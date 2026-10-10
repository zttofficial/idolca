"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import CardArt from "@/components/market/CardArt";
import MintDialog from "./MintDialog";
import { Link } from "@/i18n/navigation";
import { binderActions, useBinder, type BinderEntry } from "@/lib/binder";
import { GROUPS, TEMPLATES, templateCard, type Template } from "@/lib/catalog";
import { formatUsdt } from "@/lib/fx";
import { shortAddress } from "@/lib/solana/config";

const POCKETS = 9;
type Tab = "binder" | "progress" | "wants";
type Owned = { template: Template; entry: BinderEntry };

export default function BinderView() {
  const t = useTranslations("Binder");
  const binder = useBinder();
  const [tab, setTab] = useState<Tab>("binder");
  const [spread, setSpread] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [minting, setMinting] = useState<Template | null>(null);

  // 按圖鑑順序排列，和實體卡冊一樣同一團體、同一成員的卡放在一起
  const owned: Owned[] = TEMPLATES.filter((x) => binder.have[x.id]).map((template) => ({ template, entry: binder.have[template.id] }));
  const wants = TEMPLATES.filter((x) => binder.want[x.id]);

  if (!owned.length && !wants.length) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{t("emptyBody")}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/catalog" className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold">
            {t("browse")}
          </Link>
          <button onClick={binderActions.loadSample} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface-2">
            {t("loadSample")}
          </button>
        </div>
      </div>
    );
  }

  const copies = owned.reduce((n, o) => n + o.entry.count, 0);
  const minted = owned.filter((o) => o.entry.mint).length;
  const value = owned.reduce((v, o) => v + o.entry.count * o.template.market.fromUsdt, 0);
  const groups = new Set(owned.map((o) => o.template.groupId)).size;
  const stats = [
    { label: t("statCards"), value: copies.toLocaleString("en-US") },
    { label: t("statGroups"), value: groups },
    { label: t("statMinted"), value: `${minted} / ${owned.length}` },
    { label: t("statValue"), value: formatUsdt(value) },
  ];

  const pages = Math.max(1, Math.ceil(owned.length / POCKETS));
  const spreads = Math.ceil(pages / 2);
  const current = Math.min(spread, spreads - 1);
  const selectedOwned = owned.find((o) => o.template.id === selected);

  return (
    <div className="mt-8">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4">
            <dt className="text-xs text-ink-3">{s.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex items-center justify-between gap-4 border-b border-line">
        <div role="tablist" className="flex gap-6">
          {(["binder", "progress", "wants"] as Tab[]).map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition ${tab === id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
            >
              {t(`tab_${id}`)}
              {id === "wants" && wants.length > 0 && <span className="ml-1.5 text-ink-3 tabular-nums">{wants.length}</span>}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.confirm(t("clearConfirm")) && binderActions.clear()}
          className="pb-3 text-xs text-ink-3 hover:text-down"
        >
          {t("clear")}
        </button>
      </div>

      {tab === "binder" && (
        <>
          {/* 一次攤開兩頁，像翻開的實體卡冊 */}
          <div className="mt-6 grid gap-4 rounded-3xl bg-surface-3 p-3 sm:p-4 lg:grid-cols-2">
            {[current * 2, current * 2 + 1].map((page) =>
              page < pages || page === 0 ? (
                <div key={page} className="relative rounded-2xl bg-surface p-3 shadow-sm sm:p-4">
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {Array.from({ length: POCKETS }, (_, i) => {
                      const o = owned[page * POCKETS + i];
                      return o ? (
                        <Pocket key={i} owned={o} onSelect={() => setSelected(o.template.id)} />
                      ) : (
                        <div key={i} className="aspect-[55/85] rounded-lg border border-dashed border-line bg-surface-2" />
                      );
                    })}
                  </div>
                  <p className="mt-3 text-center text-[11px] text-ink-3 tabular-nums">{page + 1}</p>
                </div>
              ) : (
                <div key={page} className="hidden rounded-2xl bg-surface/60 lg:block" />
              ),
            )}
          </div>
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            <button
              disabled={current === 0}
              onClick={() => setSpread(current - 1)}
              className="rounded-full border border-line px-4 py-1.5 hover:bg-surface-2 disabled:opacity-40"
            >
              {t("prev")}
            </button>
            <span className="text-ink-3 tabular-nums">{t("page", { page: current + 1, pages: spreads })}</span>
            <button
              disabled={current >= spreads - 1}
              onClick={() => setSpread(current + 1)}
              className="rounded-full border border-line px-4 py-1.5 hover:bg-surface-2 disabled:opacity-40"
            >
              {t("next")}
            </button>
          </div>
        </>
      )}

      {tab === "progress" && <Progress />}

      {tab === "wants" &&
        (wants.length ? (
          <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
            {wants.map((w) => (
              <li key={w.id} className="flex items-center gap-4 px-4 py-3">
                <div className="aspect-[55/85] w-10 shrink-0 overflow-hidden rounded-md">
                  <CardArt card={templateCard(w)} rarityLabel="" className="block h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {w.group} {w.member}
                  </p>
                  <p className="truncate text-xs text-ink-3">
                    {w.album} · {w.version}
                  </p>
                </div>
                <span className="text-xs text-ink-2">
                  {w.market.forSale ? t("forSaleNow", { count: w.market.forSale, price: formatUsdt(w.market.fromUsdt) }) : t("noneForSale")}
                </span>
                {w.listingId && (
                  <Link href={`/card/${w.listingId}`} className="text-xs font-semibold text-accent-ink hover:underline">
                    {t("view")}
                  </Link>
                )}
                <button onClick={() => binderActions.toggleWant(w.id)} className="text-xs text-ink-3 hover:text-down">
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-ink-3">{t("wantsEmpty")}</p>
        ))}

      {selectedOwned && (
        <CardSheet
          owned={selectedOwned}
          onClose={() => setSelected(null)}
          onMint={() => {
            setMinting(selectedOwned.template);
            setSelected(null);
          }}
        />
      )}
      {minting && <MintDialog template={minting} onClose={() => setMinting(null)} />}
    </div>
  );
}

function ownedCard({ template, entry }: Owned) {
  const base = templateCard(template);
  return entry.photo ? { ...base, image: { front: entry.photo } } : base;
}

function Pocket({ owned, onSelect }: { owned: Owned; onSelect: () => void }) {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  return (
    <button onClick={onSelect} className="group relative block aspect-[55/85] overflow-hidden rounded-lg text-left">
      <CardArt card={ownedCard(owned)} rarityLabel={tRarity(owned.template.rarity)} className="block h-full w-full" />
      {/* 卡套的反光 */}
      <span className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-white/25 via-transparent to-transparent ring-1 ring-black/5 ring-inset" />
      {owned.entry.count > 1 && (
        <span className="absolute top-1 right-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-bold text-white">×{owned.entry.count}</span>
      )}
      {owned.entry.mint && (
        <span className="absolute bottom-1 left-1 rounded-full bg-ink/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">{t("mintedBadge")}</span>
      )}
      <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
    </button>
  );
}

function CardSheet({ owned, onClose, onMint }: { owned: Owned; onClose: () => void; onMint: () => void }) {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const { template, entry } = owned;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="grid w-full max-w-xl gap-6 rounded-2xl border border-line bg-surface p-6 shadow-2xl sm:grid-cols-[180px_1fr]" onClick={(e) => e.stopPropagation()}>
        <div className="aspect-[55/85] overflow-hidden rounded-xl">
          <CardArt card={ownedCard(owned)} rarityLabel={tRarity(template.rarity)} className="block h-full w-full" />
        </div>
        <div className="flex flex-col">
          <p className="text-xs text-ink-3">
            {template.group} · {template.album}
          </p>
          <h3 className="mt-1 text-xl font-bold">{template.member}</h3>
          <p className="text-sm text-ink-2">{template.version}</p>

          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="text-ink-3">{t("copies")}</span>
            <div className="flex items-center rounded-full border border-line">
              <button onClick={() => binderActions.setCount(template.id, entry.count - 1)} className="h-8 w-8 rounded-full hover:bg-surface-2">
                −
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">{entry.count}</span>
              <button onClick={() => binderActions.setCount(template.id, entry.count + 1)} className="h-8 w-8 rounded-full hover:bg-surface-2">
                +
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-surface-2 p-3 text-xs">
            {entry.mint ? (
              <>
                <p className="font-semibold">{t("selfReported")}</p>
                <p className="mt-1 font-mono text-ink-2">{shortAddress(entry.mint, 6, 6)}</p>
              </>
            ) : (
              <p className="text-ink-2">{t("notMinted")}</p>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-5">
            {!entry.mint && (
              <button onClick={onMint} className="btn-primary rounded-full py-2.5 text-sm font-semibold">
                {t("mint")}
              </button>
            )}
            <Link href="/#how" className="rounded-full border border-line py-2.5 text-center text-sm font-semibold hover:bg-surface-2">
              {t("sendToVault")}
            </Link>
            <button onClick={onClose} className="py-1 text-xs text-ink-3 hover:text-ink">
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 每個團體、每位成員的收集進度
function Progress() {
  const t = useTranslations("Binder");
  const binder = useBinder();
  const rows = GROUPS.flatMap((g) =>
    g.albums.flatMap((a) =>
      a.members.map((m) => {
        const list = TEMPLATES.filter((x) => x.groupId === g.id && x.albumId === a.id && x.member === m);
        return { key: `${g.id}-${a.id}-${m}`, groupId: g.id, label: `${g.name} ${m}`, album: a.title, have: list.filter((x) => binder.have[x.id]).length, total: list.length };
      }),
    ),
  )
    .filter((r) => r.have > 0)
    .sort((x, y) => y.have / y.total - x.have / x.total);

  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={`/catalog/${r.groupId}`} className="block rounded-2xl border border-line bg-surface p-4 hover:border-accent">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-semibold">
                {r.label} <span className="font-normal text-ink-3">· {r.album}</span>
              </p>
              <span className="text-xs text-ink-2 tabular-nums">
                {r.have}/{r.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(r.have / r.total) * 100}%` }} />
            </div>
            {r.have === r.total && <p className="mt-2 text-[11px] font-semibold text-up">{t("complete")}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

