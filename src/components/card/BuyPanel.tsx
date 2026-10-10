"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthContext";
import UsdtPrice from "@/components/web3/UsdtPrice";
import { formatUsdt } from "@/lib/fx";
import type { Card } from "@/lib/mock-cards";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import { useChainState, vaultAction, type VaultAction, type VaultCardState } from "@/lib/chain-client";

const PRIMARY = "btn-primary flex-1 rounded-full px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "flex-1 rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold text-ink transition hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50";

export default function BuyPanel({ card, lastSale, likes }: { card: Card; lastSale: number; likes: number }) {
  const t = useTranslations("Detail");
  const chain = useChainState();
  const live = chain?.ready ? chain.cards[card.id] : undefined;
  const price = live ? (live.listing?.priceUsdt ?? card.priceUsdt) : card.priceUsdt;
  const up = card.change24h >= 0;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <UsdtPrice amount={price} className="text-3xl font-bold tabular-nums" />
        <span className={`font-mono text-sm ${up ? "text-up" : "text-down"}`}>
          {up ? "▲" : "▼"} {Math.abs(card.change24h).toFixed(1)}% <span className="text-ink-3">{t("change24h")}</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-3">
        {t("lastSale")} · <span className="tabular-nums">{formatUsdt(lastSale)}</span>
      </p>

      <div className="mt-5">{chain?.ready && live ? <ChainActions card={card} live={live} /> : <StaticActions card={card} />}</div>

      <p className="mt-4 text-xs leading-relaxed text-ink-3">{t("settle")}</p>
      <ShareRow cardId={card.id} likes={likes} />
    </div>
  );
}

// 鏈上未配置時：只顯示狀態
function StaticActions({ card }: { card: Card }) {
  const t = useTranslations("Detail");
  return <p className="rounded-xl bg-surface-2 px-4 py-3 text-center text-sm text-ink-2">{t(card.status === "redeeming" ? "redeemingNote" : card.status === "listed" ? "comingSoon" : "notListed")}</p>;
}

type Busy = null | VaultAction;

// 按鏈上即時狀態給出能做的事：買、自己的掛單可取消、自己持有的可掛單或申請提貨
function ChainActions({ card, live }: { card: Card; live: VaultCardState }) {
  const t = useTranslations("Detail");
  const { user, login } = useAuth();
  const me = user?.walletAddress ?? null;
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ action: VaultAction; signature: string }>();
  const [price, setPrice] = useState(String(card.priceUsdt));

  const run = async (action: VaultAction, priceUsdt?: number) => {
    if (!me) return;
    setBusy(action);
    setError(undefined);
    setDone(undefined);
    try {
      setDone({ action, signature: await vaultAction(action, card.id, me, priceUsdt) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      setBusy(null);
    }
  };

  const note = (key: string) => <p className="rounded-xl bg-surface-2 px-4 py-3 text-center text-sm text-ink-2">{t(key)}</p>;
  let body: React.ReactNode;
  if (live.burned) body = note("redeemedNote");
  else if (live.redeeming) body = note(live.owner === me ? "redeemingMine" : "redeemingNote");
  else if (live.listing && live.listing.seller === me) {
    body = (
      <div>
        <p className="mb-3 text-sm text-ink-2">{t("yourListing")}</p>
        <button className={SECONDARY + " w-full"} disabled={busy !== null} onClick={() => run("cancel")}>
          {busy === "cancel" ? t("confirmInWallet") : t("cancelListing")}
        </button>
      </div>
    );
  } else if (live.listing) {
    body = !user ? (
      <button className={PRIMARY + " w-full"} onClick={login}>
        {t("connectToBuy")}
      </button>
    ) : !me ? (
      note("linkWalletToBuy")
    ) : (
      <button className={PRIMARY + " w-full"} disabled={busy !== null} onClick={() => run("buy")}>
        {busy === "buy" ? t("confirmInWallet") : t("buyNowFor", { price: formatUsdt(live.listing.priceUsdt) })}
      </button>
    );
  } else if (live.owner === me) {
    const value = Number(price);
    body = (
      <div className="space-y-3">
        <p className="text-sm text-ink-2">{t("youOwn")}</p>
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-full border border-line px-4 text-sm">
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} aria-label={t("listPrice")} className="w-full bg-transparent py-2.5 tabular-nums outline-none" />
            USDT
          </label>
          <button className={PRIMARY} disabled={busy !== null || !(value > 0)} onClick={() => run("list", value)}>
            {busy === "list" ? t("confirmInWallet") : t("listForSale")}
          </button>
        </div>
        <button className={SECONDARY + " w-full"} disabled={busy !== null} onClick={() => window.confirm(t("redeemConfirm")) && run("redeem")}>
          {busy === "redeem" ? t("confirmInWallet") : t("requestRedeem")}
        </button>
      </div>
    );
  } else body = note("notListed");

  return (
    <div>
      {body}
      <p className="mt-3 text-xs text-ink-3">
        {t("holder")}{" "}
        <a href={solscanUrl("account", live.listing ? live.listing.seller : live.owner)} target="_blank" rel="noreferrer" className="font-mono hover:text-ink">
          {live.owner === me || live.listing?.seller === me ? t("you") : shortAddress(live.listing ? live.listing.seller : live.owner)}
        </a>
        {live.listing && <span> · {t("inEscrow")}</span>}
      </p>
      {done && (
        <a href={solscanUrl("tx", done.signature)} target="_blank" rel="noreferrer" className="mt-2 block rounded-xl bg-up/10 px-4 py-2.5 text-sm font-medium text-up">
          {t(`done_${done.action}`)} ↗
        </a>
      )}
      {error && <p className="mt-2 text-xs text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : t("error_generic")}</p>}
    </div>
  );
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
    <div className="mt-4 flex items-center gap-4 border-t border-line pt-4 text-xs text-ink-2">
      <button onClick={toggle} aria-pressed={saved} className="flex items-center gap-1.5 hover:text-ink">
        <svg viewBox="0 0 20 20" className={`h-4 w-4 ${saved ? "fill-accent text-accent" : "fill-none"}`} stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M10 17s-6.5-3.9-6.5-8.4A3.6 3.6 0 0 1 10 6.3a3.6 3.6 0 0 1 6.5 2.3C16.5 13.1 10 17 10 17Z" />
        </svg>
        {saved ? t("saved") : t("wishlist")}
      </button>
      <span className="text-ink-3">{t("likes", { count: likes + (saved ? 1 : 0) })}</span>
      <button onClick={copy} className="ml-auto hover:text-ink">
        {copied ? t("copied") : t("share")}
      </button>
    </div>
  );
}
