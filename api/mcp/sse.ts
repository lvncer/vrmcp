import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// グローバルなMCPサーバーインスタンス（関数呼び出し間で共有）
let mcpServer: Server | null = null;
const transports = new Map<string, SSEServerTransport>();

// レート制限用
interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}
const rateLimitBuckets = new Map<string, RateLimitBucket>();

function checkRateLimit(key: string): boolean {
  const maxTokens = 60;
  const refillRate = 1;
  const now = Date.now();
  let bucket = rateLimitBuckets.get(key);

  if (!bucket) {
    bucket = { tokens: maxTokens - 1, lastRefill: now };
    rateLimitBuckets.set(key, bucket);
    return true;
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

function checkAuth(req: VercelRequest): boolean {
  const expectedKey = process.env.MCP_API_KEY;
  if (!expectedKey) return true;
  // ヘッダーまたはクエリパラメータからAPIキーを取得
  const providedKey = req.headers["x-api-key"] || req.query.apiKey;
  return providedKey === expectedKey;
}

function setCORS(res: VercelResponse, req: VercelRequest) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];
  const origin = req.headers.origin || "*";
  const allowed = allowedOrigins.some((o) => o === "*" || origin === o);

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

// MCPサーバー初期化（遅延初期化）
function getOrCreateMCPServer(): Server {
  if (!mcpServer) {
    mcpServer = new Server(
      {
        name: "vrm-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // ツール一覧を返す
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "load_vrm_model",
          description: "VRMモデルファイルを読み込む",
          inputSchema: {
            type: "object",
            properties: {
              filePath: {
                type: "string",
                description: "VRMファイル名（例: character.vrm）",
              },
            },
            required: ["filePath"],
          },
        },
        {
          name: "set_vrm_expression",
          description: "VRMモデルの表情を設定する",
          inputSchema: {
            type: "object",
            properties: {
              expression: {
                type: "string",
                description: "設定する表情（例: happy, angry, sad, surprised, neutral）",
              },
              weight: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "表情の強さ (0.0-1.0)",
              },
            },
            required: ["expression", "weight"],
          },
        },
        {
          name: "get_vrm_status",
          description: "VRMモデルの現在の状態を取得する",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    }));

    // ツール実行ハンドラー（簡易実装）
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name } = request.params;
      
      // Vercel環境では実際のVRM操作は行わず、コマンドを返すのみ
      return {
        content: [
          {
            type: "text",
            text: `Tool "${name}" executed on Vercel (stateless mode)`,
          },
        ],
      };
    });
  }

  return mcpServer;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  setCORS(res, req);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 認証チェック
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // レート制限チェック
  const rateLimitKey =
    (req.headers["x-api-key"] as string) || req.headers["x-forwarded-for"] || "anonymous";
  if (!checkRateLimit(rateLimitKey)) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  try {
    const server = getOrCreateMCPServer();
    const transport = new SSEServerTransport("/api/mcp/messages", res);
    transports.set(transport.sessionId, transport);

    // クリーンアップ
    res.on("close", () => {
      transports.delete(transport.sessionId);
      console.log(`SSE client disconnected: ${transport.sessionId}`);
    });

    await server.connect(transport);
    await transport.start();

    console.log(`SSE client connected: ${transport.sessionId}`);

    // 心拍送信
    const heartbeat = setInterval(() => {
      if (res.writable) {
        res.write(": ping\n\n");
      } else {
        clearInterval(heartbeat);
      }
    }, 30000);

    res.on("close", () => clearInterval(heartbeat));
  } catch (error) {
    console.error("SSE connection error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

