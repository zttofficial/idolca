"use client";

import { useEffect, useState } from "react";
import RedeemDialog from "./RedeemDialog";
import RedemptionStatus from "./RedemptionStatus";
import type { ShippingAddress } from "@/lib/shipping";
import { useTranslations } from "next-intl";
import { GetWalletPrompt } from "@/components/auth/WalletSetup";
import { useAuth } from "@/components/auth/AuthContext";
import Price from "@/components/web3/Price";
import { formatPrice } from "@/lib/fx";
import type { Card } from "@/lib/cards";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import { listVaultCard, useChainState, vaultAction, type VaultAction, type VaultCardState } from "@/lib/chain-client";
import ListingControl from "@/components/market/ListingControl";
import CopyButton from "@/components/ui/CopyButton";
import PaymentPicker from "@/components/pay/PaymentPicker";
import VaultAuction from "@/components/auction/VaultAuction";
import { WalletNotFoundHint } from "@/components/auth/WalletPicker";

const PRIMARY = "btn-primary flex-1 rounded-full px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "flex-1 rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold text-ink transition hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50";

// 價格只在鏈上真的有掛單時顯示，是託管程序裡的掛單價；拍賣中改顯示拍賣面板（目前出價、倒數、出價）
export default function BuyPanel({ card }: { card: Card }) {
  const t = useTranslations("Detail");
  const tStatus = useTranslations("Status");
  const chain = useChainState();
  const live = chain?.ready ? chain.cards[card.id] : undefined;

  if (live?.auction && !live.burned) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <VaultAuction cardId={card.id} auction={live.auction} />
        <ShareRow cardId={card.id} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      {card.status === "redeemed" ? (
        <p className="text-xl font-semibold text-ink-2">{tStatus("redeemed")}</p>
      ) : !chain ? (
        <div className="h-9 w-40 animate-pulse rounded-lg bg-surface-2" />
      ) : live?.listing ? (
        <Price amount={live.listing.priceUsdt} className="text-3xl font-bold tabular-nums" />
      ) : (
        <p className="text-xl font-semibold text-ink-2">{t("notForSale")}</p>
      )}

      <div className="mt-5">{card.status !== "redeemed" && chain?.ready && live ? <ChainActions card={card} live={live} /> : <StaticActions card={card} />}</div>
      {/* 已寄出的提貨：申請人看得到寄出日期和物流單號 */}
      {(card.status === "redeemed" || live?.burned) && <RedemptionStatus cardId={card.id} />}

      <p className="mt-4 text-xs leading-relaxed text-ink-3">{t("settle")}</p>
      <ShareRow cardId={card.id} />
    </div>
  );
}

// 鏈上未配置時：只顯示狀態
function StaticActions({ card }: { card: Card }) {
  const t = useTranslations("Detail");
  return (
    <p className="rounded-xl bg-surface-2 px-4 py-3 text-center text-sm text-ink-2">
      {card.status === "redeemed"
        ? t("redeemedOn", { date: card.redeemedAt!.slice(0, 10) })
        : t(card.status === "redeeming" ? "redeemingNote" : card.status === "listed" ? "comingSoon" : "notListed")}
    </p>
  );
}

type Busy = null | VaultAction;

// 按鏈上即時狀態給出能做的事：買、自己的掛單可取消、自己持有的可掛單或申請提貨
function ChainActions({ card, live }: { card: Card; live: VaultCardState }) {
  const t = useTranslations("Detail");
  const { user, login } = useAuth();
  const me = user?.walletAddress ?? null;
  // 金庫卡拍賣開通了才給「拍賣」選項
  const auctionsOpen = Boolean(useChainState()?.auctions);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ action: VaultAction; signature: string }>();
  const [redeeming, setRedeeming] = useState(false);
  const [picking, setPicking] = useState(false);
  const tPay = useTranslations("Pay");
  const tBinder = useTranslations("Binder");

  const run = async (action: VaultAction, priceUsdt?: number, address?: ShippingAddress) => {
    if (!me) return;
    setBusy(action);
    setError(undefined);
    setDone(undefined);
    try {
      setDone({ action, signature: await vaultAction(action, card.id, me, { priceUsdt, address }) });
      setRedeeming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      setBusy(null);
    }
  };

  // 金庫卡成交只能在 Solana 上付款（卡和款項同一筆交易原子交換），由付款方式面板呼叫；失敗時丟錯，面板顯示說明
  const buyOnSolana = async () => {
    setDone({ action: "buy", signature: await vaultAction("buy", card.id, me!) });
  };

  const note = (key: string) => <p className="rounded-xl bg-surface-2 px-4 py-3 text-center text-sm text-ink-2">{t(key)}</p>;
  let body: React.ReactNode;
  if (live.burned) body = note("redeemedNote");
  else if (live.redeeming) body = note(live.owner === me ? "redeemingMine" : "redeemingNote");
  else if (me && (live.listing?.seller === me || (!live.listing && live.owner === me))) {
    // 自己的卡：上架、改價、下架用和收藏冊同一個元件；沒上架時還能申請提貨
    const mine = live.listing;
    body = (
      <div className="space-y-3">
        <p className="text-sm text-ink-2">{t(mine ? "yourListing" : "youOwn")}</p>
        <ListingControl
          lane="vault"
          price={mine ? mine.priceUsdt : null}
          note={tBinder("vaultListingNote")}
          onList={(price) => listVaultCard(card.id, me, price, Boolean(mine))}
          onUnlist={() => vaultAction("cancel", card.id, me)}
          onAuction={auctionsOpen ? (input) => vaultAction("auction", card.id, me, input) : undefined}
        />
        {!mine && (
          <button className={SECONDARY + " w-full"} disabled={busy !== null} onClick={() => setRedeeming(true)}>
            {t("requestRedeem")}
          </button>
        )}
        {redeeming && <RedeemDialog vault={card.vault} busy={busy === "redeem"} onSubmit={(address) => run("redeem", undefined, address)} onClose={() => setRedeeming(false)} />}
      </div>
    );
  } else if (live.listing) {
    body = !user ? (
      <button className={PRIMARY + " w-full"} onClick={login}>
        {t("connectToBuy")}
      </button>
    ) : !me ? (
      <GetWalletPrompt text={t("linkWalletToBuy")} />
    ) : (
      <>
        <button className={PRIMARY + " w-full"} disabled={busy !== null || picking} onClick={() => setPicking(true)}>
          {t("buyNowFor", { price: formatPrice(live.listing.priceUsdt) })}
        </button>
        {picking && (
          <PaymentPicker
            amountUsd={live.listing.priceUsdt}
            run={{ solana: buyOnSolana, arc: null }}
            event={{ name: "purchased", props: { lane: "vault" } }}
            arcUnavailableNote={tPay("arcVaultOnly")}
            describeError={(code) => (t.has(`error_${code}`) ? t(`error_${code}`) : null)}
            onClose={() => setPicking(false)}
          />
        )}
      </>
    );
  } else body = note("notListed");

  return (
    <div>
      {body}
      {!live.burned && (
        <p className="mt-3 text-xs text-ink-3">
          {t("holder")}{" "}
          <a
            href={solscanUrl("account", live.listing ? live.listing.seller : live.owner)}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:text-ink"
          >
            {live.owner === me || live.listing?.seller === me ? t("you") : shortAddress(live.listing ? live.listing.seller : live.owner)}
          </a>
          {live.listing && <span> · {t("inEscrow")}</span>}
        </p>
      )}
      {done && (
        <a
          href={solscanUrl("tx", done.signature)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block rounded-xl bg-up/10 px-4 py-2.5 text-sm font-medium text-up"
        >
          {t(`done_${done.action}`)} ↗
        </a>
      )}
      {error && <p className="mt-2 text-xs text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : t("error_generic")}</p>}
      <WalletNotFoundHint error={error} />
    </div>
  );
}

function ShareRow({ cardId }: { cardId: string }) {
  const t = useTranslations("Detail");
  const key = `idolca:saved:${cardId}`;
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="mt-4 flex items-center gap-4 border-t border-line pt-4 text-xs text-ink-2">
      <button onClick={toggle} aria-pressed={saved} className="flex items-center gap-1.5 hover:text-ink">
        <svg viewBox="0 0 20 20" className={`h-4 w-4 ${saved ? "fill-accent text-accent" : "fill-none"}`} stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M10 17s-6.5-3.9-6.5-8.4A3.6 3.6 0 0 1 10 6.3a3.6 3.6 0 0 1 6.5 2.3C16.5 13.1 10 17 10 17Z" />
        </svg>
        {saved ? t("saved") : t("wishlist")}
      </button>
      <CopyButton text={() => window.location.href} label={t("share")} copiedLabel={t("copied")} className="ml-auto" />
    </div>
  );
}
