"use client";

import { useTranslations } from "next-intl";
import type { Verification } from "@/lib/items";

const STYLE: Record<Verification, string> = {
  self_reported: "bg-ink/75 text-white",
  authentic: "bg-up text-white",
  fake: "bg-down text-white",
};

// 鑑定狀態標籤：自述 / 真品 / 假卡，假卡一律醒目標紅
export default function VerificationBadge({ status, className = "" }: { status: Verification; className?: string }) {
  const t = useTranslations("Mint");
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${STYLE[status]} ${className}`}>{t(`status_${status}`)}</span>;
}
