"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/fx";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

type ChainEvent = { type: "mint" | "list" | "sale" | "cancel" | "redeem" | "burn" | "transfer"; date: string; signature: string; priceUsdt?: number; from?: string; to?: string };

const DOT: Record<ChainEvent["type"], string> = {
  mint: "bg-accent",
  list: "bg-ink-3",
  sale: "bg-up",
  cancel: "bg-line-strong",
  redeem: "bg-notice-ink",
  burn: "bg-down",
  transfer: "bg-ink-3",
};

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
  if (!events.length) return <p className="mt-4 text-sm text-ink-3">{t("activityEmpty")}</p>;
  return (
    <ol className="mt-4 space-y-4 border-l border-line pl-5">
      {events.map((e) => (
        <li key={e.signature} className="relative">
          <span className={`absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ring-2 ring-surface ${DOT[e.type]}`} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-medium">
              {t(`event_${e.type}`)}
              {e.priceUsdt !== undefined && <span className="ml-2 text-ink-2 tabular-nums">{formatPrice(e.priceUsdt)}</span>}
            </p>
            <span className="text-[11px] text-ink-3 tabular-nums">{e.date.slice(0, 16).replace("T", " ")}</span>
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-ink-3">
            {e.from && (
              <>
                {t("from")} {shortAddress(e.from)}{" "}
              </>
            )}
            {e.to && (
              <>
                {t("to")} {shortAddress(e.to)}{" "}
              </>
            )}
            <a href={solscanUrl("tx", e.signature)} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
              tx {shortAddress(e.signature)} ↗
            </a>
          </p>
        </li>
      ))}
    </ol>
  );
}
