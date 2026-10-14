import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "./db";
import { collectorItems, notifications, users, vaultCards } from "./schema";
import { itemTitle } from "@/lib/item-title";
import type { NotificationKind, NotificationParams, NotificationView } from "@/lib/notifications";

// 站內通知：拍賣（有人出價、被超過、得標、成交、流拍）、擔保訂單（賣出、買家填好收件地址、提醒買家填地址、寄出、完成、退款、申訴）、金庫卡賣出。
// 在伺服器處理那件事的地方寫入（出價確認、結標、訂單狀態變更、金庫卡交易回報），寫入失敗只記日誌，不影響交易本身。
// 同一件事用 key 去重：同一筆交易被回報兩次、排程重跑都不會重複通知

export type Notice = { userId: string; kind: NotificationKind; params: NotificationParams; href: string; ref: string };

const KEEP_DAYS = 90;
const LIST_LIMIT = 30;

export async function notify(db: Db, notices: Notice[]) {
  if (!notices.length) return;
  try {
    await db
      .insert(notifications)
      .values(notices.map((n) => ({ id: randomUUID(), userId: n.userId, kind: n.kind, params: JSON.stringify(n.params), href: n.href, key: `${n.kind}:${n.ref}:${n.userId}` })))
      .onConflictDoNothing();
  } catch (err) {
    console.error("notify failed", notices.map((n) => n.kind).join(","), err);
  }
}

// 金庫卡的事件只知道錢包地址，對應到帳號；沒有帳號的錢包（只在別處交易過）不通知
export async function usersByWallet(db: Db, wallets: string[]) {
  const list = [...new Set(wallets.filter(Boolean))];
  if (!list.length) return new Map<string, string>();
  const rows = await db.select({ id: users.id, wallet: users.walletAddress }).from(users).where(inArray(users.walletAddress, list));
  return new Map(rows.map((r) => [r.wallet!, r.id]));
}

// 通知裡的卡名和連結
export async function itemCard(db: Db, itemId: string) {
  const [item] = await db.select().from(collectorItems).where(eq(collectorItems.id, itemId));
  return { card: item ? itemTitle({ title: item.title, group: item.groupName, member: item.member, version: item.version }) : "", href: `/listing/${itemId}` };
}

export async function vaultCard(db: Db, cardId: string) {
  const [row] = await db.select().from(vaultCards).where(eq(vaultCards.id, cardId));
  return { card: row ? itemTitle({ title: null, group: row.groupName, member: row.member, version: row.version }) : "", href: `/card/${cardId}` };
}

export async function listNotifications(db: Db, userId: string): Promise<{ items: NotificationView[]; unread: number }> {
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(LIST_LIMIT),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  return {
    items: rows.map((r) => ({ id: r.id, kind: r.kind as NotificationKind, params: JSON.parse(r.params) as NotificationParams, href: r.href, read: r.readAt !== null, at: r.createdAt.toISOString() })),
    unread: n,
  };
}

export async function markAllRead(db: Db, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

// 排程清掉超過 90 天的通知
export async function purgeNotifications(db: Db) {
  const rows = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, new Date(Date.now() - KEEP_DAYS * 86_400_000)))
    .returning({ id: notifications.id });
  return rows.length;
}
