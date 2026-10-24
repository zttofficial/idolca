"use client";

import { useTranslations } from "next-intl";
import CardArt from "@/components/market/CardArt";
import type { Card } from "@/lib/cards";
import type { Template } from "@/lib/catalog";
import type { BinderEntry } from "@/lib/binder";
import type { CollectorItem } from "@/lib/items";
import { itemTitle } from "@/lib/item-title";

// 收藏冊卡套裡的三種卡，/binder 和公開收藏冊共用。沒給 onSelect 時只畫卡面，不能點

export type Owned = { template: Template; entry: BinderEntry };

// 手動標記的卡（不是鏈上的卡）：虛線框加「僅記錄」標籤，和真卡分開。沒給 onSelect 時只畫卡面，不能點（整理收藏冊時用）。
// card 由收藏冊算好傳進來，不在每個卡套裡各自讀一次金庫清單
export function Pocket({ owned, card, onSelect }: { owned: Owned; card: Card; onSelect?: () => void }) {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const Tag = onSelect ? "button" : "span";
  return (
    <Tag onClick={onSelect} className="group relative block h-full w-full overflow-hidden rounded-[5px] border-2 border-dashed border-ink-3/60 text-left">
      {card.image ? (
        <CardArt card={card} rarityLabel={tRarity(owned.template.rarity)} className="block h-full w-full" />
      ) : (
        // 還沒有照片的卡款：簡潔的文字卡，不畫剪影佔位圖
        <span className="flex h-full w-full flex-col justify-between bg-white p-2.5">
          <span className="text-[10px] font-semibold tracking-wide text-ink-3 uppercase">{tRarity(owned.template.rarity)}</span>
          <span>
            <span className="block text-sm leading-tight font-bold">{owned.template.member}</span>
            <span className="mt-0.5 block text-[10px] leading-snug text-ink-2">{owned.template.version}</span>
            <span className="block truncate text-[10px] text-ink-3">{owned.template.album}</span>
          </span>
        </span>
      )}
      {owned.entry.count > 1 && <span className="absolute top-1 right-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-bold text-white">×{owned.entry.count}</span>}
      <span className="absolute inset-x-0 bottom-0 bg-ink/55 py-0.5 text-center text-[9px] font-semibold tracking-wide text-white">{t("trackedOnly")}</span>
      <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
    </Tag>
  );
}

// 自己上鏈的卡：只放照片，狀態和價格在點開的詳情裡；假卡打紅框、轉灰階並蓋上斜向 FAKE 字樣。公開收藏冊只給顯示要用的欄位
export function ItemPocket({ item, onSelect }: { item: Pick<CollectorItem, "photo" | "title" | "group" | "member" | "version" | "verification">; onSelect?: () => void }) {
  const fake = item.verification === "fake";
  const Tag = onSelect ? "button" : "span";
  return (
    <Tag onClick={onSelect} className={`group relative block h-full w-full overflow-hidden text-left ${fake ? "ring-2 ring-down ring-inset" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
      <img src={item.photo} alt={itemTitle(item)} className={`h-full w-full object-cover ${fake ? "grayscale" : ""}`} />
      {fake && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="-rotate-[30deg] rounded border-2 border-down bg-white/70 px-2 text-lg font-black tracking-widest text-down">FAKE</span>
        </span>
      )}
      <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
    </Tag>
  );
}

// 錢包裡的金庫卡：和自己上鏈的卡一樣先打開詳情，再從詳情進卡片頁
export function VaultSlot({ card, onSelect }: { card: Card; onSelect?: () => void }) {
  const tRarity = useTranslations("Rarity");
  const Tag = onSelect ? "button" : "span";
  return (
    <Tag onClick={onSelect} className="group relative block h-full w-full overflow-hidden text-left">
      <CardArt card={card} rarityLabel={tRarity(card.rarity)} className="block h-full w-full" />
      <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
    </Tag>
  );
}
