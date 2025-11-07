import type { NextApiRequest, NextApiResponse } from "next";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  InitializeRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { getSessionManager } from "@/lib/redis-client";
import { broadcastToViewers } from "../viewer/sse";

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
  // ローカル開発環境では認証をスキップ
  const isLocal = process.env.NODE_ENV === "development" && 
                  (req.headers.host?.includes("localhost") || 
                   req.headers.host?.includes("127.0.0.1"));
  
  if (!expectedKey || isLocal) {
    console.log(`[MCP] Auth check: ${!expectedKey ? "No API key configured" : "Local development mode"} - allowing access`);
    return true;
  }
  
  const providedKey = req.headers["x-api-key"] || req.query.apiKey;
  const isAuthorized = providedKey === expectedKey;
  console.log(`[MCP] Auth check: ${isAuthorized ? "Authorized" : "Unauthorized"}`);
  return isAuthorized;
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
    console.log("[MCP] Creating new MCP server instance");
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
    console.log("[MCP] MCP server instance created");

    // Initialize ハンドラー
    mcpServer.setRequestHandler(InitializeRequestSchema, async (request) => {
      console.log("[MCP] Initialize request received", request.params);
      return {
        protocolVersion: request.params.protocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "vrm-mcp-server",
          version: "0.1.0",
        },
      };
    });

    // ツール一覧を返す
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log("[MCP] ListTools request received");
      return {
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
    };
    });

    // ツール実行ハンドラー
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.log(`[MCP] CallTool request received: ${name}`, args);

      // ビューアにブロードキャスト
      try {
        switch (name) {
          case "load_vrm_model":
            broadcastToViewers("load_vrm_model", {
              filePath: (args as any).filePath,
            });
            break;
          case "set_vrm_expression":
            broadcastToViewers("set_vrm_expression", {
              expression: (args as any).expression,
              weight: (args as any).weight,
            });
            break;
          case "set_vrm_pose":
            broadcastToViewers("set_vrm_pose", {
              position: (args as any).position,
              rotation: (args as any).rotation,
            });
            break;
          case "animate_vrm_bone":
            broadcastToViewers("animate_vrm_bone", {
              boneName: (args as any).boneName,
              rotation: (args as any).rotation,
            });
            break;
          case "load_vrma_animation":
            broadcastToViewers("load_vrma_animation", {
              animationPath: (args as any).animationPath,
              animationName: (args as any).animationName,
            });
            break;
          case "play_vrma_animation":
            broadcastToViewers("play_vrma_animation", {
              animationName: (args as any).animationName,
              loop: (args as any).loop,
              fadeInDuration: (args as any).fadeInDuration,
            });
            break;
          case "stop_vrma_animation":
            broadcastToViewers("stop_vrma_animation", {
              fadeOutDuration: (args as any).fadeOutDuration,
            });
            break;
        }
      } catch (error) {
        console.error("Failed to broadcast to viewers:", error);
      }

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
    console.log("[MCP] Getting or creating MCP server");
    const server = getOrCreateMCPServer();
    
    // 完全なURLを構築（Railway等の外部環境対応）
    const host = req.headers.host || "localhost:3000";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
    const protocol = req.headers["x-forwarded-proto"] || (isLocalhost ? "http" : "https");
    const baseUrl = `${protocol}://${host}`;
    const messagesEndpoint = `${baseUrl}/api/mcp/messages`;
    
    console.log(`[MCP] Creating SSE transport with endpoint: ${messagesEndpoint}`);
    const transport = new SSEServerTransport(messagesEndpoint, res as any);
    console.log(`[MCP] Transport created with sessionId: ${transport.sessionId}`);
    
    transports.set(transport.sessionId, transport);
    console.log(`[MCP] Transport stored in map (total: ${transports.size})`);

    // Redisにセッション保存
    if (sessionManager.isAvailable()) {
      await sessionManager.saveSession(transport.sessionId, {
        metadata: { connectedAt: new Date().toISOString() },
      });
      console.log(`[MCP] Session saved to Redis: ${transport.sessionId}`);
    }

    // クリーンアップ
    res.on("close", async () => {
      transports.delete(transport.sessionId);
      if (sessionManager.isAvailable()) {
        await sessionManager.deleteSession(transport.sessionId);
      }
      console.log(`[MCP] SSE client disconnected: ${transport.sessionId}`);
    });

    console.log("[MCP] Connecting server to transport...");
    console.log(`[MCP] Full messages URL: ${messagesEndpoint}?sessionId=${transport.sessionId}`);
    await server.connect(transport);
    console.log(`[MCP] ✅ SSE client connected successfully: ${transport.sessionId}`);

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

