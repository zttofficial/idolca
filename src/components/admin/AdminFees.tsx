"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import Select from "@/components/ui/Select";
import { formatPrice } from "@/lib/fx";
import { FEE_KINDS, FEE_MAX, bpsToPct, resolveFee, type FeeKind, type FeeRule, type Fees } from "@/lib/fees";
import { field, label, type Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const FEE_ERROR_LABEL: Record<string, string> = {
  invalid_kind: "Unknown fee type.",
  invalid_value: "The rate is out of range (0–10% or 0–10 USD).",
  invalid_time: "Check the times: a promotion must end after it starts, and not in the past.",
  not_found: "This rule no longer exists.",
  not_allowed: "A base rate that's already in effect can't be removed. Schedule a new base rate instead.",
};
const FEE_KIND_LABEL: Record<string, string> = { sale: "Sale commission", auction: "Auction fee", mint: "Mint fee (collection card to digital collectible)" };
const FEE_STATUS_LABEL: Record<string, string> = { scheduled: "Scheduled", active: "Active", ended: "Ended" };

type Rule = { id: string; kind: FeeKind; value: number; startsAt: string; endsAt: string | null; label: string | null; createdAt: string };
type Data = { fees: Fees; rules: Rule[]; at: number };
type Status = "scheduled" | "active" | "ended";

// 漲基本費率時建議提前公告的天數，太近只提醒、不擋
const NOTICE_MS = 7 * 24 * 3600 * 1000;
const FEE_ERRORS = ["invalid_kind", "invalid_value", "invalid_time", "not_found", "not_allowed"];
const EMPTY = { kind: "sale" as FeeKind, promo: false, value: "", startsAt: "", endsAt: "", label: "" };

// 抽成和拍賣手續費以百分比顯示（基點 / 100），鑄造費以美元顯示（美分 / 100）；輸入框同樣的單位，送出時都乘 100 換回整數
const formatFee = (kind: FeeKind, v: number) => (kind === "mint" ? formatPrice(v / 100, 2) : `${bpsToPct(v)}%`);
const toRule = (r: Rule): FeeRule => ({ ...r, startsAt: new Date(r.startsAt), endsAt: r.endsAt ? new Date(r.endsAt) : null });

// 規則的狀態：還沒開始是已排定；促銷到結束時間為止；基本費率被之後開始的基本費率取代就算結束
function statusOf(r: Rule, rules: Rule[], now: number): Status {
  const start = Date.parse(r.startsAt);
  if (start > now) return "scheduled";
  if (r.endsAt) return Date.parse(r.endsAt) > now ? "active" : "ended";
  const later = rules.some((x) => x.kind === r.kind && !x.endsAt && x.id !== r.id && Date.parse(x.startsAt) <= now && Date.parse(x.startsAt) > start);
  return later ? "ended" : "active";
}

// 手續費管理：看各項現在收多少，排定基本費率調整或限時促銷，刪除還沒開始的規則、提前結束促銷
export default function AdminFees({ call }: { call: Call }) {
  const locale = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const set = (k: "value" | "startsAt" | "endsAt" | "label") => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const fmtDate = (s: string) => date.format(new Date(s));
  const message = (code: string) => (FEE_ERRORS.includes(code) ? FEE_ERROR_LABEL[code] : `Error: ${code}`);

  const load = useCallback(async () => {
    try {
      const d = await call<Omit<Data, "at">>("GET", "/api/admin/fees");
      setData({ ...d, at: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [call]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 進入頁籤時讀費率
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const now = data?.at ?? 0;
  const units = Math.round(Number(form.value) * 100);
  const start = form.startsAt ? new Date(form.startsAt).getTime() : now;
  // 漲價提醒：跟開始時那一刻的基本費率比，開始時間不到 7 天
  const baseAtStart = data && !form.promo ? resolveFee(form.kind, data.rules.map(toRule), new Date(Math.max(start, now))).base : null;
  const shortNotice = baseAtStart !== null && form.value !== "" && units > baseAtStart && start - now < NOTICE_MS;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      kind: form.kind,
      value: units,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.promo ? new Date(form.endsAt).toISOString() : undefined,
      label: form.promo ? form.label : undefined,
    };
    act("add", () => call("POST", "/api/admin/fees", body)).then((ok) => ok && setForm((f) => ({ ...EMPTY, kind: f.kind, promo: f.promo })));
  };

  const rules = data ? [...data.rules].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)) : [];

  return (
    <section>
      <h2 className="text-lg font-semibold">Fees</h2>
      <p className="mt-1 text-xs text-ink-3">Rates apply to new orders, auctions and mints from their start time. Orders already placed keep the rate they were placed at.</p>
      {error && <p className="mt-3 rounded-xl bg-down/10 px-4 py-2 text-sm text-down">{message(error)}</p>}

      {!data ? (
        <p className="mt-4 text-sm text-ink-3">…</p>
      ) : (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {FEE_KINDS.map((kind) => {
            const f = data.fees[kind];
            return (
              <div key={kind} className="rounded-2xl border border-line bg-surface p-4">
                <dt className="text-xs text-ink-3">{FEE_KIND_LABEL[kind]}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums">{formatFee(kind, f.value)}</dd>
                {f.promo && <dd className="mt-1 text-xs text-up">{`Promotion: ${f.promo.label ?? "Unnamed"}, until ${fmtDate(f.promo.endsAt)}. Base rate ${formatFee(kind, f.base)}`}</dd>}
                {f.next && <dd className="mt-1 text-xs text-notice-ink">{`Base rate changes to ${formatFee(kind, f.next.value)} on ${fmtDate(f.next.startsAt)}`}</dd>}
              </div>
            );
          })}
        </dl>
      )}

      <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-3">
        <div role="radiogroup" aria-label="Rule type" className="flex w-fit rounded-full bg-surface-2 p-1 text-xs font-semibold sm:col-span-3">
          {([false, true] as const).map((promo) => (
            <button
              key={String(promo)}
              type="button"
              role="radio"
              aria-checked={form.promo === promo}
              onClick={() => setForm((f) => ({ ...f, promo }))}
              className={`rounded-full px-3 py-1 transition ${form.promo === promo ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
            >
              {promo ? "Limited-time promotion" : "Change base rate"}
            </button>
          ))}
        </div>
        <label className={label}>
          Fee
          <Select value={form.kind} onChange={(kind) => setForm((f) => ({ ...f, kind }))} options={FEE_KINDS.map((k) => ({ value: k, label: FEE_KIND_LABEL[k] }))} className={field} />
        </label>
        <label className={label}>
          {form.kind === "mint" ? "Amount (USD)" : "Rate (%)"}
          <input required type="number" min={0} max={FEE_MAX[form.kind] / 100} step={0.01} value={form.value} onChange={set("value")} className={field} />
        </label>
        <label className={label}>
          Starts (blank = now)
          <input type="datetime-local" value={form.startsAt} onChange={set("startsAt")} className={field} />
        </label>
        {form.promo && (
          <>
            <label className={label}>
              Ends
              <input required type="datetime-local" value={form.endsAt} onChange={set("endsAt")} className={field} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Promotion name (shown to users, optional)
              <input value={form.label} onChange={set("label")} maxLength={60} placeholder="Anniversary: zero fees" className={field} />
            </label>
          </>
        )}
        <p className="text-xs text-ink-3 sm:col-span-3">
          {
            "Sale commission and auction fee are capped at 10% (the on-chain program's limit); the mint fee is capped at 10 USD. A base rate applies from its start until the next base rate. During a promotion, the lower of the promotion and base rate applies."
          }
        </p>
        {shortNotice && (
          <p className="rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-ink sm:col-span-3">
            {"This increase takes effect within 7 days. Give users at least 7 days' notice before raising fees."}
          </p>
        )}
        <div className="sm:col-span-3">
          <button disabled={busy !== undefined || !data} className="btn-primary rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
            {busy === "add" ? "…" : "Add rule"}
          </button>
        </div>
      </form>

      <h3 className="mt-8 text-sm font-semibold">All rules</h3>
      {!data ? (
        <p className="mt-3 text-sm text-ink-3">…</p>
      ) : !rules.length ? (
        <p className="mt-3 text-sm text-ink-3">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
          {rules.map((r) => {
            const status = statusOf(r, data.rules, now);
            // 還沒開始的直接刪除；進行中的促銷可以提前結束；已生效的基本費率要改就排一條新的
            const action = status === "scheduled" ? "delete" : status === "active" && r.endsAt ? "end" : null;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {FEE_KIND_LABEL[r.kind]} · {formatFee(r.kind, r.value)}
                    <span className="ml-2 text-xs font-normal text-ink-3">{r.endsAt ? "Promotion" : "Base rate"}</span>
                    {r.label && <span className="ml-2 text-xs font-normal text-ink-2">{r.label}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">{r.endsAt ? `${fmtDate(r.startsAt)} → ${fmtDate(r.endsAt)}` : `From ${fmtDate(r.startsAt)}`}</p>
                </div>
                <span className={`text-xs font-semibold ${status === "active" ? "text-up" : status === "scheduled" ? "text-notice-ink" : "text-ink-3"}`}>{FEE_STATUS_LABEL[status]}</span>
                {action && (
                  <button
                    disabled={busy !== undefined}
                    onClick={() =>
                      window.confirm(action === "delete" ? "Delete this rule? It hasn't started yet." : "End this promotion now?") &&
                      act(r.id, () => call("DELETE", `/api/admin/fees/${r.id}`))
                    }
                    className="btn-danger rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {busy === r.id ? "…" : action === "delete" ? "Delete" : "End now"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
