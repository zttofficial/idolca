"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { HERO_CARDS, VAULT_STATS } from "@/lib/mock-cards";

const HoloCard3D = dynamic(() => import("./HoloCard3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="aspect-[55/85] h-2/3 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  ),
});

const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export default function Hero() {
  const t = useTranslations("Hero");
  const tRarity = useTranslations("Rarity");
  const [active, setActive] = useState(0);
  const card = HERO_CARDS[active];
  const rarityLabel = tRarity(card.rarity);

  const stats = [
    { label: t("statVaultValue"), value: compact(VAULT_STATS.totalValueUsdt) },
    { label: t("statHolders"), value: VAULT_STATS.holders.toLocaleString("en-US") },
    { label: t("statVolume"), value: compact(VAULT_STATS.volume24hUsdt) },
  ];

  return (
    <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
      <div className="relative z-10">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-accent-ink backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" />
          {t("badge")}
        </p>
        <h1 className="mt-6 text-4xl leading-tight font-extrabold tracking-tight sm:text-6xl">
          {t("titleLine1")}
          <br />
          <span className="text-accent-ink">{t("titleLine2")}</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg">
          {t("body")}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#market" className="btn-primary rounded-full px-6 py-3 text-sm font-semibold">
            {t("browse")}
          </a>
          <a
            href="#how"
            className="rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold text-ink backdrop-blur transition hover:bg-surface-3"
          >
            {t("consign")}
          </a>
        </div>
        <dl className="mt-12 grid max-w-lg grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-ink-3">{s.label}</dt>
              <dd className="mt-1 text-2xl font-bold text-ink tabular-nums sm:text-3xl">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>

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
            {HERO_CARDS.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setActive(i)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  i === active
                    ? "border-line-strong bg-surface-3 text-ink"
                    : "border-line bg-surface-2 text-ink-3 hover:text-ink"
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
    </section>
  );
}
