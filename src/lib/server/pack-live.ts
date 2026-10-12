import "server-only";
import { getBase58Encoder } from "@solana/kit";
import { CHAIN } from "@/lib/chain";
import { CLUSTER } from "@/lib/solana/config";
import type { Pack } from "@/lib/packs";

// 卡包頁和卡池接口顯示的剩餘張數，按鏈上持有人再核一次：卡已經不在平台錢包裡（被掛單時在託管帳戶、
// 被抽走或在別的環境賣掉）就不算剩餘。只用 RPC 讀資產帳戶，不載入 Anchor，頁面也能用；
// 下單時的完整檢查（掛單、提貨中）在 packs.ts。鏈上讀不到時照資料庫顯示
const RPC = process.env.SOLANA_RPC_URL || (CLUSTER === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");

// Metaplex Core 的 AssetV1 帳戶：第 0 個位元組是帳戶類型（1），接著 32 位元組是持有人
async function platformHeld(assets: string[]) {
  const platform = new Uint8Array(getBase58Encoder().encode(CHAIN.platform));
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [assets, { encoding: "base64", dataSlice: { offset: 0, length: 33 } }] }),
  });
  const { result } = (await res.json()) as { result?: { value: ({ data: [string, string] } | null)[] } };
  if (!result) throw new Error("rpc");
  return result.value.map((acc) => {
    if (!acc) return false;
    const data = Buffer.from(acc.data[0], "base64");
    return data.length === 33 && data[0] === 1 && platform.every((b, i) => data[i + 1] === b);
  });
}

export async function withLiveRemaining(packs: Pack[]): Promise<Pack[]> {
  const open = packs.flatMap((p) => p.pool.filter((e) => e.remaining).map((e) => e.card.asset));
  if (!CHAIN.platform || !open.length) return packs;
  let held: Map<string, boolean>;
  try {
    const flags: boolean[] = [];
    // getMultipleAccounts 一次最多 100 個
    for (let i = 0; i < open.length; i += 100) flags.push(...(await platformHeld(open.slice(i, i + 100))));
    held = new Map(open.map((a, i) => [a, flags[i]]));
  } catch {
    return packs;
  }
  return packs.map((p) => ({ ...p, pool: p.pool.map((e) => (e.remaining && !held.get(e.card.asset) ? { ...e, remaining: 0 } : e)) }));
}
