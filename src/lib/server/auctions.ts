import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Db } from "./db";
import { atomic } from "./db";
import { auctions, bids, collectorItems, orders, type PayRail } from "./schema";
import { arcPaymentRequest, arcPayout, settleArcPayment } from "./arc-pay";
import { buildPayment, payout, verifyPayment } from "./funds";
import { MAX_PRICE, priceToCents } from "./items";
import { AUCTION_DAYS, AUCTION_EXTEND_MINUTES, AUCTION_FEE_BPS, AUCTION_MIN_START, auctionFeeCents, minNextBid, type AuctionView } from "@/lib/auction";

// 自由刊登的拍賣。每口出價都先付全額進平台錢包（Solana 或 Arc），被超過就退回，得標者早就付了錢，不會棄標；
// 結標時得標款直接變成一張擔保訂單（orders），之後照擔保交易的期限寄出、確認、放款。
// 金庫卡的拍賣在鏈上託管程序裡，見 vault-chain.ts

export type AuctionRow = typeof auctions.$inferSelect;
export type BidRow = typeof bids.$inferSelect;

// 測試時可以用環境變數縮短（單位：秒，可用小數）：拍賣的一「天」、出價付款期限、截止前的延長時間
const seconds = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v * 1000 : fallback;
};
const DAY = 86_400_000;
const AUCTION_DAY_MS = seconds("AUCTION_DAY_SECONDS", DAY);
// 出價從建單到付款確認的期限；截止後也等這麼久才結標，讓截止前送出的付款來得及確認
export const BID_WINDOW_MS = seconds("AUCTION_BID_WINDOW_SECONDS", 2 * 60_000);
const EXTEND_MS = seconds("AUCTION_EXTEND_SECONDS", AUCTION_EXTEND_MINUTES * 60_000);
const memoOf = (bidId: string) => `idolca:bid:${bidId}`;
const OPEN_ORDER: (typeof orders.$inferSelect.status)[] = ["paid", "shipped", "disputed", "refunding", "releasing"];

export function auctionView(a: AuctionRow, now = Date.now()): AuctionView {
  return {
    lane: "free",
    startUsd: a.startCents / 100,
    hasReserve: a.reserveCents !== null,
    reserveMet: a.reserveCents === null || (a.highCents ?? 0) >= a.reserveCents,
    highUsd: a.highCents === null ? null : a.highCents / 100,
    bidCount: a.bidCount,
    minNextUsd: minNextBid(a.highCents, a.startCents, 100) / 100,
    endsAt: a.endsAt.toISOString(),
    feeBps: a.feeBps,
    status: a.status === "live" && a.endsAt.getTime() <= now ? "settling" : a.status,
  };
}

export async function liveAuction(db: Db, itemId: string) {
  const [row] = await db.select().from(auctions).where(and(eq(auctions.itemId, itemId), eq(auctions.status, "live")));
  return row ?? null;
}

// 一批卡最近的一場拍賣（進行中的優先），給市場和收藏冊顯示
export async function latestAuctions(db: Db, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, AuctionRow>();
  const rows = await db.select().from(auctions).where(inArray(auctions.itemId, itemIds)).orderBy(desc(auctions.createdAt));
  const out = new Map<string, AuctionRow>();
  for (const r of rows) {
    const prev = out.get(r.itemId);
    if (!prev || (prev.status !== "live" && r.status === "live")) out.set(r.itemId, r);
  }
  return out;
}

export type StartInput = { startUsd: unknown; reserveUsd?: unknown; days: unknown };

// 開拍：卡要是自己的、沒被標成假卡、沒申請寄進金庫、沒有進行中的訂單；一口價刊登同時下架
export async function startAuction(db: Db, userId: string, itemId: string, input: StartInput) {
  const start = priceToCents(input.startUsd);
  const reserve = input.reserveUsd === null || input.reserveUsd === undefined || input.reserveUsd === "" ? null : priceToCents(input.reserveUsd);
  const days = Number(input.days);
  if (!start || start < AUCTION_MIN_START * 100 || start > MAX_PRICE * 100) return { error: "invalid_start" as const };
  if (reserve === undefined || (reserve !== null && reserve < start)) return { error: "invalid_reserve" as const };
  if (!(AUCTION_DAYS as readonly number[]).includes(days)) return { error: "invalid_duration" as const };

  const [item] = await db.select().from(collectorItems).where(and(eq(collectorItems.id, itemId), eq(collectorItems.userId, userId)));
  if (!item) return { error: "not_found" as const };
  if (item.verification !== "unverified") return { error: "fake" as const };
  if (item.vaultRequestedAt || item.vaultCardId) return { error: "in_vault" as const };
  const [open] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.itemId, itemId), inArray(orders.status, OPEN_ORDER)));
  if (open) return { error: "in_order" as const };
  if (await liveAuction(db, itemId)) return { error: "already_auction" as const };

  const row = { id: randomUUID(), itemId, sellerId: userId, startCents: start, reserveCents: reserve, feeBps: AUCTION_FEE_BPS, endsAt: new Date(Date.now() + days * AUCTION_DAY_MS) };
  try {
    await atomic(db, (q) => [q.update(collectorItems).set({ priceCents: null, listedAt: null }).where(eq(collectorItems.id, itemId)), q.insert(auctions).values(row)]);
  } catch (err) {
    // 同時送出兩次時，唯一索引擋下第二場
    if (await liveAuction(db, itemId)) return { error: "already_auction" as const };
    throw err;
  }
  const [created] = await db.select().from(auctions).where(eq(auctions.id, row.id));
  return { auction: created };
}

// 賣家取消：只有還沒人出價時可以
export async function cancelAuction(db: Db, userId: string, itemId: string) {
  const [row] = await db
    .update(auctions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(auctions.itemId, itemId), eq(auctions.sellerId, userId), eq(auctions.status, "live"), eq(auctions.bidCount, 0)))
    .returning();
  return row ?? null;
}

// 卡被標成假卡：取消進行中的拍賣，最高出價等退款
export async function voidAuction(db: Db, itemId: string) {
  const a = await liveAuction(db, itemId);
  if (!a) return;
  await atomic(db, (q) => [
    q.update(auctions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(auctions.id, a.id)),
    q.update(bids).set({ status: "outbid" }).where(and(eq(bids.auctionId, a.id), eq(bids.status, "leading"))),
  ]);
}

// 建立出價：檢查金額和身分，回傳付款內容（Solana 付款交易，或 Arc 上要簽的 USDC 授權）。付款確認後才算出價
export async function createBid(db: Db, bidderId: string, wallet: string, auctionId: string, amountUsd: unknown, rail: PayRail) {
  const amount = priceToCents(amountUsd);
  const [a] = await db.select().from(auctions).where(eq(auctions.id, auctionId));
  if (!a || a.status !== "live" || a.endsAt.getTime() <= Date.now()) return { error: "auction_ended" as const };
  if (a.sellerId === bidderId) return { error: "own_auction" as const };
  if (!amount || amount < minNextBid(a.highCents, a.startCents, 100)) return { error: "bid_too_low" as const };
  if (a.highBidId) {
    const [high] = await db.select({ bidderId: bids.bidderId }).from(bids).where(eq(bids.id, a.highBidId));
    if (high?.bidderId === bidderId) return { error: "already_leading" as const };
  }
  const id = randomUUID();
  // 先組好付款交易再寫出價：餘額不夠時丟錯，不留下付不了款的出價
  const tx = rail === "solana" ? await buildPayment(new PublicKey(wallet), amount / 100, memoOf(id)) : null;
  await db.insert(bids).values({ id, auctionId, bidderId, bidderWallet: wallet, amountCents: amount, rail });
  if (rail === "arc") return { id, arc: arcPaymentRequest(memoOf(id), amount, BID_WINDOW_MS / 1000) };
  return { id, tx: tx! };
}

// 付款確認：對帳成功後嘗試成為最高出價。沒被接受（截止了、別人先出了更高的）就記成 outbid，由 refundBids 退款
export async function confirmBid(db: Db, bidderId: string, bidId: string, payment: { signature: string; from?: unknown; validBefore?: unknown }) {
  const [found] = await db.select().from(bids).where(and(eq(bids.id, bidId), eq(bids.bidderId, bidderId)));
  if (!found || found.status !== "pending") return { error: "not_pending" as const };
  let signature = payment.signature;
  let payer: string | null = null;
  let coin = found.coin;
  if (found.rail === "arc") {
    const settled = await settleArcPayment(memoOf(bidId), found.amountCents, payment);
    signature = settled.hash;
    payer = settled.from;
  } else {
    const paid = await verifyPayment(signature, new PublicKey(found.bidderWallet), found.amountCents / 100, memoOf(bidId));
    if (!paid) return { error: "payment_not_found" as const };
    coin = paid;
  }
  // 先把付款記到出價上，搶到的那一次才往下處理：同一筆付款重複回報時不會既被接受又被退款
  const [bid] = await db
    .update(bids)
    .set({ payTx: signature, payer, coin, paidAt: new Date() })
    .where(and(eq(bids.id, bidId), eq(bids.status, "pending"), isNull(bids.payTx)))
    .returning();
  if (!bid) return { error: "not_pending" as const };

  for (let attempt = 0; attempt < 5; attempt++) {
    const now = Date.now();
    const [a] = await db.select().from(auctions).where(eq(auctions.id, bid.auctionId));
    const open = a && a.status === "live" && bid.createdAt < a.endsAt && now <= a.endsAt.getTime() + BID_WINDOW_MS;
    if (!open) return reject(db, bid, "auction_ended");
    if (bid.amountCents < minNextBid(a.highCents, a.startCents, 100)) return reject(db, bid, "outbid_meanwhile");
    // 截止前 5 分鐘內出價，截止時間延到出價後 5 分鐘
    const endsAt = new Date(Math.max(a.endsAt.getTime(), now + EXTEND_MS));
    // 樂觀鎖：最高出價還是剛才讀到的那一口才寫入；這期間有人搶先就重讀再比一次。
    // 結標要等截止後 BID_WINDOW_MS，所以這裡要求 ends_at 還在這個範圍內，結標開始後不可能再接受出價
    const [won] = await db
      .update(auctions)
      .set({ highBidId: bid.id, highCents: bid.amountCents, bidCount: a.bidCount + 1, endsAt, updatedAt: new Date(now) })
      .where(
        and(
          eq(auctions.id, a.id),
          eq(auctions.status, "live"),
          gte(auctions.endsAt, new Date(now - BID_WINDOW_MS)),
          a.highBidId ? eq(auctions.highBidId, a.highBidId) : isNull(auctions.highBidId),
        ),
      )
      .returning();
    if (!won) continue;
    await atomic(db, (q) => [
      ...(a.highBidId ? [q.update(bids).set({ status: "outbid" }).where(and(eq(bids.id, a.highBidId), eq(bids.status, "leading")))] : []),
      q.update(bids).set({ status: "leading", acceptedAt: new Date(now) }).where(eq(bids.id, bid.id)),
    ]);
    return { ok: true as const, payTx: signature, auction: auctionView(won) };
  }
  return reject(db, bid, "outbid_meanwhile");
}

async function reject(db: Db, bid: BidRow, reason: "auction_ended" | "outbid_meanwhile") {
  await db.update(bids).set({ status: "outbid" }).where(and(eq(bids.id, bid.id), eq(bids.status, "pending")));
  return { error: reason, refunding: true as const };
}

// 結標：截止超過 BID_WINDOW_MS 的拍賣。有出價且達到保底價時，得標款轉成一張已付款的擔保訂單；否則流拍，最高出價等退款。
// 訂單編號由拍賣決定，重複執行不會建兩張；回傳結標了幾場
export async function settleAuctions(db: Db) {
  const due = await db
    .select()
    .from(auctions)
    .where(and(eq(auctions.status, "live"), lt(auctions.endsAt, new Date(Date.now() - BID_WINDOW_MS))));
  for (const a of due) {
    try {
      await settleOne(db, a);
    } catch (err) {
      console.error("settle auction failed", a.id, err);
    }
  }
  return due.length;
}

async function settleOne(db: Db, a: AuctionRow) {
  const now = new Date();
  const [high] = a.highBidId ? await db.select().from(bids).where(eq(bids.id, a.highBidId)) : [];
  const unchanged = and(eq(auctions.id, a.id), eq(auctions.status, "live"), eq(auctions.endsAt, a.endsAt));
  if (high && a.highCents !== null && (a.reserveCents === null || a.highCents >= a.reserveCents)) {
    const orderId = `auction-${a.id}`;
    await atomic(db, (q) => [
      q.update(auctions).set({ status: "sold", orderId, updatedAt: now }).where(unchanged),
      q
        .insert(orders)
        .values({
          id: orderId,
          itemId: a.itemId,
          buyerId: high.bidderId,
          sellerId: a.sellerId,
          priceCents: a.highCents!,
          feeCents: auctionFeeCents(a.highCents!, a.feeBps),
          status: "paid",
          buyerWallet: high.bidderWallet,
          rail: high.rail,
          payer: high.payer,
          payTx: high.payTx,
          paidAt: now,
          auctionId: a.id,
        })
        .onConflictDoNothing(),
      q.update(bids).set({ status: "won" }).where(and(eq(bids.id, high.id), eq(bids.status, "leading"))),
    ]);
  } else {
    await atomic(db, (q) => [
      q.update(auctions).set({ status: "unsold", updatedAt: now }).where(unchanged),
      ...(high ? [q.update(bids).set({ status: "outbid" }).where(and(eq(bids.id, high.id), eq(bids.status, "leading")))] : []),
    ]);
  }
}

// 退款：被超過、沒被接受、流拍和拍賣取消的出價，全額退回原通道。先鎖成 refunding，失敗時放回 outbid 等下次。
// 也順便修正中斷時留下的狀態：標成 leading、但已經不是拍賣最高出價的那一口
export async function refundBids(db: Db) {
  const stale = await db
    .select({ id: bids.id })
    .from(bids)
    .innerJoin(auctions, eq(auctions.id, bids.auctionId))
    .where(and(eq(bids.status, "leading"), or(isNull(auctions.highBidId), sql`${auctions.highBidId} <> ${bids.id}`)));
  if (stale.length) await db.update(bids).set({ status: "outbid" }).where(inArray(bids.id, stale.map((s) => s.id)));

  const due = await db.select().from(bids).where(and(eq(bids.status, "outbid"), isNotNull(bids.payTx)));
  let refunded = 0;
  for (const b of due) {
    const [locked] = await db.update(bids).set({ status: "refunding" }).where(and(eq(bids.id, b.id), eq(bids.status, "outbid"))).returning();
    if (!locked) continue;
    try {
      const refundTx = b.rail === "arc" ? await arcPayout(b.payer!, b.amountCents) : await payout(new PublicKey(b.bidderWallet), b.amountCents / 100, b.coin);
      await db.update(bids).set({ status: "refunded", refundTx }).where(eq(bids.id, b.id));
      refunded++;
    } catch (err) {
      console.error("bid refund failed", b.id, err);
      await db.update(bids).set({ status: "outbid" }).where(eq(bids.id, b.id));
    }
  }
  return refunded;
}

// 結標和退款一起跑：排程、打開拍賣頁和市場時都會呼叫
export async function sweepAuctions(db: Db) {
  const settled = await settleAuctions(db);
  const refunded = await refundBids(db);
  return { auctionsSettled: settled, bidsRefunded: refunded };
}

// 是否有到期要結標或待退款的，避免每次請求都跑一遍完整的 sweep
export async function auctionsDue(db: Db) {
  const [late] = await db
    .select({ id: auctions.id })
    .from(auctions)
    .where(and(eq(auctions.status, "live"), lt(auctions.endsAt, new Date(Date.now() - BID_WINDOW_MS))))
    .limit(1);
  if (late) return true;
  const [owed] = await db.select({ id: bids.id }).from(bids).where(and(eq(bids.status, "outbid"), isNotNull(bids.payTx))).limit(1);
  return Boolean(owed);
}

export type BidHistoryEntry = { bidder: string; amountUsd: number; at: string; mine: boolean };
export type AuctionDetail = AuctionView & {
  id: string;
  itemId: string;
  history: BidHistoryEntry[];
  // 看的人自己：是不是賣家、是不是目前最高、有沒有退款中的出價
  me: { seller: boolean; leading: boolean; refunding: boolean } | null;
};

// 拍賣頁的完整狀態：出價紀錄只列被接受過的出價，出價者用代號（出價者 1、2…，按第一次出價的順序）
export async function auctionDetail(db: Db, auctionId: string, viewerId: string | null): Promise<AuctionDetail | null> {
  const [a] = await db.select().from(auctions).where(eq(auctions.id, auctionId));
  if (!a) return null;
  const rows = await db.select().from(bids).where(and(eq(bids.auctionId, a.id), isNotNull(bids.acceptedAt))).orderBy(asc(bids.acceptedAt));
  const alias = new Map<string, number>();
  for (const b of rows) if (!alias.has(b.bidderId)) alias.set(b.bidderId, alias.size + 1);
  const history = rows
    .map((b) => ({ bidder: String(alias.get(b.bidderId)), amountUsd: b.amountCents / 100, at: b.acceptedAt!.toISOString(), mine: b.bidderId === viewerId }))
    .reverse();
  let me: AuctionDetail["me"] = null;
  if (viewerId) {
    const [owed] = await db
      .select({ id: bids.id })
      .from(bids)
      .where(and(eq(bids.auctionId, a.id), eq(bids.bidderId, viewerId), inArray(bids.status, ["outbid", "refunding"]), isNotNull(bids.payTx)))
      .limit(1);
    const leader = rows.find((b) => b.id === a.highBidId);
    me = { seller: a.sellerId === viewerId, leading: leader?.bidderId === viewerId, refunding: Boolean(owed) };
  }
  return { ...auctionView(a), id: a.id, itemId: a.itemId, history, me };
}

// 刊登頁要不要顯示這張卡：一口價刊登中、拍賣進行中，或拍賣成交、流拍不到 7 天（讓出價的人看得到結果）。賣家取消的不算
export async function recentAuction(db: Db, itemId: string) {
  const [row] = await db
    .select()
    .from(auctions)
    .where(
      and(
        eq(auctions.itemId, itemId),
        or(eq(auctions.status, "live"), and(inArray(auctions.status, ["sold", "unsold"]), gt(auctions.updatedAt, new Date(Date.now() - 7 * DAY)))),
      ),
    )
    .orderBy(desc(auctions.createdAt))
    .limit(1);
  return row ?? null;
}
