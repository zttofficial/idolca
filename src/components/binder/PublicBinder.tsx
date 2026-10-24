"use client";

import { useTranslations } from "next-intl";
import CardArt from "@/components/market/CardArt";
import { findTemplate, GROUPS, templateCard, type Template } from "@/lib/catalog";
import { useVaultCards } from "@/lib/chain-client";

// 公開收藏冊的兩份清單：有的卡（帶張數）和想要的卡，按團體分組。只讀，卡面和圖鑑一樣：金庫裡有這個卡款就用實拍照，否則畫佔位卡面
export default function PublicBinderView({ have, want }: { have: { id: string; count: number }[]; want: string[] }) {
  const t = useTranslations("PublicBinder");
  const counts = new Map(have.map((h) => [h.id, h.count]));
  return (
    <>
      <CardSection title={t("haveTitle")} empty={t("haveEmpty")} templates={have.map((h) => findTemplate(h.id)!)} counts={counts} />
      <CardSection title={t("wantTitle")} empty={t("wantEmpty")} templates={want.map((id) => findTemplate(id)!)} />
    </>
  );
}

function CardSection({ title, empty, templates, counts }: { title: string; empty: string; templates: Template[]; counts?: Map<string, number> }) {
  const groups = GROUPS.filter((g) => templates.some((x) => x.groupId === g.id));
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold tracking-tight">
        {title} <span className="text-ink-3 tabular-nums">{templates.length}</span>
      </h2>
      {groups.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-3">{empty}</p>}
      {groups.map((g) => {
        const list = templates.filter((x) => x.groupId === g.id);
        return (
          <div key={g.id} className="mt-6">
            <h3 className="text-sm font-semibold text-ink-2">
              {g.name} <span className="text-ink-3 tabular-nums">· {list.length}</span>
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
              {list.map((x) => (
                <Tile key={x.id} template={x} count={counts?.get(x.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Tile({ template, count }: { template: Template; count?: number }) {
  const tRarity = useTranslations("Rarity");
  const card = templateCard(template, useVaultCards());
  return (
    <div>
      <div className="relative aspect-[55/85] overflow-hidden rounded-xl">
        <CardArt card={card} rarityLabel={tRarity(template.rarity)} className="block h-full w-full" />
        {count !== undefined && count > 1 && <span className="absolute top-1.5 right-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">×{count}</span>}
      </div>
      <p className="mt-2 truncate text-xs font-semibold">{template.member}</p>
      <p className="truncate text-[11px] text-ink-3">
        {template.album} · {template.version}
      </p>
    </div>
  );
}
