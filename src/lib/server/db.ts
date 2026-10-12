import "server-only";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { seedDevnetVault } from "./seed-devnet";

// 資料庫連線：有 DATABASE_URL 用 Neon（線上），本機開發沒有時用 PGlite（嵌入式 Postgres，資料存在 .data/）。
// 線上環境沒配置資料庫時回傳 null，帳號功能顯示「未開通」，不偷偷寫進會丟失的臨時目錄
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// 連線掛在 globalThis 上：Next 會把頁面和 API 路由打包成不同的模組圖，模組級變數各有一份；
// PGlite 若被開兩次，兩個實例互相看不到對方的寫入，還可能弄壞資料目錄
const shared = globalThis as typeof globalThis & { __idolcaDb?: Promise<Db | null> };

// Vercel 接 Neon 時可以給變數加前綴（如 myapp_DATABASE_URL），沒有 DATABASE_URL 就找以 _DATABASE_URL 結尾的那個
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const key = Object.keys(process.env).find((k) => k.endsWith("_DATABASE_URL") && process.env[k]);
  return key ? process.env[key] : undefined;
}

async function connect(): Promise<Db | null> {
  const url = databaseUrl();
  let db: Db;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    db = drizzle(neon(url), { schema }) as unknown as Db;
  } else if (process.env.NODE_ENV !== "production") {
    const { mkdirSync } = await import("node:fs");
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    // PGLITE_DIR 換資料目錄：端到端測試用獨立的庫，不弄亂日常開發的資料
    const dir = process.env.PGLITE_DIR || ".data/pglite";
    mkdirSync(dir, { recursive: true });
    db = drizzle(new PGlite(dir), { schema }) as unknown as Db;
  } else {
    return null;
  }
  for (const stmt of schema.BOOTSTRAP_SQL) await db.execute(sql.raw(stmt));
  await seedDevnetVault(db);
  return db;
}

export function getDb() {
  shared.__idolcaDb ??= connect().catch((err) => {
    shared.__idolcaDb = undefined;
    throw err;
  });
  return shared.__idolcaDb;
}

// 幾條寫入要嘛全部生效、要嘛全部不生效。Neon 的 HTTP 驅動不支援互動式交易，用 batch（整批在同一個交易裡執行）；
// PGlite 用一般交易。build 拿到的 q 用來組查詢，組好先不要 await
type Query = PromiseLike<unknown>;
export async function atomic(db: Db, build: (q: Db) => Query[]) {
  const batch = (db as unknown as { batch?: (queries: Query[]) => Promise<unknown> }).batch;
  if (batch) {
    const queries = build(db);
    if (queries.length) await batch.call(db, queries);
    return;
  }
  await db.transaction(async (tx) => {
    for (const q of build(tx as unknown as Db)) await q;
  });
}
