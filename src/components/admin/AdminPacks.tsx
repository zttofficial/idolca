"use client";

import { useState } from "react";

import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import { MAX_RTP, TIERS, type Tier } from "@/lib/packs";
import type { AdminPack, AdminPoolEntry } from "@/lib/server/admin-packs";
import type { AdminCard } from "@/lib/server/admin-queries";
import Select from "@/components/ui/Select";
import AdminList, { type ListCtx } from "./AdminList";
import { Facts, field, label, when, type Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const PACK_VIEW_LABEL: Record<string, string> = { all: "All", live: "On sale", upcoming: "Upcoming", ended: "Ended" };
const POOL_STATE_LABEL: Record<string, string> = { remaining: "In pool", pulled: "Pulled" };

export const PACK_STATUSES = ["all", "live", "upcoming", "ended"] as const;

// 卡包管理：建立卡包（建立時生成種子並公開雜湊）；列表每個卡包只帶統計，點開在右側看卡池（分頁、可搜）和返還率，
// 從伺服器搜出能放進卡池的平台自有卡，勾選多張一起設等級和價值放進去
export default function AdminPacks({ call, onChanged }: { call: Call; onChanged: () => void }) {
  const [rev, setRev] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const create = async (body: unknown) => {
    setBusy(true);
    setError(undefined);
    try {
      await call("POST", "/api/admin/packs", body);
      setRev((n) => n + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2 className="text-lg font-semibold">Mystery packs</h2>
      <p className="mt-1 text-xs text-ink-3">
        Create a pack (a secret seed is generated and only its hash is published), then add Idolca-owned vault cards to its pool with a tier and value. Value drives expected value and
        buyback.
      </p>
      {error && <p className="mt-3 rounded-xl bg-down/10 px-4 py-2 text-sm text-down">{`Error: ${error}`}</p>}
      <NewPack onCreate={create} busy={busy} />
      <div className="mt-6">
        <AdminList<AdminPack>
          key={rev}
          endpoint="/api/admin/packs"
          call={call}
          onChanged={onChanged}
          rowKey={(p) => p.id}
          search="Search pack ID or name"
          filters={[{ key: "status", label: "Status", options: PACK_STATUSES.map((s) => ({ value: s, label: PACK_VIEW_LABEL[s] })) }]}
          renderRow={(p) => (
            <>
              <span className="h-10 w-7 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, ${p.palette[0]}, ${p.palette[1]})` }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {p.name} · {formatPrice(p.priceUsdt, 2)}
                </span>
                <span className="block text-xs text-ink-3">
                  {PACK_VIEW_LABEL[p.status]} · {when(p.startsAt)} → {when(p.endsAt)}
                </span>
              </span>
              <span className="text-xs tabular-nums text-ink-2">
                {`${p.remaining} / ${p.total} left`}
                {p.paused && <span className="ml-2 font-semibold text-down">Paused</span>}
                {!p.paused && p.lowStock && <span className="ml-2 font-semibold text-notice-ink">Low stock</span>}
              </span>
            </>
          )}
          detail={{ title: (p) => p.name, wide: true, render: (p, ctx) => <PackDetail pack={p} ctx={ctx} /> }}
        />
      </div>
    </section>
  );
}

function PackDetail({ pack, ctx }: { pack: AdminPack; ctx: ListCtx }) {
  const [poolRev, setPoolRev] = useState(0);
  const [pickRev, setPickRev] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<Tier>("N");
  const [value, setValue] = useState("");
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const add = () =>
    ctx.act("pool:add", async () => {
      await ctx.call("POST", `/api/admin/packs/${pack.id}/cards`, { cardIds: [...picked], tier, valueUsdt: Number(value) });
      setPicked(new Set());
      setPoolRev((n) => n + 1);
      setPickRev((n) => n + 1);
    });
  return (
    <div className="space-y-6">
      <div>
        <Facts
          rows={[
            [
              "Pack ID (URL)",
              <span key="id" className="font-mono text-xs">
                {pack.id}
              </span>,
            ],
            ["Price (USD)", formatPrice(pack.priceUsdt, 2)],
            ["Status", `${PACK_VIEW_LABEL[pack.status]} · ${when(pack.startsAt)} → ${when(pack.endsAt)}`],
            ["Per order", pack.maxQty === 1 ? "Single pull only" : `×${pack.maxQty}`],
            ["Pool", `${pack.remaining} / ${pack.total} left · EV ${pack.expected.toFixed(2)} USD`],
            ["Tier", pack.tiers.map((x) => `${x.tier} ${x.remaining}/${x.total}`).join(" · ")],
          ]}
        />
        <p className={`mt-3 text-xs ${pack.sellOutRtp > MAX_RTP ? "font-semibold text-down" : "text-ink-2"}`}>
          {`Return if sold out ${Math.round(pack.sellOutRtp * 100)}% (cap ${Math.round(MAX_RTP * 100)}%) · profit if sold out ${formatPrice(pack.sellOutProfit, 2)} · remaining pool ${Math.round(pack.rtp * 100)}%`}
          {pack.paused && ` · ${"sales paused: add cheaper cards or raise the price"}`}
        </p>
        <p className="mt-1 font-mono text-[10px] break-all text-ink-3">sha256(seed) = {pack.seedHash}</p>
        <Link href={`/packs/${pack.id}`} className="mt-2 inline-block text-xs text-accent-ink hover:underline">
          {"Pack page"} ↗
        </Link>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Pool</h3>
        <AdminList<AdminPoolEntry>
          key={poolRev}
          local
          endpoint={`/api/admin/packs/${pack.id}/cards`}
          call={ctx.call}
          limit={20}
          onChanged={() => {
            setPickRev((n) => n + 1);
            ctx.reload();
          }}
          rowKey={(e) => e.id}
          search="Search serial, group, member or version"
          filters={[
            { key: "state", label: "Status", options: ["", "remaining", "pulled"].map((v) => ({ value: v, label: v ? POOL_STATE_LABEL[v] : "Any" })) },
            { key: "tier", label: "Tier", options: [{ value: "", label: "Any" }, ...TIERS.map((x) => ({ value: x, label: x }))] },
          ]}
          renderRow={(e, { busy, act, call }) => (
            <>
              <span className="w-10 font-mono text-xs font-bold">{e.tier}</span>
              <span className="min-w-0 flex-1 truncate">
                {e.serial} · {e.group} {e.member} · {e.version}
              </span>
              <span className="text-xs tabular-nums">{formatPrice(e.valueUsdt, 2)}</span>
              {e.pulled ? (
                <span className="text-xs text-ink-3">Pulled</span>
              ) : (
                <button
                  disabled={busy !== undefined}
                  onClick={() => act(`remove:${e.id}`, () => call("DELETE", `/api/admin/packs/${pack.id}/cards`, { cardId: e.id }))}
                  className="text-xs text-ink-3 hover:text-down disabled:opacity-50"
                >
                  {busy === `remove:${e.id}` ? "…" : "Remove"}
                </button>
              )}
            </>
          )}
        />
      </div>

      <div className="border-t border-line pt-5">
        <h3 className="text-sm font-semibold">Add cards to the pool</h3>
        <p className="mt-1 text-xs text-ink-3">
          Tick the cards to add, set a tier and value, then add them together. Only platform-owned cards that can be drawn are listed: chain state synced, held by the platform wallet, not
          listed and not being redeemed.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className={label}>
            Tier
            <Select value={tier} onChange={setTier} options={TIERS.map((x) => ({ value: x, label: x }))} className={field} />
          </label>
          <label className={label}>
            Value (USD)
            <input type="number" min="0.01" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className={field} />
          </label>
          <button
            disabled={ctx.busy !== undefined || !picked.size || !(Number(value) > 0)}
            onClick={add}
            className="btn-primary rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {ctx.busy === "pool:add" ? "…" : `Add ${picked.size} selected`}
          </button>
        </div>
        <div className="mt-4">
          <AdminList<AdminCard>
            key={pickRev}
            local
            endpoint="/api/admin/cards?state=assignable"
            call={ctx.call}
            limit={20}
            rowKey={(c) => c.id}
            search="Search serial, group, member, album, wallet or card ID"
            empty="No assignable cards match."
            renderRow={(c) => (
              <label className="flex w-full cursor-pointer items-center gap-3">
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-ink" />
                <span className="min-w-0 flex-1 truncate">
                  {c.serial} · {c.group} {c.member} · {c.version}
                </span>
              </label>
            )}
          />
        </div>
      </div>
    </div>
  );
}

function NewPack({ onCreate, busy }: { onCreate: (body: unknown) => Promise<void>; busy: boolean }) {
  const [f, setF] = useState({ id: "", name: "", priceUsdt: "", maxQty: "1", startsAt: "", endsAt: "", c1: "#ff6f93", c2: "#e8285a" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({
          id: f.id,
          name: f.name,
          priceUsdt: Number(f.priceUsdt),
          maxQty: Number(f.maxQty),
          startsAt: new Date(f.startsAt).toISOString(),
          endsAt: new Date(f.endsAt).toISOString(),
          palette: [f.c1, f.c2],
        });
      }}
      className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-3"
    >
      <label className={label}>
        Pack ID (URL)
        <input required pattern="[a-z0-9][a-z0-9-]{1,39}" value={f.id} onChange={set("id")} placeholder="daily-oct" className={field} />
      </label>
      <label className={label}>
        Name
        <input required maxLength={40} value={f.name} onChange={set("name")} className={field} />
      </label>
      <label className={label}>
        Price (USD)
        <input required type="number" min="0.01" step="0.01" value={f.priceUsdt} onChange={set("priceUsdt")} className={field} />
      </label>
      <label className={label}>
        Per order
        <Select
          value={f.maxQty}
          onChange={(maxQty) => setF((x) => ({ ...x, maxQty }))}
          options={["1", "5", "10"].map((q) => ({ value: q, label: q === "1" ? "Single pull only" : `×${q}` }))}
          className={field}
        />
      </label>
      <label className={label}>
        Starts
        <input required type="datetime-local" value={f.startsAt} onChange={set("startsAt")} className={field} />
      </label>
      <label className={label}>
        Ends
        <input required type="datetime-local" value={f.endsAt} onChange={set("endsAt")} className={field} />
      </label>
      <div className="flex items-end gap-2">
        <input type="color" value={f.c1} onChange={set("c1")} aria-label="Pack color" className="h-10 w-12 rounded-lg border border-line" />
        <input type="color" value={f.c2} onChange={set("c2")} aria-label="Pack color" className="h-10 w-12 rounded-lg border border-line" />
        <button disabled={busy} className="btn-primary ml-auto rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? "…" : "Create pack"}
        </button>
      </div>
    </form>
  );
}
