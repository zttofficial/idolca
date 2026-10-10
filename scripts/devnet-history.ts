// 從 devnet 讀回每張樣本金庫卡的鏈上紀錄（鑄造、掛單、成交），寫進 src/lib/chain/devnet.json 的 events，
// 卡片頁的「鏈上紀錄」用它顯示真實交易。在 setup-devnet 和 onchain/scripts/devnet-market.mts 之後執行。
// 用法：npm run chain:devnet-history
import { readFileSync, writeFileSync } from "node:fs";
import { CARDS } from "../src/lib/mock-cards";

const CONFIG = "src/lib/chain/devnet.json";
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

type Event = { type: "mint" | "list" | "sale"; date: string; signature: string; priceUsdt?: number; from?: string; to?: string };
const chain = JSON.parse(readFileSync(CONFIG, "utf8")) as {
  platform: string;
  cards: Record<string, string>;
  market?: { listings: Record<string, string>; demoTrade?: { card: string; buyer: string; listTx: string; buyTx: string } };
  events?: Record<string, Event[]>;
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (res.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    const body = (await res.json()) as { result: T; error?: { message: string } };
    if (body.error) throw new Error(body.error.message);
    return body.result;
  }
}

const day = (sec: number | null) => new Date((sec ?? 0) * 1000).toISOString().slice(0, 10);
chain.events = {};
for (const card of CARDS) {
  const asset = chain.cards[card.id];
  if (!asset) continue;
  // 由新到舊；最舊的一筆是鑄造
  const sigs = await rpc<{ signature: string; blockTime: number | null; err: unknown }[]>("getSignaturesForAddress", [asset, { limit: 50 }]);
  const ok = sigs.filter((s) => !s.err).reverse();
  const at = (sig?: string) => ok.find((s) => s.signature === sig);
  const events: Event[] = [];
  if (ok[0]) events.push({ type: "mint", date: day(ok[0].blockTime), signature: ok[0].signature, to: chain.platform });
  const trade = chain.market?.demoTrade?.card === card.id ? chain.market.demoTrade : undefined;
  const listTx = trade?.listTx ?? chain.market?.listings[card.id];
  const listed = at(listTx);
  if (listed) events.push({ type: "list", date: day(listed.blockTime), signature: listed.signature, priceUsdt: card.priceUsdt, from: chain.platform });
  const sold = at(trade?.buyTx);
  if (sold && trade) events.push({ type: "sale", date: day(sold.blockTime), signature: sold.signature, priceUsdt: card.priceUsdt, from: chain.platform, to: trade.buyer });
  chain.events[card.id] = events;
  console.log(card.id, events.map((e) => e.type).join(" → "));
}
writeFileSync(CONFIG, JSON.stringify(chain, null, 2) + "\n");
console.log("完成");
