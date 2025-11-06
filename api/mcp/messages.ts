import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// 外部から参照できるようにグローバルスコープで管理
// 注意: Vercelの関数は別インスタンスで動く可能性があるため、
// 本番運用ではRedisなどの外部ストレージでセッション管理が必要
const transports = new Map<string, SSEServerTransport>();

function checkAuth(req: VercelRequest): boolean {
  const expectedKey = process.env.MCP_API_KEY;
  if (!expectedKey) return true;
  // ヘッダーまたはクエリパラメータからAPIキーを取得
  const providedKey = req.headers["x-api-key"] || req.query.apiKey;
  return providedKey === expectedKey;
}

function setCORS(res: VercelResponse, req: VercelRequest) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];
  const origin = req.headers.origin || "*";
  const allowed = allowedOrigins.some((o) => o === "*" || origin === o);

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  setCORS(res, req);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 認証チェック
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sessionId = String(req.query.sessionId || "");
  const transport = transports.get(sessionId);

  if (!transport) {
    return res.status(404).json({ error: "Invalid session" });
  }

  try {
    // SSEServerTransportのhandlePostMessageを使用
    await transport.handlePostMessage(req as any, res as any);
  } catch (error) {
    console.error("Message handling error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// モジュールスコープでtransportsをエクスポート（同一プロセス内で共有）
export { transports };

