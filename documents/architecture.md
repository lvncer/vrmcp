　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　# プロジェクト構造とアーキテクチャ

## 📁 ディレクトリ構造の概要

```
vrm-mcp/
├── src/           # ローカル実行用（開発環境）
├── api/           # Vercel Functions用（本番環境）
├── public/        # 静的ファイル（VRMビューア）
├── documents/     # ドキュメント
└── dist/          # ビルド成果物
```

## なぜ `src/` と `api/` が分かれているのか？

### 🏠 `src/` ディレクトリ（ローカル開発用）

**用途**: ローカル環境やVPS等で**長時間動作するサーバー**として実行

```
src/
├── mcp-server.ts   # メインサーバー（stdio + SSE + HTTP）
└── gateway.ts      # stdio↔SSEブリッジ（Claude Desktop用）
```

**特徴**:
- ✅ **ステートフル**: メモリ内で状態管理（Map, Set等）
- ✅ **長時間接続**: WebSocket/SSE接続を何時間でも維持可能
- ✅ **stdio対応**: Claude Desktopから直接起動できる
- ✅ **マルチ機能**: 1つのプロセスで複数の役割を担う

**実行方法**:
```bash
npm run dev
# または
node dist/mcp-server.js
```

**使用シーン**:
- ローカル開発
- Claude Desktopとの直接連携
- 自分のVPSで運用

---

### ☁️ `api/` ディレクトリ（Vercel Functions用）

**用途**: Vercelのサーバーレス環境で**リクエストごとに起動する関数**として実行

```
api/
├── mcp/
│   ├── sse.ts       # MCP SSEエンドポイント
│   └── messages.ts  # MCP POSTエンドポイント
└── viewer/
    └── sse.ts       # ビューア用SSE配信
```

**特徴**:
- ⚠️ **ステートレス**: リクエストごとに新しいインスタンス起動
- ⚠️ **短時間実行**: 無料プラン10秒、Proプラン300秒でタイムアウト
- ✅ **スケーラブル**: 自動スケーリング
- ✅ **デプロイ簡単**: `vercel` コマンド一発

**実行方法**:
```bash
vercel        # プレビュー環境
vercel --prod # 本番環境
```

**使用シーン**:
- リモートから複数クライアントでアクセス
- チームでの共有
- 公開デモ

---

## 🔄 両者の関係性

### 1. コード共有

`src/` と `api/` は**似た実装だが、環境に最適化されている**:

| 機能                | `src/mcp-server.ts`          | `api/mcp/sse.ts`           |
| ------------------- | ---------------------------- | -------------------------- |
| **プロセスモデル**  | 長時間動作（1プロセス）      | リクエストごと（関数）     |
| **状態管理**        | メモリ内（Map/Set）          | ⚠️ 共有不可（別インスタンス） |
| **WebSocket/SSE**   | 無制限                       | タイムアウトあり           |
| **ファイルアクセス** | ローカルファイル直接読み込み | 静的ファイル配信のみ       |
| **起動方法**        | `node` コマンド              | Vercelが自動管理           |

### 2. トランスポート方式の違い

#### ローカル（`src/mcp-server.ts`）

```
┌─────────────────┐  stdio  ┌──────────────────┐
│ Claude Desktop  │ ◀──────▶│  mcp-server.ts   │
└─────────────────┘         │  (1プロセス)     │
                            │  - stdio         │
┌─────────────────┐   SSE   │  - SSE           │
│ Cursor/Browser  │ ◀──────▶│  - HTTP          │
└─────────────────┘         │  - WebSocket     │
                            └──────────────────┘
```

**メリット**:
- 全機能が1プロセスに統合
- 状態を完全に管理できる
- 無制限の接続時間

**デメリット**:
- 自分でサーバーを起動・管理する必要がある
- 外部からアクセスするにはポート開放やngrok必要

#### リモート（`api/`）

```
┌─────────────────┐         ┌──────────────────┐
│ Claude Desktop  │  stdio  │  gateway.ts      │
└─────────────────┘ ◀──────▶│  (ローカル)      │
                            └────────┬─────────┘
                                     │ SSE
                                     ↓
                            ┌──────────────────┐
┌─────────────────┐   SSE   │  Vercel Function │
│ Cursor/Browser  │ ◀──────▶│  api/mcp/sse.ts  │
└─────────────────┘         └──────────────────┘
```

**メリット**:
- デプロイ簡単（`vercel`一発）
- HTTPS自動設定
- 自動スケーリング
- どこからでもアクセス可能

**デメリット**:
- タイムアウト制限（無料10秒、Pro 300秒）
- ステートレス（セッション管理が困難）
- 無料プランでは実用的な長時間接続が難しい

---

## 🎯 どちらを使えばいい？

### ローカル開発・個人利用 → `src/`

```bash
npm run dev
```

こんな人におすすめ:
- Claude Desktopから直接VRMを操作したい
- ローカルで完結させたい
- 無制限の接続時間が必要

### リモート・チーム共有 → `api/` + Vercel

```bash
vercel --prod
```

こんな人におすすめ:
- 複数のデバイスからアクセスしたい
- チームで共有したい
- サーバー管理が面倒
- **注意**: Proプラン推奨（無料だとタイムアウトで使いづらい）

---

## 🔧 実装の違い（技術詳細）

### ステートフル vs ステートレス

#### `src/mcp-server.ts`（ステートフル）

```typescript
class VRMMCPServer {
  private sseTransports = new Map<string, SSEServerTransport>();
  private viewerSSEClients = new Set<express.Response>();
  
  // 1つのプロセスで全てのクライアントを管理
  setupSSEEndpoints() {
    this.expressApp.get("/mcp/sse", (req, res) => {
      const transport = new SSEServerTransport("/mcp/messages", res);
      this.sseTransports.set(transport.sessionId, transport); // ✅ メモリに保存
    });
    
    this.expressApp.post("/mcp/messages", (req, res) => {
      const sessionId = String(req.query.sessionId);
      const transport = this.sseTransports.get(sessionId); // ✅ 同じメモリから取得
    });
  }
}
```

#### `api/mcp/sse.ts` & `api/mcp/messages.ts`（ステートレス）

```typescript
// api/mcp/sse.ts
const transports = new Map<string, SSEServerTransport>(); // ⚠️ 関数スコープ

export default async function handler(req, res) {
  const transport = new SSEServerTransport("/api/mcp/messages", res);
  transports.set(transport.sessionId, transport); // ⚠️ このインスタンスのみ
}
```

```typescript
// api/mcp/messages.ts
const transports = new Map<string, SSEServerTransport>(); // ⚠️ 別のインスタンス

export default async function handler(req, res) {
  const sessionId = String(req.query.sessionId);
  const transport = transports.get(sessionId); // ❌ 空っぽ！
  // → 404エラー
}
```

**問題**: Vercel Functionsは各リクエストで別プロセスが起動するため、**メモリを共有できない**

**解決策**: 
- Redis等の外部ストレージでセッション管理
- または、Proプランで単一長時間接続を維持

---

## 📊 環境別の推奨構成

### パターンA: 完全ローカル（開発・個人利用）

```bash
npm run dev
```

- `src/mcp-server.ts` のみ使用
- Claude Desktop設定で直接起動
- ブラウザは `http://localhost:3000`

### パターンB: ハイブリッド（推奨）

```bash
# ローカル: Claude Desktop用
npm run dev

# リモート: ブラウザ・Cursor用
vercel --prod
```

- Claude Desktopは `src/mcp-server.ts`（stdio直接）
- ブラウザ/Cursorは Vercel経由（SSE）
- 両者は独立して動作

### パターンC: フルリモート（チーム共有）

```bash
vercel --prod
```

- 全てVercel経由
- Claude Desktopは `src/gateway.ts` でSSE接続
- **Proプラン推奨**（無料だとタイムアウト頻発）

---

## 🚀 今後の拡張

### ローカル（`src/`）に追加できる機能

- ✅ ローカルファイルの直接操作
- ✅ データベース接続
- ✅ 複雑な状態管理
- ✅ WebSocketのような双方向通信

### リモート（`api/`）に適した機能

- ✅ 単純なAPI呼び出し
- ✅ 外部APIへのプロキシ
- ✅ 認証・権限管理
- ✅ グローバル配信

---

## まとめ

| 項目               | `src/`（ローカル） | `api/`（Vercel）    |
| ------------------ | ------------------ | ------------------- |
| **起動方法**       | `npm run dev`      | `vercel`            |
| **接続時間**       | 無制限             | 制限あり（10-300秒） |
| **状態管理**       | 可能               | 困難                |
| **用途**           | 開発・個人利用     | 公開・チーム共有    |
| **Claude Desktop** | stdio直接          | gateway経由         |
| **コスト**         | 無料               | 無料〜$20/月        |

両方のメリットを活かして、**ハイブリッド構成**がおすすめ！
