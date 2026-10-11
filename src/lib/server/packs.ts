import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Db } from "./db";
import { packOrders, packPulls, vaultCards } from "./schema";
import { buildBuybackTx, buildPayment, payout, transferVaultNft, verifyPayment } from "./funds";
import { confirmSignature, invalidateVaultState, vaultState } from "./vault-chain";
import { getPackRow } from "./pack-pool";
import { invalidateVaultCards, toCard } from "./vault-cards";
import { CHAIN } from "@/lib/chain";
import { BUYBACK_RATE, MAX_QTY, pickIndex, poolOrder } from "@/lib/packs";
import { drawRandom } from "@/lib/pack-draw";

// 開卡包：付款進平台錢包 → 對帳 → 按承諾的種子抽卡 → 抽到的金庫卡 NFT 從平台錢包轉給買家。
// 卡池不夠或轉移失敗時，沒交付的張數自動退款
const memoOf = (orderId: string) => `idolca:pack:${orderId}`;

const isLive = (p: { startsAt: Date; endsAt: Date }) => p.startsAt.getTime() <= Date.now() && Date.now() < p.endsAt.getTime();

// 現在能抽的卡：在卡池裡、沒被抽走，而且鏈上確實還在平台錢包（沒掛單、沒在提貨）
async function available(db: Db, packId: string) {
  const [rows, state] = await Promise.all([
    db
      .select()
      .from(vaultCards)
      .where(and(eq(vaultCards.packId, packId), isNull(vaultCards.packOrder), isNull(vaultCards.burnedAt))),
    vaultState(),
  ]);
  return rows.filter((r) => {
    const s = state[r.id];
    return s && s.owner === CHAIN.platform && !s.listing && !s.redeeming && !s.burned;
  });
}

export async function createPackOrder(db: Db, userId: string, wallet: string, packId: string, qty: number) {
  const pack = await getPackRow(db, packId);
  if (!pack) return { error: "not_found" as const };
  if (!isLive(pack)) return { error: "not_live" as const };
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: "invalid_qty" as const };
  if ((await available(db, packId)).length < qty) return { error: "sold_out" as const };
  const id = randomUUID();
  const amountCents = pack.priceCents * qty;
  await db.insert(packOrders).values({ id, userId, packId, qty, amountCents, wallet });
  return { id, amountUsdt: amountCents / 100, tx: await buildPayment(new PublicKey(wallet), amountCents / 100, memoOf(id)) };
}

async function pullsOf(db: Db, orderId: string) {
  const rows = await db
    .select({ pull: packPulls, card: vaultCards })
    .from(packPulls)
    .innerJoin(vaultCards, eq(vaultCards.id, packPulls.cardId))
    .where(eq(packPulls.orderId, orderId))
    .orderBy(packPulls.idx);
  return rows.map(({ pull, card }) => ({ cardId: card.id, asset: card.asset, tx: pull.transferTx, buybackTx: pull.buybackTx, card: toCard(card) }));
}

// 付款確認後抽卡並轉移。訂單先從 pending 鎖成 drawing，同一筆只會抽一次
export async function confirmPackOrder(db: Db, userId: string, orderId: string, signature: string) {
  const [order] = await db.select().from(packOrders).where(and(eq(packOrders.id, orderId), eq(packOrders.userId, userId)));
  if (!order) return { error: "not_found" as const };
  if (order.status === "drawn") return { pulls: await pullsOf(db, orderId), refundTx: order.refundTx };
  if (order.status !== "pending") return { error: "in_progress" as const };
  const ok = await verifyPayment(signature, new PublicKey(order.wallet), order.amountCents / 100, memoOf(orderId));
  if (!ok) return { error: "payment_not_found" as const };
  const [locked] = await db
    .update(packOrders)
    .set({ status: "drawing", payTx: signature })
    .where(and(eq(packOrders.id, orderId), eq(packOrders.status, "pending")))
    .returning();
  if (!locked) return { error: "in_progress" as const };

  const pack = (await getPackRow(db, order.packId))!;
  let delivered = 0;
  for (let idx = 0, attempts = 0; idx < order.qty && attempts < order.qty * 3; attempts++) {
    const pool = poolOrder((await available(db, pack.id)).map((r) => ({ row: r, card: { serial: r.serial } })));
    if (!pool.length) break;
    const r = drawRandom(pack.seed, signature, idx);
    const pick = pickIndex(r, pool.length);
    const card = pool[pick].row;
    // 搶到這張才算抽中；被同時進行的另一筆訂單搶走就用同一個隨機數在新的卡池重抽
    const [reserved] = await db
      .update(vaultCards)
      .set({ packOrder: orderId })
      .where(and(eq(vaultCards.id, card.id), isNull(vaultCards.packOrder)))
      .returning();
    if (!reserved) continue;
    let tx: string;
    try {
      tx = await transferVaultNft(card.asset, order.wallet);
    } catch (err) {
      console.error("pack transfer failed", orderId, card.id, err);
      await db.update(vaultCards).set({ packOrder: null }).where(eq(vaultCards.id, card.id));
      break;
    }
    await db.insert(packPulls).values({ id: `${orderId}:${idx}`, orderId, packId: pack.id, cardId: card.id, idx, poolSize: pool.length, pick, r, transferTx: tx });
    delivered++;
    idx++;
  }

  let refundTx: string | null = null;
  if (delivered < order.qty) {
    refundTx = await payout(new PublicKey(order.wallet), ((order.qty - delivered) * pack.priceCents) / 100);
  }
  await db.update(packOrders).set({ status: "drawn", refundTx }).where(eq(packOrders.id, orderId));
  invalidateVaultState();
  invalidateVaultCards();
  return { pulls: await pullsOf(db, orderId), refundTx };
}

// 這張卡是我開卡包抽到、還沒賣回的嗎
async function myPull(db: Db, userId: string, cardId: string) {
  const [row] = await db
    .select({ pull: packPulls, card: vaultCards })
    .from(packPulls)
    .innerJoin(packOrders, eq(packOrders.id, packPulls.orderId))
    .innerJoin(vaultCards, eq(vaultCards.id, packPulls.cardId))
    .where(and(eq(packPulls.cardId, cardId), eq(packOrders.userId, userId), isNull(packPulls.buybackTx)))
    .orderBy(desc(packPulls.createdAt))
    .limit(1);
  return row ?? null;
}

// 即時回購：持有人把抽到的卡賣回平台，按卡值的 BUYBACK_RATE 付款。
// 一筆交易裡同時做兩件事：持有人簽名把 NFT 轉給平台、平台把 USDT 轉給持有人，任何一步失敗整筆作廢
export async function buildBuyback(db: Db, userId: string, wallet: string, cardId: string) {
  const row = await myPull(db, userId, cardId);
  if (!row) return { error: "not_found" as const };
  if ((await vaultState())[cardId]?.owner !== wallet) return { error: "not_owner" as const };
  const amount = Math.round((row.card.packValueCents ?? 0) * BUYBACK_RATE) / 100;
  return { amountUsdt: amount, tx: await buildBuybackTx(new PublicKey(wallet), row.card.asset, amount) };
}

// 回購交易確認後，卡回到平台錢包，也回到卡池
export async function confirmBuyback(db: Db, userId: string, cardId: string, signature: string) {
  const row = await myPull(db, userId, cardId);
  if (!row) return { error: "not_found" as const };
  await confirmSignature(signature);
  invalidateVaultState();
  if ((await vaultState())[cardId]?.owner !== CHAIN.platform) return { error: "not_transferred" as const };
  await db.update(packPulls).set({ buybackTx: signature }).where(eq(packPulls.id, row.pull.id));
  await db.update(vaultCards).set({ packOrder: null }).where(eq(vaultCards.id, cardId));
  invalidateVaultCards();
  return { ok: true as const };
}
