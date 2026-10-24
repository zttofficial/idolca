"use client";

import { useTranslations } from "next-intl";
import CardArt from "@/components/market/CardArt";
import { Link } from "@/i18n/navigation";
import { findTemplate, GROUPS, templateCard, type Template } from "@/lib/catalog";
import { useVaultCards } from "@/lib/chain-client";
import type { PublicSlot } from "@/lib/server/public-binder";
import BinderBook from "./BinderBook";
import { ItemPocket, Pocket, VaultSlot } from "./BinderSlots";

// 公開收藏冊：冊子用和 /binder 同一本卡冊、同樣的卡套，照用戶的擺法排；金庫卡點了到卡片頁。想要的卡款按團體分組。只讀，不顯示張數
export default function PublicBinderView({ slots, want }: { slots: (PublicSlot | null)[]; want: string[] }) {
  const t = useTranslations("PublicBinder");
  const vault = useVaultCards();
  const count = slots.filter(Boolean).length;
  return (
    <>
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight">
          {t("haveTitle")} <span className="text-ink-3 tabular-nums">{count}</span>
        </h2>
        {count === 0 ? (
          <Empty text={t("haveEmpty")} />
        ) : (
          <div className="mt-6">
            <BinderBook slots={slots.map((slot, i) => (slot ? <SlotView key={i} slot={slot} vault={vault} /> : null))} />
          </div>
        )}
      </section>
      <WantSection title={t("wantTitle")} empty={t("wantEmpty")} templates={want.map((id) => findTemplate(id)).filter((x): x is Template => Boolean(x))} />
    </>
  );
}

function SlotView({ slot, vault }: { slot: PublicSlot; vault: ReturnType<typeof useVaultCards> }) {
  if (slot.kind === "vault")
    return (
      <Link href={`/card/${slot.card.id}`} className="block h-full w-full">
        <VaultSlot card={slot.card} />
      </Link>
    );
  if (slot.kind === "item") return <ItemPocket item={slot.item} />;
  const template = findTemplate(slot.templateId);
  // 張數不公開：卡套裡一律當一張畫
  return template ? <Pocket owned={{ template, entry: { count: 1 } }} card={templateCard(template, vault)} /> : null;
}

function Empty({ text }: { text: string }) {
  return <p className="mt-4 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-3">{text}</p>;
}

function WantSection({ title, empty, templates }: { title: string; empty: string; templates: Template[] }) {
  const groups = GROUPS.filter((g) => templates.some((x) => x.groupId === g.id));
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold tracking-tight">
        {title} <span className="text-ink-3 tabular-nums">{templates.length}</span>
      </h2>
      {groups.length === 0 && <Empty text={empty} />}
      {groups.map((g) => {
        const list = templates.filter((x) => x.groupId === g.id);
        return (
          <div key={g.id} className="mt-6">
            <h3 className="text-sm font-semibold text-ink-2">
              {g.name} <span className="text-ink-3 tabular-nums">· {list.length}</span>
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
              {list.map((x) => (
                <Tile key={x.id} template={x} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Tile({ template }: { template: Template }) {
  const tRarity = useTranslations("Rarity");
  const card = templateCard(template, useVaultCards());
  return (
    <div>
      <div className="relative aspect-[55/85] overflow-hidden rounded-xl">
        <CardArt card={card} rarityLabel={tRarity(template.rarity)} className="block h-full w-full" />
      </div>
      <p className="mt-2 truncate text-xs font-semibold">{template.member}</p>
      <p className="truncate text-[11px] text-ink-3">
        {template.album} · {template.version}
      </p>
    </div>
  );
}
