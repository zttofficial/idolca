import "server-only";
import { CLUSTER } from "./config";

// Helius DAS API：查詢 Metaplex Core 資產。金鑰只在伺服器端使用
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";

export const dasEnabled = Boolean(HELIUS_API_KEY);

const DAS_URL = `https://${CLUSTER === "mainnet-beta" ? "mainnet" : "devnet"}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

export type DasAsset = {
  id: string;
  interface: string;
  content?: { metadata?: { name?: string }; links?: { image?: string } };
  ownership: { owner: string; frozen?: boolean };
  burnt?: boolean;
  plugins?: {
    attributes?: { data?: { attribute_list?: { key: string; value: string }[] } };
    freeze_delegate?: { data?: { frozen?: boolean } };
  };
};

async function das<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(DAS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
  });
  if (!res.ok) throw new Error(`DAS ${method} HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`DAS ${method}: ${json.error.message}`);
  return json.result as T;
}

export function getAsset(id: string) {
  return das<DasAsset>("getAsset", { id });
}

// 集合裡的全部資產，按頁取完
export async function getAssetsByCollection(collection: string) {
  const items: DasAsset[] = [];
  for (let page = 1; ; page++) {
    const result = await das<{ items: DasAsset[]; total: number }>("getAssetsByGroup", {
      groupKey: "collection",
      groupValue: collection,
      page,
      limit: 1000,
    });
    items.push(...result.items);
    if (result.items.length < 1000) break;
  }
  return items.filter((a) => !a.burnt);
}

export function attributesOf(asset: DasAsset): Record<string, string> {
  const list = asset.plugins?.attributes?.data?.attribute_list ?? [];
  return Object.fromEntries(list.map(({ key, value }) => [key, value]));
}

export function isFrozen(asset: DasAsset) {
  return Boolean(asset.plugins?.freeze_delegate?.data?.frozen ?? asset.ownership.frozen);
}
