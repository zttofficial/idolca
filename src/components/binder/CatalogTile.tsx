"use client";

import { useTranslations } from "next-intl";
import { openAddCard } from "./AddCard";
import CardArt from "@/components/market/CardArt";
import { Link } from "@/i18n/navigation";
import { binderActions, useBinder } from "@/lib/binder";
import { templateCard, type Template } from "@/lib/catalog";
import { formatPrice } from "@/lib/fx";
import { useTemplateMarket, useVaultCards } from "@/lib/chain-client";
import { track } from "@/lib/analytics";

// 圖鑑裡的一個卡款：標記「有 / 想要」，看真實在售數量和最低價
export default function CatalogTile({ template }: { template: Template }) {
  const t = useTranslations("Catalog");
  const tRarity = useTranslations("Rarity");
  const binder = useBinder();
  const entry = binder.have[template.id];
  const wanted = Boolean(binder.want[template.id]);
  const base = templateCard(template, useVaultCards());
  const card = entry?.photo ? { ...base, image: { front: entry.photo } } : base;
  const market = useTemplateMarket()(template);
  // 收藏冊還是空的時候這一下就是第一次勾卡
  const firstMark = (kind: "have" | "want") => {
    if (!Object.keys(binder.have).length && !Object.keys(binder.want).length) track("binder_marked", { group: template.groupId, kind });
  };

  return (
    <div>
      <div className={`relative aspect-[55/85] overflow-hidden rounded-xl ${entry ? "ring-2 ring-accent" : ""}`}>
        <CardArt card={card} rarityLabel={tRarity(template.rarity)} className={`block h-full w-full ${entry ? "" : "opacity-90"}`} />
        {entry && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
            ×{entry.count}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-xs font-semibold">{template.member}</p>
      <p className="truncate text-[11px] text-ink-3">{template.version}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-2">
        {!market ? (
          <span className="text-ink-3">…</span>
        ) : market.forSale && market.fromUsdt !== null ? (
          market.vaultCardId ? (
            <Link href={`/card/${market.vaultCardId}`} className="text-accent-ink hover:underline">
              {t("forSale", { count: market.forSale, price: formatPrice(market.fromUsdt) })}
            </Link>
          ) : (
            <Link href={`/market?lane=free&q=${encodeURIComponent(`${template.member} ${template.version}`)}`} className="text-accent-ink hover:underline">
              {t("forSale", { count: market.forSale, price: formatPrice(market.fromUsdt) })}
            </Link>
          )
        ) : (
          <span className="text-ink-3">{t("noneForSale")}</span>
        )}
      </p>
      {entry && (
        <button
          onClick={() => openAddCard({ group: template.group, member: template.member, album: template.album, version: template.version })}
          className="mt-1.5 text-[11px] font-semibold text-accent-ink hover:underline"
        >
          {t("mint")}
        </button>
      )}
      <div className="mt-2 flex gap-1.5">
        {entry ? (
          <div className="flex flex-1 items-center justify-between rounded-full border border-accent px-1 text-xs">
            <button
              onClick={() => binderActions.setCount(template.id, entry.count - 1)}
              className="h-7 w-7 rounded-full hover:bg-accent-soft"
              aria-label="−"
            >
              −
            </button>
            <span className="font-semibold text-accent-ink">{t("have")}</span>
            <button
              onClick={() => binderActions.setCount(template.id, entry.count + 1)}
              className="h-7 w-7 rounded-full hover:bg-accent-soft"
              aria-label="+"
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              firstMark("have");
              binderActions.toggleHave(template.id);
            }}
            className="h-8 flex-1 rounded-full border border-line text-xs font-semibold hover:bg-surface-2"
          >
            {t("have")}
          </button>
        )}
        <button
          onClick={() => {
            firstMark("want");
            binderActions.toggleWant(template.id);
          }}
          aria-pressed={wanted}
          aria-label={t("want")}
          title={t("want")}
          className={`grid h-8 w-8 place-items-center rounded-full border ${wanted ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}
        >
          <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 ${wanted ? "fill-accent text-accent" : "fill-none text-ink-2"}`} stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M10 17s-6.5-3.9-6.5-8.4A3.6 3.6 0 0 1 10 6.3a3.6 3.6 0 0 1 6.5 2.3C16.5 13.1 10 17 10 17Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
