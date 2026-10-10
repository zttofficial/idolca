"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import CatalogTile from "./CatalogTile";
import { useBinder } from "@/lib/binder";
import type { Template } from "@/lib/catalog";
import { RARITIES } from "@/lib/market";
import type { Rarity } from "@/lib/mock-cards";

// 團體圖鑑：按成員、類型篩選，可搜尋版本名稱，按專輯分組
export default function CatalogGrid({ members, templates }: { members: string[]; templates: Template[] }) {
  const t = useTranslations("Catalog");
  const tRarity = useTranslations("Rarity");
  const binder = useBinder();
  const [member, setMember] = useState<string | null>(null);
  const [type, setType] = useState<Rarity | null>(null);
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = templates.filter(
    (x) =>
      (!member || x.member === member) &&
      (!type || x.rarity === type) &&
      words.every((w) => `${x.member} ${x.album} ${x.version}`.toLowerCase().includes(w)),
  );
  const albums = [...new Set(shown.map((x) => x.albumId))];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="w-full rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-ink sm:w-72"
        />
        <div className="flex flex-wrap gap-1.5">
          {[null, ...RARITIES].map((r) => (
            <button
              key={r ?? "all"}
              onClick={() => setType(r)}
              className={`rounded-full border px-3 py-1.5 text-xs ${type === r ? "border-line-strong bg-ink text-bg" : "border-line text-ink-2 hover:text-ink"}`}
            >
              {r ? tRarity(r) : t("allTypes")}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {[null, ...members].map((m) => {
          const pool = m ? templates.filter((x) => x.member === m) : templates;
          if (!pool.length) return null;
          const have = pool.filter((x) => binder.have[x.id]).length;
          return (
            <button
              key={m ?? "all"}
              onClick={() => setMember(m)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                member === m ? "border-line-strong bg-ink text-bg" : "border-line text-ink-2 hover:text-ink"
              }`}
            >
              {m ?? t("allMembers")}
              <span className="ml-1.5 opacity-60 tabular-nums">
                {have}/{pool.length}
              </span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && <p className="mt-10 text-center text-sm text-ink-3">{t("noResults")}</p>}
      {albums.map((albumId) => {
        const list = shown.filter((x) => x.albumId === albumId);
        return (
          <section key={albumId} className="mt-8">
            <h2 className="text-lg font-bold">{list[0].album}</h2>
            <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
              {list.map((x) => (
                <CatalogTile key={x.id} template={x} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
