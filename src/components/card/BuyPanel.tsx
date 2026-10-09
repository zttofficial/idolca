"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { PRIVY_APP_ID } from "@/components/web3/Providers";
import UsdtPrice from "@/components/web3/UsdtPrice";
import { formatUsdt } from "@/lib/fx";
import type { Card } from "@/lib/mock-cards";

const PRIMARY = "btn-holo flex-1 rounded-full px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "flex-1 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

export default function BuyPanel({ card, lastSale, likes }: { card: Card; lastSale: number; likes: number }) {
  const t = useTranslations("Detail");
  const up = card.change24h >= 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <UsdtPrice amount={card.priceUsdt} className="font-mono text-3xl font-semibold" />
        <span className={`font-mono text-sm ${up ? "text-emerald-400" : "text-rose-400"}`}>
          {up ? "▲" : "▼"} {Math.abs(card.change24h).toFixed(1)}% <span className="text-white/40">{t("change24h")}</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-white/45">
        {t("lastSale")} · <span className="font-mono">{formatUsdt(lastSale)}</span>
      </p>

      <div className="mt-5">
        {card.status === "listed" ? (
          PRIVY_APP_ID ? <PrivyBuyButtons /> : <BuyButtons disabledTitle={t("connectToBuy")} />
        ) : (
          <p className="rounded-xl bg-white/5 px-4 py-3 text-center text-sm text-white/60">
            {card.status === "redeeming" ? t("redeemingNote") : t("notListed")}
          </p>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-white/45">{t("settle")}</p>
      <ShareRow cardId={card.id} likes={likes} />
    </div>
  );
}

function BuyButtons({ disabledTitle, onBuy }: { disabledTitle?: string; onBuy?: () => void }) {
  const t = useTranslations("Detail");
  return (
    <div className="flex gap-3">
      <button className={PRIMARY} disabled={!onBuy} title={disabledTitle} onClick={onBuy}>
        {t("buyNow")}
      </button>
      <button className={SECONDARY} disabled={!onBuy} title={disabledTitle} onClick={onBuy}>
        {t("makeOffer")}
      </button>
    </div>
  );
}

// 未登入時按鈕喚起登入；登入後託管合約尚未部署，按鈕停用並說明原因
function PrivyBuyButtons() {
  const t = useTranslations("Detail");
  const { ready, authenticated, login } = usePrivy();
  if (!ready) return <BuyButtons disabledTitle={t("connectToBuy")} />;
  if (!authenticated) return <BuyButtons onBuy={login} />;
  return <BuyButtons disabledTitle={t("comingSoon")} />;
}

function ShareRow({ cardId, likes }: { cardId: string; likes: number }) {
  const t = useTranslations("Detail");
  const key = `idolca:saved:${cardId}`;
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      // 收藏只記在本機瀏覽器，帳號體系接上後改存伺服器
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 水合後才能讀 localStorage
      setSaved(localStorage.getItem(key) === "1");
    } catch {}
  }, [key]);

  const toggle = () => {
    const next = !saved;
    setSaved(next);
    try {
      if (next) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch {}
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="mt-4 flex items-center gap-4 border-t border-white/5 pt-4 text-xs text-white/60">
      <button onClick={toggle} aria-pressed={saved} className="flex items-center gap-1.5 hover:text-white">
        <svg viewBox="0 0 20 20" className={`h-4 w-4 ${saved ? "fill-rose-400 text-rose-400" : "fill-none"}`} stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M10 17s-6.5-3.9-6.5-8.4A3.6 3.6 0 0 1 10 6.3a3.6 3.6 0 0 1 6.5 2.3C16.5 13.1 10 17 10 17Z" />
        </svg>
        {saved ? t("saved") : t("wishlist")}
      </button>
      <span className="text-white/35">{t("likes", { count: likes + (saved ? 1 : 0) })}</span>
      <button onClick={copy} className="ml-auto hover:text-white">
        {copied ? t("copied") : t("share")}
      </button>
    </div>
  );
}
