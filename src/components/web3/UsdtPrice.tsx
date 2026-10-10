"use client";

import { useLocale } from "next-intl";
import { formatFiat, formatUsdt } from "@/lib/fx";

// 懸停顯示站點當前語言對應的當地貨幣參考價
export default function UsdtPrice({ amount, className = "" }: { amount: number; className?: string }) {
  const fiat = formatFiat(amount, useLocale());
  return (
    <span className={`group/price relative inline-flex cursor-help items-baseline ${className}`} aria-label={`${formatUsdt(amount)} ≈ ${fiat}`}>
      {formatUsdt(amount)}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 whitespace-nowrap rounded-md border border-line bg-surface shadow-xl px-2 py-1 font-sans text-[11px] font-normal text-ink opacity-0 shadow-lg backdrop-blur transition group-hover/price:opacity-100"
      >
        ≈ {fiat}
      </span>
    </span>
  );
}
