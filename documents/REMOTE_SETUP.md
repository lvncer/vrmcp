# リモートMCPサーバー セットアップガイド

このガイドでは、VRM MCPサーバーをVercelにデプロイし、リモートからアクセスする方法を説明します。

## 概要

リモートMCPサーバーを使用することで、以下のメリットがあります：

- ✅ ローカル環境に環境変数を設定する必要がない
- ✅ 複数のクライアント（Claude Desktop、Cursor等）から同じサーバーにアクセス可能
- ✅ VRMモデルとアニメーションを一元管理
- ✅ チーム内で共有可能

## アーキテクチャ

```
┌──────────────────┐     stdio      ┌──────────────────┐
│ Claude Desktop   │ ←──────────→   │  Gateway (local) │
└──────────────────┘                └──────────┬───────┘
                                               │ SSE
                                               ↓
                                    ┌──────────────────────┐
                                    │  MCP Server (Vercel) │
                                    └──────────┬───────────┘
                                               │ SSE
                                               ↓
                                    ┌──────────────────────┐
                                    │  Viewer (Browser)    │
                                    └──────────────────────┘
```

## 1. Vercelへのデプロイ

### 1.1 Vercelアカウント作成

[vercel.com](https://vercel.com) でアカウントを作成し、GitHubと連携します。

### 1.2 プロジェクトのデプロイ

```bash
# Vercel CLIをインストール（まだの場合）
npm install -g vercel

# プロジェクトをデプロイ
cd /path/to/vrm-mcp
vercel
```

初回は以下の質問に答えます：

- Set up and deploy? `Y`
- Which scope? あなたのアカウント
- Link to existing project? `N`
- Project name? `vrm-mcp`
- In which directory is your code located? `./`
- Want to modify settings? `N`

### 1.3 環境変数の設定

Vercelダッシュボードまたはコマンドラインで環境変数を設定します：

```bash
# APIキー（必須：認証に使用）
vercel env add MCP_API_KEY

# 許可するオリジン（カンマ区切り）
vercel env add ALLOWED_ORIGINS
```

例：
- `MCP_API_KEY`: `your-super-secret-key-12345`
- `ALLOWED_ORIGINS`: `https://your-domain.vercel.app,http://localhost:3000`

### 1.4 再デプロイ

環境変数を設定したら再デプロイ：

```bash
vercel --prod
```

デプロイが完了すると、URLが表示されます（例：`https://vrm-mcp-xxx.vercel.app`）

## 2. クライアント設定

### 2.1 Claude Desktop（Gateway経由）

ローカルでゲートウェイを使用してClaude Desktopから接続します。

#### ステップ1: 依存関係のインストール

```bash
cd /path/to/vrm-mcp
npm install
npm run build
```

#### ステップ2: 環境変数の設定

```bash
# ~/.zshrc または ~/.bashrc に追加
export MCP_REMOTE_URL="https://vrm-mcp-xxx.vercel.app/api/mcp/sse"
export MCP_API_KEY="your-super-secret-key-12345"
```

設定を反映：
```bash
source ~/.zshrc
```

#### ステップ3: Claude Desktop設定

`~/Library/Application Support/Claude/claude_desktop_config.json` を編集：

```json
{
  "mcpServers": {
    "vrm-remote": {
      "command": "node",
      "args": ["/path/to/vrm-mcp/dist/gateway.js"],
      "env": {
        "MCP_REMOTE_URL": "https://vrm-mcp-xxx.vercel.app/api/mcp/sse",
        "MCP_API_KEY": "your-super-secret-key-12345"
      }
    }
  }
}
```

#### ステップ4: Claude Desktopを再起動

設定を反映するため、Claude Desktopを再起動します。

### 2.2 Cursor（直接SSE接続）

Cursorから直接SSE接続する場合の設定例：

```json
{
  "mcp": {
    "servers": {
      "vrm-remote": {
        "transport": {
          "type": "sse",
          "url": "https://vrmcp.vercel.app/api/mcp/sse",
          "headers": {
            "x-api-key": "your-super-secret-key-12345"
          }
        }
      }
    }
  }
}
```

## 3. Webビューアの使用

デプロイされたサーバーでは、静的ファイルも配信されます：

```
https://vrmcp.vercel.app/
```

ブラウザでアクセスすると、VRMビューアが表示されます。SSE経由でリアルタイムに更新されます。

## 4. 動作確認

### 4.1 ローカルゲートウェイのテスト

```bash
# ゲートウェイを直接実行してログ確認
npm run gateway
```

以下のような出力が表示されればOK：

```
🌉 VRM MCP Gateway starting...
📡 Remote URL: https://vrm-mcp-xxx.vercel.app/api/mcp/sse
✓ Connected to remote MCP server
✓ Gateway ready (stdio ⇄ SSE)
```

### 4.2 Claude Desktopでテスト

Claude Desktopで以下を試してみてください：

```
あなた: どんなVRMモデルがある？

Claude: [リモートサーバーからツール一覧を取得して応答]
```

### 4.3 接続問題のデバッグ

接続に問題がある場合：

1. **APIキーを確認**
   ```bash
   echo $MCP_API_KEY
   # Vercelの環境変数と一致するか確認
   ```

2. **ネットワーク確認**
   ```bash
   curl -H "x-api-key: your-key" https://vrm-mcp-xxx.vercel.app/api/mcp/sse
   ```
   
   `event: endpoint` が返ってくればOK

3. **ログ確認**
   - Vercelダッシュボードでログを確認
   - ゲートウェイのコンソール出力を確認

## 5. セキュリティのベストプラクティス

### 5.1 APIキーの管理

- ✅ 強力なランダムキーを生成（最低32文字）
- ✅ 環境変数で管理し、コードにハードコードしない
- ✅ 定期的にローテーション
- ❌ GitHubにコミットしない

```bash
# 強力なAPIキーを生成
openssl rand -base64 32
```

### 5.2 CORS設定

必要なオリジンのみを許可：

```bash
# 本番環境
ALLOWED_ORIGINS=https://your-domain.vercel.app

# 開発環境も含める場合
ALLOWED_ORIGINS=https://your-domain.vercel.app,http://localhost:3000
```

### 5.3 レート制限

デフォルトで実装されていますが、必要に応じて調整：

- デフォルト: 60リクエスト/分
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
        "MCP_REMOTE_URL": "https://vrm-mcp-xxx.vercel.app/api/mcp/sse",
        "MCP_API_KEY": "your-key"
      }
    }
  }
}
```

## 7. トラブルシューティング

### タイムアウトエラー

Vercelの無料プランでは関数の実行時間に制限があります（10秒）。長時間接続が必要な場合：

- Pro プランにアップグレード（最大300秒）
- または、心拍間隔を調整

### セッション切断

SSE接続が頻繁に切断される場合：

- 心拍送信間隔を短くする（デフォルト30秒→15秒）
- クライアント側で自動再接続を実装（ブラウザ側は既に実装済み）

### CORS エラー

```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```

- `ALLOWED_ORIGINS` にクライアントのオリジンが含まれているか確認
- ブラウザの開発者ツールでリクエストヘッダーを確認

## 8. 次のステップ

- 📦 VRMモデルをVercelのストレージに配置
- 🔐 OAuth2認証の追加（Auth0等）
- 📊 使用状況のモニタリング（Vercel Analytics）
- 🚀 CDNでモデル配信の高速化
- 🤝 チームメンバーの招待と権限管理

## まとめ

これでリモートMCPサーバーのセットアップが完了しました！

どこからでもVRMモデルを操作できる環境が整いました。

