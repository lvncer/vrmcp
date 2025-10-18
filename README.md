# VRM MCP Server 🎭

**VRMモデルをAIが自然言語で制御できるMCPサーバー**

Claude Desktopから自然言語で指示するだけで、WebブラウザでVRMモデルがリアルタイムに動きます。

## ✨ 特徴

- ✅ **自然言語制御**: 「嬉しい表情で手を振って」→ AIが自動的にツールを呼び出し
- ✅ **VRMAアニメーション対応**: VRMAファイルの読み込み・再生（ループ・フェード対応）
- ✅ **リアルタイム**: WebSocketで低遅延通信（<10ms）
- ✅ **柔軟な配置**: 環境変数でVRM/VRMAファイルの場所を自由に設定
- ✅ **ブラウザレンダリング**: Three.jsでスムーズな60FPS描画

## 🚀 セットアップ

### 1. インストール

```bash
cd /Users/lvncer/GitRepos/vrm-mcp
npm install
```

### 2. ビルド

```bash
npm run build
```

### 3. VRM/VRMAファイルの配置

#### 方法A: 環境変数で好きな場所を指定（推奨）

```bash
# 好きな場所にディレクトリ作成
mkdir -p ~/Documents/MyVRMs/{models,animations}

# VRM/VRMAファイルを配置
cp your-character.vrm ~/Documents/MyVRMs/models/
cp your-animation.vrma ~/Documents/MyVRMs/animations/
```

#### 方法B: プロジェクト内に配置（デフォルト）

```bash
# プロジェクト内に配置
cp your-character.vrm public/models/
cp your-animation.vrma public/animations/
```

### 4. Claude Desktop設定

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

1. **Claude Desktopを起動** → 自動的にMCPサーバーが起動します
2. **ブラウザでアクセス**: http://localhost:3000
3. **Claude Desktopで指示**: 「どんなVRMモデルがある？」

## 📖 使い方

### VRMモデルの読み込み

```
あなた: どんなVRMモデルがある？
Claude: character.vrm、character2.vrm、avatar.vrm があります

あなた: character.vrm を読み込んで
Claude: ✓ VRMモデルを読み込みました
```

### 表情制御

```
あなた: 嬉しい表情にして
Claude: ✓ 表情 "happy" を強さ 1.0 で設定しました
```

### VRMAアニメーション

```
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

```
あなた: 右手を上げて
Claude: ✓ ボーン "rightUpperArm" をアニメーションしました
```

## 🛠️ 利用可能なツール

| ツール名 | 説明 | 使用例 |
|---------|------|--------|
| `list_vrm_files` | 利用可能なVRM/VRMAファイル一覧 | 「どんなVRMがある？」 |
| `load_vrm_model` | VRMモデル読み込み | 「character.vrm を読み込んで」 |
| `set_vrm_expression` | 表情設定 | 「嬉しい表情にして」 |
| `set_vrm_pose` | ポーズ設定 | 「右を向いて」 |
| `animate_vrm_bone` | ボーン操作 | 「右手を上げて」 |
| `load_vrma_animation` | VRMAアニメーション読み込み | 「greeting.vrma を読み込んで」 |
| `play_vrma_animation` | アニメーション再生 | 「挨拶して」 |
| `stop_vrma_animation` | アニメーション停止 | 「止めて」 |
| `get_vrm_status` | 状態取得 | 「現在の状態は？」 |

## 📁 プロジェクト構造

```
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

## 🔧 環境変数

| 環境変数 | 説明 | デフォルト値 |
|---------|------|-------------|
| `VRM_MODELS_DIR` | VRMモデルファイルのディレクトリ | `./public/models` |
| `VRMA_ANIMATIONS_DIR` | VRMAアニメーションファイルのディレクトリ | `./public/animations` |
| `VIEWER_PORT` | Webビューアのポート番号 | `3000` |

## 🐛 トラブルシューティング

### ブラウザでVRMが表示されない

- ブラウザのコンソールを確認してください
- VRMファイルが正しい場所に配置されているか確認
- CORSエラーの場合: ファイルパスが正しいか確認

### WebSocket接続エラー

```
Error: WebSocket connection failed
```

- MCPサーバーが起動しているか確認
- ポート3000が使用中でないか確認: `lsof -i :3000`

### Claude Desktopからツールが見えない

- `claude_desktop_config.json` のパスが正しいか確認
- Claude Desktopを再起動

## 📚 参考資料

- [Architecture Document](./documents/architecture.md) - 詳細なアーキテクチャ設計
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) - VRM SDK
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP仕様

## 📝 ライセンス

MIT

## 🙏 謝辞

- [Three.js](https://threejs.org/)
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

**作成日**: 2025/10/19  
**AIに話しかけるだけで、VRMキャラクターが動く** 🎭✨

