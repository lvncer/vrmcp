/**
 * Redis クライアント（セッション管理用）
 * Upstash Redis を使用してステートレス環境でもセッション永続化
 */

import { Redis } from "@upstash/redis";

export interface SessionData {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, any>;
}

export class RedisSessionManager {
  private redis: Redis | null = null;
  private readonly SESSION_PREFIX = "mcp:session:";
  private readonly SESSION_TTL = 3600; // 1時間（秒）

  constructor() {
    // 環境変数が設定されている場合のみRedis接続
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
      this.redis = new Redis({
        url,
        token,
      });
      console.error("✓ Redis session manager initialized");
    } else {
      console.error(
        "⚠️  Redis not configured, falling back to in-memory sessions"
      );
    }
  }

  /**
   * Redisが利用可能かチェック
   */
  isAvailable(): boolean {
    return this.redis !== null;
  }

  /**
   * セッションを保存
   */
  async saveSession(
    sessionId: string,
    data: Partial<SessionData> = {}
  ): Promise<void> {
    if (!this.redis) return;

    const sessionData: SessionData = {
      sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      ...data,
    };

    const key = this.SESSION_PREFIX + sessionId;
    await this.redis.set(key, JSON.stringify(sessionData), {
      ex: this.SESSION_TTL,
    });
  }

  /**
   * セッションを取得
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!this.redis) return null;

    const key = this.SESSION_PREFIX + sessionId;
    const data = await this.redis.get<string>(key);

    if (!data) return null;

    const session: SessionData = JSON.parse(data);

    // アクセス時刻を更新
    session.lastAccessedAt = Date.now();
    await this.redis.set(key, JSON.stringify(session), {
      ex: this.SESSION_TTL,
    });

    return session;
  }

  /**
   * セッションを削除
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.redis) return;

    const key = this.SESSION_PREFIX + sessionId;
    await this.redis.del(key);
  }

  /**
   * セッションの有効期限を延長
   */
  async extendSession(sessionId: string): Promise<void> {
    if (!this.redis) return;

    const key = this.SESSION_PREFIX + sessionId;
    await this.redis.expire(key, this.SESSION_TTL);
  }

  /**
   * 全てのアクティブセッションを取得（デバッグ用）
   */
  async getAllSessions(): Promise<string[]> {
    if (!this.redis) return [];

    const keys = await this.redis.keys(this.SESSION_PREFIX + "*");
    return keys.map((k) => k.replace(this.SESSION_PREFIX, ""));
  }

  /**
   * セッション数を取得
   */
  async getSessionCount(): Promise<number> {
    if (!this.redis) return 0;

    const keys = await this.redis.keys(this.SESSION_PREFIX + "*");
    return keys.length;
  }
}

// シングルトンインスタンス
let sessionManager: RedisSessionManager | null = null;

export function getSessionManager(): RedisSessionManager {
  if (!sessionManager) {
    sessionManager = new RedisSessionManager();
  }
  return sessionManager;
}

