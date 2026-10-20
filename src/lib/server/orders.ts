import "server-only";
import { ESCROW_ADDRESS_DAYS, ESCROW_CONFIRM_DAYS, ESCROW_SHIP_DAYS } from "@/lib/policy";
import { feeCents as feeOf } from "@/lib/fees";
import { getFees } from "./fees";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { PublicKey } from "@solana/web3.js";
import type { Db } from "./db";
import { auctions, bids, collectorItems, orders, redemptions, users, type OrderStatus, type PayRail } from "./schema";
import { arcPaymentRequest, arcPayout, settleArcPayment } from "./arc-pay";
import { buildPayment, payout, transferCollectorNft, verifyPayment } from "./funds";
import { itemTitle } from "@/lib/item-title";
import { addressDeadline as addressDeadlineFrom, needsAddressReminder, shipDeadline as deadlineFrom } from "@/lib/escrow";
import { parseAddress, type ShippingAddress } from "@/lib/shipping";
import { trackingOf, type Tracking } from "@/lib/tracking";
import { itemCard, notify, type Notice } from "./notifications";
import { afterCursor, containsAny, cursorOf, orderOf, page, type SortKey } from "./admin-lists";
import { likePrefix } from "@/lib/admin-list";

// 自由刊登的擔保交易。貨款先進平台錢包，買家確認收貨後才放給賣家，NFT 同時由平台轉給買家。
// 買家可以在 Solana 或 Arc 上付款（見 packs.ts），退款退回原來的通道；放款給賣家目前一律在 Solana 上，
// 用買家付的那種結算代幣（Arc 付的 USDC 也在 Solana 上用 USDC 放款）。
// 平台抽成和金庫卡一口價用同一個費率（fees.ts 的 sale），建單時記在訂單上，之後改費率不影響已建的訂單
const memoOf = (orderId: string) => `idolca:order:${orderId}`;

// 訂單的通知都連到收藏冊的訂單頁
const ORDERS_HREF = "/binder?tab=orders";
// ref 預設是訂單編號（同一種通知每張訂單只發一次）；同一件事會發生多次時（買家改地址、賣家更正單號）另外帶上區分的 ref
async function notifyOrder(db: Db, order: OrderRow, notices: { to: "buyer" | "seller"; kind: Notice["kind"]; price?: number; tracking?: string; ref?: string }[]) {
  const { card } = await itemCard(db, order.itemId);
  await notify(
    db,
    notices.map((n) => ({
      userId: n.to === "buyer" ? order.buyerId : order.sellerId,
      kind: n.kind,
      params: { card, price: n.price, tracking: n.tracking },
      href: ORDERS_HREF,
      ref: n.ref ?? order.id,
    })),
  );
}

export type OrderRow = typeof orders.$inferSelect;

// 付了款、還沒結束的訂單。這期間卡還在賣家的收藏冊裡，但不能再刊登、拍賣或寄進金庫
export const OPEN_ORDER: OrderStatus[] = ["paid", "shipped", "disputed", "refunding", "releasing"];
export async function openOrders(db: Db, itemIds: string[]) {
  const out = new Map<string, OrderStatus>();
  if (!itemIds.length) return out;
  const rows = await db
    .select({ itemId: orders.itemId, status: orders.status })
    .from(orders)
    .where(and(inArray(orders.itemId, itemIds), inArray(orders.status, OPEN_ORDER)));
  for (const r of rows) out.set(r.itemId, r.status);
  return out;
}

// 建立待付款訂單：Solana 付款組好付款交易，Arc 付款給出要買家簽名的 USDC 授權轉帳內容。
// 一口價在付款前就要有收件地址，付款成功的那一刻賣家就能寄
export async function createOrder(db: Db, buyerId: string, buyerWallet: string, itemId: string, rail: PayRail, address: ShippingAddress) {
  const [item] = await db.select().from(collectorItems).where(eq(collectorItems.id, itemId));
  // 價格至少 1 分（priceToCents 擋下更低的價格，這裡再擋住早期存進來的 0 元刊登）
  if (!item || item.priceCents === null || item.priceCents < 1 || item.verification !== "unverified") return { error: "not_listed" as const };
  if (item.userId === buyerId) return { error: "own_listing" as const };
  const id = randomUUID();
  const feeCents = feeOf(item.priceCents, (await getFees(db)).sale.value);
  // 先組好付款交易再寫訂單：餘額不夠時丟錯，不留下付不了款的訂單
  const tx = rail === "solana" ? await buildPayment(new PublicKey(buyerWallet), item.priceCents / 100, memoOf(id)) : null;
  await db
    .insert(orders)
    .values({ id, itemId, buyerId, sellerId: item.userId, priceCents: item.priceCents, feeCents, buyerWallet, rail, shippingAddress: JSON.stringify(address), addressAt: new Date() });
  if (rail === "arc") return { id, arc: arcPaymentRequest(memoOf(id), item.priceCents) };
  return { id, tx: tx! };
}

// 期限：付款後 ADDRESS_DAYS 天內買家沒填收件地址，訂單自動取消並退款；
// 有地址後 SHIP_DAYS 天內賣家要標記寄出（從付款和填地址兩者較晚的時間起算），否則自動退款；
// 寄出後 CONFIRM_DAYS 天內買家沒確認也沒申訴，自動放款。測試時可以用環境變數縮短（單位：天，可用小數）
const DAY = 86_400_000;
const days = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
export const SHIP_DAYS = days("ESCROW_SHIP_DAYS", ESCROW_SHIP_DAYS);
export const CONFIRM_DAYS = days("ESCROW_CONFIRM_DAYS", ESCROW_CONFIRM_DAYS);
export const ADDRESS_DAYS = days("ESCROW_ADDRESS_DAYS", ESCROW_ADDRESS_DAYS);
const addressDeadline = (o: OrderRow) => addressDeadlineFrom(o.paidAt, o.shippingAddress ? o.addressAt : null, ADDRESS_DAYS);
const shipDeadline = (o: OrderRow) => deadlineFrom(o.paidAt, o.shippingAddress ? o.addressAt : null, SHIP_DAYS);
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

// 買家填寫或修改收件地址：付款後、寄出前都可以（拍賣得標的訂單、早期沒收地址的訂單在這裡補填）。
// 寄出期限從這次填寫起算，所以改地址只會讓賣家多一點時間；每次都通知賣家
export async function setOrderAddress(db: Db, buyerId: string, orderId: string, address: ShippingAddress) {
  const now = new Date();
  const [row] = await db
    .update(orders)
    .set({ shippingAddress: JSON.stringify(address), addressAt: now, updatedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId), eq(orders.status, "paid")))
    .returning();
  if (row) await notifyOrder(db, row, [{ to: "seller", kind: "order_address", ref: `${row.id}:${now.getTime()}` }]);
  return row ?? null;
}

// 賣家標記寄出：要有收件地址和物流單號（路由先用 parseTracking 驗過），並帶上他看到的那份地址的填寫時間；
// 買家在這之後改過地址就擋下，讓賣家重新讀過。單號隨寄出通知帶給買家
export async function markShipped(db: Db, sellerId: string, orderId: string, addressAt: unknown, tracking: Tracking) {
  const seen = typeof addressAt === "string" ? new Date(addressAt) : null;
  if (!seen || Number.isNaN(seen.getTime())) return { error: "no_address" as const };
  const now = new Date();
  const [row] = await db
    .update(orders)
    .set({ status: "shipped", shippedAt: now, updatedAt: now, trackingCarrier: tracking.carrier, trackingNumber: tracking.number })
    .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId), eq(orders.status, "paid"), isNotNull(orders.shippingAddress), eq(orders.addressAt, seen)))
    .returning();
  if (!row) {
    const [o] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId)));
    if (o?.status !== "paid") return { error: "not_paid" as const };
    return { error: o.shippingAddress ? ("address_changed" as const) : ("no_address" as const) };
  }
  await notifyOrder(db, row, [{ to: "buyer", kind: "order_shipped", tracking: tracking.number }]);
  return { ok: true as const };
}

// 賣家更正物流單號：寄出後到買家確認（或申訴）前都可以，改了就通知買家；單號沒變時不做事
export async function updateTracking(db: Db, sellerId: string, orderId: string, tracking: Tracking) {
  const [before] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId)));
  if (before?.status !== "shipped") return { error: "not_shipped" as const };
  if (before.trackingCarrier === tracking.carrier && before.trackingNumber === tracking.number) return { ok: true as const };
  const now = new Date();
  const [row] = await db
    .update(orders)
    .set({ trackingCarrier: tracking.carrier, trackingNumber: tracking.number, updatedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId), eq(orders.status, "shipped")))
    .returning();
  if (!row) return { error: "not_shipped" as const };
  await notifyOrder(db, row, [{ to: "buyer", kind: "order_tracking", tracking: tracking.number, ref: `${row.id}:${now.getTime()}` }]);
  return { ok: true as const };
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
  // 早期存進來、低於 1 分的價格不再接受（priceToCents），這種訂單退款後卡只回到收藏冊，不按原價重新上架
  if (order.auctionId || order.priceCents < 1) return { ok: true as const, refundTx };
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

// 買家取消：賣家過了寄出期限還沒寄，全額退款。還沒填地址的訂單沒有期限，不能取消
export async function cancelUnshipped(db: Db, buyerId: string, orderId: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)));
  const deadline = order && shipDeadline(order);
  if (!order || order.status !== "paid") return { error: "not_paid" as const };
  if (!deadline) return { error: "no_address" as const };
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

// 處理逾時：買家逾時沒填收件地址的退款（付款 2 天後先提醒一次），賣家逾時未寄的退款，買家逾時未確認（也沒申訴）的放款。
// 打開訂單頁時和每天的排程都會跑。退款時一口價的卡按原價重新上架，拍賣得標的卡回到賣家的收藏冊（見 refundOrder）
export async function sweepOrders(db: Db) {
  const now = Date.now();
  const open = await db.select().from(orders).where(inArray(orders.status, ["paid", "shipped"]));
  let refunded = 0;
  let released = 0;
  const remind = open.filter((o) => o.status === "paid" && needsAddressReminder(o.paidAt, o.shippingAddress ? o.addressAt : null, now));
  for (const o of remind) await notifyOrder(db, o, [{ to: "buyer", kind: "order_address_needed" }]);
  for (const o of open) {
    try {
      const address = addressDeadline(o);
      const ship = shipDeadline(o);
      const release = releaseAt(o);
      const overdue = (o.status === "paid" && address && now >= address.getTime()) || (o.status === "paid" && ship && now >= ship.getTime());
      if (overdue && "ok" in (await refundOrder(db, o.id, ["paid"]))) refunded++;
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
  // 買家填地址的期限（已填時沒有）、賣家寄出期限（買家還沒填地址時沒有）、自動放款時間（ISO）
  addressBy: string | null;
  shipBy: string | null;
  autoReleaseAt: string | null;
  // 收件地址和填寫時間：只在訂單的買家、賣家和後台看得到（myOrders、adminOrders），刊登頁和公開接口不讀這兩欄
  shippingAddress: ShippingAddress | null;
  addressAt: string | null;
  // 賣家寄出時填的物流單號，同樣只給買家、賣家和後台
  tracking: Tracking | null;
  updatedAt: string;
};

// 寫入時已經驗證過，讀出來原樣顯示（可寄送國家清單之後改了也不會讓舊地址消失）
const addressOf = (json: string | null) => (json ? (JSON.parse(json) as ShippingAddress) : null);

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
  addressBy: o.status === "paid" ? (addressDeadline(o)?.toISOString() ?? null) : null,
  shipBy: shipDeadline(o)?.toISOString() ?? null,
  autoReleaseAt: releaseAt(o)?.toISOString() ?? null,
  shippingAddress: addressOf(o.shippingAddress),
  addressAt: o.shippingAddress ? (o.addressAt?.toISOString() ?? null) : null,
  tracking: trackingOf(o.trackingCarrier, o.trackingNumber),
  updatedAt: o.updatedAt.toISOString(),
});

// 買家上一次填過的收件地址（擔保訂單或金庫卡提貨，取較新的），表單用來預填；只回給本人
export async function lastAddress(db: Db, userId: string): Promise<ShippingAddress | null> {
  const [[o], [r]] = await Promise.all([
    db
      .select({ address: orders.shippingAddress, at: orders.addressAt })
      .from(orders)
      .where(and(eq(orders.buyerId, userId), isNotNull(orders.shippingAddress)))
      .orderBy(desc(orders.addressAt))
      .limit(1),
    db
      .select({ address: redemptions.shippingAddress, at: redemptions.createdAt })
      .from(redemptions)
      .where(and(eq(redemptions.userId, userId), isNotNull(redemptions.shippingAddress)))
      .orderBy(desc(redemptions.createdAt))
      .limit(1),
  ]);
  const newer = !o ? r : !r ? o : (o.at?.getTime() ?? 0) >= r.at.getTime() ? o : r;
  // 預填用：重新驗證，不合現在規則的（例如國家已不能寄）就不帶入
  return newer?.address ? parseAddress(JSON.parse(newer.address)) : null;
}

// 排程：清掉結束超過 cutoff 的訂單（完成、退款、取消）和沒付款就放棄的訂單上的收件地址，物流單號一起清
export async function purgeOrderAddresses(db: Db, cutoff: Date) {
  const rows = await db
    .update(orders)
    .set({ shippingAddress: null, trackingCarrier: null, trackingNumber: null })
    .where(and(isNotNull(orders.shippingAddress), inArray(orders.status, ["completed", "refunded", "cancelled", "pending"]), lt(orders.updatedAt, cutoff)))
    .returning({ id: orders.id });
  return rows.length;
}

// 出價上的收件地址：拍賣不在進行中（成交、流拍、取消、作廢）就清掉。結標時已經清過，這裡兜底取消和作廢的拍賣
export async function purgeBidAddresses(db: Db) {
  const rows = await db
    .update(bids)
    .set({ shippingAddress: null })
    .where(and(isNotNull(bids.shippingAddress), inArray(bids.auctionId, db.select({ id: auctions.id }).from(auctions).where(ne(auctions.status, "live")))))
    .returning({ id: bids.id });
  return rows.length;
}

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

// 後台的訂單列表。open：還沒結束的（申訴中的排最前面，其次按最後更新時間）；late：已付款、有地址但還沒寄、寄出期限已過或一天內到期（期限最早的在前）；
// 其他按狀態篩，all 是所有付過款的。搜尋訂單編號、卡名、買賣雙方的郵箱或錢包、付款交易。每次只讀一頁（鍵集分頁見 admin-lists.ts）
export const ADMIN_ORDER_VIEWS = ["open", "disputed", "late", "paid", "shipped", "completed", "refunded", "cancelled", "all"] as const;
export type AdminOrderView = (typeof ADMIN_ORDER_VIEWS)[number];
export type AdminParty = { id: string; name: string; email: string | null; wallet: string | null };
export type AdminOrder = PublicOrder & { createdAt: string; paidAt: string | null; shippedAt: string | null; buyerWallet: string; buyer: AdminParty; seller: AdminParty };

// 寄出期限（同 shipDeadline），寫成 SQL 才能在資料庫裡篩和排序
const shipDeadlineSql = sql`(greatest(${orders.paidAt}, ${orders.addressAt}) + interval '${sql.raw(String(Math.round(SHIP_DAYS * 86_400)))} seconds')`;
const shipLateWhere = () => and(eq(orders.status, "paid"), isNotNull(orders.shippingAddress), sql`${shipDeadlineSql} < now() + interval '1 day'`);

export async function adminOrders(db: Db, p: { view: AdminOrderView; q?: string; from?: Date | null; to?: Date | null; cursor?: string | null; limit: number; id?: string | null }) {
  const buyer = alias(users, "buyer");
  const seller = alias(users, "seller");
  const byId: SortKey = { expr: orders.id, type: "text", desc: true };
  const keys: SortKey[] =
    p.view === "open"
      ? [{ expr: sql`(CASE WHEN ${orders.status} = 'disputed' THEN 0 ELSE 1 END)`, type: "int" }, { expr: orders.updatedAt, type: "timestamptz", desc: true }, byId]
      : p.view === "late"
        ? [{ expr: shipDeadlineSql, type: "timestamptz" }, { ...byId, desc: false }]
        : [{ expr: orders.updatedAt, type: "timestamptz", desc: true }, byId];
  const view = p.view === "open" ? inArray(orders.status, OPEN_ORDER) : p.view === "late" ? shipLateWhere() : p.view === "all" ? ne(orders.status, "pending") : eq(orders.status, p.view);
  const q = p.q;
  const where = p.id
    ? eq(orders.id, p.id)
    : and(
        view,
        p.from ? gte(orders.createdAt, p.from) : undefined,
        p.to ? lt(orders.createdAt, p.to) : undefined,
        q
          ? or(
              ilike(orders.id, likePrefix(q)),
              eq(orders.payTx, q),
              eq(orders.buyerWallet, q),
              eq(buyer.walletAddress, q),
              eq(seller.walletAddress, q),
              containsAny(q, [collectorItems.title, collectorItems.groupName, collectorItems.member, buyer.email, seller.email]),
            )
          : undefined,
        afterCursor(keys, p.cursor ?? null),
      );
  const party = (u: typeof buyer | typeof seller) => ({ id: u.id, name: u.displayName, email: u.email, wallet: u.walletAddress });
  const rows = await db
    .select({ order: orders, item: collectorItems, buyer: party(buyer), seller: party(seller), cursor: cursorOf(keys) })
    .from(orders)
    .innerJoin(buyer, eq(buyer.id, orders.buyerId))
    .innerJoin(seller, eq(seller.id, orders.sellerId))
    .leftJoin(collectorItems, eq(collectorItems.id, orders.itemId))
    .where(where)
    .orderBy(...orderOf(keys))
    .limit(p.limit + 1);
  const { list, next } = page(rows, p.limit);
  const out: AdminOrder[] = list.map(({ order, item, buyer, seller }) => ({
    ...toPublic(order, item, "buyer"),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    buyerWallet: order.buyerWallet,
    buyer,
    seller,
  }));
  return { rows: out, next };
}

// 待處理的數量：申訴中，以及寄出期限已過或一天內到期
export async function adminOrderCounts(db: Db) {
  const [[d], [l]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(eq(orders.status, "disputed")),
    db.select({ n: count() }).from(orders).where(shipLateWhere()),
  ]);
  return { disputed: d.n, late: l.n };
}
