import "server-only";
import { and, count, desc, eq, gte, ilike, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import { collectorItems, orders, packOrders, packs, redemptions, users, vaultCards, vaultChainState, vaultTrades } from "./schema";
import { publicItem } from "./items";
import { toCard } from "./vault-cards";
import { adminWallets, isAdmin } from "./auth";
import { afterCursor, containsAny, cursorOf, orderOf, page, type ListParams, type SortKey } from "./admin-lists";
import { likePrefix } from "@/lib/admin-list";
import type { AdminParty } from "./orders";
import type { Card } from "@/lib/cards";
import { GRADERS } from "@/lib/grading";
import { CHAIN } from "@/lib/chain";
import { VAULT_IDS, vaultOf } from "@/lib/vaults";

// 後台各列表的查詢（訂單在 orders.ts）。鏈上狀態一律讀 vault_chain_state 索引表（left join：還沒同步到的卡沒有那一列，當作「未知」），
// 不在列表裡讀鏈；每次只讀一頁

const party = (u: { id: string; displayName: string; email: string | null; walletAddress: string | null }): AdminParty => ({
  id: u.id,
  name: u.displayName,
  email: u.email,
  wallet: u.walletAddress,
});
const partyCols = { id: users.id, displayName: users.displayName, email: users.email, walletAddress: users.walletAddress };

// 鏈上狀態索引的一列（沒有就是 null，也就是還沒同步）
export type ChainRow = {
  owner: string;
  listing: { seller: string; priceUsdt: number } | null;
  auction: { seller: string; endsAt: string | null } | null;
  redeeming: boolean;
  burned: boolean;
  syncedAt: string;
};
const chainOf = (s: typeof vaultChainState.$inferSelect | null): ChainRow | null =>
  s && {
    owner: s.owner,
    listing: s.listingSeller ? { seller: s.listingSeller, priceUsdt: (s.listingPriceCents ?? 0) / 100 } : null,
    auction: s.auctionSeller ? { seller: s.auctionSeller, endsAt: s.auctionEndsAt?.toISOString() ?? null } : null,
    redeeming: s.redeeming,
    burned: s.burned,
    syncedAt: s.syncedAt.toISOString(),
  };

// ── 提貨 ──
// pending：還沒寄出也沒取消（鏈上已銷毀的不算）；ready 是其中運費已到帳、可以出貨的。這兩種最早申請的在前，shipped、cancelled、all 新的在前
export const REDEMPTION_VIEWS = ["pending", "ready", "shipped", "cancelled", "all"] as const;
const redemptionPending = and(isNull(redemptions.shipTx), isNull(redemptions.cancelledAt), sql`coalesce(${vaultChainState.burned}, false) = false`);

export async function adminRedemptions(db: Db, p: ListParams) {
  const view = p.pick("status", REDEMPTION_VIEWS, "pending");
  const vault = p.pick("vault", ["", ...VAULT_IDS], "");
  const newest = view !== "pending" && view !== "ready";
  const keys: SortKey[] = [
    { expr: redemptions.createdAt, type: "timestamptz", desc: newest },
    { expr: redemptions.cardId, type: "text", desc: newest },
  ];
  const q = p.q;
  const where = p.id
    ? eq(redemptions.cardId, p.id)
    : and(
        view === "pending"
          ? redemptionPending
          : view === "ready"
            ? and(redemptionPending, eq(redemptions.feePaid, 1))
            : view === "shipped"
              ? or(isNotNull(redemptions.shipTx), and(isNull(redemptions.cancelledAt), eq(vaultChainState.burned, true)))
              : view === "cancelled"
                ? isNotNull(redemptions.cancelledAt)
                : undefined,
        vault ? eq(vaultCards.vault, vault) : undefined,
        p.from ? gte(redemptions.createdAt, p.from) : undefined,
        p.to ? lt(redemptions.createdAt, p.to) : undefined,
        q
          ? or(
              eq(redemptions.cardId, q),
              eq(redemptions.wallet, q),
              ilike(vaultCards.serial, likePrefix(q)),
              containsAny(q, [redemptions.trackingNumber, vaultCards.groupName, vaultCards.member]),
            )
          : undefined,
        afterCursor(keys, p.cursor),
      );
  const rows = await db
    .select({ r: redemptions, serial: vaultCards.serial, group: vaultCards.groupName, member: vaultCards.member, vault: vaultCards.vault, chain: vaultChainState, cursor: cursorOf(keys) })
    .from(redemptions)
    .leftJoin(vaultCards, eq(vaultCards.id, redemptions.cardId))
    .leftJoin(vaultChainState, eq(vaultChainState.cardId, redemptions.cardId))
    .where(where)
    .orderBy(...orderOf(keys))
    .limit(p.limit + 1);
  const { list, next } = page(rows, p.limit);
  return {
    rows: list.map(({ r, serial, group, member, vault, chain }) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      shippedAt: r.shippedAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      card: serial ? `${serial} · ${group} ${member}` : r.cardId,
      vault: vaultOf(vault).id,
      onChain: chainOf(chain),
    })),
    next,
  };
}
export type AdminRedemption = Awaited<ReturnType<typeof adminRedemptions>>["rows"][number];

// ── 收藏卡 ──
// all：申請寄進金庫的排最前面，其次新上鏈的在前；vault 只看申請寄進金庫的。已轉成金庫卡的不列
export const ITEM_VIEWS = ["all", "vault", "unverified", "fake"] as const;
const vaultRequested = and(isNotNull(collectorItems.vaultRequestedAt), ne(collectorItems.verification, "fake"));

export async function adminItems(db: Db, p: ListParams) {
  const view = p.pick("status", ITEM_VIEWS, "all");
  const keys: SortKey[] = [
    ...(view === "all"
      ? [{ expr: sql`(CASE WHEN ${collectorItems.vaultRequestedAt} IS NOT NULL AND ${collectorItems.verification} <> 'fake' THEN 0 ELSE 1 END)`, type: "int" as const }]
      : []),
    { expr: collectorItems.createdAt, type: "timestamptz", desc: true },
    { expr: collectorItems.id, type: "text", desc: true },
  ];
  const q = p.q;
  const where = p.id
    ? eq(collectorItems.id, p.id)
    : and(
        isNull(collectorItems.vaultCardId),
        view === "vault" ? vaultRequested : view === "all" ? undefined : eq(collectorItems.verification, view),
        p.from ? gte(collectorItems.createdAt, p.from) : undefined,
        p.to ? lt(collectorItems.createdAt, p.to) : undefined,
        q
          ? or(
              eq(collectorItems.id, q),
              eq(collectorItems.asset, q),
              eq(collectorItems.ownerAddress, q),
              eq(users.walletAddress, q),
              containsAny(q, [collectorItems.title, collectorItems.groupName, collectorItems.member, users.email]),
            )
          : undefined,
        afterCursor(keys, p.cursor),
      );
  const rows = await db
    .select({ item: collectorItems, owner: partyCols, cursor: cursorOf(keys) })
    .from(collectorItems)
    .innerJoin(users, eq(users.id, collectorItems.userId))
    .where(where)
    .orderBy(...orderOf(keys))
    .limit(p.limit + 1);
  const { list, next } = page(rows, p.limit);
  return { rows: list.map(({ item, owner }) => ({ ...publicItem(item), owner: party(owner) })), next };
}
export type AdminItem = Awaited<ReturnType<typeof adminItems>>["rows"][number];

// ── 金庫卡 ──
// state：held 在庫（沒銷毀），listed 掛單中，auction 拍賣中，redeeming 提貨凍結中，redeemed 已提貨，unknown 還沒有鏈上狀態，all 全部。
// assignable 是卡包卡池能放的卡：平台自有、沒銷毀、不在卡包，鏈上在平台錢包、沒掛單、沒拍賣、沒在提貨（鏈上狀態還沒同步的不算）
export const CARD_STATES = ["held", "listed", "auction", "redeeming", "redeemed", "unknown", "all", "assignable"] as const;
export const CARD_OWNERS = ["", "platform", "depositor"] as const;
export const CARD_PACKS = ["", "in", "none"] as const;
export const CARD_GRADES = ["", "graded", "ungraded", ...GRADERS.map((g) => g.id)] as const;

export const assignableWhere = () =>
  and(
    isNull(vaultCards.packId),
    isNull(vaultCards.depositorId),
    isNull(vaultCards.burnedAt),
    eq(vaultChainState.owner, CHAIN.platform),
    isNull(vaultChainState.listingSeller),
    isNull(vaultChainState.auctionSeller),
    eq(vaultChainState.redeeming, false),
    eq(vaultChainState.burned, false),
  );

export async function adminCards(db: Db, p: ListParams) {
  const state = p.pick("state", CARD_STATES, "held");
  const owner = p.pick("owner", CARD_OWNERS, "");
  const pack = p.pick("pack", CARD_PACKS, "");
  const grade = p.pick("grade", CARD_GRADES, "");
  const vault = p.pick("vault", ["", ...VAULT_IDS], "");
  const keys: SortKey[] = [
    { expr: vaultCards.createdAt, type: "timestamptz", desc: true },
    { expr: vaultCards.id, type: "text", desc: true },
  ];
  const burned = or(isNotNull(vaultCards.burnedAt), eq(vaultChainState.burned, true));
  const stateWhere = {
    held: and(isNull(vaultCards.burnedAt), sql`coalesce(${vaultChainState.burned}, false) = false`),
    listed: and(isNull(vaultCards.burnedAt), isNotNull(vaultChainState.listingSeller)),
    auction: and(isNull(vaultCards.burnedAt), isNotNull(vaultChainState.auctionSeller)),
    redeeming: and(isNull(vaultCards.burnedAt), eq(vaultChainState.redeeming, true)),
    redeemed: burned,
    unknown: and(isNull(vaultCards.burnedAt), isNull(vaultChainState.cardId)),
    all: undefined,
    assignable: assignableWhere(),
  }[state];
  const q = p.q;
  const where = p.id
    ? eq(vaultCards.id, p.id)
    : and(
        stateWhere,
        owner === "platform" ? isNull(vaultCards.depositorId) : owner === "depositor" ? isNotNull(vaultCards.depositorId) : undefined,
        pack === "in" ? isNotNull(vaultCards.packId) : pack === "none" ? isNull(vaultCards.packId) : undefined,
        grade === "graded" ? isNotNull(vaultCards.grader) : grade === "ungraded" ? isNull(vaultCards.grader) : grade ? eq(vaultCards.grader, grade) : undefined,
        vault ? eq(vaultCards.vault, vault) : undefined,
        p.from ? gte(vaultCards.createdAt, p.from) : undefined,
        p.to ? lt(vaultCards.createdAt, p.to) : undefined,
        q
          ? or(
              eq(vaultCards.id, q),
              eq(vaultCards.asset, q),
              ilike(vaultCards.serial, likePrefix(q)),
              eq(vaultChainState.owner, q),
              eq(vaultChainState.listingSeller, q),
              eq(vaultChainState.auctionSeller, q),
              eq(users.walletAddress, q),
              containsAny(q, [vaultCards.groupName, vaultCards.member, vaultCards.album, vaultCards.version, users.email]),
            )
          : undefined,
        afterCursor(keys, p.cursor),
      );
  const rows = await db
    .select({ card: vaultCards, chain: vaultChainState, depositor: partyCols, packName: packs.name, cursor: cursorOf(keys) })
    .from(vaultCards)
    .leftJoin(vaultChainState, eq(vaultChainState.cardId, vaultCards.id))
    .leftJoin(users, eq(users.id, vaultCards.depositorId))
    .leftJoin(packs, eq(packs.id, vaultCards.packId))
    .where(where)
    .orderBy(...orderOf(keys))
    .limit(p.limit + 1);
  const { list, next } = page(rows, p.limit);
  return {
    rows: list.map(({ card, chain, depositor, packName }) => {
      const c = chainOf(chain);
      const base = toCard(card);
      const status: Card["status"] = card.burnedAt || c?.burned ? "redeemed" : c?.redeeming ? "redeeming" : c?.auction ? "auction" : c?.listing ? "listed" : "vaulted";
      return {
        ...base,
        status,
        // 持有人：拍賣中看賣家；鏈上狀態還沒同步時不知道
        owner: c ? (c.auction?.seller ?? c.listing?.seller ?? c.owner) : "",
        mintTx: card.mintTx,
        createdAt: card.createdAt.toISOString(),
        depositor: depositor?.id ? party(depositor) : null,
        pack: card.packId ? { id: card.packId, name: packName ?? card.packId, tier: card.packTier, valueUsdt: (card.packValueCents ?? 0) / 100, pulled: Boolean(card.packOrder) } : null,
        chain: c,
      };
    }),
    next,
  };
}
export type AdminCard = Awaited<ReturnType<typeof adminCards>>["rows"][number];

// ── 用戶 ──
export const USER_ROLES = ["", "admin", "user"] as const;

export async function adminUsers(db: Db, p: ListParams) {
  const role = p.pick("role", USER_ROLES, "");
  const keys: SortKey[] = [
    { expr: users.createdAt, type: "timestamptz", desc: true },
    { expr: users.id, type: "text", desc: true },
  ];
  const q = p.q;
  const where = p.id
    ? eq(users.id, p.id)
    : and(
        role ? eq(users.role, role) : undefined,
        p.from ? gte(users.createdAt, p.from) : undefined,
        p.to ? lt(users.createdAt, p.to) : undefined,
        q ? or(eq(users.id, q), ilike(users.walletAddress, likePrefix(q)), containsAny(q, [users.email, users.displayName])) : undefined,
        afterCursor(keys, p.cursor),
      );
  const rows = await db
    .select({ u: users, cursor: cursorOf(keys) })
    .from(users)
    .where(where)
    .orderBy(...orderOf(keys))
    .limit(p.limit + 1);
  const { list, next } = page(rows, p.limit);
  return { rows: list.map(({ u }) => userRow(u)), next };
}

const userRow = (u: typeof users.$inferSelect) => ({
  id: u.id,
  name: u.displayName,
  email: u.email,
  emailVerified: u.emailVerifiedAt !== null,
  wallet: u.walletAddress,
  walletKind: u.walletKind,
  role: u.role,
  // 管理員：role 是 admin，或錢包在 ADMIN_WALLETS 裡（後者撤不掉）
  admin: isAdmin(u),
  adminByEnv: u.walletAddress !== null && adminWallets().has(u.walletAddress),
  createdAt: u.createdAt.toISOString(),
});
export type AdminUser = ReturnType<typeof userRow>;

// 用戶詳情：帳號資料、各類紀錄的數量和最近 5 筆訂單、金庫卡成交、開包。都按用戶或錢包走索引
export async function adminUserDetail(db: Db, id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return null;
  const wallet = u.walletAddress;
  const byWallet = wallet ? or(eq(vaultTrades.buyer, wallet), eq(vaultTrades.seller, wallet)) : sql`false`;
  const n = (rows: { n: number }[]) => rows[0]?.n ?? 0;
  const [bought, sold, items, deposited, packOrderCount, trades, redeems, recentOrders, recentTrades, recentPacks] = await Promise.all([
    db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.buyerId, id), ne(orders.status, "pending"))),
    db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.sellerId, id), ne(orders.status, "pending"))),
    db.select({ n: count() }).from(collectorItems).where(eq(collectorItems.userId, id)),
    db.select({ n: count() }).from(vaultCards).where(eq(vaultCards.depositorId, id)),
    db
      .select({ n: count() })
      .from(packOrders)
      .where(and(eq(packOrders.userId, id), ne(packOrders.status, "pending"))),
    db.select({ n: count() }).from(vaultTrades).where(byWallet),
    db.select({ n: count() }).from(redemptions).where(eq(redemptions.userId, id)),
    db
      .select({
        id: orders.id,
        status: orders.status,
        priceCents: orders.priceCents,
        buyerId: orders.buyerId,
        at: orders.updatedAt,
        title: collectorItems.title,
        group: collectorItems.groupName,
        member: collectorItems.member,
      })
      .from(orders)
      .leftJoin(collectorItems, eq(collectorItems.id, orders.itemId))
      .where(and(or(eq(orders.buyerId, id), eq(orders.sellerId, id)), ne(orders.status, "pending")))
      .orderBy(desc(orders.updatedAt))
      .limit(5),
    db
      .select({
        signature: vaultTrades.signature,
        kind: vaultTrades.kind,
        buyer: vaultTrades.buyer,
        priceCents: vaultTrades.priceCents,
        at: vaultTrades.tradedAt,
        cardId: vaultTrades.cardId,
        serial: vaultCards.serial,
      })
      .from(vaultTrades)
      .leftJoin(vaultCards, eq(vaultCards.id, vaultTrades.cardId))
      .where(byWallet)
      .orderBy(desc(vaultTrades.tradedAt))
      .limit(5),
    db
      .select({
        id: packOrders.id,
        packId: packOrders.packId,
        qty: packOrders.qty,
        amountCents: packOrders.amountCents,
        status: packOrders.status,
        at: packOrders.createdAt,
        name: packs.name,
      })
      .from(packOrders)
      .leftJoin(packs, eq(packs.id, packOrders.packId))
      .where(and(eq(packOrders.userId, id), ne(packOrders.status, "pending")))
      .orderBy(desc(packOrders.createdAt))
      .limit(5),
  ]);
  return {
    user: userRow(u),
    counts: { bought: n(bought), sold: n(sold), items: n(items), deposited: n(deposited), packOrders: n(packOrderCount), trades: n(trades), redemptions: n(redeems) },
    orders: recentOrders.map((o) => ({
      id: o.id,
      role: o.buyerId === id ? ("buyer" as const) : ("seller" as const),
      status: o.status,
      priceUsdt: o.priceCents / 100,
      at: o.at.toISOString(),
      title: o.title || [o.group, o.member].filter(Boolean).join(" "),
    })),
    trades: recentTrades.map((t) => ({
      signature: t.signature,
      kind: t.kind,
      role: t.buyer === wallet ? ("buyer" as const) : ("seller" as const),
      priceUsdt: t.priceCents / 100,
      at: t.at.toISOString(),
      cardId: t.cardId,
      serial: t.serial,
    })),
    packOrders: recentPacks.map((o) => ({ id: o.id, pack: o.name ?? o.packId, qty: o.qty, amountUsdt: o.amountCents / 100, status: o.status, at: o.at.toISOString() })),
  };
}
export type AdminUserDetail = NonNullable<Awaited<ReturnType<typeof adminUserDetail>>>;

// ── 待處理的數量 ──
export async function adminQueueCounts(db: Db) {
  const [[r], [i]] = await Promise.all([
    db
      .select({ n: count() })
      .from(redemptions)
      .leftJoin(vaultChainState, eq(vaultChainState.cardId, redemptions.cardId))
      .where(and(redemptionPending, eq(redemptions.feePaid, 1))),
    db
      .select({ n: count() })
      .from(collectorItems)
      .where(and(isNull(collectorItems.vaultCardId), vaultRequested)),
  ]);
  return { redemptions: r.n, vaultRequests: i.n };
}
