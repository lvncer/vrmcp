# VRMCP (VRM MCP Server)

VRM モデルを AI が自然言語で制御できる MCP サーバー。
Claude Desktop から自然言語で指示するだけで、Web ブラウザで VRM モデルがリアルタイムに動きます。

## セットアップ

このプロジェクトは 2 つの運用モードをサポートしています：

1. **ローカルモード**: ローカル環境で MCP サーバーを起動（従来の方法）

   - [ローカルセットアップガイド](./documents/LOCAL_SETUP.md)

2. **リモートモード**（推奨）

   - [リモートセットアップガイド](./documents/REMOTE_SETUP.md)

     ```json
     {
       "mcpServers": {
         "vrmcp": {
           "url": "https://vrmcp.up.railway.app/api/mcp/sse",
           "headers": {
             "x-api-key": "your-super-secret-key-12345"
           }
         }
       }
     }
     ```

## 使い方

利用可能なツールと使い方をまとめています。

- [ツールとユースケース](./documents/tool-usecases.md)

## 利用可能なツール

| Tool                  | 説明                             | 使用例                         |
| --------------------- | -------------------------------- | ------------------------------ |
| `list_vrm_files`      | 利用可能な VRM/glTF ファイル一覧 | 「どんな VRM がある？」        |
| `load_vrm_model`      | VRM モデル読み込み               | 「character.vrm を読み込んで」 |
| `set_vrm_expression`  | 表情設定                         | 「嬉しい表情にして」           |
| `set_vrm_pose`        | ポーズ設定                       | 「右を向いて」                 |
| `animate_vrm_bone`    | ボーン操作                       | 「右手を上げて」               |
| `load_gltf_animation` | glTF アニメーション読み込み      | 「walk.glb を読み込んで」      |
| `play_gltf_animation` | アニメーション再生               | 「挨拶して」                   |
| `stop_gltf_animation` | アニメーション停止               | 「止めて」                     |
| `get_vrm_status`      | 状態取得                         | 「現在の状態は？」             |

## プロジェクト構造

```sh
vrm-mcp/
├── src/
│   ├── mcp-server.ts          # MCPサーバー実装（stdio + SSE）
│   ├── redis-client.ts
│   └── gateway.ts             # stdio↔SSEゲートウェイ（Claude Desktop用）
├── api/
│   ├── mcp/
│   │   ├── sse.ts             # MCP SSEエンドポイント
│   │   └── messages.ts        # MCP POSTエンドポイント
│   └── viewer/
│       └── sse.ts             # Viewer SSEエンドポイント
├── public/
│   ├── index.html             # VRMビューア（SSE対応）
│   ├── models/                # VRMモデル配置（デフォルト）
│   └── animations/            # glTFアニメーション配置（.glb/.gltf）
├── package.json
└── README.md
```
