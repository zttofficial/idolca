import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Link } from "@/i18n/navigation";
import { CARDS, type VaultStatus } from "@/lib/mock-cards";
import { CARD_COLLECTION, shortAddress, solscanUrl } from "@/lib/solana/config";
import { getVaultSnapshot } from "@/lib/vault";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("vaultTitle"), description: t("vaultDescription") };
}

const STATUS_STYLE: Record<VaultStatus, string> = {
  vaulted: "bg-emerald-400/15 text-emerald-300",
  listed: "bg-violet-400/15 text-violet-200",
  redeeming: "bg-amber-400/15 text-amber-200",
};

export default async function VaultPage() {
  const t = await getTranslations("Vault");
  const tMeta = await getTranslations("Meta");
  const tStatus = await getTranslations("Status");
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
      <div className="aurora" />
      <div className="grid-bg" />
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{tMeta("vaultTitle")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
          {t("intro")}
          {CARD_COLLECTION && (
            <>
              {" "}
              {t("collection")}:{" "}
              <a href={solscanUrl("account", CARD_COLLECTION)} target="_blank" rel="noreferrer" className="font-mono text-violet-300 hover:text-violet-200">
                {shortAddress(CARD_COLLECTION, 6, 6)}
              </a>
            </>
          )}
        </p>
        {source === "demo" && (
          <p className="mt-4 inline-block rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100/80">
            {t("demo")}
          </p>
        )}

        <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <dt className="text-xs text-white/45">{s.label}</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-white/[0.04] text-xs text-white/45">
              <tr>
                <th className="px-4 py-3 font-medium">{t("colSerial")}</th>
                <th className="px-4 py-3 font-medium">{t("colCard")}</th>
                <th className="px-4 py-3 font-medium">{t("colAsset")}</th>
                <th className="px-4 py-3 font-medium">{t("colOwner")}</th>
                <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("colIntake")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((e) => {
                const cardId = cardIdBySerial.get(e.serial);
                return (
                  <tr key={e.asset} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs">
                      {cardId ? (
                        <Link href={`/card/${cardId}`} className="text-violet-300 hover:text-violet-200">
                          {e.serial}
                        </Link>
                      ) : (
                        e.serial
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/85">{e.title}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <a href={solscanUrl("account", e.asset)} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white">
                        {shortAddress(e.asset, 6, 6)}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/55">{shortAddress(e.owner)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[e.status]}`}>{tStatus(e.status)}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/55">{e.intakeDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
      <Footer />
    </>
  );
}
