import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import VaultTable, { VaultSummary } from "@/components/vault/VaultTable";
import { CARD_COLLECTION, shortAddress, solscanUrl } from "@/lib/solana/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("vaultTitle"), description: t("vaultDescription") };
}

export default async function VaultPage() {
  const t = await getTranslations("Vault");
  const tMeta = await getTranslations("Meta");

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
        <VaultSummary />

        <div className="mt-10">
          <VaultTable />
        </div>
      </main>
      <Footer />
    </>
  );
}
