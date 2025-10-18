# VRMCP (VRM MCP Server)

**作成日**: 2025/10/19

VRM モデルを AI が自然言語で制御できる MCP サーバー。
Claude Desktop から自然言語で指示するだけで、Web ブラウザで VRM モデルがリアルタイムに動きます。

## 特徴

- **自然言語制御**: 「嬉しい表情で手を振って」→ AI が自動的にツールを呼び出し
- **VRMA アニメーション対応**: VRMA ファイルの読み込み・再生（ループ・フェード対応）
- **リアルタイム**: WebSocket で低遅延通信（<10ms）
- **柔軟な配置**: 環境変数で VRM/VRMA ファイルの場所を自由に設定
- **ブラウザレンダリング**: Three.js でスムーズな 60FPS 描画

## セットアップ

### 1. インストール

```bash
cd /Users/your-name//vrm-mcp
npm install
```

### 2. ビルド

```bash
npm run build
```

### 3. VRM/VRMA ファイルの配置

#### 方法 A: 環境変数で好きな場所を指定（推奨）

```bash
# 好きな場所にディレクトリ作成
mkdir -p ~/Documents/MyVRMs/{models,animations}

# VRM/VRMAファイルを配置
cp your-character.vrm ~/Documents/MyVRMs/models/
cp your-animation.vrma ~/Documents/MyVRMs/animations/
```

#### 方法 B: プロジェクト内に配置（デフォルト）

```bash
# プロジェクト内に配置
cp your-character.vrm public/models/
cp your-animation.vrma public/animations/
```

### 4. Claude Desktop 設定

`~/Library/Application Support/Claude/claude_desktop_config.json` を編集：

```json
{
  "mcpServers": {
    "vrm-control": {
      "command": "node",
      "args": ["/Users/lvncer/GitRepos/vrm-mcp/dist/mcp-server.js"],
      "env": {
        "VRM_MODELS_DIR": "/Users/lvncer/Documents/MyVRMs/models",
        "VRMA_ANIMATIONS_DIR": "/Users/lvncer/Documents/MyVRMs/animations",
        "VIEWER_PORT": "3000"
      }
    }
  }
}
```

**環境変数を省略した場合**: デフォルトで `./public/models/` と `./public/animations/` を使用

### 5. 起動

1. **Claude Desktop を起動** → 自動的に MCP サーバーが起動します
2. **ブラウザでアクセス**: [http://localhost:3000](http://localhost:3000)
3. **Claude Desktop で指示**: 「どんな VRM モデルがある？」

## 📖 使い方

### VRM モデルの読み込み

```text
あなた: どんなVRMモデルがある？
Claude: character.vrm、character2.vrm、avatar.vrm があります

あなた: character.vrm を読み込んで
Claude: ✓ VRMモデルを読み込みました
```

### 表情制御

```text
あなた: 嬉しい表情にして
Claude: ✓ 表情 "happy" を強さ 1.0 で設定しました
```

### VRMA アニメーション

```text
あなた: どんなアニメーションがある？
Claude: greeting.vrma、wave.vrma、dance.vrma、bow.vrma があります

あなた: 笑顔で挨拶して
Claude:
  ✓ VRMAアニメーション "greeting" を読み込みました
  ✓ 表情 "happy" を強さ 1.0 で設定しました
  ▶ VRMAアニメーション "greeting" を再生しました

あなた: ダンスを繰り返して
Claude: ▶ VRMAアニメーション "dance" を再生しました（ループ）

あなた: 止めて
Claude: ⏹ VRMAアニメーションを停止しました
```

### ボーン操作

```text
あなた: 右手を上げて
Claude: ✓ ボーン "rightUpperArm" をアニメーションしました
```

## 利用可能なツール

| Tool                  | 説明                             | 使用例                         |
| --------------------- | -------------------------------- | ------------------------------ |
| `list_vrm_files`      | 利用可能な VRM/VRMA ファイル一覧 | 「どんな VRM がある？」        |
| `load_vrm_model`      | VRM モデル読み込み               | 「character.vrm を読み込んで」 |
| `set_vrm_expression`  | 表情設定                         | 「嬉しい表情にして」           |
| `set_vrm_pose`        | ポーズ設定                       | 「右を向いて」                 |
| `animate_vrm_bone`    | ボーン操作                       | 「右手を上げて」               |
| `load_vrma_animation` | VRMA アニメーション読み込み      | 「greeting.vrma を読み込んで」 |
| `play_vrma_animation` | アニメーション再生               | 「挨拶して」                   |
| `stop_vrma_animation` | アニメーション停止               | 「止めて」                     |
| `get_vrm_status`      | 状態取得                         | 「現在の状態は？」             |

## プロジェクト構造

```sh
vrm-mcp/
├── src/
│   └── mcp-server.ts          # MCPサーバー実装
├── public/
│   ├── viewer.html            # VRMビューア（VRMA対応）
│   ├── models/                # VRMモデル配置（デフォルト）
│   └── animations/            # VRMAアニメーション配置（デフォルト）
├── dist/                      # ビルド出力
├── package.json
├── tsconfig.json
└── README.md
```

## 環境変数

| 環境変数              | 説明                                      | デフォルト値          |
| --------------------- | ----------------------------------------- | --------------------- |
| `VRM_MODELS_DIR`      | VRM モデルファイルのディレクトリ          | `./public/models`     |
| `VRMA_ANIMATIONS_DIR` | VRMA アニメーションファイルのディレクトリ | `./public/animations` |
| `VIEWER_PORT`         | Web ビューアのポート番号                  | `3000`                |
