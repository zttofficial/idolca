"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CURRENCY, formatPrice } from "@/lib/fx";

// 上架、改價、下架。收藏冊裡自己上鏈的卡（擔保交易刊登）、收藏冊和卡片頁上的金庫卡（鏈上託管掛單）共用這一個介面，
// 差別只在呼叫方傳進來的動作和說明文字
export default function ListingControl({
  price,
  viewHref,
  note,
  onList,
  onUnlist,
}: {
  // 目前的售價；沒上架時為 null
  price: number | null;
  // 上架後「看刊登頁」連到哪裡；已經在刊登頁上時不給
  viewHref?: string;
  // 輸入價格時下方的說明
  note: string;
  onList: (price: number) => Promise<unknown>;
  onUnlist: () => Promise<unknown>;
}) {
  const t = useTranslations("Binder");
  const listed = price !== null;
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(price?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const value = Number(input);
  // 最低 0.01（伺服器以分為單位存）
  const valid = input !== "" && value >= 0.01 && value <= 100_000;
  const run = async (go: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await go();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  };
  const errorText = error && <p className="mt-2 text-[11px] text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : t("listingError")}</p>;

  if (listed && !editing) {
    return (
      <div className="rounded-xl bg-accent-soft p-3 text-sm">
        <p className="font-semibold text-accent-ink">{t("listedAt", { price: formatPrice(price) })}</p>
        {viewHref && (
          <Link href={viewHref} className="btn-primary mt-2 block rounded-full py-2 text-center text-sm font-semibold">
            {t("viewListing")} →
          </Link>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => setEditing(true)} className="btn-secondary rounded-full py-1.5 text-xs font-semibold disabled:opacity-50">
            {t("editPrice")}
          </button>
          <button disabled={busy} onClick={() => run(onUnlist)} className="btn-secondary rounded-full py-1.5 text-xs font-semibold disabled:opacity-50">
            {busy ? "…" : t("unlist")}
          </button>
        </div>
        {errorText}
      </div>
    );
  }
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="btn-primary rounded-full py-2.5 text-sm font-semibold">
        {t("listForSale")}
      </button>
    );
  }
  return (
    <form
      className="rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) run(() => onList(value));
      }}
    >
      <label className="flex items-center gap-2 text-xs text-ink-2">
        {t("price")}
        <input
          autoFocus
          inputMode="decimal"
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ""))}
          className="w-24 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-ink"
        />
        {CURRENCY}
      </label>
      <p className="mt-2 text-[11px] leading-snug text-ink-3">{note}</p>
      <div className="mt-2 flex gap-2">
        <button disabled={!valid || busy} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40">
          {busy ? "…" : t(listed ? "savePrice" : "confirmList")}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="btn-secondary rounded-full px-4 py-1.5 text-xs font-semibold">
          {t("cancel")}
        </button>
      </div>
      {errorText}
    </form>
  );
}
