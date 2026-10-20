import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import type { Db } from "./db";
import { packOrders, packPulls, vaultCards } from "./schema";
import { buildBuybackTx, buildPayment, payout, transferVaultNft, verifyPayment, walletSignature } from "./funds";
import { cardStates, confirmSignature, readCardState, refreshCardStates, type VaultCardState } from "./vault-chain";
import { getPackRow } from "./pack-pool";
import { invalidateVaultCards, toCard } from "./vault-cards";
import { CHAIN } from "@/lib/chain";
import { BUYBACK_RATE, MAX_QTY, overRtp, pickIndex, poolOrder } from "@/lib/packs";
import { drawRandom } from "@/lib/pack-draw";
import { arcPaymentRequest, arcPayout, settleArcPayment } from "./arc-pay";
import type { PayRail } from "./schema";
import type { Coin } from "@/lib/coins";

// 開卡包：付款進平台錢包 → 對帳 → 按承諾的種子抽卡 → 抽到的金庫卡 NFT 從平台錢包轉給買家。
// 付款有兩條通道：Solana（買家錢包轉帳加備註）或 Arc（買家簽 USDC 授權轉帳，平台代送）；卡一律在 Solana 上交付。
// 卡池不夠或轉移失敗時，沒交付的張數自動退款，退回原來付款的那條通道
const memoOf = (orderId: string) => `idolca:pack:${orderId}`;

const isLive = (p: { startsAt: Date; endsAt: Date }) => p.startsAt.getTime() <= Date.now() && Date.now() < p.endsAt.getTime();

// 鏈上確實能抽：還在平台錢包，沒掛單、沒在提貨、沒銷毀
const drawable = (s: VaultCardState | undefined) => Boolean(s && s.owner === CHAIN.platform && !s.listing && !s.redeeming && !s.burned);

// 現在能抽的卡：在卡池裡、沒被抽走，而且鏈上確實能抽（按鏈上狀態索引；抽中後轉移前再即時確認那一張）
async function available(db: Db, packId: string) {
  const rows = await db
    .select()
    .from(vaultCards)
    .where(and(eq(vaultCards.packId, packId), isNull(vaultCards.packOrder), isNull(vaultCards.burnedAt)));
  const state = await cardStates(rows.map((r) => r.id));
  return rows.filter((r) => drawable(state[r.id]));
}

export async function createPackOrder(db: Db, userId: string, wallet: string, packId: string, qty: number, rail: PayRail = "solana") {
  const pack = await getPackRow(db, packId);
  if (!pack) return { error: "not_found" as const };
  if (!isLive(pack)) return { error: "not_live" as const };
  if (!Number.isInteger(qty) || qty < 1 || qty > Math.min(MAX_QTY, pack.maxQty)) return { error: "invalid_qty" as const };
  const pool = await available(db, packId);
  if (pool.length < qty) return { error: "sold_out" as const };
  // 剩下卡池的期望價值超過返還率上限就暫停販售（見 lib/packs.ts 的 MAX_RTP）
  const expected = pool.reduce((v, r) => v + (r.packValueCents ?? 0), 0) / pool.length / 100;
  if (overRtp(expected, pack.priceCents / 100)) return { error: "paused" as const };
  const id = randomUUID();
  const amountCents = pack.priceCents * qty;
  // 先組好付款交易再寫訂單：餘額不夠時丟錯，不留下付不了款的訂單
  const tx = rail === "solana" ? await buildPayment(new PublicKey(wallet), amountCents / 100, memoOf(id)) : null;
  await db.insert(packOrders).values({ id, userId, packId, qty, amountCents, wallet, rail });
  if (rail === "arc") return { id, amountUsdt: amountCents / 100, arc: arcPaymentRequest(memoOf(id), amountCents) };
  return { id, amountUsdt: amountCents / 100, tx: tx! };
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

// 買家回報的付款：Solana 通道是付款交易簽名；Arc 通道是付款地址、授權有效期和授權簽名
export type PackPayment = { signature: string; from?: unknown; validBefore?: unknown };

// 付款確認後抽卡並轉移。訂單先從 pending 鎖成 drawing，同一筆只會抽一次。
// 抽卡的隨機數來自買家產生、平台事先算不出來的簽名：Solana 是買家錢包在付款交易裡的簽名，Arc 是買家的授權簽名
export async function confirmPackOrder(db: Db, userId: string, orderId: string, payment: PackPayment) {
  const [order] = await db.select().from(packOrders).where(and(eq(packOrders.id, orderId), eq(packOrders.userId, userId)));
  if (!order) return { error: "not_found" as const };
  if (order.status === "drawn") return { pulls: await pullsOf(db, orderId), refundTx: order.refundTx, payTx: order.payTx };
  if (order.status !== "pending") return { error: "in_progress" as const };
  const signature = payment.signature;
  let paid: { payTx: string; payer: string | null; payProof: string | null; coin?: Coin };
  if (order.rail === "arc") {
    const { hash, from } = await settleArcPayment(memoOf(orderId), order.amountCents, payment);
    paid = { payTx: hash, payer: from, payProof: signature };
  } else {
    const coin = await verifyPayment(signature, new PublicKey(order.wallet), order.amountCents / 100, memoOf(orderId));
    if (!coin) return { error: "payment_not_found" as const };
    // 隨機數用買家錢包在付款交易裡的簽名：交易編號是付手續費的平台的簽名，平台事先算得出來
    const proof = await walletSignature(signature, new PublicKey(order.wallet));
    if (!proof) return { error: "payment_not_found" as const };
    paid = { payTx: signature, payer: null, payProof: proof, coin };
  }
  const [locked] = await db
    .update(packOrders)
    .set({ status: "drawing", ...paid })
    .where(and(eq(packOrders.id, orderId), eq(packOrders.status, "pending")))
    .returning();
  if (!locked) return { error: "in_progress" as const };

  const pack = (await getPackRow(db, order.packId))!;
  let delivered = 0;
  for (let idx = 0, attempts = 0; idx < order.qty && attempts < order.qty * 3; attempts++) {
    const pool = poolOrder((await available(db, pack.id)).map((r) => ({ row: r, card: { serial: r.serial } })));
    if (!pool.length) break;
    const r = drawRandom(pack.seed, locked.payProof!, idx);
    const pick = pickIndex(r, pool.length);
    const card = pool[pick].row;
    // 搶到這張才算抽中；被同時進行的另一筆訂單搶走就用同一個隨機數在新的卡池重抽
    const [reserved] = await db
      .update(vaultCards)
      .set({ packOrder: orderId })
      .where(and(eq(vaultCards.id, card.id), isNull(vaultCards.packOrder)))
      .returning();
    if (!reserved) continue;
    // 索引可能稍舊：轉移前即時確認鏈上確實能抽，不能抽就放回（即時讀已更新索引，重抽時不會再抽到它）
    if (!drawable((await readCardState(card.id)) ?? undefined)) {
      await db.update(vaultCards).set({ packOrder: null }).where(eq(vaultCards.id, card.id));
      continue;
    }
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
    const cents = (order.qty - delivered) * pack.priceCents;
    refundTx = order.rail === "arc" ? await arcPayout(locked.payer!, cents) : await payout(new PublicKey(order.wallet), cents / 100, locked.coin);
  }
  await db.update(packOrders).set({ status: "drawn", refundTx }).where(eq(packOrders.id, orderId));
  invalidateVaultCards();
  const pulls = await pullsOf(db, orderId);
  await refreshCardStates(pulls.map((p) => p.cardId));
  return { pulls, refundTx, payTx: locked.payTx };
}

// 這張卡是我開卡包抽到、還沒賣回的嗎
async function myPull(db: Db, userId: string, cardId: string) {
  const [row] = await db
    .select({ pull: packPulls, card: vaultCards, order: packOrders })
    .from(packPulls)
    .innerJoin(packOrders, eq(packOrders.id, packPulls.orderId))
    .innerJoin(vaultCards, eq(vaultCards.id, packPulls.cardId))
    .where(and(eq(packPulls.cardId, cardId), eq(packOrders.userId, userId), isNull(packPulls.buybackTx)))
    .orderBy(desc(packPulls.createdAt))
    .limit(1);
  return row ?? null;
}

// 即時回購：持有人把抽到的卡賣回平台，按卡值的 BUYBACK_RATE 付款，用開卡包時付的那種幣（Arc 付的用 USDC）。
// 一筆交易裡同時做兩件事：持有人簽名把 NFT 轉給平台、平台把貨款轉給持有人，任何一步失敗整筆作廢
export async function buildBuyback(db: Db, userId: string, wallet: string, cardId: string) {
  const row = await myPull(db, userId, cardId);
  if (!row) return { error: "not_found" as const };
  if ((await readCardState(cardId))?.owner !== wallet) return { error: "not_owner" as const };
  const amount = Math.round((row.card.packValueCents ?? 0) * BUYBACK_RATE) / 100;
  const coin = row.order.rail === "arc" ? "usdc" : row.order.coin;
  return { amountUsdt: amount, tx: await buildBuybackTx(new PublicKey(wallet), row.card.asset, amount, coin) };
}

// 回購交易確認後，卡回到平台錢包，也回到卡池
export async function confirmBuyback(db: Db, userId: string, cardId: string, signature: string) {
  const row = await myPull(db, userId, cardId);
  if (!row) return { error: "not_found" as const };
  await confirmSignature(signature);
  if ((await readCardState(cardId))?.owner !== CHAIN.platform) return { error: "not_transferred" as const };
  await db.update(packPulls).set({ buybackTx: signature }).where(eq(packPulls.id, row.pull.id));
  await db.update(vaultCards).set({ packOrder: null }).where(eq(vaultCards.id, cardId));
  invalidateVaultCards();
  return { ok: true as const };
}
