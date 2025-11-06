import type { VercelRequest, VercelResponse } from "@vercel/node";

// ビューア用SSEクライアント管理
const viewerClients = new Set<VercelResponse>();

function setCORS(res: VercelResponse, req: VercelRequest) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];
  const origin = req.headers.origin || "*";
  const allowed = allowedOrigins.some((o) => o === "*" || origin === o);

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // SSEヘッダー設定
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  viewerClients.add(res);
  console.log("Viewer SSE client connected");

  // 初期状態送信
  res.write(
    `event: init\ndata: ${JSON.stringify({
      isLoaded: false,
      modelPath: null,
    })}\n\n`
  );

  // 心拍送信
  const heartbeat = setInterval(() => {
    if (res.writable) {
      res.write(": ping\n\n");
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  // クリーンアップ
  req.on("close", () => {
    clearInterval(heartbeat);
    viewerClients.delete(res);
    console.log("Viewer SSE client disconnected");
  });
}

// ビューアへのブロードキャスト関数（他のAPIから呼び出し可能）
export function broadcastToViewers(eventType: string, data: any) {
  const sseMessage = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  viewerClients.forEach((client) => {
    if (client.writable) {
      client.write(sseMessage);
    }
  });
}

