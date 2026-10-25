import "server-only";
import { eq } from "drizzle-orm";
import { findGroup } from "@/lib/catalog";
import { getDb } from "./db";
import { getListing } from "./items";
import { publicBinderOwner } from "./public-binder";
import { packs, vaultCards } from "./schema";

// 詳情頁網址有沒有對應的資料，由 proxy 在頁面開始輸出前檢查。
// 頁面採串流輸出，等頁面自己發現資料不存在時 200 狀態碼已經送出，搜尋引擎會報「軟 404」，所以要提前判斷。
// 條件和各頁面一致：已提貨的金庫卡、成交或下架的刊登、結束的卡包都還有頁面，只有根本不存在的才算
const DETAIL = /^\/(card|listing|packs|collector|catalog)\/([^/]+)$/;

// path 是去掉語言前綴的路徑；不是詳情頁或沒有資料庫時回傳 true，交給頁面自己處理
export async function detailPageExists(path: string): Promise<boolean> {
  const m = DETAIL.exec(path);
  if (!m) return true;
  const [, kind, raw] = m;
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return false;
  }
  if (kind === "catalog") return !!findGroup(id);
  const db = await getDb();
  if (!db) return true;
  if (kind === "card") return (await db.select({ id: vaultCards.id }).from(vaultCards).where(eq(vaultCards.id, id))).length > 0;
  if (kind === "packs") return (await db.select({ id: packs.id }).from(packs).where(eq(packs.id, id))).length > 0;
  if (kind === "listing") return !!(await getListing(db, id));
  return !!(await publicBinderOwner(db, id));
}
