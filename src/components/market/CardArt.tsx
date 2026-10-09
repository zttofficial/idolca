"use client";

import { useEffect, useRef } from "react";
import { ART_H, ART_W, drawCardFront } from "@/lib/card-art";
import type { Card } from "@/lib/mock-cards";

export default function CardArt({ card, className }: { card: Card; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const ctx = ref.current?.getContext("2d");
      if (ctx) drawCardFront(ctx, card);
    };
    draw();
    document.fonts.ready.then(draw);
  }, [card]);

  return <canvas ref={ref} width={ART_W} height={ART_H} className={className} aria-label={`${card.group} ${card.member}`} />;
}
