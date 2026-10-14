import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/fx";
import { shortAddress } from "@/lib/solana/config";

export type ActivityType = "mint" | "list" | "sale" | "cancel" | "auction" | "unsold" | "cancelAuction" | "redeem" | "burn" | "transfer";
export type ActivityEvent = { type: ActivityType; date: string; priceUsdt?: number; from?: string; to?: string; tx?: { id: string; href: string } };

const DOT: Record<ActivityType, string> = {
  mint: "bg-accent",
  list: "bg-ink-3",
  sale: "bg-up",
  cancel: "bg-line-strong",
  auction: "bg-accent",
  unsold: "bg-line-strong",
  cancelAuction: "bg-line-strong",
  redeem: "bg-notice-ink",
  burn: "bg-down",
  transfer: "bg-ink-3",
};

// 時間軸：金庫卡的鏈上紀錄和自由刊登的交易紀錄共用
export default function ActivityList({ events }: { events: ActivityEvent[] }) {
  const t = useTranslations("Detail");
  if (!events.length) return <p className="mt-4 text-sm text-ink-3">{t("activityEmpty")}</p>;
  return (
    <ol className="mt-4 space-y-4 border-l border-line pl-5">
      {events.map((e, i) => (
        <li key={e.tx?.id ?? `${e.type}-${e.date}-${i}`} className="relative">
          <span className={`absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ring-2 ring-surface ${DOT[e.type]}`} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-medium">
              {t(`event_${e.type}`)}
              {e.priceUsdt !== undefined && <span className="ml-2 text-ink-2 tabular-nums">{formatPrice(e.priceUsdt)}</span>}
            </p>
            <span className="text-[11px] text-ink-3 tabular-nums">{e.date.slice(0, 16).replace("T", " ")}</span>
          </div>
          {(e.from || e.to || e.tx) && (
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
              {e.tx && (
                <a href={e.tx.href} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
                  tx {shortAddress(e.tx.id)} ↗
                </a>
              )}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
