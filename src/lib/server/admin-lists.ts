import "server-only";
import { ilike, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { decodeCursor, encodeCursor, likeContains, parseDay, parseLimit, parseQuery, pickOne } from "@/lib/admin-list";

// 後台列表的鍵集分頁：排序鍵依序比較，游標是上一頁最後一列各鍵的文字值（在資料庫裡轉成文字，時間保留到微秒，不會因為 JS 只到毫秒而漏列或重複）。
// 每個鍵要標明型別，比較時把游標轉回原型別；最後一個鍵要是唯一的（通常是 id）
export type SortKey = { expr: SQL | AnyColumn; type: "timestamptz" | "int" | "text"; desc?: boolean };

export const cursorOf = (keys: SortKey[]) =>
  sql<string>`concat_ws(chr(31), ${sql.join(
    keys.map((k) => sql`(${k.expr})::text`),
    sql`, `,
  )})`;

export const orderOf = (keys: SortKey[]) => keys.map((k) => (k.desc ? sql`${k.expr} DESC` : sql`${k.expr} ASC`));

// 「排在游標之後」：(k1 在後) 或 (k1 相等且 k2 在後) 或 …；各鍵方向可以不同
export function afterCursor(keys: SortKey[], cursor: string | null): SQL | undefined {
  const parts = decodeCursor(cursor, keys.length);
  if (!parts) return undefined;
  const value = (i: number) => sql`${parts[i]}::${sql.raw(keys[i].type)}`;
  const branches = keys.map((k, i) => {
    const same = keys.slice(0, i).map((p, j) => sql`${p.expr} = ${value(j)}`);
    const past = k.desc ? sql`${k.expr} < ${value(i)}` : sql`${k.expr} > ${value(i)}`;
    return sql`(${sql.join([...same, past], sql` AND `)})`;
  });
  return sql`(${sql.join(branches, sql` OR `)})`;
}

// 查詢時多讀一列，有多的就給下一頁的游標
export function page<T extends { cursor: string }>(rows: T[], limit: number) {
  const list = rows.slice(0, limit);
  return { list, next: rows.length > limit ? encodeCursor(list[list.length - 1].cursor) : null };
}

// 每個列表接口共用的參數：搜尋、每頁幾列、游標、日期範圍；id 是直接查某一列（詳情面板和從待處理點進來時用，不套篩選）
export function listParams(sp: URLSearchParams) {
  return {
    q: parseQuery(sp.get("q")),
    limit: parseLimit(sp.get("limit")),
    cursor: sp.get("cursor"),
    id: parseQuery(sp.get("id")) || null,
    from: parseDay(sp.get("from")),
    to: parseDay(sp.get("to"), true),
    pick: <T extends string>(key: string, allowed: readonly T[], fallback: T) => pickOne(sp.get(key), allowed, fallback),
  };
}
export type ListParams = ReturnType<typeof listParams>;

// 在幾個文字欄位裡找包含搜尋字的
export const containsAny = (q: string, cols: (SQL | AnyColumn)[]) => or(...cols.map((c) => ilike(c as AnyColumn, likeContains(q))));

// 原生 SQL 的查詢結果（Neon 和 PGlite 都放在 rows 裡）
export const rowsOf = <T>(result: unknown) => ((result as { rows?: T[] }).rows ?? []) as T[];
