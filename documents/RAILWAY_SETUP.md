# Railway デプロイ設定ガイド

このドキュメントは、Next.js化したVRM MCPプロジェクトをRailwayにデプロイする際の設定手順です。

## 前提条件

- Railwayアカウントとプロジェクトが作成済み
- GitHubリポジトリと連携済み

## デプロイ設定

### 1. Build & Start コマンド

Railwayのプロジェクト設定で以下を設定：

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm start -- -p $PORT
```

または、Railway設定画面で：
- Build Command: `npm run build`
- Start Command: `npm start`

Railwayは自動的に`npm install`を実行し、`$PORT`環境変数を提供します。

### 2. 環境変数

Railwayのプロジェクト設定 → Variables で以下を設定：

#### 必須
- `NODE_ENV`: `production`

#### 認証・セキュリティ（推奨）
- `MCP_API_KEY`: MCPエンドポイントのAPIキー（任意の文字列）
- `ALLOWED_ORIGINS`: CORS許可オリジン（カンマ区切り）
  - 例: `https://your-domain.railway.app,https://another-domain.com`
  - または `*` で全許可（開発時のみ推奨）

#### Redis（オプション・推奨）
複数インスタンスでのセッション共有に必要：

- `UPSTASH_REDIS_REST_URL`: Upstash RedisのREST URL
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redisのトークン

> **Note:** Redisを設定しない場合、セッションはメモリ内に保存されます（単一インスタンスでは問題なし）。

### 3. Node.jsバージョン

`package.json`で指定済み：
```json
{
  "engines": {
    "node": "20.x"
  }
}
```

Railwayは自動的にNode.js 20を使用します。

### 4. ルートディレクトリ設定

プロジェクトをルートに移動した後、Railwayの設定は不要です。
もし`vrmcp/`サブディレクトリのままデプロイする場合：

- Settings → Root Directory: `vrmcp`

## デプロイ後の確認

### エンドポイント

デプロイ後、以下のエンドポイントが利用可能：

- **MCP SSE**: `https://your-app.railway.app/api/mcp/sse`
- **MCP Messages**: `https://your-app.railway.app/api/mcp/messages`
- **Viewer**: `https://your-app.railway.app/viewer`
- **静的アセット**: 
  - `/models/*` (VRMモデル)
  - `/animations/*` (VRMAアニメーション)

### 動作確認

1. **Viewerページ**: `https://your-app.railway.app/viewer` にアクセス
   - "Connected" ステータスが表示されることを確認

2. **MCP接続テスト** (ローカルから):
   ```bash
   export MCP_REMOTE_URL="https://your-app.railway.app/api/mcp/sse"
   export MCP_API_KEY="your-api-key"
   npm run gateway
   ```

## Claude Desktopとの連携

### 設定ファイル

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "vrm-remote": {
      "command": "npm",
      "args": ["run", "gateway"],
      "cwd": "/path/to/vrmcp",
      "env": {
        "MCP_REMOTE_URL": "https://your-app.railway.app/api/mcp/sse",
        "MCP_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 使い方

1. Claude Desktopを再起動
2. チャット画面でMCPツールが利用可能に
3. 例: "VRMモデルを読み込んで" → `load_vrm_model` ツールが実行される

## トラブルシューティング

### ビルドエラー

- `npm install`が失敗する場合、`package-lock.json`を削除して再試行
- TypeScriptエラーが出る場合、`tsconfig.json`の設定を確認

### SSE接続エラー

- `ALLOWED_ORIGINS`に正しいドメインが含まれているか確認
- ブラウザのコンソールでCORSエラーをチェック

### セッションが維持されない

- 複数インスタンスの場合、Redisの設定が必要
- `UPSTASH_REDIS_REST_URL`と`UPSTASH_REDIS_REST_TOKEN`を設定

### APIキー認証エラー

- `MCP_API_KEY`が正しく設定されているか確認
- Gateway起動時に同じAPIキーを環境変数で渡しているか確認

## スケーリング

Railwayで複数インスタンスにスケールする場合：

1. **Redis必須**: セッション共有のため
2. **Upstash Redis推奨**: サーバーレス対応、低レイテンシ
3. 環境変数に`UPSTASH_REDIS_REST_URL`と`UPSTASH_REDIS_REST_TOKEN`を設定

## 参考リンク

- [Railway Docs](https://docs.railway.app/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Upstash Redis](https://upstash.com/)

