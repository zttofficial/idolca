import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import RateTable, { type RateRow } from "@/components/shipping/RateTable";
import { Link } from "@/i18n/navigation";
import { REDEEM_FEE_BUFFER, REDEEM_FEE_STEP_USD } from "@/lib/policy";
import { CKG_QUOTED_ON, CKG_SOURCES } from "@/lib/rates/ckg";
import type { RateSource } from "@/lib/rates/source";
import { YVR_QUOTED_ON, YVR_SOURCES } from "@/lib/rates/yvr";
import { redeemFeeUsd, vaultCountries } from "@/lib/shipping";
import { VAULT_IDS, VAULT_LIST, type VaultId } from "@/lib/vaults";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shipping");
  return pageMetadata({ locale: await getLocale(), path: "/shipping", title: t("metaTitle"), description: t("metaDescription") });
}

const SECTION = "mt-16";
const HOW = ["how1", "how2", "how3"] as const;
// 各金庫郵資表的報價來源和查詢日期（src/lib/rates/）
const SOURCES: Record<VaultId, { quotedOn: string; sources: readonly RateSource[] }> = {
  yvr: { quotedOn: YVR_QUOTED_ON, sources: YVR_SOURCES },
  ckg: { quotedOn: CKG_QUOTED_ON, sources: CKG_SOURCES },
};

// 公開的提貨運費表：提貨是什麼、兩個金庫各用什麼寄法、每個國家或地區從各金庫寄的運費、計價方式和報價來源。
// 金額全部用 src/lib/shipping.ts 的 redeemFeeUsd 現算，和提貨表單、伺服器收費同一份資料；頁面沒有請求資料，整頁靜態產生
export default async function ShippingPage() {
  const t = await getTranslations("Shipping");
  const tVault = await getTranslations("Vaults");
  const locale = await getLocale();
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const name = (code: string) => regions.of(code) ?? code;
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });

  const countries = [...new Set(VAULT_LIST.flatMap((v) => vaultCountries(v.id)))];
  const rows: RateRow[] = countries.map((c) => ({
    country: c,
    name: name(c),
    fees: Object.fromEntries(VAULT_IDS.map((v) => [v, redeemFeeUsd(v, c)])) as Record<VaultId, number | null>,
  }));
  // 寄到加拿大境內另收 GST/HST（按收件省份），只適用設在加拿大的金庫；稅的計算在 src/lib/shipping.ts，這裡只加註記
  const domestic = VAULT_LIST.filter((v) => v.country === "CA").map((v) => tVault(v.id));
  const taxVault = new Intl.ListFormat(locale, { type: "disjunction" }).format(domestic);

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-14 sm:px-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-accent-ink uppercase">{t("eyebrow")}</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-2">
          {t.rich("intro", {
            vault: (c) => (
              <Link href="/vault" className="font-semibold text-accent-ink hover:underline">
                {c}
              </Link>
            ),
            terms: (c) => (
              <Link href="/terms" className="font-semibold text-accent-ink hover:underline">
                {c}
              </Link>
            ),
          })}
        </p>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {HOW.map((k) => (
            <div key={k} className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-semibold">{t(`${k}Title`)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(`${k}Body`)}</p>
            </div>
          ))}
        </section>

        <section className={SECTION}>
          <h2 className="text-2xl font-bold tracking-tight">{t("vaultsTitle")}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {VAULT_LIST.map((v) => (
              <div key={v.id} className="rounded-2xl bg-surface-2 p-5">
                <h3 className="font-semibold">
                  {tVault(v.id)} <span className="font-normal text-ink-3">· {name(v.country)}</span>
                </h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-ink-3">{t("vaultService")}</dt>
                    <dd className="text-ink-2">{v.service}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-3">{t("vaultReach")}</dt>
                    <dd className="text-ink-2">{t("vaultReachCount", { count: vaultCountries(v.id).length })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-3">{t("vaultFx")}</dt>
                    <dd className="text-ink-2 tabular-nums">
                      1 USD = {nf.format(v.perUsd)} {v.currency}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>

        <section className={SECTION}>
          <h2 className="text-2xl font-bold tracking-tight">{t("tableTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{t("tableNote")}</p>
          <div className="mt-6">
            <RateTable rows={rows} vaults={[...VAULT_IDS]} notes={domestic.length ? { CA: t("caTax", { vault: taxVault }) } : {}} />
          </div>
          {domestic.length > 0 && <p className="mt-3 text-xs leading-relaxed text-ink-3">{t("taxNote", { vault: taxVault })}</p>}
        </section>

        <section className={SECTION}>
          <h2 className="text-2xl font-bold tracking-tight">{t("pricingTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
            {t("pricingBody", { buffer: new Intl.NumberFormat(locale, { style: "percent" }).format(REDEEM_FEE_BUFFER), step: REDEEM_FEE_STEP_USD })}
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {VAULT_LIST.map((v) => (
              <div key={v.id} className="rounded-2xl border border-line bg-surface p-5">
                <h3 className="font-semibold">{t("sourcesTitle", { vault: tVault(v.id), date: SOURCES[v.id].quotedOn })}</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {SOURCES[v.id].sources.map((s) => (
                    <li key={s.url} className="flex gap-2">
                      <span className="w-20 shrink-0 text-xs leading-5 text-ink-3">{t(`kind_${s.kind}`)}</span>
                      <a href={s.url} target="_blank" rel="noreferrer" className="min-w-0 break-words text-accent-ink hover:underline">
                        {s.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
