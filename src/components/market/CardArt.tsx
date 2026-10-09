"use client";

import { useEffect, useRef, useState } from "react";
import { ART_H, ART_W, drawCardBack, drawCardFront } from "@/lib/card-art";
import type { Card } from "@/lib/mock-cards";

// 有實拍圖用實拍圖，沒有或載入失敗時畫 canvas 佔位圖
export default function CardArt({ card, rarityLabel, className }: { card: Card; rarityLabel: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const src = card.image?.front;

  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 卡面要和 canvas 一樣鋪滿 55:85 的容器，不需要 next/image 的響應式裁切
      <img
        src={src}
        alt={`${card.group} ${card.member} ${card.version}`}
        className={`${className ?? ""} object-cover`}
        draggable={false}
        onError={() => setFailedSrc(src)}
      />
    );
  }
  return <CanvasArt card={card} rarityLabel={rarityLabel} className={className} />;
}

function CanvasArt({ card, rarityLabel, className }: { card: Card; rarityLabel: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const ctx = ref.current?.getContext("2d");
      if (ctx) drawCardFront(ctx, card, rarityLabel);
    };
    draw();
    document.fonts.ready.then(draw);
  }, [card, rarityLabel]);

  return <canvas ref={ref} width={ART_W} height={ART_H} className={className} aria-label={`${card.group} ${card.member}`} />;
}

// 背面：有實拍圖用實拍圖，否則畫平台統一的卡背
export function CardBackArt({ card, className }: { card: Card; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failedSrc, setFailedSrc] = useState<string>();
  const src = card.image?.back;

  useEffect(() => {
    const draw = () => {
      const ctx = ref.current?.getContext("2d");
      if (ctx) drawCardBack(ctx, card);
    };
    draw();
    document.fonts.ready.then(draw);
  }, [card, src, failedSrc]);

  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 同正面，鋪滿 55:85 容器
      <img src={src} alt="" className={`${className ?? ""} object-cover`} draggable={false} onError={() => setFailedSrc(src)} />
    );
  }
  return <canvas ref={ref} width={ART_W} height={ART_H} className={className} aria-hidden />;
}
