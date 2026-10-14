"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { solscanUrl } from "@/lib/solana/config";
import ActivityList, { type ActivityType } from "./ActivityList";

type ChainEvent = { type: ActivityType; date: string; signature: string; priceUsdt?: number; from?: string; to?: string };

// 卡片的鏈上紀錄：每次打開都直接讀鏈（伺服器快取 20 秒）
export default function ChainActivity({ cardId }: { cardId: string }) {
  const t = useTranslations("Detail");
  const [events, setEvents] = useState<ChainEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/chain/history/${cardId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { events: ChainEvent[] }) => setEvents(d.events))
      .catch(() => setFailed(true));
  }, [cardId]);

  if (failed) return <p className="mt-4 text-sm text-ink-3">{t("activityFailed")}</p>;
  if (!events) return <div className="mt-4 h-24 animate-pulse rounded-xl bg-surface-2" />;
  return <ActivityList events={events.map(({ signature, ...e }) => ({ ...e, tx: { id: signature, href: solscanUrl("tx", signature) } }))} />;
}
