import { RECENT_TRADES } from "@/lib/mock-cards";

export default function TradeTicker() {
  const items = [...RECENT_TRADES, ...RECENT_TRADES];
  return (
    <div className="marquee overflow-hidden border-y border-white/5 bg-white/[0.02] py-3">
      <ul className="marquee-track flex w-max gap-10 font-mono text-xs text-white/55">
        {items.map((t, i) => (
          <li key={i} className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.card.palette[0] }} />
            <span className="text-white/85">
              {t.card.group} {t.card.member}
            </span>
            <span>{t.card.version}</span>
            <span className="text-emerald-400">${t.priceUsd}</span>
            <span className="text-white/30">{t.minutesAgo} 分鐘前成交</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
