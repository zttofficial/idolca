import { useTranslations } from "next-intl";
import { RECENT_TRADES } from "@/lib/mock-cards";
import { formatUsdt } from "@/lib/fx";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

export default function TradeTicker() {
  const t = useTranslations("Ticker");
  const items = [...RECENT_TRADES, ...RECENT_TRADES];
  return (
    <div className="marquee overflow-hidden border-y border-line bg-surface-2 py-3">
      <ul className="marquee-track flex w-max gap-10 text-xs text-ink-2 tabular-nums">
        {items.map((trade, i) => (
          <li key={i} className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: trade.card.palette[0] }} />
            <span className="text-ink">
              {trade.card.group} {trade.card.member}
            </span>
            <span>{trade.card.version}</span>
            <span className="text-up">{formatUsdt(trade.priceUsdt)}</span>
            <span className="text-ink-3">{t("minutesAgo", { minutes: trade.minutesAgo })}</span>
            <a
              href={solscanUrl("tx", trade.signature)}
              target="_blank"
              rel="noreferrer"
              className="text-accent-ink hover:text-accent-ink"
            >
              tx {shortAddress(trade.signature, 4, 4)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
