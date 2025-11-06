# Redis セッション管理セットアップガイド

VRM MCPサーバーをリモート環境（Railway等）で動かす場合、複数インスタンス間でセッション情報を共有するためにRedisを使用します。

## なぜRedisが必要？

### 問題: ステートレス環境でのセッション喪失

```
┌─────────────┐  GET /mcp/sse      ┌──────────────┐
│   Client    │ ──────────────────▶│  Instance A  │
└─────────────┘                    │  (sessionId  │
                                   │   保存)      │
                                   └──────────────┘

┌─────────────┐  POST /messages    ┌──────────────┐
│   Client    │ ──────────────────▶│  Instance B  │
└─────────────┘                    │  (sessionId  │
                                   │   なし!) ❌  │
                                   └──────────────┘
```

### 解決: Redisで共有ストレージ

```
┌─────────────┐  GET /mcp/sse      ┌──────────────┐
│   Client    │ ──────────────────▶│  Instance A  │
└─────────────┘                    │  ↓ 保存      │
                                   └──────┬───────┘
                                          │
                                   ┌──────▼───────┐
                                   │    Redis     │
                                   │  (sessions)  │
                                   └──────▲───────┘
                                          │
┌─────────────┐  POST /messages    ┌─────┴────────┐
│   Client    │ ──────────────────▶│  Instance B  │
└─────────────┘                    │  ↑ 取得 ✅   │
                                   └──────────────┘
```

---

## セットアップ手順

### Step 1: Upstash Redisアカウント作成

1. **https://upstash.com/** にアクセス
2. **Sign Up** → GitHubアカウントで登録（無料）
3. ダッシュボードにログイン

### Step 2: Redis データベース作成

1. **Create Database** をクリック
2. 設定：
   - **Name**: `vrm-mcp-sessions`
   - **Type**: **Global**（推奨）
   - **Primary Region**: **Tokyo** または近い地域
   - **Read Regions**: 必要に応じて追加
   - **Eviction**: **allkeys-lru**（推奨）
   - **TLS**: **Enabled**（必須）
3. **Create** をクリック

### Step 3: 認証情報の取得

データベース作成後、以下の情報をコピー：

1. **REST API** タブをクリック
2. 以下をコピー：
   ```
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=AXXXyyyyyzzzzz==
   ```

---

## 環境変数の設定

### ローカル開発

`.env` ファイルを作成（または `.zshrc`/`.bashrc` に追加）:

```bash
# Redis（Upstash）
export UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="AXXXyyyyyzzzzz=="

# その他の既存の環境変数
export MCP_API_KEY="your-api-key"
export ALLOWED_ORIGINS="http://localhost:3000"
```

反映：
```bash
source ~/.zshrc
# または
source .env
```

### Railway

1. Railwayダッシュボードでプロジェクトを開く
2. **Variables** タブをクリック
3. **New Variable** で以下を追加：

```
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXXXyyyyyzzzzz==
```

4. **Deploy** をクリックして再デプロイ

---

## 動作確認

### 1. ローカルでテスト

```bash
# サーバー起動
npm run dev
```

ログに以下が表示されればOK:
```
✓ Redis session manager initialized
Redis Sessions: ENABLED
```

### 2. Redisへの接続確認

Upstashダッシュボードで：
- **Data Browser** を開く
- キー `mcp:session:*` が作成されているか確認
- SSE接続すると自動的にキーが追加される

### 3. セッション情報の確認

```bash
# curlでSSE接続
curl -N "http://localhost:3000/mcp/sse?apiKey=YOUR_KEY"
```

別のターミナルで、Upstash Data Browserを確認：
```
mcp:session:177b4a80-105b-40b9-bf53-4976d61ac58c
```

---

## Redis設定の詳細

### セッション有効期限

デフォルト: **1時間（3600秒）**

変更したい場合、`src/redis-client.ts` の `SESSION_TTL` を編集：

```typescript
private readonly SESSION_TTL = 3600; // 秒単位
```

### 自動延長

心拍（30秒ごと）でセッションが自動延長されます：

```typescript
// src/mcp-server.ts
const heartbeat = setInterval(async () => {
  if (res.writable) {
    res.write(": ping\n\n");
    // セッション延長
    await this.sessionManager.extendSession(transport.sessionId);
  }
}, 30000);
```

### クリーンアップ

Redis側で自動的に期限切れキーを削除（`ex` オプション使用）：

```typescript
await redis.set(key, value, { ex: this.SESSION_TTL });
```

---

## トラブルシューティング

### Redis接続エラー

**症状**: `Redis session manager` が初期化されない

**確認**:
```bash
echo $UPSTASH_REDIS_REST_URL
echo $UPSTASH_REDIS_REST_TOKEN
```

両方とも値が表示されるか確認。

**解決**:
- 環境変数が正しく設定されているか
- Upstashダッシュボードで正しいURLとトークンをコピーしたか
- Railway等の場合、Variables設定後に再デプロイしたか

### セッションが見つからない（404エラー）

**症状**: `{"error":"Invalid session"}`

**原因**:
1. セッションが期限切れ（1時間経過）
2. Redis接続が失敗している
3. セッションIDが間違っている

**確認**:
```bash
# Upstash Data Browserでキーを確認
# キーが存在するか？
# TTLが残っているか？
```

### 複数インスタンス問題（503エラー）

**症状**: `{"error":"Service temporarily unavailable"}`

**説明**: セッションはRedisに存在するが、SSE接続が別インスタンスにある

**対策**: Railwayで単一インスタンスに制限する設定（無料プランでは自動）

---

## Redisなしでの動作（フォールバック）

Redis環境変数が設定されていない場合、自動的にメモリ内セッション管理にフォールバック：

```
⚠️  Redis not configured, falling back to in-memory sessions
Redis Sessions: DISABLED (in-memory)
```

**制限**:
- 単一インスタンスでのみ動作
- 複数インスタンス環境では404エラー発生

**用途**:
- ローカル開発
- 単一サーバー運用

---

## 料金

### Upstash 無料プラン

- **コマンド数**: 10,000/日
- **ストレージ**: 256MB
- **帯域幅**: 200MB/日

**VRM MCPの使用量目安**:
- セッション作成: 1コマンド
- セッション延長（30秒ごと）: 1コマンド
- 1時間接続: 約120コマンド

**結論**: 無料枠で十分！

---

## 次のステップ

1. ✅ Upstash Redisセットアップ完了
2. ✅ 環境変数設定
3. ✅ ローカルでテスト
4. 🚀 Railwayにデプロイ

Railwayデプロイ手順は `REMOTE_SETUP.md` を参照してください。

