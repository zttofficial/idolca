import "server-only";
import { randomUUID } from "node:crypto";
import { TEMPLATES } from "@/lib/catalog";
import { and, count, desc, eq, inArray, isNotNull, max, ne, or } from "drizzle-orm";
import type { Db } from "./db";
import { auctions, collectorItems, orders, users, type OrderStatus } from "./schema";
import type { Listing, ListingDeal, ListingEvent } from "@/lib/items";
import { auctionView, latestAuctions, recentAuction, type AuctionRow } from "./auctions";
import { isVaultId } from "@/lib/vaults";

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
    description: r.description,
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
    vaultRequestedAt: r.vaultRequestedAt?.toISOString() ?? null,
    vaultTarget: isVaultId(r.vaultTarget) ? r.vaultTarget : null,
    createdAt: r.createdAt.toISOString(),
  };
}

// 自由刊登對外顯示的內容：收藏品加上賣家暱稱，不含賣家帳號資料。拍賣中的卡附上拍賣狀態，上架時間用開拍時間；
// 不在售的卡附上最近一筆成交
export const publicListing = (r: ItemRow, seller: string, auction?: AuctionRow | null, deal?: ListingDeal | null) => {
  const item = publicItem(r);
  return {
    ...item,
    listedAt: item.listedAt ?? auction?.createdAt.toISOString() ?? null,
    seller,
    auction: auction ? { ...auctionView(auction), id: auction.id } : null,
    deal: deal ?? null,
    vaultCardId: r.vaultCardId,
  };
};

// 算成交的訂單：付了款、沒退款的（pending 是沒付款就放棄的，refunded、cancelled 是退了款的）
const DEAL_STATUSES: OrderStatus[] = ["paid", "shipped", "disputed", "refunding", "releasing", "completed"];
const dealOf = (o: typeof orders.$inferSelect): ListingDeal =>
  o.status === "completed"
    ? { status: "sold", priceUsdt: o.priceCents / 100, at: o.updatedAt.toISOString() }
    : { status: "trading", priceUsdt: o.priceCents / 100, at: (o.paidAt ?? o.updatedAt).toISOString() };

// 在售：一口價刊登中，或拍賣進行中。假卡一律不算
const liveAuctionItems = (db: Db) => db.select({ id: auctions.itemId }).from(auctions).where(eq(auctions.status, "live"));
const onSale = (db: Db) => and(or(isNotNull(collectorItems.priceCents), inArray(collectorItems.id, liveAuctionItems(db))), eq(collectorItems.verification, "unverified"));

export const MAX_PHOTOS = 8;
export const MAX_DESCRIPTION = 500;
export const MAX_PRICE = 100_000;
// 價格轉成分；不合法時回傳 undefined，null 表示下架
export function priceToCents(v: unknown): number | null | undefined {
  if (v === null) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  // 以分為單位存，四捨五入後至少 1 分（0.01）：不到半分的價格會變成 0，等於免費
  const cents = Math.round(n * 100);
  if (!Number.isFinite(n) || cents < 1 || n > MAX_PRICE) return undefined;
  return cents;
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

export const newItemId = () => randomUUID();

// 成交過的真卡刊登和最近一次成交時間，給站點地圖：成交後的刊登頁是保留的成交紀錄
export async function listSoldListings(db: Db) {
  const at = max(orders.updatedAt);
  const rows = await db
    .select({ id: orders.itemId, at })
    .from(orders)
    .innerJoin(collectorItems, eq(collectorItems.id, orders.itemId))
    .where(and(eq(orders.status, "completed"), eq(collectorItems.verification, "unverified")))
    .groupBy(orders.itemId);
  return rows.map((r) => ({ id: r.id, soldAt: r.at ? new Date(r.at).toISOString() : undefined }));
}

// 在售的自由刊登（一口價和拍賣中），新的在前；假卡即使有價格也不出現。成交了的卡不列在市場上，刊登頁的網址一直有效
export async function listListings(db: Db, limit = 200) {
  const rows = await db
    .select({ item: collectorItems, seller: users.displayName })
    .from(collectorItems)
    .innerJoin(users, eq(users.id, collectorItems.userId))
    .where(onSale(db))
    .limit(limit);
  const live = await latestAuctions(
    db,
    rows.filter((r) => r.item.priceCents === null).map((r) => r.item.id),
  );
  return rows
    .map((r) => publicListing(r.item, r.seller, live.get(r.item.id)))
    .sort((a, b) => (b.listedAt ?? "").localeCompare(a.listedAt ?? ""));
}

// 刊登頁：在售的卡（一口價、拍賣中，拍賣成交或流拍不到 7 天的也顯示拍賣結果），
// 以及不在售但有公開紀錄的卡：成交過、做成了數位珍藏（NFT 元數據連到這頁）、或已寄進金庫轉成金庫卡。
// 只存在收藏冊裡、沒成交過也沒做成數位珍藏的卡不公開
export async function getListing(db: Db, id: string) {
  const [r] = await db
    .select({ item: collectorItems, seller: users.displayName })
    .from(collectorItems)
    .innerJoin(users, eq(users.id, collectorItems.userId))
    .where(eq(collectorItems.id, id));
  if (!r) return null;
  const genuine = r.item.verification === "unverified";
  const auction = genuine && r.item.priceCents === null ? await recentAuction(db, id) : null;
  if (genuine && (r.item.priceCents !== null || auction)) return publicListing(r.item, r.seller, auction);
  const [last] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.itemId, id), inArray(orders.status, DEAL_STATUSES)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (!last && !r.item.mintTx && !r.item.vaultCardId) return null;
  return publicListing(r.item, r.seller, null, last ? dealOf(last) : null);
}

// 刊登頁的交易紀錄，新的在前：目前的一口價刊登、每場拍賣（開拍、流拍、取消）、每筆放款完成的成交
export async function listingHistory(db: Db, listing: Listing): Promise<ListingEvent[]> {
  const [rounds, sales] = await Promise.all([
    db.select().from(auctions).where(eq(auctions.itemId, listing.id)),
    db
      .select()
      .from(orders)
      .where(and(eq(orders.itemId, listing.id), eq(orders.status, "completed"))),
  ]);
  const events: ListingEvent[] = [];
  if (listing.priceUsdt !== null && listing.listedAt) events.push({ type: "list", date: listing.listedAt, priceUsdt: listing.priceUsdt });
  for (const a of rounds) {
    events.push({ type: "auction", date: a.createdAt.toISOString(), priceUsdt: a.startCents / 100 });
    if (a.status === "unsold" || a.status === "cancelled") events.push({ type: a.status === "unsold" ? "unsold" : "cancelAuction", date: a.updatedAt.toISOString() });
  }
  for (const o of sales) {
    const tx = o.transferTx ? { chain: "solana" as const, signature: o.transferTx } : o.payTx ? { chain: o.rail, signature: o.payTx } : undefined;
    events.push({ type: "sale", date: o.updatedAt.toISOString(), priceUsdt: o.priceCents / 100, tx });
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}

// 刊登頁的賣家卡片：暱稱、加入時間、成交筆數、在售件數、有沒有綁錢包，以及這位賣家的其他刊登（最多 4 則）。
// 只給公開資訊，不含郵箱和錢包地址
export async function getSeller(db: Db, itemId: string) {
  const [row] = await db
    .select({ id: users.id, name: users.displayName, joinedAt: users.createdAt, wallet: users.walletAddress })
    .from(collectorItems)
    .innerJoin(users, eq(users.id, collectorItems.userId))
    .where(eq(collectorItems.id, itemId));
  if (!row) return null;
  const mine = and(eq(collectorItems.userId, row.id), onSale(db));
  const [[sales], [active], others] = await Promise.all([
    db.select({ n: count() }).from(orders).where(and(eq(orders.sellerId, row.id), eq(orders.status, "completed"))),
    db.select({ n: count() }).from(collectorItems).where(mine),
    db.select().from(collectorItems).where(and(mine, ne(collectorItems.id, itemId))).orderBy(desc(collectorItems.listedAt)).limit(4),
  ]);
  const othersLive = await latestAuctions(
    db,
    others.filter((r) => r.priceCents === null).map((r) => r.id),
  );
  return {
    name: row.name,
    joinedAt: row.joinedAt.toISOString(),
    sales: sales.n,
    active: active.n,
    walletLinked: Boolean(row.wallet),
    others: others.map((r) => publicListing(r, row.name, othersLive.get(r.id))),
  };
}

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
