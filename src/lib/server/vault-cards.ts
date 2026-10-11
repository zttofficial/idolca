import "server-only";
import { randomUUID } from "node:crypto";
import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Card, Rarity } from "@/lib/cards";
import { GROUPS } from "@/lib/catalog";
import { CHAIN } from "@/lib/chain";
import type { Db } from "./db";
import { vaultCards } from "./schema";

// 金庫卡的資料庫讀寫。卡片資料很少變（入庫、提貨時才變），清單在記憶體快取 30 秒，寫入時清掉
export type VaultCardRow = typeof vaultCards.$inferSelect;

const NEUTRAL: Card["palette"] = ["#ececf1", "#dedee6", "#cfcfd9"];
const paletteOf = (group: string) => GROUPS.find((g) => g.name.toLowerCase() === group.toLowerCase())?.palette ?? NEUTRAL;

export function toCard(r: VaultCardRow): Card {
  return {
    id: r.id,
    serial: r.serial,
    group: r.groupName,
    member: r.member,
    album: r.album,
    version: r.version,
    rarity: r.rarity as Rarity,
    grade: r.grade ?? undefined,
    condition: r.condition ?? undefined,
    priceUsdt: 0,
    palette: paletteOf(r.groupName),
    asset: r.asset,
    owner: r.burnedAt ? "" : CHAIN.platform,
    status: r.burnedAt ? "redeemed" : "vaulted",
    intakeDate: r.intakeDate,
    location: r.location,
    image: r.imageFront ? { front: r.imageFront, back: r.imageBack ?? undefined } : undefined,
    redeemedAt: r.burnedAt?.toISOString(),
  };
}

const shared = globalThis as typeof globalThis & { __idolcaVault?: { at: number; rows: Promise<VaultCardRow[]> } };

// 還在金庫裡的卡（已提貨銷毀的不算），新入庫的在前
export function vaultRows(db: Db): Promise<VaultCardRow[]> {
  const c = shared.__idolcaVault;
  if (c && Date.now() - c.at < 30_000) return c.rows;
  const rows = db.select().from(vaultCards).where(isNull(vaultCards.burnedAt)).orderBy(desc(vaultCards.intakeDate), desc(vaultCards.createdAt));
  shared.__idolcaVault = { at: Date.now(), rows };
  rows.catch(() => (shared.__idolcaVault = undefined));
  return rows;
}
export const invalidateVaultCards = () => {
  shared.__idolcaVault = undefined;
};

export const listVaultCards = async (db: Db) => (await vaultRows(db)).map(toCard);

// 已提貨銷毀的卡：不在金庫和市場裡，但金庫頁的「已提貨」頁籤和卡片頁仍然看得到，鏈上紀錄也還在
export async function listRedeemedCards(db: Db) {
  const rows = await db.select().from(vaultCards).where(isNotNull(vaultCards.burnedAt)).orderBy(desc(vaultCards.burnedAt));
  return rows.map(toCard);
}

// 單張卡（包括已銷毀的，卡片頁和元數據仍要能打開）
export async function getVaultRow(db: Db, id: string) {
  const [row] = await db.select().from(vaultCards).where(eq(vaultCards.id, id));
  return row ?? null;
}

// at：銷毀交易的時間；不給就是現在（後台出貨當下）
export async function markBurned(db: Db, id: string, at = new Date()) {
  await db.update(vaultCards).set({ burnedAt: at }).where(eq(vaultCards.id, id));
  invalidateVaultCards();
}

// 新卡的編號：IC- 加六位流水號，接在目前最大的編號後面
export async function nextSerial(db: Db) {
  const rows = await db.select({ serial: vaultCards.serial }).from(vaultCards);
  const max = rows.reduce((m, r) => Math.max(m, Number(/^IC-(\d+)$/.exec(r.serial)?.[1] ?? 0)), 0);
  return `IC-${String(max + 1).padStart(6, "0")}`;
}

export const newVaultCardId = () => randomUUID();
