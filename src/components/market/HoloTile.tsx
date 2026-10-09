"use client";

import { useRef } from "react";
import CardArt from "./CardArt";
import { RARITY_LABEL, type Card } from "@/lib/mock-cards";

// 列表卡：滑鼠位置驅動 CSS 3D 傾斜、彩虹箔和高光（樣式見 globals.css 的 .holo-tile）
export default function HoloTile({ card }: { card: Card }) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    el.style.setProperty("--rx", `${(0.5 - py) * 18}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * 22}deg`);
    el.style.setProperty("--pos", `${px * 100}% ${py * 100}%`);
    el.dataset.active = "true";
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.dataset.active = "false";
  };

  const up = card.change24h >= 0;

  return (
    <article className="group">
      <div className="holo-stage">
        <div ref={ref} className="holo-tile" data-holo={card.rarity} onPointerMove={onMove} onPointerLeave={onLeave}>
          <CardArt card={card} className="block h-full w-full" />
          <div className="holo-foil" />
          <div className="holo-glare" />
        </div>
      </div>
      <div className="mt-3 space-y-1 px-1">
        <div className="flex items-center justify-between text-xs text-white/45">
          <span>
            {card.group} · {card.album}
          </span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">{RARITY_LABEL[card.rarity]}</span>
        </div>
        <p className="font-semibold text-white">
          {card.member} <span className="font-normal text-white/50">{card.version}</span>
        </p>
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-lg font-semibold">${card.priceUsd.toLocaleString()}</span>
          <span className={`font-mono text-xs ${up ? "text-emerald-400" : "text-rose-400"}`}>
            {up ? "▲" : "▼"} {Math.abs(card.change24h).toFixed(1)}%
          </span>
        </div>
      </div>
    </article>
  );
}
