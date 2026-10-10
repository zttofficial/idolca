import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { TEMPLATES } from "@/lib/catalog";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "./db";
import { collectorItems, users } from "./schema";

export type ItemRow = typeof collectorItems.$inferSelect;

const photosOf = (r: ItemRow) => [r.photo, ...(r.photoBack ? [r.photoBack] : []), ...(r.extraPhotos ? (JSON.parse(r.extraPhotos) as string[]) : [])];

// 前端看到的收藏品
export function publicItem(r: ItemRow) {
  return {
    id: r.id,
    photo: r.photo,
    photoBack: r.photoBack,
    photos: photosOf(r),
    title: r.title,
    quantity: r.quantity,
    source: r.source,
    group: r.groupName,
    member: r.member,
    album: r.album,
    version: r.version,
    templateId: r.templateId,
    asset: r.asset,
    mintTx: r.mintTx,
    ownerAddress: r.ownerAddress,
    fakeTx: r.fakeTx,
    verification: r.verification,
    verificationNote: r.verificationNote,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    priceUsdt: r.priceCents === null ? null : r.priceCents / 100,
    listedAt: r.listedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// 自由刊登對外顯示的內容：收藏品加上賣家暱稱，不含賣家帳號資料
export const publicListing = (r: ItemRow, seller: string) => ({ ...publicItem(r), seller });

export const MAX_PHOTOS = 8;
export const MAX_PRICE = 100_000;
// 價格轉成分；不合法時回傳 undefined，null 表示下架
export function priceToCents(v: unknown): number | null | undefined {
  if (v === null) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PRICE) return undefined;
  return Math.round(n * 100);
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

// 用戶填的名稱和圖鑑卡款完全一致（不分大小寫）時自動關聯
export function matchTemplate(group: string, member: string, album?: string | null, version?: string | null) {
  if (!album || !version) return null;
  return (
    TEMPLATES.find(
      (t) => norm(t.group) === norm(group) && norm(t.member) === norm(member) && norm(t.album) === norm(album) && norm(t.version) === norm(version),
    )?.id ?? null
  );
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// 鏈上未配置的環境（演示模式）用的假 NFT 地址
export function demoAssetId() {
  return Array.from(randomBytes(44), (b) => BASE58[b % 58]).join("");
}

export const newItemId = () => randomUUID();

// 刊登中的自由刊登，新的在前；假卡即使有價格也不出現
export async function listListings(db: Db, limit = 200) {
  const rows = await db
    .select({ item: collectorItems, seller: users.displayName })
    .from(collectorItems)
    .innerJoin(users, eq(users.id, collectorItems.userId))
    .where(and(isNotNull(collectorItems.priceCents), eq(collectorItems.verification, "unverified")))
    .orderBy(desc(collectorItems.listedAt))
    .limit(limit);
  return rows.map((r) => publicListing(r.item, r.seller));
}

export async function getListing(db: Db, id: string) {
  const [r] = await db
    .select({ item: collectorItems, seller: users.displayName })
    .from(collectorItems)
    .innerJoin(users, eq(users.id, collectorItems.userId))
    .where(and(eq(collectorItems.id, id), isNotNull(collectorItems.priceCents), eq(collectorItems.verification, "unverified")));
  return r ? publicListing(r.item, r.seller) : null;
}

export type Listing = ReturnType<typeof publicListing>;

// 鏈上屬性用的收藏品資料
export const chainAttributes = (r: ItemRow) => ({
  title: r.title || [r.groupName, r.member, r.version].filter(Boolean).join(" "),
  group: r.groupName,
  member: r.member,
  source: r.source,
  quantity: r.quantity,
  album: r.album,
  version: r.version,
});
