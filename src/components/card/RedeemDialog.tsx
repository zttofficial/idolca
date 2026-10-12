"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatPrice } from "@/lib/fx";
import Select from "@/components/ui/Select";
import { EMPTY_ADDRESS, REDEEM_FEE_USDT, SHIP_COUNTRIES, parseAddress, type ShippingAddress } from "@/lib/shipping";

const DRAFT_KEY = "idolca:shipping-address";

// 申請提貨：填收件地址，確認後錢包簽一筆交易（凍結 NFT、付運費）。地址存在這個瀏覽器，下次自動帶入
export default function RedeemDialog({ busy, onSubmit, onClose }: { busy: boolean; onSubmit: (address: ShippingAddress) => void; onClose: () => void }) {
  const t = useTranslations("Detail");
  const locale = useLocale();
  const [a, setA] = useState<ShippingAddress>(EMPTY_ADDRESS);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打開時帶入上次的地址
      if (saved) setA({ ...EMPTY_ADDRESS, ...(JSON.parse(saved) as Partial<ShippingAddress>) });
    } catch {}
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return SHIP_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code })).sort((x, y) => x.name.localeCompare(y.name, locale));
  }, [locale]);
  const valid = parseAddress(a);
  const set = (k: keyof ShippingAddress) => (e: { target: { value: string } }) => setA((x) => ({ ...x, [k]: e.target.value }));
  const field = "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink";
  const label = "block text-xs text-ink-3";

  return (
    <div role="dialog" aria-modal="true" aria-label={t("redeemTitle")} className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(valid));
          } catch {}
          onSubmit(valid);
        }}
        className="mx-auto my-8 w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold">{t("redeemTitle")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{t("redeemBody")}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            {t("addrName")}
            <input required autoComplete="name" value={a.name} onChange={set("name")} className={field} />
          </label>
          <label className={label}>
            {t("addrPhone")}
            <input required type="tel" autoComplete="tel" value={a.phone} onChange={set("phone")} placeholder="+82 10 1234 5678" className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            {t("addrLine1")}
            <input required autoComplete="address-line1" value={a.line1} onChange={set("line1")} className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            {t("addrLine2")}
            <input autoComplete="address-line2" value={a.line2} onChange={set("line2")} className={field} />
          </label>
          <label className={label}>
            {t("addrCity")}
            <input required autoComplete="address-level2" value={a.city} onChange={set("city")} className={field} />
          </label>
          <label className={label}>
            {t("addrRegion")}
            <input autoComplete="address-level1" value={a.region} onChange={set("region")} className={field} />
          </label>
          <label className={label}>
            {t("addrPostal")}
            <input autoComplete="postal-code" value={a.postal} onChange={set("postal")} className={field} />
          </label>
          <label className={label}>
            {t("addrCountry")}
            <Select required searchable value={a.country} onChange={(country) => setA((x) => ({ ...x, country }))} options={countries.map((c) => ({ value: c.code, label: c.name }))} className={field} />
          </label>
        </div>
        <p className="mt-5 rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-2">{t("redeemFee", { fee: formatPrice(REDEEM_FEE_USDT, 2) })}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-5 py-2 text-sm hover:bg-surface-2">
            {t("cancel")}
          </button>
          <button disabled={!valid || busy} className="btn-primary rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? t("confirmInWallet") : t("redeemSubmit")}
          </button>
        </div>
      </form>
    </div>
  );
}
