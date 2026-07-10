/**
 * horei-mcp リモート版（Cloudflare Workers）
 * Streamable HTTP: https://<worker>/mcp ／ 旧SSEクライアント互換: /sse
 */
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools, SERVER_INFO } from "./core.js";

export class HoreiMCP extends McpAgent {
  server = new McpServer(SERVER_INFO);

  async init() {
    registerTools(this.server);
  }
}

/**
 * 無料の直接アクセス用の簡易レート制限（IPごとに1分10コール）。
 * Durable Objectの固定ウィンドウカウンターで実装。本格利用はApify Store経由（課金・無制限）へ誘導する。
 */
export class RateLimiterDO {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  async fetch(): Promise<Response> {
    const windowMs = 60_000;
    const limit = 10;
    const bucket = Math.floor(Date.now() / windowMs);
    const stored = (await this.state.storage.get<{ bucket: number; count: number }>("counter")) ?? {
      bucket,
      count: 0,
    };
    let { bucket: storedBucket, count } = stored;
    if (storedBucket !== bucket) {
      storedBucket = bucket;
      count = 0;
    }
    count += 1;
    await this.state.storage.put("counter", { bucket: storedBucket, count });
    return new Response(JSON.stringify({ success: count <= limit, count }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default {
  async fetch(request: Request, env: any, ctx: unknown) {
    const { pathname } = new URL(request.url);

    // 無料の直接アクセスは軽くレート制限する（IPごとに1分10コール）。
    // 本格利用はApify Store経由（課金・無制限）に誘導する。
    if ((pathname === "/mcp" || pathname.startsWith("/mcp/")) && request.method === "POST" && env.RATE_LIMITER_DO) {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const id = env.RATE_LIMITER_DO.idFromName(ip);
      const stub = env.RATE_LIMITER_DO.get(id);
      const res = await stub.fetch("https://rate-limiter/check");
      const { success } = (await res.json()) as { success: boolean };
      if (!success) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message:
                "Rate limit exceeded on the free endpoint (10 calls/min per IP). For unlimited access, use the paid Apify Store listing.",
            },
            id: null,
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      return HoreiMCP.serve("/mcp").fetch(request as any, env as any, ctx as any);
    }
    if (pathname === "/sse" || pathname.startsWith("/sse/")) {
      return HoreiMCP.serveSSE("/sse").fetch(request as any, env as any, ctx as any);
    }
    return new Response(
      `${SERVER_INFO.name} v${SERVER_INFO.version} — MCP endpoint: /mcp`,
      { status: pathname === "/" ? 200 : 404 }
    );
  },
};
