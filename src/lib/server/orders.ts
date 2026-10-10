import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Db } from "./db";
import { collectorItems, orders, users, type OrderStatus } from "./schema";
import { buildPayment, payout, transferCollectorNft, verifyPayment } from "./funds";
import { itemTitle } from "@/lib/item-title";

// 自由刊登的擔保交易。貨款先進平台錢包，買家確認收貨後才放給賣家，NFT 同時由平台轉給買家。
// 平台抽成和金庫卡一樣是 2.5%
export const FEE_BPS = 250;
const memoOf = (orderId: string) => `idolca:order:${orderId}`;

export type OrderRow = typeof orders.$inferSelect;

// 建立待付款訂單並組好付款交易
export async function createOrder(db: Db, buyerId: string, buyerWallet: string, itemId: string) {
  const [item] = await db.select().from(collectorItems).where(eq(collectorItems.id, itemId));
  if (!item || item.priceCents === null || item.verification !== "unverified") return { error: "not_listed" as const };
  if (item.userId === buyerId) return { error: "own_listing" as const };
  const id = randomUUID();
  const feeCents = Math.round((item.priceCents * FEE_BPS) / 10_000);
  await db.insert(orders).values({ id, itemId, buyerId, sellerId: item.userId, priceCents: item.priceCents, feeCents, buyerWallet });
  const tx = await buildPayment(new PublicKey(buyerWallet), item.priceCents / 100, memoOf(id));
  return { id, tx };
}

// 付款交易確認：對帳成功就下架商品、訂單變成已付款。商品已被別人先買走時退款並取消
export async function confirmOrderPayment(db: Db, buyerId: string, orderId: string, signature: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)));
  if (!order || order.status !== "pending") return { error: "not_pending" as const };
  const ok = await verifyPayment(signature, new PublicKey(order.buyerWallet), order.priceCents / 100, memoOf(orderId));
  if (!ok) return { error: "payment_not_found" as const };

  const [item] = await db
    .update(collectorItems)
    .set({ priceCents: null, listedAt: null })
    .where(and(eq(collectorItems.id, order.itemId), isNotNull(collectorItems.priceCents)))
    .returning();
  if (!item) {
    const refund = await payout(new PublicKey(order.buyerWallet), order.priceCents / 100);
    await db.update(orders).set({ status: "cancelled", payTx: signature, payoutTx: refund, updatedAt: new Date() }).where(eq(orders.id, orderId));
    return { error: "sold_out_refunded" as const };
  }
  await db.update(orders).set({ status: "paid", payTx: signature, updatedAt: new Date() }).where(eq(orders.id, orderId));
  return { ok: true as const };
}

export async function markShipped(db: Db, sellerId: string, orderId: string) {
  const [row] = await db
    .update(orders)
    .set({ status: "shipped", updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId), eq(orders.status, "paid")))
    .returning();
  return row ?? null;
}

// 買家確認收貨：NFT 轉給買家、貨款扣除抽成後放給賣家（賣家沒綁錢包時先暫存）、收藏品過戶給買家
export async function confirmReceived(db: Db, buyerId: string, orderId: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)));
  if (!order || order.status !== "shipped") return { error: "not_shipped" as const };
  const [item] = await db.select().from(collectorItems).where(eq(collectorItems.id, order.itemId));
  const [seller] = await db.select({ wallet: users.walletAddress }).from(users).where(eq(users.id, order.sellerId));

  const transferTx = item?.mintTx ? await transferCollectorNft(item.asset, order.buyerWallet) : null;
  const sellerAmount = (order.priceCents - order.feeCents) / 100;
  const payoutTx = seller?.wallet ? await payout(new PublicKey(seller.wallet), sellerAmount) : null;
  await db
    .update(orders)
    .set({ status: "completed", transferTx, payoutTx, payoutHeld: payoutTx ? 0 : 1, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
  if (item) await db.update(collectorItems).set({ userId: buyerId, ownerAddress: transferTx ? order.buyerWallet : item.ownerAddress }).where(eq(collectorItems.id, item.id));
  return { ok: true as const, transferTx, payoutTx };
}

// 賣家綁定錢包後，補發之前暫存在平台的貨款
export async function releaseHeldPayouts(db: Db, sellerId: string, wallet: string) {
  const held = await db.select().from(orders).where(and(eq(orders.sellerId, sellerId), eq(orders.payoutHeld, 1)));
  for (const o of held) {
    const tx = await payout(new PublicKey(wallet), (o.priceCents - o.feeCents) / 100);
    await db.update(orders).set({ payoutTx: tx, payoutHeld: 0, updatedAt: new Date() }).where(eq(orders.id, o.id));
  }
}

export type PublicOrder = {
  id: string;
  role: "buyer" | "seller";
  status: OrderStatus;
  itemId: string;
  title: string;
  photo: string | null;
  priceUsdt: number;
  feeUsdt: number;
  payTx: string | null;
  payoutTx: string | null;
  payoutHeld: boolean;
  transferTx: string | null;
  updatedAt: string;
};

// 我買的和我賣的訂單（不含沒付款就放棄的）
export async function myOrders(db: Db, userId: string): Promise<PublicOrder[]> {
  const rows = await db
    .select({ order: orders, item: collectorItems })
    .from(orders)
    .leftJoin(collectorItems, eq(collectorItems.id, orders.itemId))
    .where(or(eq(orders.buyerId, userId), eq(orders.sellerId, userId)))
    .orderBy(desc(orders.updatedAt));
  return rows
    .filter((r) => r.order.status !== "pending")
    .map(({ order: o, item }) => ({
      id: o.id,
      role: o.buyerId === userId ? "buyer" : "seller",
      status: o.status,
      itemId: o.itemId,
      title: item ? itemTitle({ title: item.title, group: item.groupName, member: item.member, version: item.version }) : "",
      photo: item?.photo ?? null,
      priceUsdt: o.priceCents / 100,
      feeUsdt: o.feeCents / 100,
      payTx: o.payTx,
      payoutTx: o.payoutTx,
      payoutHeld: o.payoutHeld === 1,
      transferTx: o.transferTx,
      updatedAt: o.updatedAt.toISOString(),
    }));
}
