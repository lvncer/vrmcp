#!/usr/bin/env node

/**
 * VRM MCP Gateway
 * Claude Desktop (stdio) ⇄ Remote MCP Server (SSE) のブリッジ
 * 
 * 使い方:
 * 1. 環境変数で設定:
 *    export MCP_REMOTE_URL="https://your-domain.vercel.app/api/mcp/sse"
 *    export MCP_API_KEY="your-api-key"
 * 
 * 2. Claude Desktopの設定に追加:
 *    "mcpServers": {
 *      "vrm": {
 *        "command": "node",
 *        "args": ["/path/to/gateway.js"]
 *      }
 *    }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import fetch from "node-fetch";

const REMOTE_URL = process.env.MCP_REMOTE_URL || "http://localhost:3000/mcp/sse";
const API_KEY = process.env.MCP_API_KEY;

class MCPGateway {
  private server: Server;
  private client: Client;

  constructor() {
    // ローカル側: Claude DesktopとStdio通信
    this.server = new Server(
      {
        name: "vrm-mcp-gateway",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // リモート側: SSEクライアント
    this.client = new Client(
      {
        name: "vrm-mcp-gateway-client",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );

    this.setupBridge();
  }

  private setupBridge(): void {
    // Claude Desktopからのツール一覧リクエストをリモートに転送
    this.server.setRequestHandler(
      { method: "tools/list" } as any,
      async () => {
        try {
          const result = await this.client.request(
            { method: "tools/list" },
            { method: "tools/list" } as any
          );
          return result;
        } catch (error) {
          console.error("Failed to list tools from remote:", error);
          return { tools: [] };
        }
      }
    );

    // Claude Desktopからのツール実行リクエストをリモートに転送
    this.server.setRequestHandler(
      { method: "tools/call" } as any,
      async (request: any) => {
        try {
          const result = await this.client.request(
            { method: "tools/call", params: request.params },
            { method: "tools/call" } as any
          );
          return result;
        } catch (error) {
          console.error("Failed to call tool on remote:", error);
          throw error;
        }
      }
    );
  }

  async start(): Promise<void> {
    console.error("🌉 VRM MCP Gateway starting...");
    console.error(`📡 Remote URL: ${REMOTE_URL}`);

    try {
      // リモートSSEサーバーに接続
      // Note: SSEClientTransportではヘッダーをコンストラクタで渡せないため、
      // URLクエリパラメータまたはグローバルfetchのカスタマイズが必要
      // ここでは簡易実装として、APIキーをクエリパラメータに追加する方法を採用
      const url = new URL(REMOTE_URL);
      if (API_KEY) {
        url.searchParams.set("apiKey", API_KEY);
      }

      const sseTransport = new SSEClientTransport(url);

      await this.client.connect(sseTransport);
      console.error("✓ Connected to remote MCP server");

      // ローカルStdio通信開始
      const stdioTransport = new StdioServerTransport();
      await this.server.connect(stdioTransport);
      console.error("✓ Gateway ready (stdio ⇄ SSE)");
    } catch (error) {
      console.error("❌ Gateway startup failed:", error);
      process.exit(1);
    }
  }
}

// ゲートウェイ起動
const gateway = new MCPGateway();
gateway.start().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

