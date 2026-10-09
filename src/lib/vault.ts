import "server-only";
import { cacheLife } from "next/cache";
import { CARDS, LAST_AUDIT_DATE, type VaultStatus } from "./mock-cards";
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
  lastAuditDate: string;
};

// 配好 HELIUS_API_KEY 和 NEXT_PUBLIC_CARD_COLLECTION 時讀鏈上集合，否則用展示資料
export async function getVaultSnapshot(): Promise<VaultSnapshot> {
  if (dasEnabled && CARD_COLLECTION) return getChainSnapshot();
  return {
    source: "demo",
    lastAuditDate: LAST_AUDIT_DATE,
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
  return { source: "chain", entries, lastAuditDate: LAST_AUDIT_DATE };
}
