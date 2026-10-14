"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Dialog from "@/components/ui/Dialog";
import Select from "@/components/ui/Select";
import CopyButton from "@/components/ui/CopyButton";
import { EMPTY_ADDRESS, SHIP_COUNTRIES, formatAddress, parseAddress, type ShippingAddress } from "@/lib/shipping";

const DRAFT_KEY = "idolca:shipping-address";
const isEmpty = (a: ShippingAddress) => Object.values(a).every((v) => !v);

// 收件地址表單（金庫卡提貨、擔保交易的一口價購買和訂單補填共用）。欄位和驗證見 src/lib/shipping.ts。
// 沒給 initial 時預填我上一次填過的地址：先問伺服器（擔保訂單或提貨，取較新的），沒有再用這個瀏覽器存的。
// note 和 submitLabel 可以傳函式，隨正在填的地址變（提貨用它按國家即時顯示運費）。
// countries 限定可選的國家（提貨只列卡所在金庫寄得到的）；預填的地址不在裡面時不能送出，由 note 說明
type ByAddress = string | ((address: ShippingAddress) => string);

export default function AddressDialog({
  title,
  body,
  note,
  submitLabel,
  busyLabel,
  busy = false,
  initial,
  countries: allowed = SHIP_COUNTRIES,
  onSubmit,
  onClose,
}: {
  title: string;
  body: string;
  note?: ByAddress;
  submitLabel: ByAddress;
  busyLabel?: string;
  busy?: boolean;
  initial?: ShippingAddress | null;
  countries?: readonly string[];
  onSubmit: (address: ShippingAddress) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Detail");
  const locale = useLocale();
  const [a, setA] = useState<ShippingAddress>(initial ?? EMPTY_ADDRESS);
  useEffect(() => {
    if (initial) return;
    let live = true;
    (async () => {
      let saved: Partial<ShippingAddress> | null = null;
      try {
        const res = await fetch("/api/account/address");
        if (res.ok) saved = ((await res.json()) as { address: ShippingAddress | null }).address;
      } catch {}
      if (!saved) {
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) saved = JSON.parse(raw) as Partial<ShippingAddress>;
        } catch {}
      }
      // 用戶已經開始填就不蓋掉
      if (live && saved) setA((x) => (isEmpty(x) ? { ...EMPTY_ADDRESS, ...saved } : x));
    })();
    return () => {
      live = false;
    };
  }, [initial]);

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return allowed.map((code) => ({ code, name: names.of(code) ?? code })).sort((x, y) => x.name.localeCompare(y.name, locale));
  }, [locale, allowed]);
  const parsed = parseAddress(a);
  const valid = parsed && allowed.includes(parsed.country) ? parsed : null;
  const byAddress = (v: ByAddress | undefined) => (typeof v === "function" ? v(a) : v);
  const noteText = byAddress(note);
  const set = (k: keyof ShippingAddress) => (e: { target: { value: string } }) => setA((x) => ({ ...x, [k]: e.target.value }));
  const field = "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink";
  const label = "block text-xs text-ink-3";

  return (
    <Dialog label={title} onClose={onClose} className="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(valid));
          } catch {}
          onSubmit(valid);
        }}
      >
        <h2 className="pr-8 text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
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
        {noteText && <p className="mt-5 rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-2">{noteText}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-5 py-2 text-sm hover:bg-surface-2">
            {t("cancel")}
          </button>
          <button disabled={!valid || busy} className="btn-primary rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
            {busy && busyLabel ? busyLabel : byAddress(submitLabel)}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// 顯示一份收件地址（擔保訂單的賣家和買家、後台的提貨和訂單共用），附複製按鈕方便貼到寄件單
export function AddressBlock({ address, className = "" }: { address: ShippingAddress; className?: string }) {
  const t = useTranslations("Detail");
  const text = formatAddress(address);
  return (
    <div className={`rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2 ${className}`}>
      <pre className="font-sans whitespace-pre-wrap">{text}</pre>
      <CopyButton text={text} label={t("copyAddress")} copiedLabel={t("copied")} className="mt-1 text-[11px] font-semibold text-ink-3" />
    </div>
  );
}
