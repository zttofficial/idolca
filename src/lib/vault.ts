import "server-only";
import { cacheLife } from "next/cache";
import { CARDS, type VaultStatus } from "./mock-cards";
import { CHAIN } from "./chain";
import { CARD_COLLECTION } from "./solana/config";
import { attributesOf, dasEnabled, getAssetsByCollection, isFrozen } from "./solana/das";
import { listingAddress } from "./solana/market";

export type VaultEntry = {
  serial: string;
  title: string;
  asset: string;
  owner: string;
  status: VaultStatus;
  intakeDate: string;
};

export type VaultSnapshot = {
  source: "chain" | "demo";
  entries: VaultEntry[];
};

// 配好 HELIUS_API_KEY 時用 DAS 讀整個鏈上集合；否則用樣本卡清單
export async function getVaultSnapshot(): Promise<VaultSnapshot> {
  if (dasEnabled && CARD_COLLECTION) return getChainSnapshot();
  // 樣本卡已在 devnet 鑄造時，地址是真實的；持有人和狀態由瀏覽器讀鏈上即時資料覆蓋（見 VaultTable）
  return {
    source: Object.keys(CHAIN.cards).length ? "chain" : "demo",
    entries: CARDS.map((c) => ({
      serial: c.serial,
      title: `${c.group} ${c.member} · ${c.version}`,
      asset: c.asset,
      owner: c.owner,
      status: c.status,
      intakeDate: c.intakeDate,
    })),
  };
}

async function getChainSnapshot(): Promise<VaultSnapshot> {
  "use cache";
  cacheLife("minutes");

  const assets = await getAssetsByCollection(CARD_COLLECTION);
  const entries = await Promise.all(
    assets.map(async (a): Promise<VaultEntry> => {
      const attrs = attributesOf(a);
      const listing = await listingAddress(a.id);
      const status: VaultStatus = isFrozen(a) ? "redeeming" : a.ownership.owner === listing ? "listed" : "vaulted";
      return {
        serial: attrs.serial ?? "",
        title: a.content?.metadata?.name ?? attrs.serial ?? a.id,
        asset: a.id,
        owner: a.ownership.owner,
        status,
        intakeDate: attrs.intake_date ?? "",
      };
    }),
  );
  entries.sort((x, y) => x.serial.localeCompare(y.serial));
  return { source: "chain", entries };
}
