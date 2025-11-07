# Verification Steps - VRM MCP Integration

## Phase 1: VRM Viewer Migration ✅

### 完了した変更

1. ✅ Three.js と @pixiv/three-vrm をインストール
2. ✅ `src/app/viewer/page.tsx` を Next.js React コンポーネントに書き直し
3. ✅ `public/index.html` をバックアップ（`index.html.backup`）
4. ✅ Viewer の動作確認完了

### 確認方法

```bash
# サーバーが起動していることを確認
curl http://localhost:3000/viewer

# ブラウザでアクセス
open http://localhost:3000/viewer
```

**期待される結果:**
- VRM Viewer が表示される
- 「🎭 VRM Viewer (VRMA対応)」のパネルが表示される
- Status: Connected（緑の点）

## Phase 2: MCP Tool Loading Fix ✅

### 完了した変更

1. ✅ デバッグログを追加
   - `[MCP]` プレフィックスで全てのログを統一
   - SSE接続、トランスポート作成、ツールリスト取得のログ追加

2. ✅ 認証問題を修正
   - ローカル開発環境（localhost）では認証を自動スキップ
   - リモート環境では引き続きAPIキー認証を使用

### 確認方法

#### ステップ1: SSE接続テスト

```bash
# APIキーなしでSSE接続をテスト
curl -N -H "Accept: text/event-stream" http://localhost:3000/api/mcp/sse

# 期待される出力:
# event: endpoint
# data: /api/mcp/messages?sessionId=<session-id>
# 
# : ping  (30秒ごと)
```

#### ステップ2: Cursorでの確認

1. **Cursor設定を更新:**

   Cursorの設定ファイルに以下を追加（詳細は `CURSOR_CONFIG_EXAMPLE.md` 参照）：

   ```json
   {
     "mcpServers": {
       "vrm-mcp": {
         "url": "http://localhost:3000/api/mcp/sse",
         "transport": "sse"
       }
     }
   }
   ```

2. **開発サーバーを起動:**

   ```bash
   npm run dev
   ```

3. **Cursorを再起動**

4. **MCPツールが読み込まれることを確認:**

   Cursorのログまたは MCP パネルで、以下のツールが表示されるはずです：
   - `list_vrm_files`
   - `load_vrm_model`
   - `set_vrm_expression`
   - `set_vrm_pose`
   - `animate_vrm_bone`
   - `load_vrma_animation`
   - `play_vrma_animation`
   - `stop_vrma_animation`
   - `get_vrm_status`

#### ステップ3: サーバーログを確認

開発サーバーのログに以下のようなメッセージが表示されているはずです：

```
[MCP] Auth check: Local development mode - allowing access
[MCP] Getting or creating MCP server
[MCP] Creating new MCP server instance
[MCP] MCP server instance created
[MCP] Creating SSE transport
[MCP] Transport created with sessionId: <session-id>
[MCP] Transport stored in map (total: 1)
[MCP] Connecting server to transport...
[MCP] ✅ SSE client connected successfully: <session-id>
```

#### ステップ4: ツールの動作確認（オプション）

Cursorで以下のようなプロンプトを試してください：

```
どんなVRMモデルがありますか？
```

期待される動作：
1. Cursorが `list_vrm_files` ツールを呼び出す
2. サーバーログに `[MCP] CallTool request received: list_vrm_files` が表示される
3. Cursorに利用可能なファイル一覧が返される

## トラブルシューティング

### 問題: Cursorでツールが読み込めない

**確認事項:**

1. **開発サーバーが起動しているか:**
   ```bash
   curl http://localhost:3000/api/mcp/sse
   ```

2. **Cursorの設定が正しいか:**
   - URLが `http://localhost:3000/api/mcp/sse` になっているか
   - `transport` が `"sse"` になっているか

3. **ポートが競合していないか:**
   ```bash
   lsof -i :3000
   ```

4. **Cursorを再起動したか:**
   設定変更後は必ず再起動が必要です

### 問題: "Unauthorized" エラー

**解決策:**
- ローカル環境（localhost）では自動的に認証がスキップされるはずです
- もしエラーが出る場合は、`process.env.NODE_ENV` が `development` になっているか確認してください

## 変更されたファイルまとめ

### 新規作成
- `src/app/viewer/page.tsx` - VRM Viewerコンポーネント
- `CURSOR_CONFIG_EXAMPLE.md` - Cursor設定例
- `VERIFICATION_STEPS.md` - この検証手順書

### 変更
- `package.json` - three, @pixiv/three-vrm, @types/three を追加
- `src/pages/api/mcp/sse.ts` - デバッグログ追加、認証ロジック改善
- `src/pages/api/mcp/messages.ts` - デバッグログ追加、認証ロジック改善

### バックアップ
- `public/index.html` → `public/index.html.backup`

## 次のステップ

全ての検証が完了したら：

1. ✅ Phase 1 完了: VRM Viewer が Next.js で動作
2. ✅ Phase 2 完了: MCP ツールが Cursor で読み込める
3. 🎉 VRMモデルを自然言語で操作できます！

使用例：
```
先輩: 「どんなVRMモデルがある？」
Cursor: 「character.vrm があります」

先輩: 「character.vrm を読み込んで、嬉しい表情にして」
Cursor: VRMモデルを読み込み、happy表情を設定
```

