#!/usr/bin/env node

/**
 * VRM Model Context Protocol サーバー
 * VRMモデルの読み込み、制御、アニメーションを提供
 *
 * 環境変数:
 * - VRM_MODELS_DIR: VRMモデルファイルのディレクトリ (デフォルト: ./public/models)
 * - VRMA_ANIMATIONS_DIR: VRMAアニメーションファイルのディレクトリ (デフォルト: ./public/animations)
 * - VIEWER_PORT: Webビューアのポート番号 (デフォルト: 3000)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { getSessionManager } from "./redis-client.js";

// ESM での __dirname 取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// VRMモデルの状態管理
interface VRMState {
  modelPath: string | null;
  isLoaded: boolean;
  expressions: Map<string, number>;
  pose: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
  bones: Map<string, { x: number; y: number; z: number; w: number }>;
  loadedAnimations: string[];
}

// セキュリティ: レート制限用トークンバケット
interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

class RateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private maxTokens: number;
  private refillRate: number; // tokens per second

  constructor(maxTokens = 60, refillRate = 1) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
  }

  check(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens - 1, lastRefill: now };
      this.buckets.set(key, bucket);
      return true;
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      this.maxTokens,
      bucket.tokens + elapsed * this.refillRate
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }
}

class VRMMCPServer {
  private mcpServer: Server;
  private expressApp: express.Application;
  private wss: WebSocketServer;
  private vrmState: VRMState;
  private connectedClients: Set<WebSocket>;
  private sseTransports = new Map<string, SSEServerTransport>();
  private viewerSSEClients = new Set<express.Response>();
  private rateLimiter = new RateLimiter(60, 1);
  private sessionManager = getSessionManager();

  // 環境変数から読み取り
  private vrmModelsDir: string;
  private vrmaAnimationsDir: string;
  private viewerPort: number;
  private mcpApiKey: string | undefined;
  private allowedOrigins: string[];

  constructor() {
    // 環境変数またはデフォルトパス
    this.vrmModelsDir =
      process.env.VRM_MODELS_DIR || path.join(__dirname, "../public/models");

    this.vrmaAnimationsDir =
      process.env.VRMA_ANIMATIONS_DIR ||
      path.join(__dirname, "../public/animations");

    this.viewerPort = parseInt(process.env.VIEWER_PORT || "3000", 10);
    this.mcpApiKey = process.env.MCP_API_KEY;
    this.allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["http://localhost:3000"];

    console.error("=== VRM MCP Server Configuration ===");
    console.error(`VRM Models Dir: ${this.vrmModelsDir}`);
    console.error(`VRMA Animations Dir: ${this.vrmaAnimationsDir}`);
    console.error(`Viewer Port: ${this.viewerPort}`);
    console.error(`MCP API Key: ${this.mcpApiKey ? "SET" : "NOT SET"}`);
    console.error(`Allowed Origins: ${this.allowedOrigins.join(", ")}`);
    console.error(
      `Redis Sessions: ${
        this.sessionManager.isAvailable() ? "ENABLED" : "DISABLED (in-memory)"
      }`
    );
    console.error("====================================");

    // MCP サーバー初期化
    this.mcpServer = new Server(
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

    // VRM 状態初期化
    this.vrmState = {
      modelPath: null,
      isLoaded: false,
      expressions: new Map(),
      pose: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
      bones: new Map(),
      loadedAnimations: [],
    };

    this.connectedClients = new Set();

    // Express サーバー初期化
    this.expressApp = express();
    const httpServer = createServer(this.expressApp);

    // 静的ファイル配信
    this.expressApp.use("/models", express.static(this.vrmModelsDir));
    this.expressApp.use("/animations", express.static(this.vrmaAnimationsDir));
    this.expressApp.use(express.static(path.join(__dirname, "../public")));

    // WebSocket サーバー
    this.wss = new WebSocketServer({ server: httpServer });

    // HTTP サーバー起動
    httpServer.listen(this.viewerPort, () => {
      console.error(`🌐 Web viewer: http://localhost:${this.viewerPort}`);
    });

    this.setupHandlers();
    this.setupWebSocket();
    this.setupSSEEndpoints();
  }

  // セキュリティミドルウェア
  private checkAuth(req: express.Request, res: express.Response): boolean {
    if (!this.mcpApiKey) {
      return true; // APIキー未設定なら認証スキップ
    }
    // ヘッダーまたはクエリパラメータからAPIキーを取得
    const providedKey = req.get("x-api-key") || (req.query.apiKey as string);
    if (providedKey !== this.mcpApiKey) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  private checkCORS(req: express.Request, res: express.Response): boolean {
    const origin = req.get("origin") || req.get("referer") || "";
    const allowed = this.allowedOrigins.some(
      (o) => origin.startsWith(o) || o === "*"
    );

    if (allowed || !origin) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      return true;
    }

    res.status(403).json({ error: "Forbidden origin" });
    return false;
  }

  private checkRateLimit(req: express.Request, res: express.Response): boolean {
    const key = req.get("x-api-key") || req.ip || "anonymous";
    if (!this.rateLimiter.check(key)) {
      res.status(429).json({ error: "Rate limit exceeded" });
      return false;
    }
    return true;
  }

  private setupSSEEndpoints(): void {
    // OPTIONS for CORS preflight
    this.expressApp.options("/mcp/sse", (req, res) => {
      this.checkCORS(req, res);
      res.status(200).end();
    });

    this.expressApp.options("/mcp/messages", (req, res) => {
      this.checkCORS(req, res);
      res.status(200).end();
    });

    // MCP SSE endpoint (GET)
    this.expressApp.get("/mcp/sse", async (req, res) => {
      if (!this.checkAuth(req, res)) return;
      if (!this.checkCORS(req, res)) return;
      if (!this.checkRateLimit(req, res)) return;

      const transport = new SSEServerTransport("/mcp/messages", res);
      this.sseTransports.set(transport.sessionId, transport);

      // Redisにセッション保存
      if (this.sessionManager.isAvailable()) {
        await this.sessionManager.saveSession(transport.sessionId, {
          metadata: { connectedAt: new Date().toISOString() },
        });
      }

      res.on("close", async () => {
        this.sseTransports.delete(transport.sessionId);
        // Redisからセッション削除
        if (this.sessionManager.isAvailable()) {
          await this.sessionManager.deleteSession(transport.sessionId);
        }
        console.error(`✗ MCP SSE client disconnected: ${transport.sessionId}`);
      });

      try {
        await this.mcpServer.connect(transport);
        await transport.start();
        console.error(`✓ MCP SSE client connected: ${transport.sessionId}`);

        // 心拍送信 (30秒ごと) + セッション延長
        const heartbeat = setInterval(async () => {
          if (res.writable) {
            res.write(": ping\n\n");
            // Redisセッションの有効期限を延長
            if (this.sessionManager.isAvailable()) {
              await this.sessionManager.extendSession(transport.sessionId);
            }
          } else {
            clearInterval(heartbeat);
          }
        }, 30000);

        res.on("close", () => clearInterval(heartbeat));
      } catch (error) {
        console.error("SSE connection error:", error);
        this.sseTransports.delete(transport.sessionId);
        if (this.sessionManager.isAvailable()) {
          await this.sessionManager.deleteSession(transport.sessionId);
        }
      }
    });

    // MCP messages endpoint (POST)
    this.expressApp.post("/mcp/messages", async (req, res) => {
      if (!this.checkAuth(req, res)) return;
      if (!this.checkCORS(req, res)) return;
      if (!this.checkRateLimit(req, res)) return;

      const sessionId = String(req.query.sessionId || "");

      // まずメモリ内のtransportを確認
      let transport = this.sseTransports.get(sessionId);

      // メモリにない場合、Redisでセッションの有効性を確認
      if (!transport && this.sessionManager.isAvailable()) {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
          res.status(404).json({ error: "Invalid session" });
          return;
        }
        // セッションは有効だが、transportがない = 別インスタンス
        // この場合、現在のインスタンスでは処理できないが、
        // セッションは有効と判断してエラーを返さない
        console.error(
          `⚠️  Session ${sessionId} exists in Redis but not in memory (multi-instance scenario)`
        );
        res.status(503).json({
          error: "Service temporarily unavailable",
          message: "Session exists but connection is on different instance",
        });
        return;
      }

      if (!transport) {
        res.status(404).json({ error: "Invalid session" });
        return;
      }

      try {
        await transport.handlePostMessage(req, res);
      } catch (error) {
        console.error("Message handling error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Viewer SSE endpoint (GET)
    this.expressApp.get("/viewer/sse", (req, res) => {
      if (!this.checkCORS(req, res)) return;
      if (!this.checkRateLimit(req, res)) return;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      this.viewerSSEClients.add(res);
      console.error("✓ Viewer SSE client connected");

      // 接続時に現在の状態を送信
      res.write(
        `event: init\ndata: ${JSON.stringify({
          modelPath: this.vrmState.modelPath,
          isLoaded: this.vrmState.isLoaded,
        })}\n\n`
      );

      // 心拍送信
      const heartbeat = setInterval(() => {
        if (res.writable) {
          res.write(": ping\n\n");
        } else {
          clearInterval(heartbeat);
        }
      }, 30000);

      req.on("close", () => {
        clearInterval(heartbeat);
        this.viewerSSEClients.delete(res);
        console.error("✗ Viewer SSE client disconnected");
      });
    });
  }

  private setupHandlers(): void {
    // ツール一覧を返す
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
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

    // ツール実行ハンドラー
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case "load_vrm_model":
            return await this.loadVRMModel(args as any);

          case "set_vrm_expression":
            return await this.setVRMExpression(args as any);

          case "set_vrm_pose":
            return await this.setVRMPose(args as any);

          case "animate_vrm_bone":
            return await this.animateVRMBone(args as any);

          case "get_vrm_status":
            return await this.getVRMStatus();

          case "list_vrm_files":
            return await this.listVRMFiles(args as any);

          case "load_vrma_animation":
            return await this.loadVRMAAnimation(args as any);

          case "play_vrma_animation":
            return await this.playVRMAAnimation(args as any);

          case "stop_vrma_animation":
            return await this.stopVRMAAnimation(args as any);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      console.error("✓ WebSocket client connected");
      this.connectedClients.add(ws);

      // 接続時に現在の状態を送信
      ws.send(
        JSON.stringify({
          type: "init",
          data: {
            modelPath: this.vrmState.modelPath,
            isLoaded: this.vrmState.isLoaded,
          },
        })
      );

      ws.on("close", () => {
        console.error("✗ WebSocket client disconnected");
        this.connectedClients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.connectedClients.delete(ws);
      });
    });
  }

  private broadcast(message: any): void {
    // WebSocket broadcast (legacy)
    const data = JSON.stringify(message);
    this.connectedClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });

    // SSE broadcast
    this.broadcastSSE(message);
  }

  private broadcastSSE(message: any): void {
    const eventType = message.type || "message";
    const eventData = JSON.stringify(message.data || message);
    const sseMessage = `event: ${eventType}\ndata: ${eventData}\n\n`;

    this.viewerSSEClients.forEach((client) => {
      if (client.writable) {
        client.write(sseMessage);
      }
    });
  }

  // ===== ツール実装 =====

  private async loadVRMModel(args: { filePath: string }) {
    const { filePath } = args;
    const fullPath = path.join(this.vrmModelsDir, filePath);

    try {
      // ファイルの存在確認
      await fs.access(fullPath);

      // 状態更新
      this.vrmState.modelPath = filePath;
      this.vrmState.isLoaded = true;

      // ブラウザに送信
      this.broadcast({
        type: "load_vrm_model",
        data: { filePath: `/models/${filePath}` },
      });

      return {
        content: [
          {
            type: "text",
            text: `✓ VRMモデルを読み込みました: ${filePath}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`VRMモデルの読み込みに失敗しました: ${filePath}`);
    }
  }

  private async setVRMExpression(args: { expression: string; weight: number }) {
    const { expression, weight } = args;

    if (!this.vrmState.isLoaded) {
      throw new Error("VRMモデルが読み込まれていません");
    }

    // 状態更新
    this.vrmState.expressions.set(expression, weight);

    // ブラウザに送信
    this.broadcast({
      type: "set_vrm_expression",
      data: { expression, weight },
    });

    return {
      content: [
        {
          type: "text",
          text: `✓ 表情 "${expression}" を強さ ${weight} で設定しました`,
        },
      ],
    };
  }

  private async setVRMPose(args: { position?: any; rotation?: any }) {
    const { position, rotation } = args;

    if (!this.vrmState.isLoaded) {
      throw new Error("VRMモデルが読み込まれていません");
    }

    // 状態更新
    if (position) {
      this.vrmState.pose.position = {
        ...this.vrmState.pose.position,
        ...position,
      };
    }
    if (rotation) {
      this.vrmState.pose.rotation = {
        ...this.vrmState.pose.rotation,
        ...rotation,
      };
    }

    // ブラウザに送信
    this.broadcast({
      type: "set_vrm_pose",
      data: { position, rotation },
    });

    return {
      content: [
        {
          type: "text",
          text: `✓ VRMモデルのポーズを更新しました`,
        },
      ],
    };
  }

  private async animateVRMBone(args: { boneName: string; rotation: any }) {
    const { boneName, rotation } = args;

    if (!this.vrmState.isLoaded) {
      throw new Error("VRMモデルが読み込まれていません");
    }

    // 状態更新
    this.vrmState.bones.set(boneName, rotation);

    // ブラウザに送信
    this.broadcast({
      type: "animate_vrm_bone",
      data: { boneName, rotation },
    });

    return {
      content: [
        {
          type: "text",
          text: `✓ ボーン "${boneName}" をアニメーションしました`,
        },
      ],
    };
  }

  private async getVRMStatus() {
    const status = {
      isLoaded: this.vrmState.isLoaded,
      modelPath: this.vrmState.modelPath,
      expressions: Object.fromEntries(this.vrmState.expressions),
      pose: this.vrmState.pose,
      loadedAnimations: this.vrmState.loadedAnimations,
    };

    return {
      content: [
        {
          type: "text",
          text: `VRMモデルの状態:\n${JSON.stringify(status, null, 2)}`,
        },
      ],
    };
  }

  private async listVRMFiles(args: { type?: string }) {
    const type = args.type || "all";
    const result: any = {};

    if (type === "models" || type === "all") {
      try {
        const files = await fs.readdir(this.vrmModelsDir);
        result.models = files.filter((f) => f.endsWith(".vrm"));
      } catch (error) {
        result.models = [];
      }
    }

    if (type === "animations" || type === "all") {
      try {
        const files = await fs.readdir(this.vrmaAnimationsDir);
        result.animations = files.filter((f) => f.endsWith(".vrma"));
      } catch (error) {
        result.animations = [];
      }
    }

    const summary: string[] = [];
    if (result.models) {
      summary.push(`📦 VRMモデル (${result.models.length}件):`);
      result.models.forEach((f: string) => summary.push(`  - ${f}`));
    }
    if (result.animations) {
      summary.push(`🎬 VRMAアニメーション (${result.animations.length}件):`);
      result.animations.forEach((f: string) => summary.push(`  - ${f}`));
    }

    return {
      content: [
        {
          type: "text",
          text: summary.join("\n") || "利用可能なファイルがありません",
        },
      ],
    };
  }

  private async loadVRMAAnimation(args: {
    animationPath: string;
    animationName: string;
  }) {
    const { animationPath, animationName } = args;
    const fullPath = path.join(this.vrmaAnimationsDir, animationPath);

    try {
      // ファイルの存在確認
      await fs.access(fullPath);

      // 状態更新
      if (!this.vrmState.loadedAnimations.includes(animationName)) {
        this.vrmState.loadedAnimations.push(animationName);
      }

      // ブラウザに送信
      this.broadcast({
        type: "load_vrma_animation",
        data: {
          animationPath: `/animations/${animationPath}`,
          animationName,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `✓ VRMAアニメーション "${animationName}" を読み込みました: ${animationPath}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `VRMAアニメーションの読み込みに失敗しました: ${animationPath}`
      );
    }
  }

  private async playVRMAAnimation(args: {
    animationName: string;
    loop?: boolean;
    fadeInDuration?: number;
  }) {
    const { animationName, loop, fadeInDuration } = args;

    if (!this.vrmState.isLoaded) {
      throw new Error("VRMモデルが読み込まれていません");
    }

    // ブラウザに送信
    this.broadcast({
      type: "play_vrma_animation",
      data: { animationName, loop, fadeInDuration },
    });

    return {
      content: [
        {
          type: "text",
          text: `▶ VRMAアニメーション "${animationName}" を再生しました${
            loop ? "（ループ）" : ""
          }`,
        },
      ],
    };
  }

  private async stopVRMAAnimation(args: { fadeOutDuration?: number }) {
    const { fadeOutDuration } = args;

    // ブラウザに送信
    this.broadcast({
      type: "stop_vrma_animation",
      data: { fadeOutDuration },
    });

    return {
      content: [
        {
          type: "text",
          text: `⏹ VRMAアニメーションを停止しました`,
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
    console.error("🚀 VRM MCP Server が起動しました (stdio + HTTP)");
  }
}

// サーバーを起動
const server = new VRMMCPServer();
server.run().catch((error) => {
  console.error("サーバーの起動に失敗しました:", error);
  process.exit(1);
});
