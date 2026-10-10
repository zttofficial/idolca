import "server-only";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// 資料庫連線：有 DATABASE_URL 用 Neon（線上），本機開發沒有時用 PGlite（嵌入式 Postgres，資料存在 .data/）。
// 線上環境沒配置資料庫時回傳 null，帳號功能顯示「未開通」，不偷偷寫進會丟失的臨時目錄
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let ready: Promise<Db | null> | undefined;

async function connect(): Promise<Db | null> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    db = drizzle(neon(url), { schema }) as unknown as Db;
  } else if (process.env.NODE_ENV !== "production") {
    const { mkdirSync } = await import("node:fs");
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    mkdirSync(".data", { recursive: true });
    db = drizzle(new PGlite(".data/pglite"), { schema }) as unknown as Db;
  } else {
    return null;
  }
  for (const stmt of schema.BOOTSTRAP_SQL) await db.execute(sql.raw(stmt));
  return db;
}

export function getDb() {
  ready ??= connect().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
}
