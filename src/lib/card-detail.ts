// 卡片內頁的樣本資料：鑑定報告、成交紀錄、鏈上流轉、同款在售、賣家。
// 按卡片 id 確定性生成，接入資料庫和鏈上索引後整個換掉；欄位就是正式資料要提供的內容。

import { CARDS, type Card } from "./mock-cards";
import { CHAIN } from "./chain";
import { fakeBase58, seeded } from "./seeded";

// 樣本資料的「今天」，固定下來讓頁面能靜態預渲染
const TODAY = Date.UTC(2026, 9, 9);
const DAY = 86_400_000;

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type ConditionKey = "gem" | "mint" | "nearMint";
export type InspectionNote = "noScratches" | "sharpCorners" | "lightEdgeWear" | "printLine" | "sleeved";

export type ConditionReport = {
  grade: number;
  condition: ConditionKey;
  subgrades: { centering: number; corners: number; edges: number; surface: number };
  notes: InspectionNote[];
  inspectedOn: string;
  inspector: string;
};

export type Sale = { date: string; priceUsdt: number };

export type ChainEvent = {
  type: "mint" | "list" | "sale" | "cancel";
  date: string;
  priceUsdt?: number;
  from?: string;
  to?: string;
  signature: string;
};

export type OtherListing = { serial: string; grade: number; priceUsdt: number; seller: string };

export type Seller = { address: string; sales: number; listings: number; positivePct: number; joined: string };

export type CardDetail = {
  condition: ConditionReport;
  sales: Sale[];
  events: ChainEvent[];
  otherListings: OtherListing[];
  seller: Seller;
  likes: number;
  related: Card[];
};

const round1 = (n: number) => Math.round(n * 2) / 2;

export function getCardDetail(card: Card): CardDetail {
  const rand = seeded(`detail:${card.id}`);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

  // 鑑定：已評級的卡沿用評級，其餘按入庫檢查給出品相分
  const subgrades = {
    centering: round1(8.5 + rand() * 1.5),
    corners: round1(8.5 + rand() * 1.5),
    edges: round1(8 + rand() * 2),
    surface: round1(8.5 + rand() * 1.5),
  };
  const avg = (subgrades.centering + subgrades.corners + subgrades.edges + subgrades.surface) / 4;
  const grade = card.grade ?? round1(avg);
  const notes: InspectionNote[] = ["sleeved"];
  notes.unshift(subgrades.surface >= 9.5 ? "noScratches" : "printLine");
  if (subgrades.corners >= 9.5) notes.unshift("sharpCorners");
  if (subgrades.edges < 9) notes.push("lightEdgeWear");

  const intakeMs = Date.parse(card.intakeDate);
  const condition: ConditionReport = {
    grade,
    condition: grade >= 9.5 ? "gem" : grade >= 9 ? "mint" : "nearMint",
    subgrades,
    notes,
    inspectedOn: isoDate(intakeMs + DAY),
    inspector: "Idolca Seoul Vault",
  };

  // 這個版本所有入庫卡近 120 天的成交（不限於這一張），在當前價附近隨機遊走
  const sales: Sale[] = [];
  let price = card.priceUsdt / (1 + card.change24h / 100) / (1 + (rand() - 0.3) * 0.25);
  const count = 18 + Math.floor(rand() * 10);
  for (let i = 0; i < count; i++) {
    const ms = TODAY - Math.round((120 * (count - i)) / count) * DAY + Math.floor(rand() * DAY);
    price *= 1 + (rand() - 0.47) * 0.09;
    sales.push({ date: isoDate(ms), priceUsdt: Math.max(1, Math.round(price)) });
  }
  sales.push({ date: isoDate(TODAY - DAY), priceUsdt: Math.round(card.priceUsdt / (1 + card.change24h / 100)) });

  // 鏈上流轉：入庫鑄造 → 幾次掛單成交 → 當前持有人（掛單中的卡最後一筆是掛單）
  // 已上鏈的卡用真實紀錄（src/lib/chain/devnet.json），否則生成示意紀錄
  const real = CHAIN.events?.[card.id];
  const holders = [card.owner, fakeBase58(rand, 44), fakeBase58(rand, 44)].reverse();
  const events: ChainEvent[] = [
    { type: "mint", date: card.intakeDate, to: holders[0], signature: fakeBase58(rand, 88) },
  ];
  const hops = holders.length - 1;
  for (let i = 0; i < hops; i++) {
    const listMs = intakeMs + ((i * 2 + 1) * (TODAY - intakeMs)) / (hops * 2 + 2);
    const saleMs = listMs + (2 + Math.floor(rand() * 5)) * DAY;
    const p = sales[Math.min(sales.length - 1, Math.floor(((i + 1) * sales.length) / (hops + 1)))].priceUsdt;
    events.push({ type: "list", date: isoDate(listMs), priceUsdt: Math.round(p * 1.05), from: holders[i], signature: fakeBase58(rand, 88) });
    if (i === 0 && rand() > 0.5) {
      events.push({ type: "cancel", date: isoDate(listMs + DAY), from: holders[i], signature: fakeBase58(rand, 88) });
      events.push({ type: "list", date: isoDate(listMs + 2 * DAY), priceUsdt: p, from: holders[i], signature: fakeBase58(rand, 88) });
    }
    events.push({ type: "sale", date: isoDate(saleMs), priceUsdt: p, from: holders[i], to: holders[i + 1], signature: fakeBase58(rand, 88) });
  }
  if (card.status === "listed") {
    events.push({
      type: "list",
      date: isoDate(TODAY - (1 + Math.floor(rand() * 6)) * DAY),
      priceUsdt: card.priceUsdt,
      from: card.owner,
      signature: fakeBase58(rand, 88),
    });
  }
  events.reverse();

  // 同一版本的其他編號
  const serialBase = Number(card.serial.slice(3));
  const otherListings: OtherListing[] = Array.from({ length: 3 + Math.floor(rand() * 3) }, (_, i) => {
    const g = round1(8 + rand() * 2);
    return {
      serial: `IC-${String(serialBase + 1200 * (i + 1) + Math.floor(rand() * 900)).padStart(6, "0")}`,
      grade: g,
      priceUsdt: Math.round(card.priceUsdt * (0.82 + (g - 8) * 0.12 + rand() * 0.1)),
      seller: fakeBase58(rand, 44),
    };
  }).sort((a, b) => a.priceUsdt - b.priceUsdt);

  const seller: Seller = {
    address: card.owner,
    sales: 12 + Math.floor(rand() * 400),
    listings: 1 + Math.floor(rand() * 40),
    positivePct: 96 + Math.floor(rand() * 5),
    joined: pick(["2025-11", "2026-01", "2026-03", "2026-05"]),
  };

  const sameGroup = CARDS.filter((c) => c.id !== card.id && c.group === card.group);
  const related = [...sameGroup, ...CARDS.filter((c) => c.id !== card.id && c.group !== card.group)].slice(0, 4);

  return { condition, sales, events: real ?? events, otherListings, seller, likes: 40 + Math.floor(rand() * 900), related };
}

// 平台規則，和託管合約、提貨腳本一致
export const FEES = {
  platformBps: 250,
  networkUsd: 0.01,
  redemptionFromUsdt: 6,
};
