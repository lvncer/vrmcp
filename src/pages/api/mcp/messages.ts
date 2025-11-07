import type { NextApiRequest, NextApiResponse } from "next";
import { transports } from "./sse";
import { getSessionManager } from "@/lib/redis-client";

function checkAuth(req: NextApiRequest): boolean {
  const expectedKey = process.env.MCP_API_KEY;
  // ローカル開発環境では認証をスキップ
  const isLocal = process.env.NODE_ENV === "development" && 
                  (req.headers.host?.includes("localhost") || 
                   req.headers.host?.includes("127.0.0.1"));
  
  if (!expectedKey || isLocal) {
    console.log(`[MCP Messages] Auth check: ${!expectedKey ? "No API key configured" : "Local development mode"} - allowing access`);
    return true;
  }
  
  const providedKey = req.headers["x-api-key"] || req.query.apiKey;
  const isAuthorized = providedKey === expectedKey;
  console.log(`[MCP Messages] Auth check: ${isAuthorized ? "Authorized" : "Unauthorized"}`);
  return isAuthorized;
}

function setCORS(res: NextApiResponse, req: NextApiRequest) {
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
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log(`[MCP Messages] Request received: ${req.method} ${req.url}`);
  console.log(`[MCP Messages] Headers:`, JSON.stringify(req.headers, null, 2));
  
  setCORS(res, req);

  if (req.method === "OPTIONS") {
    console.log(`[MCP Messages] OPTIONS request handled`);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    console.log(`[MCP Messages] Method not allowed: ${req.method}`);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 認証チェック
  if (!checkAuth(req)) {
    console.log(`[MCP Messages] Unauthorized request`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sessionId = String(req.query.sessionId || "");
  const sessionManager = getSessionManager();

  console.log(`[MCP Messages] Received POST message for session: ${sessionId}`);
  console.log(`[MCP Messages] Available transports: ${Array.from(transports.keys()).join(', ') || 'none'}`);

  // まずメモリ内のtransportを確認
  let transport = transports.get(sessionId);

  // メモリにない場合、Redisでセッションの有効性を確認
  if (!transport && sessionManager.isAvailable()) {
    console.log(`[MCP Messages] Transport not in memory, checking Redis for session: ${sessionId}`);
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      console.error(`[MCP Messages] Session not found in Redis: ${sessionId}`);
      return res.status(404).json({ error: "Invalid session" });
    }
    // セッションは有効だが、transportがない = 別インスタンス
    console.error(
      `[MCP Messages] ⚠️  Session ${sessionId} exists in Redis but not in memory (multi-instance scenario)`
    );
    return res.status(503).json({
      error: "Service temporarily unavailable",
      message: "Session exists but connection is on different instance",
    });
  }

  if (!transport) {
    console.error(`[MCP Messages] Transport not found for session: ${sessionId}`);
    return res.status(404).json({ error: "Invalid session" });
  }

  console.log(`[MCP Messages] Processing message for session: ${sessionId}`);
  console.log(`[MCP Messages] Request body:`, JSON.stringify(req.body));
  try {
    await transport.handlePostMessage(req as any, res as any);
    console.log(`[MCP Messages] Message handled successfully for session: ${sessionId}`);
  } catch (error) {
    console.error(`[MCP Messages] Message handling error for session ${sessionId}:`, error);
    if (error instanceof Error) {
      console.error(`[MCP Messages] Error stack:`, error.stack);
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}

