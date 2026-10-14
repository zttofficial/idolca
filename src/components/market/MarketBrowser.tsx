"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import HoloTile from "./HoloTile";
import ListingTile from "./ListingTile";
import TileSkeleton from "./TileSkeleton";
import { openAddCard } from "@/components/binder/AddCard";
import { useListings, useVaultCards } from "@/lib/chain-client";
import Select from "@/components/ui/Select";
import { LANES, RARITIES, SORTS, applyListingQuery, applyQuery, facetCounts, parseQuery, toSearch, type MarketQuery } from "@/lib/market";
import { countOf, sameName } from "@/lib/facets";
import { ClearFilters, FilterPanel, FiltersButton, GroupMemberFilter, SearchField } from "./CardFilters";

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
  const listings = useListings();
  const vault = useVaultCards();
  const cards = useMemo(() => vault ?? [], [vault]);
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

  const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });
  const groups = free ? [...new Set((listings ?? []).map((l) => l.group))].sort(byName) : [...new Set(cards.map((c) => c.group))].sort(byName);
  const groupCount = (g: string | null) => (free ? (listings ?? []).filter((l) => !g || sameName(l.group, g)).length : g ? countOf(facets.groups, g) : facets.total);
  const members = q.group && !free ? [...new Set(cards.filter((c) => sameName(c.group, q.group!)).map((c) => c.member))].sort(byName) : [];
  const activeCount = (q.group ? 1 : 0) + (q.member ? 1 : 0) + q.types.length + (q.min !== null || q.max !== null ? 1 : 0) + (q.listedOnly ? 1 : 0);

  const filters = (
    <>
      <GroupMemberFilter
        groups={groups.map((g) => ({ name: g, count: groupCount(g) }))}
        total={groupCount(null)}
        members={members.map((m) => ({ name: m, count: countOf(facets.members, m) }))}
        group={q.group}
        member={q.member}
        onGroup={(group) => go({ group, member: null })}
        onMember={(member) => go({ member })}
      />

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

      {activeCount > 0 && <ClearFilters onClick={() => go({ group: null, member: null, types: [], min: null, max: null, listedOnly: false })} />}
    </>
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
              {t(`lane_${lane}`)} <span className="font-normal text-ink-3 tabular-nums">{lane === "vault" ? (vault?.length ?? "…") : (listings?.length ?? "…")}</span>
            </span>
            <span className="block text-[11px] text-ink-3">{t(`laneHint_${lane}`)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchField value={q.q} onSearch={(text) => go({ q: text })} placeholder={t("searchPlaceholder")} />
        <FiltersButton active={activeCount} onClick={() => setShowFilters((v) => !v)} />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <span className="hidden sm:inline">{t("sortLabel")}</span>
          <Select
            value={q.sort}
            onChange={(sort) => go({ sort })}
            options={SORTS.map((s) => ({ value: s, label: t(`sort_${s}`) }))}
            ariaLabel={t("sortLabel")}
            className="rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none hover:bg-surface-2"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
        <FilterPanel open={showFilters}>{filters}</FilterPanel>

        {/* min-w-0：結果欄不被裡面的內容撐寬，窄螢幕上不出現橫向捲動 */}
        <div className="min-w-0">
          {free && <p className="mb-4 rounded-xl bg-notice-bg px-4 py-3 text-xs leading-relaxed text-notice-ink">{tListing("disclaimerShort")}</p>}
          <p className="text-sm text-ink-2">{t("results", { count: result.total })}</p>
          {(free ? listings === null : vault === null) ? (
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <TileSkeleton key={i} />
              ))}
            </div>
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
            <nav aria-label="pagination" className="mt-12 flex flex-wrap items-center justify-center gap-1.5">
              <button
                disabled={result.page === 1}
                onClick={() => go({ page: result.page - 1 }, true)}
                className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-40"
              >
                {t("prev")}
              </button>
              {pageList(result.page, result.pages).map((n, i) =>
                n === null ? (
                  <span key={`gap-${i}`} className="w-6 text-center text-sm text-ink-3" aria-hidden>
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    aria-current={n === result.page ? "page" : undefined}
                    onClick={() => go({ page: n }, true)}
                    className={`h-9 w-9 rounded-full text-sm tabular-nums ${n === result.page ? "bg-ink font-semibold text-bg" : "hover:bg-surface-2"}`}
                  >
                    {n}
                  </button>
                ),
              )}
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

// 頁碼太多時只列第一頁、最後一頁和目前這頁前後各一頁，跳過的用 null（顯示成 …）
function pageList(page: number, pages: number): (number | null)[] {
  const keep = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  keep.forEach((n, i) => {
    if (i > 0 && n - keep[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}
