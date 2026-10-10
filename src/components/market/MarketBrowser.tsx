"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import HoloTile from "./HoloTile";
import ListingTile from "./ListingTile";
import { openAddCard } from "@/components/binder/AddCard";
import type { Listing } from "@/lib/items";
import { useChainState, withLive } from "@/lib/chain-client";
import { CARDS } from "@/lib/mock-cards";
import { LANES, RARITIES, SORTS, applyListingQuery, applyQuery, facetCounts, parseQuery, toSearch, type MarketQuery } from "@/lib/market";

// 市場頁：金庫卡 / 自由刊登兩條線；搜尋、團體 → 成員、類型、價格、只看在售、排序、分頁，狀態全在網址裡
export default function MarketBrowser() {
  const t = useTranslations("Market");
  const tListing = useTranslations("Listing");
  const tRarity = useTranslations("Rarity");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = useMemo(() => parseQuery(new URLSearchParams(sp.toString())), [sp]);
  const free = q.lane === "free";
  const [listings, setListings] = useState<Listing[] | null>(null);
  useEffect(() => {
    fetch("/api/listings")
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((d: { listings: Listing[] }) => setListings(d.listings))
      .catch(() => setListings([]));
  }, []);
  const chain = useChainState();
  const cards = useMemo(() => withLive(CARDS, chain), [chain]);
  const vaultResult = useMemo(() => applyQuery(cards, q), [cards, q]);
  const freeResult = useMemo(() => applyListingQuery(listings ?? [], q), [listings, q]);
  const result = free ? freeResult : vaultResult;
  const facets = useMemo(() => facetCounts(cards, q), [cards, q]);
  const [showFilters, setShowFilters] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const go = (patch: Partial<MarketQuery>, scroll = false) => {
    const next = { ...q, page: 1, ...patch };
    const qs = toSearch(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    if (scroll) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 搜尋框：輸入停頓 300ms 再更新網址
  const [text, setText] = useState(q.q);
  const lastSent = useRef(q.q);
  useEffect(() => {
    if (text === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = text;
      go({ q: text.trim() });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go 依賴最新的 q，只在輸入變化時觸發
  }, [text]);

  const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });
  const groups = free ? [...new Set((listings ?? []).map((l) => l.group))].sort(byName) : [...new Set(CARDS.map((c) => c.group))].sort(byName);
  const groupCount = (g: string | null) =>
    free ? (listings ?? []).filter((l) => !g || l.group === g).length : g ? (facets.groups.get(g) ?? 0) : [...facets.groups.values()].reduce((a, b) => a + b, 0);
  const members = q.group && !free ? [...new Set(CARDS.filter((c) => c.group === q.group).map((c) => c.member))].sort(byName) : [];
  const activeCount = (q.group ? 1 : 0) + (q.member ? 1 : 0) + q.types.length + (q.min !== null || q.max !== null ? 1 : 0) + (q.listedOnly ? 1 : 0);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-line-strong bg-ink text-bg" : "border-line text-ink-2 hover:text-ink"}`;

  const filters = (
    <div className="space-y-6 text-sm">
      <div>
        <p className="text-xs font-semibold text-ink-3">{t("group")}</p>
        <ul className="mt-2 space-y-0.5">
          {[null, ...groups].map((g) => (
            <li key={g ?? "all"}>
              <button
                onClick={() => go({ group: g, member: null })}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left ${q.group === g ? "bg-surface-3 font-semibold" : "hover:bg-surface-2"}`}
              >
                <span>{g ?? t("allGroups")}</span>
                <span className="text-xs text-ink-3 tabular-nums">{groupCount(g)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {members.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-3">{t("member")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={() => go({ member: null })} className={chip(!q.member)}>
              {t("allMembers")}
            </button>
            {members.map((m) => (
              <button key={m} onClick={() => go({ member: m })} className={chip(q.member === m)}>
                {m} <span className="opacity-60 tabular-nums">{facets.members.get(m) ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!free && (
        <div>
          <p className="text-xs font-semibold text-ink-3">{t("type")}</p>
          <div className="mt-2 space-y-1.5">
            {RARITIES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={q.types.includes(r)}
                  onChange={() => go({ types: q.types.includes(r) ? q.types.filter((x) => x !== r) : [...q.types, r] })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {tRarity(r)}
              </label>
            ))}
          </div>
        </div>
      )}

      <PriceRange key={`${q.min}-${q.max}`} min={q.min} max={q.max} onApply={(min, max) => go({ min, max })} />

      {!free && (
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={q.listedOnly} onChange={() => go({ listedOnly: !q.listedOnly })} className="h-4 w-4 accent-[var(--accent)]" />
          {t("listedOnly")}
        </label>
      )}

      {activeCount > 0 && (
        <button onClick={() => go({ group: null, member: null, types: [], min: null, max: null, listedOnly: false })} className="text-xs font-semibold text-accent-ink hover:underline">
          {t("clear")}
        </button>
      )}
    </div>
  );

  return (
    <div ref={top} className="scroll-mt-24">
      <div role="tablist" className="mb-5 flex gap-2">
        {LANES.map((lane) => (
          <button
            key={lane}
            role="tab"
            aria-selected={q.lane === lane}
            onClick={() => go({ lane, group: null, member: null, types: [], listedOnly: false })}
            className={`rounded-2xl border px-4 py-2.5 text-left transition ${q.lane === lane ? "border-ink bg-surface" : "border-line text-ink-2 hover:border-line-strong"}`}
          >
            <span className="block text-sm font-semibold">
              {t(`lane_${lane}`)} <span className="font-normal text-ink-3 tabular-nums">{lane === "vault" ? CARDS.length : (listings?.length ?? "…")}</span>
            </span>
            <span className="block text-[11px] text-ink-3">{t(`laneHint_${lane}`)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-60 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 focus-within:border-ink">
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" />
          </svg>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </label>
        <button onClick={() => setShowFilters((v) => !v)} className="rounded-full border border-line px-4 py-2.5 text-sm font-medium lg:hidden">
          {t("filters")}
          {activeCount > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{activeCount}</span>}
        </button>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <span className="hidden sm:inline">{t("sortLabel")}</span>
          <select value={q.sort} onChange={(e) => go({ sort: e.target.value as MarketQuery["sort"] })} className="rounded-full border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none">
            {SORTS.filter((s) => !free || s !== "trending").map((s) => (
              <option key={s} value={s}>
                {t(`sort_${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className={`${showFilters ? "block" : "hidden"} rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-24 lg:block lg:self-start lg:border-0 lg:p-0`}>{filters}</aside>

        <div>
          {free && <p className="mb-4 rounded-xl bg-notice-bg px-4 py-3 text-xs leading-relaxed text-notice-ink">{tListing("disclaimerShort")}</p>}
          <p className="text-sm text-ink-2">{t("results", { count: result.total })}</p>
          {free && listings === null ? (
            <div className="mt-4 h-64 animate-pulse rounded-2xl bg-surface-2" />
          ) : result.items.length ? (
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
              {free ? freeResult.items.map((l) => <ListingTile key={l.id} listing={l} />) : vaultResult.items.map((c) => <HoloTile key={c.id} card={c} />)}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-2">
              {free && !listings?.length ? tListing("empty") : t("noResults")}
              {free && (
                <button onClick={() => openAddCard()} className="btn-primary mx-auto mt-4 block rounded-full px-5 py-2.5 text-sm font-semibold">
                  {tListing("sellYours")}
                </button>
              )}
            </div>
          )}

          {result.pages > 1 && (
            <nav aria-label="pagination" className="mt-12 flex items-center justify-center gap-1.5">
              <button
                disabled={result.page === 1}
                onClick={() => go({ page: result.page - 1 }, true)}
                className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-40"
              >
                {t("prev")}
              </button>
              {Array.from({ length: result.pages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  aria-current={n === result.page ? "page" : undefined}
                  onClick={() => go({ page: n }, true)}
                  className={`h-9 w-9 rounded-full text-sm tabular-nums ${n === result.page ? "bg-ink font-semibold text-bg" : "hover:bg-surface-2"}`}
                >
                  {n}
                </button>
              ))}
              <button
                disabled={result.page === result.pages}
                onClick={() => go({ page: result.page + 1 }, true)}
                className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-40"
              >
                {t("next")}
              </button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceRange({ min, max, onApply }: { min: number | null; max: number | null; onApply: (min: number | null, max: number | null) => void }) {
  const t = useTranslations("Market");
  const [lo, setLo] = useState(min?.toString() ?? "");
  const [hi, setHi] = useState(max?.toString() ?? "");
  const apply = () => onApply(lo === "" ? null : Math.max(0, Number(lo)), hi === "" ? null : Math.max(0, Number(hi)));
  const input = "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-ink";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <p className="text-xs font-semibold text-ink-3">{t("price")}</p>
      <div className="mt-2 flex items-center gap-2">
        <input inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value.replace(/[^\d.]/g, ""))} onBlur={apply} placeholder={t("min")} aria-label={t("min")} className={input} />
        <span className="text-ink-3">–</span>
        <input inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value.replace(/[^\d.]/g, ""))} onBlur={apply} placeholder={t("max")} aria-label={t("max")} className={input} />
      </div>
    </form>
  );
}
