// 後台列表共用的純邏輯（伺服器用，有單元測試）：分頁游標、查詢參數、搜尋字串的跳脫、CSV。
// 列表一律按（排序欄, id）做鍵集分頁：游標是上一頁最後一列的排序鍵，下一頁從它之後讀，資料量再大每頁也只讀一頁的量

export const PAGE_SIZE = 30;
export const MAX_PAGE = 100;
// 銷售紀錄一次最多匯出幾列（後台超過時提示縮小日期範圍）
export const SALES_EXPORT_CAP = 50_000;
// 游標裡各排序鍵之間的分隔字元（單元分隔符，不會出現在編號、時間和數字裡）
export const CURSOR_SEP = "\u001f";

export const encodeCursor = (raw: string) => Buffer.from(raw, "utf8").toString("base64url");

// 解不開、段數不對或太長的游標當作沒有（從第一頁讀起），不丟錯
export function decodeCursor(cursor: string | null | undefined, parts: number): string[] | null {
  if (!cursor || cursor.length > 600 || !/^[\w-]+$/.test(cursor)) return null;
  const values = Buffer.from(cursor, "base64url").toString("utf8").split(CURSOR_SEP);
  return values.length === parts && values.every((v) => v.length <= 200) ? values : null;
}

// LIKE 的萬用字元當成普通字：用戶搜「100%」不該匹配所有東西
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
export const likeContains = (q: string) => `%${escapeLike(q)}%`;
export const likePrefix = (q: string) => `${escapeLike(q)}%`;

// 搜尋框：去頭尾空白、連續空白併成一個，最多 100 字
export const parseQuery = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").slice(0, 100);

export function parseLimit(v: string | null | undefined, fallback = PAGE_SIZE) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PAGE) : fallback;
}

// 篩選值只接受列出的幾種，其他一律用預設值
export const pickOne = <T extends string>(v: string | null | undefined, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback);

// 日期範圍（YYYY-MM-DD，UTC）：from 是當天 0 點，to 包含當天整天（回傳隔天 0 點，查詢用「小於」）
export function parseDay(v: string | null | undefined, end = false): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return end ? new Date(d.getTime() + 86_400_000) : d;
}

// CSV 一格：含逗號、引號、換行的加引號（引號寫兩次）；文字開頭是 = + - @ 或定位字元的前面加 '，免得試算表當成公式執行
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvLine = (cells: unknown[]) => `${cells.map(csvCell).join(",")}\r\n`;
