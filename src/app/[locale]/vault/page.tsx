import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import VaultTable from "@/components/vault/VaultTable";
import { CARDS } from "@/lib/mock-cards";
import { CARD_COLLECTION, shortAddress, solscanUrl } from "@/lib/solana/config";
import { getVaultSnapshot } from "@/lib/vault";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("vaultTitle"), description: t("vaultDescription") };
}

export default async function VaultPage() {
  const t = await getTranslations("Vault");
  const tMeta = await getTranslations("Meta");
  const { source, entries, lastAuditDate } = await getVaultSnapshot();
  const redeeming = entries.filter((e) => e.status === "redeeming").length;
  const cardIdBySerial = new Map(CARDS.map((c) => [c.serial, c.id]));

  const summary = [
    { label: t("nftCount"), value: entries.length },
    { label: t("redeeming"), value: redeeming },
    { label: t("physical"), value: entries.length },
    { label: t("lastAudit"), value: lastAuditDate },
  ];

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{tMeta("vaultTitle")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">
          {t("intro")}
          {CARD_COLLECTION && (
            <>
              {" "}
              {t("collection")}:{" "}
              <a href={solscanUrl("account", CARD_COLLECTION)} target="_blank" rel="noreferrer" className="font-mono text-accent-ink hover:text-accent-ink">
                {shortAddress(CARD_COLLECTION, 6, 6)}
              </a>
            </>
          )}
        </p>
        {source === "demo" && (
          <p className="mt-4 inline-block rounded-lg border border-notice-line bg-notice-bg px-3 py-1.5 text-xs text-notice-ink">
            {t("demo")}
          </p>
        )}

        <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-surface p-5">
              <dt className="text-xs text-ink-3">{s.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10">
          <VaultTable rows={entries.map((e) => ({ ...e, cardId: cardIdBySerial.get(e.serial) }))} />
        </div>
      </main>
      <Footer />
    </>
  );
}
