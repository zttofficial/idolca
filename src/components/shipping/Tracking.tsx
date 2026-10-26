"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Dialog from "@/components/ui/Dialog";
import Select from "@/components/ui/Select";
import CopyButton from "@/components/ui/CopyButton";
import { CARRIERS, carrierName, parseTracking, trackingUrl, type CarrierId, type Tracking } from "@/lib/tracking";

const LAST_CARRIER_KEY = "idolca:last-carrier";
const OTHER = "other";

// 填物流單號的彈窗（擔保交易賣家標記寄出和更正單號、後台提貨出貨和改單號共用）。單號必填，物流商選填（清單外的選「其他」）。
// 沒給 initial 時預設 defaultCarrier（提貨出貨按卡所在的金庫給），沒給就用這個瀏覽器上次選的物流商
export function TrackingDialog({
  title,
  body,
  submitLabel,
  busy = false,
  error,
  initial,
  defaultCarrier,
  onSubmit,
  onClose,
}: {
  title: string;
  body: string;
  submitLabel: string;
  busy?: boolean;
  error?: string;
  initial?: Tracking | null;
  defaultCarrier?: CarrierId;
  onSubmit: (tracking: Tracking) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Tracking");
  const td = useTranslations("Detail");
  const [carrier, setCarrier] = useState<string>(() => {
    if (initial) return initial.carrier ?? OTHER;
    if (defaultCarrier) return defaultCarrier;
    try {
      const last = localStorage.getItem(LAST_CARRIER_KEY);
      if (last && (last === OTHER || (CARRIERS as string[]).includes(last))) return last;
    } catch {}
    return "";
  });
  const [number, setNumber] = useState(initial?.number ?? "");
  const [touched, setTouched] = useState(false);
  const parsed = parseTracking({ carrier: carrier === OTHER ? null : carrier, number });
  const options = [...CARRIERS.map((id) => ({ value: id as string, label: carrierName(id) })), { value: OTHER, label: t("other") }];
  const field = "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink";

  return (
    <Dialog label={title} onClose={onClose} className="max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!parsed) return;
          try {
            localStorage.setItem(LAST_CARRIER_KEY, carrier || OTHER);
          } catch {}
          onSubmit(parsed);
        }}
      >
        <h2 className="pr-8 text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
        <div className="mt-5 grid gap-3">
          <label className="block text-xs text-ink-3">
            {t("carrier")}
            <Select searchable value={carrier} onChange={setCarrier} options={options} placeholder={t("carrierPlaceholder")} className={field} />
          </label>
          <label className="block text-xs text-ink-3">
            {t("number")}
            <input
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onBlur={() => setTouched(true)}
              className={`${field} font-mono`}
            />
          </label>
        </div>
        {touched && number.trim() && !parsed && <p className="mt-3 text-xs text-down">{t("invalid")}</p>}
        {error && <p className="mt-3 text-xs text-down">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary rounded-full px-5 py-2 text-sm font-semibold">
            {td("cancel")}
          </button>
          <button disabled={!parsed || busy} className="btn-primary rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? "…" : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// 顯示物流單號（擔保訂單的買家和賣家、後台的訂單和提貨、卡片頁的提貨進度共用）：物流商、單號、複製，物流商有公開查詢頁時附連結
export function TrackingBlock({ tracking, className = "" }: { tracking: Tracking; className?: string }) {
  const t = useTranslations("Tracking");
  const td = useTranslations("Detail");
  const url = trackingUrl(tracking);
  return (
    <div className={`rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2 ${className}`}>
      <p className="text-[11px] text-ink-3">
        {t("label")} · {tracking.carrier ? carrierName(tracking.carrier) : t("other")}
      </p>
      <p className="mt-0.5 font-mono text-sm break-all text-ink">{tracking.number}</p>
      <p className="mt-1 flex flex-wrap gap-3 text-[11px] font-semibold text-ink-3">
        <CopyButton text={tracking.number} label={t("copy")} copiedLabel={td("copied")} />
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="hover:text-ink">
            {t("track")} ↗
          </a>
        )}
      </p>
    </div>
  );
}
