import "server-only";
import { ESCROW_CONFIRM_DAYS, ESCROW_SHIP_DAYS, FEE_BPS } from "@/lib/policy";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Db } from "./db";
import { collectorItems, orders, users, type OrderStatus, type PayRail } from "./schema";
import { arcPaymentRequest, arcPayout, settleArcPayment } from "./arc-pay";
import { buildPayment, payout, transferCollectorNft, verifyPayment } from "./funds";
import { itemTitle } from "@/lib/item-title";
import { itemCard, notify, type Notice } from "./notifications";

// 自由刊登的擔保交易。貨款先進平台錢包，買家確認收貨後才放給賣家，NFT 同時由平台轉給買家。
// 買家可以在 Solana 或 Arc 上付款（見 packs.ts），退款退回原來的通道；放款給賣家目前一律在 Solana 上，
// 用買家付的那種結算代幣（Arc 付的 USDC 也在 Solana 上用 USDC 放款）。
// 平台抽成和金庫卡一樣是 2.5%
export { FEE_BPS };
const memoOf = (orderId: string) => `idolca:order:${orderId}`;

// 訂單的通知都連到收藏冊的訂單頁
const ORDERS_HREF = "/binder?tab=orders";
async function notifyOrder(db: Db, order: OrderRow, notices: { to: "buyer" | "seller"; kind: Notice["kind"]; price?: number }[]) {
  const { card } = await itemCard(db, order.itemId);
  await notify(
    db,
    notices.map((n) => ({ userId: n.to === "buyer" ? order.buyerId : order.sellerId, kind: n.kind, params: { card, price: n.price }, href: ORDERS_HREF, ref: order.id })),
  );
}

export type OrderRow = typeof orders.$inferSelect;

// 建立待付款訂單：Solana 付款組好付款交易，Arc 付款給出要買家簽名的 USDC 授權轉帳內容
export async function createOrder(db: Db, buyerId: string, buyerWallet: string, itemId: string, rail: PayRail = "solana") {
  const [item] = await db.select().from(collectorItems).where(eq(collectorItems.id, itemId));
  if (!item || item.priceCents === null || item.verification !== "unverified") return { error: "not_listed" as const };
  if (item.userId === buyerId) return { error: "own_listing" as const };
  const id = randomUUID();
  const feeCents = Math.round((item.priceCents * FEE_BPS) / 10_000);
  // 先組好付款交易再寫訂單：餘額不夠時丟錯，不留下付不了款的訂單
  const tx = rail === "solana" ? await buildPayment(new PublicKey(buyerWallet), item.priceCents / 100, memoOf(id)) : null;
  await db.insert(orders).values({ id, itemId, buyerId, sellerId: item.userId, priceCents: item.priceCents, feeCents, buyerWallet, rail });
  if (rail === "arc") return { id, arc: arcPaymentRequest(memoOf(id), item.priceCents) };
  return { id, tx: tx! };
}

// 期限：付款後 SHIP_DAYS 天內賣家要標記寄出，否則買家可以取消並退款；
// 寄出後 CONFIRM_DAYS 天內買家沒確認也沒申訴，自動放款。測試時可以用環境變數縮短（單位：天，可用小數）
const DAY = 86_400_000;
const days = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
export const SHIP_DAYS = days("ESCROW_SHIP_DAYS", ESCROW_SHIP_DAYS);
export const CONFIRM_DAYS = days("ESCROW_CONFIRM_DAYS", ESCROW_CONFIRM_DAYS);
const shipDeadline = (o: OrderRow) => (o.paidAt ? new Date(o.paidAt.getTime() + SHIP_DAYS * DAY) : null);
const releaseAt = (o: OrderRow) => (o.shippedAt ? new Date(o.shippedAt.getTime() + CONFIRM_DAYS * DAY) : null);

// 退款給買家：退回原來付款的那條通道
const refundBuyer = (order: OrderRow) => (order.rail === "arc" ? arcPayout(order.payer!, order.priceCents) : payout(new PublicKey(order.buyerWallet), order.priceCents / 100, order.coin));
// 放款給賣家用的幣：Solana 付的用原來那種，Arc 付的用 USDC
const payoutCoin = (order: OrderRow) => (order.rail === "arc" ? "usdc" : order.coin);

// 付款確認：對帳成功就下架商品、訂單變成已付款。商品已被別人先買走時退款並取消。
// Solana 付款回報付款交易簽名；Arc 付款回報付款地址、授權有效期和授權簽名，伺服器代為送上鏈
export async function confirmOrderPayment(db: Db, buyerId: string, orderId: string, payment: { signature: string; from?: unknown; validBefore?: unknown }) {
  const [found] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)));
  if (!found || found.status !== "pending") return { error: "not_pending" as const };
  let signature = payment.signature;
  let payer: string | null = null;
  let coin = found.coin;
  if (found.rail === "arc") {
    const settled = await settleArcPayment(memoOf(orderId), found.priceCents, payment);
    signature = settled.hash;
    payer = settled.from;
  } else {
    const paid = await verifyPayment(signature, new PublicKey(found.buyerWallet), found.priceCents / 100, memoOf(orderId));
    if (!paid) return { error: "payment_not_found" as const };
    coin = paid;
  }
  // 先把付款記到訂單上，搶到的那一次才往下處理：同一筆付款重複回報時不會既成交又退款
  const [order] = await db
    .update(orders)
    .set({ payTx: signature, payer, coin })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending"), isNull(orders.payTx)))
    .returning();
  if (!order) return { error: "not_pending" as const };

  const [item] = await db
    .update(collectorItems)
    .set({ priceCents: null, listedAt: null })
    .where(and(eq(collectorItems.id, order.itemId), isNotNull(collectorItems.priceCents)))
    .returning();
  if (!item) {
    const refund = await refundBuyer(order);
    await db.update(orders).set({ status: "cancelled", payTx: signature, refundTx: refund, updatedAt: new Date() }).where(eq(orders.id, orderId));
    return { error: "sold_out_refunded" as const };
  }
  const now = new Date();
  await db.update(orders).set({ status: "paid", payTx: signature, paidAt: now, updatedAt: now }).where(eq(orders.id, orderId));
  await notifyOrder(db, order, [{ to: "seller", kind: "order_paid", price: order.priceCents / 100 }]);
  return { ok: true as const, payTx: signature };
}

export async function markShipped(db: Db, sellerId: string, orderId: string) {
  const now = new Date();
  const [row] = await db
    .update(orders)
    .set({ status: "shipped", shippedAt: now, updatedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId), eq(orders.status, "paid")))
    .returning();
  if (row) await notifyOrder(db, row, [{ to: "buyer", kind: "order_shipped" }]);
  return row ?? null;
}

// 把訂單從允許的狀態鎖成處理中；拿不到鎖表示別人已經在處理或狀態不對
async function lock(db: Db, orderId: string, from: OrderStatus[], to: "refunding" | "releasing") {
  const [row] = await db
    .update(orders)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), inArray(orders.status, from)))
    .returning();
  return row ?? null;
}
const unlock = (db: Db, order: OrderRow) => db.update(orders).set({ status: order.status, updatedAt: new Date() }).where(eq(orders.id, order.id));

// 退款給買家：全額退回，一口價的商品按原價重新上架（還是賣家的、也沒被標成假卡時）；拍賣得標的訂單不重新上架，卡回到賣家的收藏冊。
// NFT 一直在賣家手上，不用動
export async function refundOrder(db: Db, orderId: string, from: OrderStatus[] = ["paid", "shipped", "disputed"]) {
  const [before] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!before) return { error: "not_found" as const };
  const order = await lock(db, orderId, from, "refunding");
  if (!order) return { error: "not_refundable" as const };
  let refundTx: string;
  try {
    refundTx = await refundBuyer(order);
  } catch (err) {
    await unlock(db, before);
    throw err;
  }
  await db.update(orders).set({ status: "refunded", refundTx, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await notifyOrder(db, order, [
    { to: "buyer", kind: "order_refunded", price: order.priceCents / 100 },
    { to: "seller", kind: "order_refunded_seller" },
  ]);
  if (order.auctionId) return { ok: true as const, refundTx };
  await db
    .update(collectorItems)
    .set({ priceCents: order.priceCents, listedAt: new Date() })
    .where(and(eq(collectorItems.id, order.itemId), eq(collectorItems.userId, order.sellerId), eq(collectorItems.verification, "unverified")));
  return { ok: true as const, refundTx };
}

// 放款給賣家：NFT 轉給買家、貨款扣除抽成後放給賣家（賣家沒綁錢包時先暫存）、收藏品過戶給買家
export async function releaseOrder(db: Db, orderId: string, from: OrderStatus[] = ["shipped", "disputed"]) {
  const [before] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!before) return { error: "not_found" as const };
  const order = await lock(db, orderId, from, "releasing");
  if (!order) return { error: "not_releasable" as const };
  try {
    const [item] = await db.select().from(collectorItems).where(eq(collectorItems.id, order.itemId));
    const [seller] = await db.select({ wallet: users.walletAddress }).from(users).where(eq(users.id, order.sellerId));
    const transferTx = item?.mintTx && item.asset ? await transferCollectorNft(item.asset, order.buyerWallet) : null;
    const payoutTx = seller?.wallet ? await payout(new PublicKey(seller.wallet), (order.priceCents - order.feeCents) / 100, payoutCoin(order)) : null;
    await db
      .update(orders)
      .set({ status: "completed", transferTx, payoutTx, payoutHeld: payoutTx ? 0 : 1, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    if (item) await db.update(collectorItems).set({ userId: order.buyerId, ownerAddress: transferTx ? order.buyerWallet : item.ownerAddress }).where(eq(collectorItems.id, item.id));
    await notifyOrder(db, order, [{ to: "seller", kind: payoutTx ? "order_completed" : "order_completed_held", price: (order.priceCents - order.feeCents) / 100 }]);
    return { ok: true as const, transferTx, payoutTx };
  } catch (err) {
    await unlock(db, before);
    throw err;
  }
}

// 買家確認收貨
export async function confirmReceived(db: Db, buyerId: string, orderId: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)));
  if (!order || order.status !== "shipped") return { error: "not_shipped" as const };
  return releaseOrder(db, orderId, ["shipped"]);
}

// 買家取消：賣家過了寄出期限還沒寄，全額退款
export async function cancelUnshipped(db: Db, buyerId: string, orderId: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)));
  const deadline = order && shipDeadline(order);
  if (!order || order.status !== "paid" || !deadline) return { error: "not_paid" as const };
  if (Date.now() < deadline.getTime()) return { error: "too_early" as const };
  return refundOrder(db, orderId, ["paid"]);
}

// 買家申訴：收到的卡有問題，暫停自動放款，交給後台
export async function disputeOrder(db: Db, buyerId: string, orderId: string, reason: string) {
  const [row] = await db
    .update(orders)
    .set({ status: "disputed", disputeReason: reason.trim().slice(0, 500) || null, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId), eq(orders.status, "shipped")))
    .returning();
  if (row) await notifyOrder(db, row, [{ to: "seller", kind: "order_disputed" }]);
  return row ?? null;
}

// 處理逾時：賣家逾時未寄的退款，買家逾時未確認（也沒申訴）的放款。打開訂單頁時和每天的排程都會跑
export async function sweepOrders(db: Db) {
  const now = Date.now();
  const open = await db.select().from(orders).where(inArray(orders.status, ["paid", "shipped"]));
  let refunded = 0;
  let released = 0;
  for (const o of open) {
    try {
      const ship = shipDeadline(o);
      const release = releaseAt(o);
      if (o.status === "paid" && ship && now >= ship.getTime() && "ok" in (await refundOrder(db, o.id, ["paid"]))) refunded++;
      if (o.status === "shipped" && release && now >= release.getTime() && "ok" in (await releaseOrder(db, o.id, ["shipped"]))) released++;
    } catch (err) {
      console.error("sweep failed", o.id, err);
    }
  }
  return { refunded, released };
}

// 賣家綁定錢包後，補發之前暫存在平台的貨款
export async function releaseHeldPayouts(db: Db, sellerId: string, wallet: string) {
  const held = await db.select().from(orders).where(and(eq(orders.sellerId, sellerId), eq(orders.payoutHeld, 1)));
  for (const o of held) {
    const tx = await payout(new PublicKey(wallet), (o.priceCents - o.feeCents) / 100, payoutCoin(o));
    await db.update(orders).set({ payoutTx: tx, payoutHeld: 0, updatedAt: new Date() }).where(eq(orders.id, o.id));
  }
}

export type PublicOrder = {
  id: string;
  role: "buyer" | "seller";
  status: OrderStatus;
  // 買家付款和退款的通道；放款一律在 Solana
  rail: PayRail;
  // 拍賣得標的訂單
  auction: boolean;
  itemId: string;
  title: string;
  photo: string | null;
  priceUsdt: number;
  feeUsdt: number;
  payTx: string | null;
  payoutTx: string | null;
  payoutHeld: boolean;
  transferTx: string | null;
  refundTx: string | null;
  disputeReason: string | null;
  // 賣家寄出期限、自動放款時間（ISO）
  shipBy: string | null;
  autoReleaseAt: string | null;
  updatedAt: string;
};

const toPublic = (o: OrderRow, item: typeof collectorItems.$inferSelect | null, role: "buyer" | "seller"): PublicOrder => ({
  id: o.id,
  role,
  status: o.status,
  rail: o.rail,
  auction: Boolean(o.auctionId),
  itemId: o.itemId,
  title: item ? itemTitle({ title: item.title, group: item.groupName, member: item.member, version: item.version }) : "",
  photo: item?.photo ?? null,
  priceUsdt: o.priceCents / 100,
  feeUsdt: o.feeCents / 100,
  payTx: o.payTx,
  payoutTx: o.payoutTx,
  payoutHeld: o.payoutHeld === 1,
  transferTx: o.transferTx,
  refundTx: o.refundTx,
  disputeReason: o.disputeReason,
  shipBy: shipDeadline(o)?.toISOString() ?? null,
  autoReleaseAt: releaseAt(o)?.toISOString() ?? null,
  updatedAt: o.updatedAt.toISOString(),
});

// 我買的和我賣的訂單（不含沒付款就放棄的）
export async function myOrders(db: Db, userId: string): Promise<PublicOrder[]> {
  const rows = await db
    .select({ order: orders, item: collectorItems })
    .from(orders)
    .leftJoin(collectorItems, eq(collectorItems.id, orders.itemId))
    .where(or(eq(orders.buyerId, userId), eq(orders.sellerId, userId)))
    .orderBy(desc(orders.updatedAt));
  return rows.filter((r) => r.order.status !== "pending").map(({ order, item }) => toPublic(order, item, order.buyerId === userId ? "buyer" : "seller"));
}

// 後台：所有付過款的訂單，進行中和申訴中的排前面
export async function adminOrders(db: Db) {
  const rows = await db
    .select({ order: orders, item: collectorItems })
    .from(orders)
    .leftJoin(collectorItems, eq(collectorItems.id, orders.itemId))
    .where(inArray(orders.status, ["paid", "shipped", "disputed", "refunding", "releasing", "completed", "refunded", "cancelled"]))
    .orderBy(desc(orders.updatedAt))
    .limit(100);
  const rank = (s: OrderStatus) => (s === "disputed" ? 0 : s === "paid" || s === "shipped" ? 1 : 2);
  return rows.map(({ order, item }) => toPublic(order, item, "buyer")).sort((a, b) => rank(a.status) - rank(b.status));
}
