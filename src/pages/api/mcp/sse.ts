import type { NextApiRequest, NextApiResponse } from "next";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { getSessionManager } from "@/lib/redis-client";

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

function checkAuth(req: NextApiRequest): boolean {
  const expectedKey = process.env.MCP_API_KEY;
  if (!expectedKey) return true;
  const providedKey = req.headers["x-api-key"] || req.query.apiKey;
  return providedKey === expectedKey;
}

function setCORS(res: NextApiResponse, req: NextApiRequest) {
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
                description:
                  "VRMファイル名（例: character.vrm）環境変数 VRM_MODELS_DIR からの相対パス",
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
                description:
                  "設定する表情（例: happy, angry, sad, surprised, neutral）",
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
          name: "set_vrm_pose",
          description: "VRMモデルの位置と回転を設定する",
          inputSchema: {
            type: "object",
            properties: {
              position: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  z: { type: "number" },
                },
                description: "モデルの位置",
              },
              rotation: {
                type: "object",
                properties: {
                  x: { type: "number", description: "ラジアン" },
                  y: { type: "number", description: "ラジアン" },
                  z: { type: "number", description: "ラジアン" },
                },
                description: "モデルの回転",
              },
            },
          },
        },
        {
          name: "animate_vrm_bone",
          description: "指定されたボーンを回転させる",
          inputSchema: {
            type: "object",
            properties: {
              boneName: {
                type: "string",
                description:
                  "ボーン名（例: leftUpperArm, rightUpperArm, head, spine）",
              },
              rotation: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  z: { type: "number" },
                  w: { type: "number" },
                },
                description: "クォータニオン回転",
              },
            },
            required: ["boneName", "rotation"],
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
        {
          name: "list_vrm_files",
          description:
            "利用可能なVRMモデルとVRMAアニメーションファイルの一覧を取得する",
          inputSchema: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["models", "animations", "all"],
                description: "取得するファイルの種類（デフォルト: all）",
              },
            },
          },
        },
        {
          name: "load_vrma_animation",
          description: "VRMAファイルからアニメーションを読み込む",
          inputSchema: {
            type: "object",
            properties: {
              animationPath: {
                type: "string",
                description:
                  "VRMAファイル名（例: greeting.vrma）環境変数 VRMA_ANIMATIONS_DIR からの相対パス",
              },
              animationName: {
                type: "string",
                description: "アニメーション識別名（再生時に使用）",
              },
            },
            required: ["animationPath", "animationName"],
          },
        },
        {
          name: "play_vrma_animation",
          description: "読み込み済みのVRMAアニメーションを再生する",
          inputSchema: {
            type: "object",
            properties: {
              animationName: {
                type: "string",
                description: "再生するアニメーション名",
              },
              loop: {
                type: "boolean",
                description: "ループ再生するか",
              },
              fadeInDuration: {
                type: "number",
                description: "フェードイン時間（秒）",
              },
            },
            required: ["animationName"],
          },
        },
        {
          name: "stop_vrma_animation",
          description: "再生中のVRMAアニメーションを停止する",
          inputSchema: {
            type: "object",
            properties: {
              fadeOutDuration: {
                type: "number",
                description: "フェードアウト時間（秒）",
              },
            },
          },
        },
      ],
    }));

    // ツール実行ハンドラー（簡易実装）
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Next.js環境では実際のVRM操作は行わず、コマンドを返すのみ
      // 実際のVRM制御はビューアページ側で受信して処理
      return {
        content: [
          {
            type: "text",
            text: `Tool "${name}" executed with args: ${JSON.stringify(args)}`,
          },
        ],
      };
    });
  }

  return mcpServer;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
  const apiKey = req.headers["x-api-key"];
  const forwardedFor = req.headers["x-forwarded-for"];
  const rateLimitKey =
    (typeof apiKey === "string" ? apiKey : "") ||
    (typeof forwardedFor === "string" ? forwardedFor : "") ||
    "anonymous";
  if (!checkRateLimit(rateLimitKey)) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const sessionManager = getSessionManager();

  try {
    const server = getOrCreateMCPServer();
    const transport = new SSEServerTransport("/api/mcp/messages", res as any);
    transports.set(transport.sessionId, transport);

    // Redisにセッション保存
    if (sessionManager.isAvailable()) {
      await sessionManager.saveSession(transport.sessionId, {
        metadata: { connectedAt: new Date().toISOString() },
      });
    }

    // クリーンアップ
    res.on("close", async () => {
      transports.delete(transport.sessionId);
      if (sessionManager.isAvailable()) {
        await sessionManager.deleteSession(transport.sessionId);
      }
      console.log(`SSE client disconnected: ${transport.sessionId}`);
    });

    await server.connect(transport);
    console.log(`SSE client connected: ${transport.sessionId}`);

    // 心拍送信 + セッション延長
    const heartbeat = setInterval(async () => {
      if ((res as any).writable) {
        res.write(": ping\n\n");
        if (sessionManager.isAvailable()) {
          await sessionManager.extendSession(transport.sessionId);
        }
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

// transportsをエクスポート（messages.tsで使用）
export { transports };

