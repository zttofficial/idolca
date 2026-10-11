import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "./db";

// 固定時間窗的頻率限制，計數存在資料庫（rate_limits 表），多個伺服器實例共用。
// key 由呼叫方組（例如 "login:<ip>"）；超過上限回 false
export async function allow(db: Db, key: string, limit: number, windowSeconds: number) {
  const result = await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`);
  const rows = (Array.isArray(result) ? result : (result as { rows: { count: number }[] }).rows) as { count: number }[];
  return Number(rows[0]?.count ?? 0) <= limit;
}

// 用戶端 IP：Vercel 把真實來源放在 x-forwarded-for 的第一個
export const clientIp = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export const tooMany = () => Response.json({ error: "rate_limited" }, { status: 429 });
