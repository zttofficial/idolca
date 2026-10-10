"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import CatalogTile from "./CatalogTile";
import { useBinder } from "@/lib/binder";
import type { Template } from "@/lib/catalog";

// 團體圖鑑：按成員篩選，按專輯分組
export default function CatalogGrid({ members, templates }: { members: string[]; templates: Template[] }) {
  const t = useTranslations("Catalog");
  const binder = useBinder();
  const [member, setMember] = useState<string | null>(null);
  const shown = member ? templates.filter((x) => x.member === member) : templates;
  const albums = [...new Set(shown.map((x) => x.albumId))];

  return (
    <div>
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
