"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RARITY_LIST, type Card } from "@/lib/cards";
import { useVaultCards } from "@/lib/chain-client";

// 3D 卡（three.js）和金庫卡資料同時下載：Hero 一掛上就開始載入，不等卡片資料到了才開始
const loadHoloCard = () => import("./HoloCard3D");
const HoloCard3D = dynamic(loadHoloCard, {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="aspect-[55/85] h-2/3 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  ),
});

// 首頁展示金庫裡最稀有、有實拍照的三張卡；同樣稀有、同樣評級時入庫最早的在前
function pickHero(cards: Card[]) {
  return cards
    .filter((c) => c.image)
    .sort((a, b) => RARITY_LIST.indexOf(b.rarity) - RARITY_LIST.indexOf(a.rarity) || (b.grade?.score ?? 0) - (a.grade?.score ?? 0) || a.intakeDate.localeCompare(b.intakeDate))
    .slice(0, 3);
}

export default function Hero() {
  const t = useTranslations("Hero");
  const vault = useVaultCards();
  const heroCards = vault ? pickHero(vault) : null;
  useEffect(() => {
    void loadHoloCard();
  }, []);

  return (
    <section className="relative mx-auto grid page-width items-center gap-10 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
      <div className="relative z-10">
        <p className="text-xs font-semibold tracking-[0.2em] text-accent-ink">{t("badge")}</p>
        <h1 className="mt-6 text-4xl leading-tight font-extrabold tracking-tight sm:text-6xl">
          {t("titleLine1")}
          <br />
          <span className="text-accent-ink">{t("titleLine2")}</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">{t("body")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/market" className="btn-primary rounded-full px-6 py-3 text-sm font-semibold">
            {t("browse")}
          </Link>
          <Link href="/binder" className="btn-secondary rounded-full px-6 py-3 text-sm font-semibold backdrop-blur">
            {t("startBinder")}
          </Link>
        </div>
      </div>

      {heroCards === null ? (
        <div className="flex h-[460px] items-center justify-center sm:h-[560px]">
          <div className="aspect-[55/85] h-2/3 animate-pulse rounded-2xl bg-surface-2" />
        </div>
      ) : (
        heroCards.length > 0 && <Showcase cards={heroCards} />
      )}
    </section>
  );
}

function Showcase({ cards }: { cards: Card[] }) {
  const t = useTranslations("Hero");
  const tRarity = useTranslations("Rarity");
  const [active, setActive] = useState(0);
  const card = cards[Math.min(active, cards.length - 1)];
  const rarityLabel = tRarity(card.rarity);
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-0 -z-0 rounded-full opacity-60 blur-3xl transition-colors duration-700"
        style={{
          background: "radial-gradient(circle at 50% 45%, rgba(232, 40, 90, 0.10), transparent 60%)",
        }}
      />
      <div className="relative h-[460px] sm:h-[560px]">
        <HoloCard3D card={card} rarityLabel={rarityLabel} />
      </div>
      <div className="relative mt-2 flex flex-col items-center gap-3">
        <div className="flex gap-2">
          {cards.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActive(i)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                i === active ? "border-line-strong bg-surface-3 text-ink" : "border-line bg-surface-2 text-ink-3 hover:text-ink"
              }`}
            >
              {c.member}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-3">
          {card.serial} · {rarityLabel} · On Solana · {t("hint")}
        </p>
      </div>
    </div>
  );
}
