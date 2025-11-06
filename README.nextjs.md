# VRM MCP - Next.js Edition

VRMモデルをMCP (Model Context Protocol) 経由で制御するNext.jsアプリケーション。
AI（Claude等）からVRMキャラクターの表情やポーズをリアルタイムで操作できます。

## 特徴

- **Next.js 16**: App Router + Pages API（SSE対応）
- **MCP Protocol**: SSE経由でリモートMCPサーバーとして動作
- **Redis Session**: Upstash Redisでマルチインスタンス対応
- **Viewer UI**: リアルタイムイベントログ表示
- **Gateway CLI**: Claude DesktopからリモートMCP接続

## プロジェクト構成

```
vrmcp/
├── src/
│   ├── app/              # Next.js App Router
│   │   └── viewer/       # Viewerページ
│   ├── pages/api/        # API Routes (SSE対応)
│   │   ├── mcp/          # MCP SSE/Messages
│   │   └── viewer/       # Viewer SSE
│   ├── lib/              # ユーティリティ
│   │   └── redis-client.ts
│   └── gateway.ts        # CLI Gateway (Claude Desktop用)
├── public/               # 静的アセット
│   ├── models/           # VRMモデル
│   └── animations/       # VRMAアニメーション
└── package.json
```

## セットアップ

### 1. 依存インストール

```bash
npm install
```

### 2. 静的アセットのコピー

```bash
# ルートのpublic/からコピー
cp -r ../public/models ./public/
cp -r ../public/animations ./public/
```

### 3. 環境変数（オプション）

`.env.local`を作成：

```env
# 認証（オプション）
MCP_API_KEY=your-secret-key

# CORS設定
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com

# Redis（マルチインスタンス用・オプション）
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

### 4. 開発サーバー起動

```bash
npm run dev
```

- アプリ: http://localhost:3000
- Viewer: http://localhost:3000/viewer
- MCP SSE: http://localhost:3000/api/mcp/sse

## 使い方

### Webビューア

1. http://localhost:3000/viewer にアクセス
2. SSE接続が確立され、リアルタイムでイベントを表示
3. MCPコマンドが実行されると、ログに表示される

### Claude Desktopから接続（Gateway経由）

1. **Gateway設定**

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vrm": {
      "command": "npm",
      "args": ["run", "gateway"],
      "cwd": "/path/to/vrmcp",
      "env": {
        "MCP_REMOTE_URL": "http://localhost:3000/api/mcp/sse",
        "MCP_API_KEY": "your-secret-key"
      }
    }
  }
}
```

2. **Claude Desktop再起動**

3. **使用例**

```
User: VRMモデル "character.vrm" を読み込んで
Claude: [load_vrm_model ツールを実行]

User: 笑顔にして
Claude: [set_vrm_expression ツールを実行]
```

## デプロイ

### Railway

詳細は [RAILWAY_SETUP.md](./RAILWAY_SETUP.md) を参照。

**簡易手順:**

1. Railwayプロジェクト作成・GitHub連携
2. 環境変数設定:
   - `MCP_API_KEY`
   - `ALLOWED_ORIGINS`
   - `UPSTASH_REDIS_REST_URL` (オプション)
   - `UPSTASH_REDIS_REST_TOKEN` (オプション)
3. デプロイ（自動）

**エンドポイント:**
- MCP SSE: `https://your-app.railway.app/api/mcp/sse`
- Viewer: `https://your-app.railway.app/viewer`

### Vercel

Next.jsなので、Vercelにもデプロイ可能：

```bash
npm install -g vercel
vercel
```

> **Note:** SSEは長時間接続のため、Vercel Hobbyプランでは制限あり。Railwayを推奨。

## スクリプト

```bash
npm run dev       # 開発サーバー
npm run build     # プロダクションビルド
npm run start     # プロダクション起動
npm run gateway   # Gateway CLI起動（Claude Desktop用）
npm run lint      # Biome lint
npm run format    # Biome format
```

## API仕様

### MCP Tools

利用可能なツール一覧：

- `load_vrm_model`: VRMモデル読み込み
- `set_vrm_expression`: 表情設定
- `set_vrm_pose`: ポーズ設定
- `animate_vrm_bone`: ボーン回転
- `get_vrm_status`: 状態取得
- `list_vrm_files`: ファイル一覧
- `load_vrma_animation`: アニメーション読み込み
- `play_vrma_animation`: アニメーション再生
- `stop_vrma_animation`: アニメーション停止

### SSE Endpoints

**MCP SSE** (`GET /api/mcp/sse`)
- MCP Protocol over SSE
- `x-api-key` ヘッダーまたは `?apiKey=` クエリパラメータで認証

**MCP Messages** (`POST /api/mcp/messages?sessionId=xxx`)
- SSEセッションへのメッセージ送信

**Viewer SSE** (`GET /api/viewer/sse`)
- Viewer向けイベントストリーム
- 認証不要

## トラブルシューティング

### SSE接続エラー

- CORSエラー → `ALLOWED_ORIGINS`を確認
- 認証エラー → `MCP_API_KEY`が一致しているか確認

### セッションが維持されない

- 複数インスタンス環境 → Redisを設定
- 単一インスタンス → メモリ内セッションで動作（問題なし）

### ビルドエラー

```bash
# キャッシュクリア
rm -rf .next node_modules
npm install
npm run build
```

## ライセンス

MIT

## 関連リンク

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Next.js Documentation](https://nextjs.org/docs)
- [VRM Specification](https://vrm.dev/)
