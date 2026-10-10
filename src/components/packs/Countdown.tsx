"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 1000);
  return () => clearInterval(timer);
}

// 秒級時間戳，伺服器渲染時為 0（未知），水合後開始走秒
const useNow = () =>
  useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000) * 1000,
    () => 0,
  );

function format(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  return d > 0 ? `D-${d} ${hms}` : hms;
}

export function usePackPhase(startsAt: string, endsAt: string) {
  const now = useNow();
  if (!now) return { phase: "unknown" as const, now };
  if (now < Date.parse(startsAt)) return { phase: "upcoming" as const, now };
  if (now < Date.parse(endsAt)) return { phase: "live" as const, now };
  return { phase: "ended" as const, now };
}

export default function Countdown({ startsAt, endsAt, className = "" }: { startsAt: string; endsAt: string; className?: string }) {
  const t = useTranslations("Packs");
  const { phase, now } = usePackPhase(startsAt, endsAt);
  const text =
    phase === "unknown"
      ? " "
      : phase === "upcoming"
        ? t("startsIn", { time: format(Date.parse(startsAt) - now) })
        : phase === "live"
          ? t("endsIn", { time: format(Date.parse(endsAt) - now) })
          : t("ended");
  return <span className={`tabular-nums ${className}`}>{text}</span>;
}
