# Japan Law Search MCP — 日本の法令検索

**Give your AI agent authoritative access to all ~10,000 Japanese laws and regulations.**

This MCP server searches and retrieves the full text of current Japanese legislation — acts, cabinet orders, and ministerial ordinances — from the official [e-Gov Laws API](https://laws.e-gov.go.jp/) (Government of Japan). Built for legal-tech, compliance, HR, and contract-review AI agents working with Japanese law.

## Why this server?

Japanese statutes are published as deeply nested XML with kanji numerals, era-based dates, and no convenient full-text API surface for LLMs. This server turns that into three clean, token-efficient tools.

## Tools

### `search_laws`
Full-text search across the body text of every current law (or search by law title). Returns matched snippets, law categories, promulgation dates, and official links.

### `get_law_structure`
Table of contents for any law: chapters, sections, and article headings. Long statutes (e.g. the Civil Code with 1,000+ articles) are automatically compressed to chapter level to save tokens.

### `get_law_article`
Retrieve the exact text of any article. Accepts flexible references — `3`, `第3条`, `第三条の二`, `3の2` — and normalizes kanji numerals automatically. Output preserves paragraph and item numbering as clean plain text.

## Example queries your agent can now answer

- 「電子署名法で電子署名が有効とされる条件は？」→ finds Article 3 and quotes it verbatim
- "What does the Labor Standards Act say about overtime limits? Quote the exact article."
- 「個人情報保護法の目次を見せて、第三者提供に関する条文を特定して」

## Data source & freshness

Official e-Gov Laws API v2 (Government of Japan), fetched live on every call — always the currently enforced revision, including amendments enforced this month.

## Pricing

Pay per tool call. One search, one table of contents, or one article retrieval = one event. No subscription, no minimum.

---

### 日本語

日本の現行法令（約1万件）を全文検索し、条文を取得できるMCPサーバーです。巨大な法令XMLをAIが読みやすいテキストに整形し、「第三条の二」等の表記ゆらぎも自動吸収します。リーガルテック・コンプライアンス・労務系AIに最適です。

## Get started

This is a hosted (remote) MCP server, available on Apify Store:

👉 **https://apify.com/plus-synergy/japan-law-search-mcp**

The store page includes setup instructions for Claude, ChatGPT, Cursor, and any MCP-compatible client. Pay-as-you-go: $0.02 per tool call, no subscription.

---
*Built by [Plus Synergy](https://apify.com/plus-synergy) — Japanese data infrastructure for AI agents. Part of the SEKISHO series: [subsidies](https://apify.com/plus-synergy/japan-subsidy-search-mcp) / [laws](https://apify.com/plus-synergy/japan-law-search-mcp) / [parliament](https://apify.com/plus-synergy/japan-parliament-search-mcp).*
