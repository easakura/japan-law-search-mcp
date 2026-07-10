/**
 * horei-mcp Apify Actor版（Standby mode / Streamable HTTP）
 * ツール呼び出しごとに Actor.charge({ eventName: "tool-call" }) で従量課金する。
 */
import { Actor } from "apify";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools, SERVER_INFO } from "./core.js";

await Actor.init();

// Apifyの日次自動テスト対策：Standbyでない通常実行のときは、
// サンプル検索を1件実行して結果をデータセットに出力し、正常終了する
if (process.env.APIFY_META_ORIGIN !== "STANDBY") {
  console.log("Standard run detected — running self-test search against e-Gov Laws API.");
  const res = await fetch(
    "https://laws.e-gov.go.jp/api/2/laws?law_title=%E9%9B%BB%E5%AD%90%E7%BD%B2%E5%90%8D&limit=3"
  );
  const json: any = await res.json();
  const items = (json.laws ?? []).map((l: any) => ({
    law_id: l.law_info?.law_id ?? null,
    title: l.revision_info?.law_title ?? null,
    category: l.revision_info?.category ?? null,
    note: "Self-test sample. Connect via MCP for full functionality — see README.",
  }));
  await Actor.pushData(
    items.length > 0 ? items : [{ status: "ok", note: "API reachable." }]
  );
  await Actor.exit();
}

const app = express();
app.use(express.json());

// Apifyのreadiness probe（ヘッダー付きGET /）には即200を返す
app.get("/", (_req, res) => {
  res.status(200).send(`${SERVER_INFO.name} v${SERVER_INFO.version} — MCP endpoint: POST /mcp`);
});

// ステートレス運用：リクエストごとにサーバー＋トランスポートを作る
app.post("/mcp", async (req, res) => {
  try {
    const server = new McpServer(SERVER_INFO);
    registerTools(server, async (toolName) => {
      await Actor.charge({ eventName: "tool-call" });
      console.log(`charged: tool-call (${toolName})`);
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP request error:", e);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// ステートレスのためGET/DELETE（セッション系）は非対応と明示する
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST (stateless mode)." },
    id: null,
  });
});
app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST (stateless mode)." },
    id: null,
  });
});

const port = Number(
  process.env.ACTOR_WEB_SERVER_PORT ?? process.env.APIFY_CONTAINER_PORT ?? 3000
);
app.listen(port, () => {
  console.log(`${SERVER_INFO.name} v${SERVER_INFO.version} listening on :${port} (Actor standby)`);
});
