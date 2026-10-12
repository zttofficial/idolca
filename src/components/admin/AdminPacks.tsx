"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Card } from "@/lib/cards";
import { formatPrice } from "@/lib/fx";
import { TIERS, packStats, type Pack, type Tier } from "@/lib/packs";
import Select from "@/components/ui/Select";

type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;

// 卡包管理：建立卡包（建立時生成種子並公開雜湊），把平台自有的金庫卡放進卡池、設等級和價值
export default function AdminPacks({ call }: { call: Call }) {
  const t = useTranslations("Admin");
  const [data, setData] = useState<{ packs: Pack[]; assignable: Card[] } | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async () => {
    try {
      setData(await call<{ packs: Pack[]; assignable: Card[] }>("GET", "/api/admin/packs"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [call]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 進入後台時讀卡包
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold">{t("packs")}</h2>
      <p className="mt-1 text-xs text-ink-3">{t("packsHint")}</p>
      {error && <p className="mt-3 rounded-xl bg-down/10 px-4 py-2 text-sm text-down">{t("error", { error })}</p>}
      <NewPack onCreate={(body) => act("create", () => call("POST", "/api/admin/packs", body))} busy={busy === "create"} />
      {!data ? (
        <p className="mt-4 text-sm text-ink-3">…</p>
      ) : (
        data.packs.map((pack) => (
          <PackPool
            key={pack.id}
            pack={pack}
            assignable={data.assignable}
            busy={busy}
            onAdd={(cardId, tier, valueUsdt) => act(`add:${cardId}`, () => call("POST", `/api/admin/packs/${pack.id}/cards`, { cardId, tier, valueUsdt }))}
            onRemove={(cardId) => act(`remove:${cardId}`, () => call("DELETE", `/api/admin/packs/${pack.id}/cards`, { cardId }))}
          />
        ))
      )}
    </section>
  );
}

const field = "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink";
const label = "block text-xs text-ink-3";

function NewPack({ onCreate, busy }: { onCreate: (body: unknown) => Promise<void>; busy: boolean }) {
  const t = useTranslations("Admin");
  const [f, setF] = useState({ id: "", name: "", priceUsdt: "", maxQty: "1", startsAt: "", endsAt: "", c1: "#ff6f93", c2: "#e8285a" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ id: f.id, name: f.name, priceUsdt: Number(f.priceUsdt), maxQty: Number(f.maxQty), startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(), palette: [f.c1, f.c2] });
      }}
      className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-3"
    >
      <label className={label}>
        {t("packId")}
        <input required pattern="[a-z0-9][a-z0-9-]{1,39}" value={f.id} onChange={set("id")} placeholder="daily-oct" className={field} />
      </label>
      <label className={label}>
        {t("packName")}
        <input required maxLength={40} value={f.name} onChange={set("name")} className={field} />
      </label>
      <label className={label}>
        {t("packPrice")}
        <input required type="number" min="0.01" step="0.01" value={f.priceUsdt} onChange={set("priceUsdt")} className={field} />
      </label>
      <label className={label}>
        {t("packMaxQty")}
        <Select value={f.maxQty} onChange={(maxQty) => setF((x) => ({ ...x, maxQty }))} options={["1", "5", "10"].map((q) => ({ value: q, label: q === "1" ? t("singlePull") : `×${q}` }))} className={field} />
      </label>
      <label className={label}>
        {t("packStarts")}
        <input required type="datetime-local" value={f.startsAt} onChange={set("startsAt")} className={field} />
      </label>
      <label className={label}>
        {t("packEnds")}
        <input required type="datetime-local" value={f.endsAt} onChange={set("endsAt")} className={field} />
      </label>
      <div className="flex items-end gap-2">
        <input type="color" value={f.c1} onChange={set("c1")} aria-label={t("packColor")} className="h-10 w-12 rounded-lg border border-line" />
        <input type="color" value={f.c2} onChange={set("c2")} aria-label={t("packColor")} className="h-10 w-12 rounded-lg border border-line" />
        <button disabled={busy} className="btn-primary ml-auto rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? "…" : t("createPack")}
        </button>
      </div>
    </form>
  );
}

function PackPool({
  pack,
  assignable,
  busy,
  onAdd,
  onRemove,
}: {
  pack: Pack;
  assignable: Card[];
  busy?: string;
  onAdd: (cardId: string, tier: Tier, valueUsdt: number) => void;
  onRemove: (cardId: string) => void;
}) {
  const t = useTranslations("Admin");
  const s = packStats(pack);
  const [tier, setTier] = useState<Tier>("N");
  const [value, setValue] = useState("");
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/packs/${pack.id}`} className="font-semibold hover:underline">
          {pack.name} · {formatPrice(pack.priceUsdt, 2)}
        </Link>
        <span className="text-xs text-ink-3">
          {t("poolSummary", { remaining: s.remaining, total: s.total, ev: s.expected.toFixed(2) })} · {pack.startsAt.slice(0, 16).replace("T", " ")} → {pack.endsAt.slice(0, 16).replace("T", " ")}
        </span>
      </div>
      <p className="mt-1 font-mono text-[10px] break-all text-ink-3">sha256(seed) = {pack.seedHash}</p>
      {pack.pool.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {pack.pool.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-10 font-mono text-xs font-bold">{e.tier}</span>
              <span className="min-w-0 flex-1 truncate">
                {e.card.serial} · {e.card.group} {e.card.member} · {e.card.version}
              </span>
              <span className="text-xs tabular-nums">{formatPrice(e.valueUsdt, 2)}</span>
              {e.remaining ? (
                <button disabled={busy !== undefined} onClick={() => onRemove(e.id)} className="text-xs text-ink-3 hover:text-down disabled:opacity-50">
                  {t("removeFromPool")}
                </button>
              ) : (
                <span className="text-xs text-ink-3">{t("pulled")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {assignable.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className={label}>
              {t("tier")}
              <Select value={tier} onChange={setTier} options={TIERS.map((x) => ({ value: x, label: x }))} className={field} />
            </label>
            <label className={label}>
              {t("cardValue")}
              <input type="number" min="0.01" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className={field} />
            </label>
            <p className="pb-2 text-xs text-ink-3">{t("assignHint")}</p>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {assignable.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <button
                  disabled={busy !== undefined || !(Number(value) > 0)}
                  onClick={() => onAdd(c.id, tier, Number(value))}
                  className="rounded-full border border-line px-3 py-0.5 text-xs font-semibold hover:bg-surface-2 disabled:opacity-40"
                >
                  {busy === `add:${c.id}` ? "…" : t("addToPool")}
                </button>
                <span className="truncate">
                  {c.serial} · {c.group} {c.member} · {c.version}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
