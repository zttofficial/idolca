"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Facet } from "@/lib/facets";
import { sameName } from "@/lib/facets";

// 市場和收藏冊共用的篩選元件：搜尋框、團體 → 成員兩層切換（KOCA 的「切換藝人與角色」）、篩選按鈕和兩種面板。
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

// 團體清單和選定團體的成員標籤，選項旁顯示數量；選了團體才出現成員
export function GroupMemberFilter({
  groups,
  total,
  members,
  group,
  member,
  onGroup,
  onMember,
  layout = "list",
}: {
  groups: Facet[];
  total: number;
  members: Facet[];
  group: string | null;
  member: string | null;
  onGroup: (group: string | null) => void;
  onMember: (member: string | null) => void;
  // list：側欄裡一行一個團體；chips：上方面板裡和成員一樣排成標籤，團體多時換行，不拉長版面
  layout?: "list" | "chips";
}) {
  const t = useTranslations("Market");
  const isGroup = (g: string | null) => (g === null ? group === null : group !== null && sameName(g, group));
  return (
    <>
      <div>
        <p className="text-xs font-semibold text-ink-3">{t("group")}</p>
        {layout === "chips" ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[{ name: null, count: total }, ...groups].map((g) => (
              <button key={g.name ?? "all"} onClick={() => onGroup(g.name)} className={chip(isGroup(g.name))}>
                {g.name ?? t("allGroups")} <span className="opacity-60 tabular-nums">{g.count}</span>
              </button>
            ))}
          </div>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {[{ name: null, count: total }, ...groups].map((g) => (
              <li key={g.name ?? "all"}>
                <button
                  onClick={() => onGroup(g.name)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left ${isGroup(g.name) ? "bg-surface-3 font-semibold" : "hover:bg-surface-2"}`}
                >
                  <span>{g.name ?? t("allGroups")}</span>
                  <span className="text-xs text-ink-3 tabular-nums">{g.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {members.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-3">{t("member")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={() => onMember(null)} className={chip(!member)}>
              {t("allMembers")}
            </button>
            {members.map((m) => (
              <button key={m.name} onClick={() => onMember(m.name)} className={chip(member !== null && sameName(member, m.name))}>
                {m.name} <span className="opacity-60 tabular-nums">{m.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
