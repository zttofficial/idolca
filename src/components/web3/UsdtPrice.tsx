"use client";

import { useSyncExternalStore } from "react";
import { formatFiat, formatUsdt } from "@/lib/fx";

const noopSubscribe = () => () => {};

// 伺服器渲染時不知道訪客語言，先按繁中站的預設（新台幣）出提示，水合後換成瀏覽器語言
function useLocale() {
  return useSyncExternalStore(
    noopSubscribe,
    () => navigator.language,
    () => "zh-TW",
  );
}

export default function UsdtPrice({ amount, className = "" }: { amount: number; className?: string }) {
  const locale = useLocale();
  const fiat = formatFiat(amount, locale);
  return (
    <span className={`group/price relative inline-flex cursor-help items-baseline ${className}`} aria-label={`${formatUsdt(amount)}，約 ${fiat}`}>
      {formatUsdt(amount)}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 whitespace-nowrap rounded-md border border-white/10 bg-black/85 px-2 py-1 font-sans text-[11px] font-normal text-white/80 opacity-0 shadow-lg backdrop-blur transition group-hover/price:opacity-100"
      >
        ≈ {fiat}
      </span>
    </span>
  );
}
