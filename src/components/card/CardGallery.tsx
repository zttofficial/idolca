"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { HoloCardFace } from "@/components/market/HoloTile";
import { CardBackArt } from "@/components/market/CardArt";
import type { Card } from "@/lib/mock-cards";

const HoloCard3D = dynamic(() => import("@/components/hero/HoloCard3D"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-white/5" />,
});

type View = "front" | "back" | "3d";

export default function CardGallery({ card }: { card: Card }) {
  const t = useTranslations("Detail");
  const tRarity = useTranslations("Rarity");
  const [view, setView] = useState<View>("front");
  const views: { id: View; label: string }[] = [
    { id: "front", label: t("viewFront") },
    { id: "back", label: t("viewBack") },
    { id: "3d", label: t("view3d") },
  ];

  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className="relative aspect-[55/85]">
        {view === "front" && (
          <div className="holo-stage h-full">
            <HoloCardFace card={card} />
          </div>
        )}
        {view === "back" && <CardBackArt card={card} className="block h-full w-full rounded-[18px] shadow-2xl" />}
        {view === "3d" && (
          <div className="absolute -inset-10">
            <HoloCard3D card={card} rarityLabel={tRarity(card.rarity)} />
          </div>
        )}
      </div>
      <div role="tablist" className="mt-5 flex justify-center gap-2">
        {views.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={`rounded-full border px-4 py-1.5 text-xs transition ${
              view === v.id ? "border-white/40 bg-white/15 text-white" : "border-white/10 bg-white/5 text-white/55 hover:text-white"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "3d" && <p className="mt-2 text-center text-xs text-white/40">{t("dragHint")}</p>}
    </div>
  );
}
