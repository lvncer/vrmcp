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

class VRMMCPServer {
  private mcpServer: Server;
  private expressApp: express.Application;
  private wss: WebSocketServer;
  private vrmState: VRMState;
  private connectedClients: Set<WebSocket>;

  // 環境変数から読み取り
  private vrmModelsDir: string;
  private vrmaAnimationsDir: string;
  private viewerPort: number;

  constructor() {
    // 環境変数またはデフォルトパス
    this.vrmModelsDir =
      process.env.VRM_MODELS_DIR || path.join(__dirname, "../public/models");

    this.vrmaAnimationsDir =
      process.env.VRMA_ANIMATIONS_DIR ||
      path.join(__dirname, "../public/animations");

    this.viewerPort = parseInt(process.env.VIEWER_PORT || "3000", 10);

    console.error("=== VRM MCP Server Configuration ===");
    console.error(`VRM Models Dir: ${this.vrmModelsDir}`);
    console.error(`VRMA Animations Dir: ${this.vrmaAnimationsDir}`);
    console.error(`Viewer Port: ${this.viewerPort}`);
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
    const data = JSON.stringify(message);
    this.connectedClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
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
