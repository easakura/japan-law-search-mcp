#!/usr/bin/env node
/**
 * horei-mcp ローカル版（stdio）
 * ロジック本体は core.ts（リモート版 worker.ts と共有）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools, SERVER_INFO } from "./core.js";

const server = new McpServer(SERVER_INFO);
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`${SERVER_INFO.name} v${SERVER_INFO.version} 起動（stdio）`);
