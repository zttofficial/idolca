"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { hit, sameGroup, sameName, type CategoryFacet, type Facet } from "@/lib/facets";
import { categoryOf, findDirectoryGroup, type Category, type CategoryKey } from "@/lib/directory";

// 市場和收藏冊共用的篩選元件：搜尋框、品類 → 團體 → 成員三層切換（KOCA 的星球和「切換藝人與角色」）、篩選按鈕和兩種面板。
// 市場用側欄（大螢幕固定在左邊）；收藏冊用卡冊上方可收起的面板，不擠占卡冊的寬度。條件都由呼叫方寫進網址，這裡只負責畫和回報

export const chip = (active: boolean) => `rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-line-strong bg-ink text-bg" : "border-line text-ink-2 hover:text-ink"}`;

// 搜尋框：輸入停頓 300ms 再回報，網址不會每打一個字就換一次
export function SearchField({ value, onSearch, placeholder }: { value: string; onSearch: (q: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  const lastSent = useRef(value);
  useEffect(() => {
    if (text === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = text;
      onSearch(text.trim());
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSearch 依賴呼叫方最新的條件，只在輸入變化時觸發
  }, [text]);
  return (
    <label className="flex min-w-60 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 focus-within:border-ink">
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="9" cy="9" r="6" />
        <path d="m14 14 4 4" />
      </svg>
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
      />
    </label>
  );
}

// 展開、收起篩選面板的按鈕，旁邊標出生效中的條件數。側欄在大螢幕上一直顯示，按鈕只在窄螢幕出現；上方面板各種寬度都用按鈕收起
export function FiltersButton({ active, open, onClick, always = false }: { active: number; open?: boolean; onClick: () => void; always?: boolean }) {
  const t = useTranslations("Market");
  return (
    <button onClick={onClick} aria-expanded={open} className={`rounded-full border px-4 py-2.5 text-sm font-medium ${open ? "border-ink" : "border-line"} ${always ? "" : "lg:hidden"}`}>
      {t("filters")}
      {active > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{active}</span>}
    </button>
  );
}

// 篩選側欄：大螢幕固定在左邊，窄螢幕由 FiltersButton 展開
export function FilterPanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <aside className={`${open ? "block" : "hidden"} rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-24 lg:block lg:self-start lg:border-0 lg:p-0`}>
      <div className="space-y-6 text-sm">{children}</div>
    </aside>
  );
}

// 上方面板：收藏冊用，收起時完全不占位置
export function FilterBar({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return null;
  return <div className="mb-5 space-y-4 rounded-2xl border border-line bg-surface p-4 text-sm">{children}</div>;
}

export function ClearFilters({ onClick }: { onClick: () => void }) {
  const t = useTranslations("Market");
  return (
    <button onClick={onClick} className="text-xs font-semibold text-accent-ink hover:underline">
      {t("clear")}
    </button>
  );
}

const CATEGORY_LABEL: Record<Category, string> = { kpop: "K-pop", jpop: "J-pop", cpop: "C-pop", tpop: "T-pop" };

// 品類 → 團體的二級選單和選定團體的成員標籤，選項旁顯示數量；選了團體才出現成員。
// list：側欄用，品類是可展開的一級選單，展開後是可捲動的團體清單；團體多時有搜尋框，搜尋時跨品類列出命中的團體。
// chips：收藏冊上方面板用，品類和團體都排成標籤，團體多時換行，不拉長版面
export function GroupMemberFilter({
  tree,
  total,
  members,
  category,
  group,
  member,
  onCategory,
  onGroup,
  onMember,
  layout = "list",
}: {
  tree: CategoryFacet[];
  total: number;
  members: Facet[];
  category: CategoryKey | null;
  group: string | null;
  member: string | null;
  onCategory: (category: CategoryKey | null) => void;
  onGroup: (group: string | null) => void;
  onMember: (member: string | null) => void;
  layout?: "list" | "chips";
}) {
  const t = useTranslations("Market");
  const label = (key: CategoryKey) => (key === "other" ? t("otherCategory") : CATEGORY_LABEL[key]);
  // 選了團體時，它所在的品類就是目前的品類
  const active = group ? categoryOf(group) : category;
  const [open, setOpen] = useState<CategoryKey | null>(active);
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    setOpen(active);
  }
  const [find, setFind] = useState("");
  // 展開的團體清單捲到選定的團體（清單自己捲動，不動整頁）
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>("[aria-current]");
    if (list.current && el) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 3;
  }, [group, open]);
  const isGroup = (g: string) => group !== null && sameGroup(g, group);
  const groupCount = tree.reduce((n, c) => n + c.groups.length, 0);
  const found = find.trim()
    ? tree.flatMap((c) => c.groups.filter((g) => hit(`${g.name} ${findDirectoryGroup(g.name)?.aka?.join(" ") ?? ""}`, find.trim())).map((g) => ({ ...g, key: c.key })))
    : null;
  const pickCategory = (key: CategoryKey) => {
    if (open === key && active === key && !group) return setOpen(null);
    setOpen(key);
    onCategory(key);
  };

  const row = (g: Facet, hint?: string) => (
    <li key={g.name}>
      <button
        onClick={() => onGroup(g.name)}
        aria-current={isGroup(g.name) || undefined}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left ${isGroup(g.name) ? "bg-surface-3 font-semibold" : `hover:bg-surface-2 ${g.count ? "" : "text-ink-3"}`}`}
      >
        <span className="min-w-0 truncate">
          {g.name}
          {hint && <span className="ml-1.5 text-[11px] text-ink-3">{hint}</span>}
        </span>
        <span className="text-xs text-ink-3 tabular-nums">{g.count}</span>
      </button>
    </li>
  );

  const memberChips = members.length > 0 && (
    <div>
      <p className="text-xs font-semibold text-ink-3">{t("member")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => onMember(null)} className={chip(!member)}>
          {t("allMembers")}
        </button>
        {members.map((m) => (
          <button key={m.name} onClick={() => onMember(m.name)} className={`${chip(member !== null && sameName(member, m.name))} ${m.count ? "" : "opacity-60"}`}>
            {m.name} <span className="opacity-60 tabular-nums">{m.count}</span>
          </button>
        ))}
      </div>
    </div>
  );

  if (layout === "chips") {
    const shown = active ? (tree.find((c) => c.key === active)?.groups ?? []) : tree.flatMap((c) => c.groups);
    return (
      <>
        <div>
          <p className="text-xs font-semibold text-ink-3">{t("group")}</p>
          {tree.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => onCategory(null)} className={chip(!active)}>
                {t("allGroups")} <span className="opacity-60 tabular-nums">{total}</span>
              </button>
              {tree.map((c) => (
                <button key={c.key} onClick={() => onCategory(c.key)} className={chip(active === c.key && !group)}>
                  {label(c.key)} <span className="opacity-60 tabular-nums">{c.count}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tree.length <= 1 && (
              <button onClick={() => onGroup(null)} className={chip(!group)}>
                {t("allGroups")} <span className="opacity-60 tabular-nums">{total}</span>
              </button>
            )}
            {shown.map((g) => (
              <button key={g.name} onClick={() => onGroup(g.name)} className={chip(isGroup(g.name))}>
                {g.name} <span className="opacity-60 tabular-nums">{g.count}</span>
              </button>
            ))}
          </div>
        </div>
        {memberChips}
      </>
    );
  }

  return (
    <>
      <div>
        <p className="text-xs font-semibold text-ink-3">{t("group")}</p>
        {groupCount > 12 && (
          <input
            type="search"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder={t("searchGroups")}
            aria-label={t("searchGroups")}
            className="mt-2 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-3 focus:border-ink"
          />
        )}
        <ul className="mt-2 space-y-0.5">
          <li>
            <button
              onClick={() => onCategory(null)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left ${!active ? "bg-surface-3 font-semibold" : "hover:bg-surface-2"}`}
            >
              <span>{t("allGroups")}</span>
              <span className="text-xs text-ink-3 tabular-nums">{total}</span>
            </button>
          </li>
          {found ? (
            found.length ? (
              found.slice(0, 50).map((g) => row(g, label(g.key)))
            ) : (
              <li className="px-2.5 py-1.5 text-xs text-ink-3">{t("noGroups")}</li>
            )
          ) : (
            tree.map((c) => (
              <li key={c.key}>
                <button
                  onClick={() => pickCategory(c.key)}
                  aria-expanded={open === c.key}
                  className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left ${active === c.key && !group ? "bg-surface-3 font-semibold" : "hover:bg-surface-2"}`}
                >
                  <svg
                    viewBox="0 0 12 12"
                    className={`h-3 w-3 shrink-0 text-ink-3 transition ${open === c.key ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden
                  >
                    <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
                  </svg>
                  <span className="flex-1">{label(c.key)}</span>
                  <span className="text-xs text-ink-3 tabular-nums">{c.count}</span>
                </button>
                {open === c.key && (
                  <ul ref={list} className="relative mt-0.5 ml-3 max-h-72 space-y-0.5 overflow-y-auto border-l border-line pl-1.5">
                    {c.groups.map((g) => row(g))}
                  </ul>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
      {memberChips}
    </>
  );
}
