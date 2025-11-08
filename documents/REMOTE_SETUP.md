# リモート MCP サーバー セットアップガイド

このガイドでは、VRM MCP サーバーを Vercel にデプロイし、リモートからアクセスする方法を説明します。

## 概要

リモート MCP サーバーを使用することで、以下のメリットがあります：

- ✅ ローカル環境に環境変数を設定する必要がない
- ✅ 複数のクライアント（Claude Desktop、Cursor 等）から同じサーバーにアクセス可能
- ✅ VRM モデルとアニメーションを一元管理
- ✅ チーム内で共有可能
- ✅ **Redis セッション管理**で複数インスタンス対応

> 💡 **重要**: リモート環境では**Redis（Upstash）**が必須です。
> セッション情報を共有して、複数インスタンス間での動作を保証します。

## アーキテクチャ

```text
┌──────────────────┐     stdio      ┌──────────────────┐
│ Claude Desktop   │ ←──────────→   │  Gateway (local) │
└──────────────────┘                └──────────┬───────┘
                                               │ SSE
                                               ↓
                                    ┌──────────────────┐
                                    │  MCP Server      │
                                    └──────────────────┘
                                               │ SSE
                                               ↓
                                    ┌──────────────────┐
                                    │  Viewer (Browser)│
                                    └──────────────────┘
```

## 0. 事前準備：Redis（Upstash）のセットアップ

リモート環境では Redis が**必須**です。先に設定してください。

👉 **[Redis セットアップガイド（REDIS_SETUP.md）](./REDIS_SETUP.md)** を参照

取得する情報：

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

---

## 1. Railway へのデプロイ（推奨）

### 1.1 Railway アカウント作成

[railway.app](https://railway.app) でアカウントを作成し、GitHub と連携します。

### 1.2 プロジェクトのデプロイ

```bash
# Railway CLIをインストール（まだの場合）
npm install -g @railway/cli

# ログイン
railway login

# プロジェクトをデプロイ
cd /path/to/vrm-mcp
railway init
railway up
```

または、Web UI から：

1. Railway Dashboard → **New Project**
2. **Deploy from GitHub repo**
3. リポジトリを選択

### 1.3 環境変数の設定

Railway Dashboard → プロジェクト → **Variables** で以下を設定：

```bash
# 必須
MCP_API_KEY=your-super-secret-key-12345
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXXXyyyyyzzzzz==

# オプション
ALLOWED_ORIGINS=https://vrmcp.up.railway.app
PORT=3000
```

### 1.4 Start Command の設定

Settings → Deploy → **Start Command**:

```bash
node dist/mcp-server.js
```

Build Command（自動検出されるはず）:

```bash
npm install && npm run build
```

### 1.5 デプロイ確認

デプロイが完了すると、URL が表示されます：

[https://vrmcp.up.railway.app](https://vrmcp.up.railway.app)

### 1.6 環境変数の設定

- `MCP_API_KEY`: `your-super-secret-key-12345`
- `ALLOWED_ORIGINS`: `https://vrmcp.up.railway.app`

## 2. クライアント設定

### 2.1 Claude Desktop（Gateway 経由）

ローカルでゲートウェイを使用して Claude Desktop から接続します。

#### ステップ 1: 依存関係のインストール

```bash
cd /path/to/vrm-mcp
npm install
npm run build
```

#### ステップ 2: 環境変数の設定

```bash
# ~/.zshrc または ~/.bashrc に追加
export MCP_REMOTE_URL="https://vrmcp.up.railway.app/api/mcp/sse"
export MCP_API_KEY="your-super-secret-key-12345"
```

設定を反映：

```bash
source ~/.zshrc
```

#### ステップ 3: Claude Desktop 設定

`~/Library/Application Support/Claude/claude_desktop_config.json` を編集：

```json
{
  "mcpServers": {
    "vrm-remote": {
      "command": "node",
      "args": ["/path/to/vrm-mcp/dist/gateway.js"],
      "env": {
        "MCP_REMOTE_URL": "https://vrmcp.up.railway.app/api/mcp/sse",
        "MCP_API_KEY": "your-super-secret-key-12345"
      }
    }
  }
}
```

#### ステップ 4: Claude Desktop を再起動

設定を反映するため、Claude Desktop を再起動します。

### 2.2 Cursor（直接 SSE 接続）

Cursor から直接 SSE 接続する場合の設定例：

```json
{
  "mcpServers": {
    "vrm-remote": {
      "type": "sse",
      "url": "https://vrmcp.up.railway.app/mcp/sse",
      "headers": {
        "x-api-key": "your-super-secret-key-12345"
      }
    }
  }
}
```

## 3. Web ビューアの使用

デプロイされたサーバーでは、静的ファイルも配信されます：

[https://vrmcp.up.railway.app/](https://vrmcp.up.railway.app/)

ブラウザでアクセスすると、VRM ビューアが表示されます。SSE 経由でリアルタイムに更新されます。

## 4. 動作確認

### 4.1 ローカルゲートウェイのテスト

```bash
# ゲートウェイを直接実行してログ確認
npm run gateway
```

以下のような出力が表示されれば OK：

```sh
🌉 VRM MCP Gateway starting...
📡 Remote URL: https://vrmcp.up.railway.app/api/mcp/sse
✓ Connected to remote MCP server
✓ Gateway ready (stdio ⇄ SSE)
```

### 4.2 Claude Desktop でテスト

Claude Desktop で以下を試してみてください：

```text
あなた: どんなVRMモデルがある？

Claude: [リモートサーバーからツール一覧を取得して応答]
```

## 5. セキュリティのベストプラクティス

### 5.1 API キーの管理

- ✅ 強力なランダムキーを生成（最低 32 文字）
- ✅ 環境変数で管理し、コードにハードコードしない
- ✅ 定期的にローテーション
- ❌ GitHub にコミットしない

```bash
# 強力なAPIキーを生成
openssl rand -base64 32
```

### 5.2 CORS 設定

必要なオリジンのみを許可：

```bash
# 本番環境
ALLOWED_ORIGINS=https://vrmcp.up.railway.app

# 開発環境も含める場合
ALLOWED_ORIGINS=https://vrmcp.up.railway.app,http://localhost:3000
```

### 5.3 レート制限

デフォルトで実装されていますが、必要に応じて調整：

- デフォルト: 60 リクエスト/分
- 変更する場合は `src/mcp-server.ts` の `RateLimiter` を編集

## 6. ローカル開発

リモートサーバーとローカル開発を両立できます：

```bash
# ローカルサーバーを起動（stdio + HTTP）
npm run dev

# ブラウザでアクセス
open http://localhost:3000
```

ローカル設定（Claude Desktop）:

```json
{
  "mcpServers": {
    "vrm-local": {
      "command": "node",
      "args": ["/path/to/vrm-mcp/dist/mcp-server.js"]
    },
    "vrm-remote": {
      "command": "node",
      "args": ["/path/to/vrm-mcp/dist/gateway.js"],
      "env": {
        "MCP_REMOTE_URL": "https://vrmcp.up.railway.app/api/mcp/sse",
        "MCP_API_KEY": "your-key"
      }
    }
  }
}
```
