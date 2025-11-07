# Cursor Configuration Example

このファイルは、Cursorでvrm-mcpを使用するための設定例です。

## ローカル開発環境での設定

Cursorの設定ファイル（`~/.cursor/mcp.json` または Cursor設定UI）に以下を追加してください：

### オプション1: Next.js開発サーバー経由（推奨）

```json
{
  "mcpServers": {
    "vrm-mcp-nextjs": {
      "url": "http://localhost:3000/api/mcp/sse",
      "transport": "sse"
    }
  }
}
```

**手順:**
1. ターミナルで `npm run dev` を実行してNext.jsサーバーを起動
2. Cursorを起動
3. Cursorが自動的にMCPサーバーに接続します

**注意:**
- ローカル開発環境（localhost）では認証が自動的にスキップされます
- リモートデプロイでは `.env` の `MCP_API_KEY` が必要です

### オプション2: Gateway経由（Claude Desktop用）

将来的にClaude Desktopから接続する場合は、gatewayを使用します：

```json
{
  "mcpServers": {
    "vrm-mcp-gateway": {
      "command": "npm",
      "args": ["run", "gateway"],
      "cwd": "/Users/lvncer/GitRepos/vrm-mcp",
      "env": {
        "MCP_REMOTE_URL": "http://localhost:3000/api/mcp/sse"
      }
    }
  }
}
```

## トラブルシューティング

### ツールが読み込めない場合

1. **開発サーバーが起動しているか確認:**
   ```bash
   curl http://localhost:3000/api/mcp/sse
   ```
   
   正常な場合、以下のようなSSEイベントが返されます：
   ```
   event: endpoint
   data: /api/mcp/messages?sessionId=...
   ```

2. **ログを確認:**
   開発サーバーのログに以下のようなメッセージが表示されているはずです：
   ```
   [MCP] Auth check: Local development mode - allowing access
   [MCP] Creating new MCP server instance
   [MCP] ✅ SSE client connected successfully: <sessionId>
   ```

3. **Cursorを再起動:**
   設定変更後は、Cursorを完全に再起動してください。

## 利用可能なツール

接続に成功すると、以下のツールが利用可能になります：

- `list_vrm_files` - VRM/VRMAファイル一覧
- `load_vrm_model` - VRMモデル読み込み
- `set_vrm_expression` - 表情設定
- `set_vrm_pose` - ポーズ設定
- `animate_vrm_bone` - ボーン操作
- `load_vrma_animation` - VRMAアニメーション読み込み
- `play_vrma_animation` - アニメーション再生
- `stop_vrma_animation` - アニメーション停止
- `get_vrm_status` - 状態取得

## Viewer

ブラウザで以下のURLにアクセスすると、VRMモデルのレンダリングが表示されます：

- **Viewer:** http://localhost:3000/viewer
- **API Status:** http://localhost:3000/api/mcp/sse (SSE接続テスト)

