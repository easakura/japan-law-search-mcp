/**
 * horei-mcp コアロジック
 * データソース: e-Gov 法令API v2（認証不要・無料・政府公式）
 *   https://laws.e-gov.go.jp/
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const API_BASE = "https://laws.e-gov.go.jp/api/2";
const PORTAL_BASE = "https://laws.e-gov.go.jp/law";

export const SERVER_INFO = { name: "horei-mcp", version: "0.1.0" };

// ---------- ユーティリティ ----------

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`e-Gov法令APIエラー: HTTP ${res.status}（URL: ${url}）`);
  }
  return res.json();
}

function stripTags(s: string | null | undefined): string {
  return (s ?? "").replace(/<[^>]+>/g, "");
}

/** 漢数字（〜千九百九十九程度）をアラビア数字へ。既に数字ならそのまま */
function kanjiToNumber(s: string): string {
  if (/^\d+$/.test(s)) return s;
  const digits: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  let total = 0;
  let current = 0;
  for (const ch of s) {
    if (ch in digits) current = digits[ch];
    else if (ch === "十") { total += (current || 1) * 10; current = 0; }
    else if (ch === "百") { total += (current || 1) * 100; current = 0; }
    else if (ch === "千") { total += (current || 1) * 1000; current = 0; }
    else return s; // 変換できない文字はそのまま返す
  }
  return String(total + current);
}

/**
 * 条番号の指定ゆらぎを内部形式（Article Num属性）へ正規化する。
 * 例: "3" → "3" ／ "第3条" → "3" ／ "第三条の二" → "3_2" ／ "3の2" → "3_2"
 */
export function normalizeArticleNum(input: string): string {
  let s = input.trim().replace(/^第/, "").replace(/条/g, "");
  const parts = s.split(/の|_/).map((p) => kanjiToNumber(p.trim()));
  return parts.filter((p) => p !== "").join("_");
}

function articleLabel(num: string): string {
  return `第${num.split("_").join("条の")}条`.replace(/条の(\d+)条$/, "条の$1");
}

// ---------- 法令本文ツリーの処理 ----------

type LawNode = string | { tag: string; attr?: Record<string, string>; children?: LawNode[] };

/** ノードを読みやすいプレーンテキストへ変換（条見出し・項番号・号で改行） */
function nodeText(n: LawNode): string {
  if (typeof n === "string") return n;
  const kids = (n.children ?? []).map(nodeText).join("");
  switch (n.tag) {
    case "ArticleCaption":
      return kids + "\n";
    case "ArticleTitle":
    case "ParagraphNum":
    case "ItemTitle":
    case "Subitem1Title":
    case "Subitem2Title":
      return kids ? kids + "　" : "";
    case "Paragraph":
    case "Item":
    case "Subitem1":
    case "Subitem2":
      return kids.trimEnd() + "\n";
    default:
      return kids;
  }
}

function findNodes(root: LawNode, tag: string): Array<Exclude<LawNode, string>> {
  const found: Array<Exclude<LawNode, string>> = [];
  const walk = (n: LawNode) => {
    if (typeof n === "string") return;
    if (n.tag === tag) found.push(n);
    (n.children ?? []).forEach(walk);
  };
  walk(root);
  return found;
}

function firstText(node: Exclude<LawNode, string>, tag: string): string {
  const hit = findNodes(node, tag)[0];
  return hit ? nodeText(hit).trim() : "";
}

function lawSummary(law: any) {
  const info = law.law_info ?? {};
  const rev = law.revision_info ?? {};
  return {
    law_id: info.law_id,
    title: rev.law_title,
    abbrev: rev.abbrev || null,
    kana: rev.law_title_kana ?? null,
    category: rev.category ?? null,
    law_num: info.law_num,
    promulgation_date: info.promulgation_date,
    last_amendment_enforced: rev.amendment_enforcement_date ?? null,
    official_page: `${PORTAL_BASE}/${info.law_id}`,
  };
}

async function fetchLawData(lawId: string): Promise<any> {
  return fetchJson(
    `${API_BASE}/law_data/${encodeURIComponent(lawId)}?law_full_text_format=json`
  );
}

// ---------- ツール登録 ----------

/**
 * @param onToolCall 課金など、ツール実行前に呼ぶフック（Apify版で使用。省略可）
 */
export function registerTools(
  server: McpServer,
  onToolCall?: (toolName: string) => Promise<void>
): void {
  server.registerTool(
    "search_laws",
    {
      title: "日本の法令を検索",
      description:
        "日本の現行法令（法律・政令・省令など約1万件）を政府公式データベース（e-Gov）から検索する。" +
        "search_in=full_text（既定）は条文本文の全文検索、search_in=titleは法令名検索。" +
        "結果のlaw_idをget_law_structure / get_law_articleに渡すと条文を参照できる。",
      inputSchema: {
        query: z.string().min(1).describe("検索語（例: 電子署名 / 個人情報 / 解雇）"),
        search_in: z
          .enum(["full_text", "title"])
          .default("full_text")
          .describe("full_text=条文本文を全文検索（既定） / title=法令名で検索"),
        limit: z.number().int().min(1).max(20).default(5).describe("最大件数（1〜20）"),
      },
    },
    async ({ query, search_in, limit }) => {
      await onToolCall?.("search_laws");
      let results: any[];
      if (search_in === "title") {
        const json = await fetchJson(
          `${API_BASE}/laws?law_title=${encodeURIComponent(query)}&limit=${limit}`
        );
        results = (json.laws ?? []).map(lawSummary);
      } else {
        const json = await fetchJson(
          `${API_BASE}/keyword?keyword=${encodeURIComponent(query)}&limit=${limit}`
        );
        results = (json.items ?? []).map((it: any) => ({
          ...lawSummary(it),
          matched_snippets: (it.sentences ?? [])
            .slice(0, 3)
            .map((s: any) => stripTags(s.text)),
        }));
      }
      const payload = {
        query,
        search_in,
        returned: results.length,
        results,
        hint:
          results.length === 0
            ? "ヒットなし。別の語彙（法律用語）で再検索してください。例:「クビ」→「解雇」"
            : "law_idをget_law_structureに渡すと目次、get_law_articleに渡すと条文本文を取得できます。",
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
    }
  );

  server.registerTool(
    "get_law_structure",
    {
      title: "法令の目次（章・条の一覧）を取得",
      description:
        "law_idを指定して法令の構造（章・節・条の見出し一覧）を取得する。" +
        "どの条文を読むべきか当たりを付けるのに使う。law_idはsearch_lawsの結果に含まれる。",
      inputSchema: {
        law_id: z.string().min(1).describe("法令ID（例: 412AC0000000102）"),
      },
    },
    async ({ law_id }) => {
      await onToolCall?.("get_law_structure");
      const json = await fetchLawData(law_id);
      const root = json.law_full_text as LawNode;
      const articles = findNodes(root, "Article");
      const compact = articles.length > 150;
      const list = compact
        ? undefined
        : articles.map((a) => ({
            article: articleLabel(a.attr?.Num ?? "?"),
            num: a.attr?.Num ?? "?",
            caption: firstText(a, "ArticleCaption") || null,
          }));
      const chapters = findNodes(root, "Chapter").map((c) => ({
        chapter: firstText(c, "ChapterTitle"),
        articles: findNodes(c, "Article").length,
        first_article: c ? findNodes(c, "Article")[0]?.attr?.Num ?? null : null,
      }));
      const payload = {
        law: lawSummary(json),
        total_articles: articles.length,
        ...(chapters.length > 0 ? { chapters } : {}),
        ...(list ? { articles: list } : {}),
        ...(compact
          ? { note: "条数が多いため章単位の概要のみ表示。get_law_articleで個別条文を取得してください。" }
          : {}),
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
    }
  );

  server.registerTool(
    "get_law_article",
    {
      title: "法令の条文本文を取得",
      description:
        "law_idと条番号を指定して条文の本文を取得する。" +
        "条番号は「3」「第3条」「第三条の二」「3の2」のいずれの形式でもよい。",
      inputSchema: {
        law_id: z.string().min(1).describe("法令ID（例: 412AC0000000102）"),
        article: z.string().min(1).describe("条番号（例: 3 / 第3条 / 第三条の二）"),
      },
    },
    async ({ law_id, article }) => {
      await onToolCall?.("get_law_article");
      const num = normalizeArticleNum(article);
      const json = await fetchLawData(law_id);
      const root = json.law_full_text as LawNode;
      const hit = findNodes(root, "Article").find((a) => a.attr?.Num === num);
      if (!hit) {
        const available = findNodes(root, "Article")
          .slice(0, 30)
          .map((a) => a.attr?.Num)
          .join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `${articleLabel(num)}は見つかりませんでした。存在する条番号の例: ${available}`,
            },
          ],
          isError: true,
        };
      }
      const payload = {
        law: lawSummary(json).title,
        law_id,
        article: articleLabel(num),
        text: nodeText(hit).trim(),
        official_page: `${PORTAL_BASE}/${law_id}`,
        note: "本文は公布・改正データに基づく参考情報。法的判断には公式ページ・専門家確認を推奨。",
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
    }
  );
}
