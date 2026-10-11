"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import PackArt from "./PackArt";
import { usePackPhase } from "./Countdown";
import { HoloCardFace } from "@/components/market/HoloTile";
import { CardBackArt } from "@/components/market/CardArt";
import { formatUsdt } from "@/lib/fx";
import { BUYBACK_RATE, TIER_COLOR, entryCard, type Pack, type PoolEntry } from "@/lib/packs";
import { useAuth } from "@/components/auth/AuthContext";
import { payAndConfirm, postAction, refreshChainState, useChainState } from "@/lib/chain-client";
import { signAndSend } from "@/lib/solana/wallets";
import { solscanUrl } from "@/lib/solana/config";

const QUANTITIES = [1, 5, 10] as const;
type Stage = "closed" | "pack" | "tearing" | "reveal" | "results";
type Choice = "kept" | "sold";
// 每張抽到的卡：金庫卡 id、NFT 地址、從平台轉給我的交易，賣回後的交易
type Minted = { cardId: string; asset: string; tx: string | null; buybackTx?: string | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

// 用錢包付 USDT → 伺服器對帳後按承諾的種子抽卡 → 抽到的金庫卡 NFT 轉進錢包，可以即時賣回。
// 卡池不夠時沒交付的張數自動退款
export default function PackOpener({ pack, regionBlocked }: { pack: Pack; regionBlocked: boolean }) {
  const t = useTranslations("Packs");
  const { phase } = usePackPhase(pack.startsAt, pack.endsAt);
  const [qty, setQty] = useState<(typeof QUANTITIES)[number]>(1);
  const quantities = QUANTITIES.filter((q) => q <= pack.maxQty);
  const [stage, setStage] = useState<Stage>("closed");
  const chain = useChainState();
  const live = Boolean(chain?.ready);
  const { user, login, updateUser } = useAuth();
  const [ageAsk, setAgeAsk] = useState(false);
  const [ageChecked, setAgeChecked] = useState(false);
  const wallet = user?.walletAddress;
  const [pool, setPool] = useState(pack.pool);
  const [minted, setMinted] = useState<Minted[]>([]);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string>();
  const [paySig, setPaySig] = useState<string>();
  const [refundTx, setRefundTx] = useState<string | null>(null);

  // 卡池剩餘張數以伺服器為準（扣掉所有人已開出的）；關掉開包畫面時重新讀
  const closed = stage === "closed";
  useEffect(() => {
    if (!live) return;
    fetch(`/api/packs/${pack.id}/pool`)
      .then((r) => r.json())
      .then((d: { pack?: Pack }) => d.pack && setPool(d.pack.pool))
      .catch(() => {});
  }, [live, pack.id, closed]);
  const [pulls, setPulls] = useState<PoolEntry[]>([]);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [choices, setChoices] = useState<Record<number, Choice>>({});

  const left = pool.reduce((n, e) => n + e.remaining, 0);
  const canOpen = phase === "live" && left >= qty && !regionBlocked;

  const reveal = (drawn: PoolEntry[]) => {
    setPulls(drawn);
    setFlipped(drawn.map(() => false));
    setChoices({});
    setStage("pack");
  };

  const open = async () => {
    if (!live) return;
    if (!user) return login();
    if (!wallet) return;
    // 第一次開包要確認已滿 18 歲
    if (!user.ageConfirmed) return setAgeAsk(true);
    setPaying(true);
    setPayError(undefined);
    try {
      const { signature, result } = await payAndConfirm<{ pulls: Minted[]; refundTx: string | null }>(
        `/api/packs/${pack.id}/order`,
        { qty },
        (id) => `/api/packs/orders/${id}/confirm`,
        wallet,
      );
      setPaySig(signature);
      setMinted(result.pulls.map(({ cardId, asset, tx }) => ({ cardId, asset, tx })));
      setRefundTx(result.refundTx);
      // 抽到的卡已轉進錢包，重讀鏈上持有人，收藏冊和市場立刻看得到
      refreshChainState();
      reveal(result.pulls.map((p) => pool.find((e) => e.id === p.cardId) ?? pack.pool.find((e) => e.id === p.cardId)).filter((e): e is PoolEntry => Boolean(e)));
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "network");
    } finally {
      setPaying(false);
    }
  };

  // 即時回購：一筆交易裡 NFT 轉給平台、平台付 USDT
  const sellBack = async (i: number) => {
    const m = minted[i];
    if (!m || !wallet) return;
    const { tx } = await postAction<{ tx: string }>("/api/packs/buyback", { cardId: m.cardId });
    const signature = await signAndSend(tx, wallet);
    await postAction("/api/packs/buyback/confirm", { cardId: m.cardId, signature });
    refreshChainState();
    setMinted((prev) => prev.map((x, j) => (j === i ? { ...x, buybackTx: signature } : x)));
    setChoices((prev) => ({ ...prev, [i]: "sold" }));
  };

  const tear = () => {
    setStage("tearing");
    setTimeout(() => setStage("reveal"), 1100);
  };

  const flip = (i: number) => setFlipped((f) => f.map((v, j) => (j === i ? true : v)));
  const revealAll = () =>
    flipped.forEach((done, i) => {
      if (!done) setTimeout(() => flip(i), 120 * i);
    });

  const close = () => setStage("closed");

  const confirmAge = async () => {
    const { user: updated } = await postAction<{ user: NonNullable<typeof user> }>("/api/account/age");
    updateUser(updated);
    setAgeAsk(false);
  };

  const label = paying
    ? t("paying")
    : regionBlocked
      ? t("regionBlocked")
      : !live
        ? t("unavailable")
        : !user
          ? t("loginToOpen")
          : phase === "upcoming"
            ? t("notStarted")
            : phase === "ended"
              ? t("ended")
              : left < qty
                ? t("soldOut")
                : t("openN", { count: qty, total: round2(qty * pack.priceUsdt) });

  return (
    <div>
      {quantities.length > 1 && (
        <div className="flex gap-2" role="radiogroup" aria-label={t("qtyLabel")}>
          {quantities.map((q) => (
            <button
              key={q}
              role="radio"
              aria-checked={qty === q}
              onClick={() => setQty(q)}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                qty === q ? "border-line-strong bg-surface-3" : "border-line bg-surface-2 text-ink-2 hover:text-ink"
              }`}
            >
              ×{q}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={open}
        disabled={!canOpen || paying || (live && Boolean(user) && !wallet)}
        className="btn-primary mt-3 w-full rounded-full px-6 py-3.5 text-base font-bold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
      {live && user && !wallet && <p className="mt-2 text-center text-xs text-ink-2">{t("linkWalletToOpen")}</p>}
      {ageAsk && (
        <div className="mt-3 rounded-xl border border-line bg-surface-2 p-4 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={ageChecked} onChange={(e) => setAgeChecked(e.target.checked)} className="mt-1" />
            <span>{t("ageConfirm")}</span>
          </label>
          <button disabled={!ageChecked} onClick={confirmAge} className="btn-primary mt-3 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
            {t("ageContinue")}
          </button>
        </div>
      )}
      {payError && <p className="mt-2 text-center text-xs text-down">{t.has(`error_${payError}`) ? t(`error_${payError}`) : t("error_generic")}</p>}
      <p className="mt-3 rounded-lg border border-notice-line bg-notice-bg px-3 py-2 text-[11px] leading-relaxed text-notice-ink">{t("chainNote")}</p>

      {stage !== "closed" && (
        <OpeningModal
          pack={pack}
          stage={stage}
          pulls={pulls}
          flipped={flipped}
          choices={choices}
          onTear={tear}
          onFlip={flip}
          onRevealAll={revealAll}
          onResults={() => setStage("results")}
          onChoose={(i, c) => setChoices((prev) => ({ ...prev, [i]: c }))}
          minted={minted}
          paySig={paySig}
          refundTx={refundTx}
          onSellBack={sellBack}
          onAgain={canOpen ? open : undefined}
          onClose={close}
        />
      )}
    </div>
  );
}

function OpeningModal({
  pack,
  stage,
  pulls,
  flipped,
  choices,
  onTear,
  onFlip,
  onRevealAll,
  onResults,
  onChoose,
  onAgain,
  onClose,
  minted,
  paySig,
  refundTx,
  onSellBack,
}: {
  pack: Pack;
  stage: Stage;
  pulls: PoolEntry[];
  flipped: boolean[];
  choices: Record<number, Choice>;
  onTear: () => void;
  onFlip: (i: number) => void;
  onRevealAll: () => void;
  onResults: () => void;
  onChoose: (i: number, c: Choice) => void;
  onAgain?: () => void;
  onClose: () => void;
  minted: Minted[];
  paySig?: string;
  refundTx: string | null;
  onSellBack: (i: number) => Promise<void>;
}) {
  const t = useTranslations("Packs");
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primary.current?.focus();
  }, [stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const allFlipped = flipped.every(Boolean);
  const spent = round2(pulls.length * pack.priceUsdt);
  const refunded = minted.length > 0 && refundTx !== null;
  const pulledValue = round2(pulls.reduce((v, e) => v + e.valueUsdt, 0));
  const cardWidth = pulls.length === 1 ? "w-56 sm:w-64" : "w-28 sm:w-36";

  return (
    <div role="dialog" aria-modal="true" aria-label={pack.name} className="theme-dark fixed inset-0 z-[60] overflow-y-auto bg-[#0c0c0f]/95 backdrop-blur-md">
      <button onClick={onClose} className="absolute top-4 right-4 z-10 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 hover:bg-surface-3">
        {t("close")}
      </button>

      <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
        {(stage === "pack" || stage === "tearing") && (
          <button
            ref={primary}
            onClick={stage === "pack" ? onTear : undefined}
            className={`relative w-56 sm:w-64 ${stage === "pack" ? "pack-shake cursor-pointer" : ""}`}
            aria-label={t("tapToOpen")}
          >
            <div className={`absolute inset-x-0 top-0 h-[14%] overflow-hidden ${stage === "tearing" ? "pack-tear-top" : ""}`}>
              <PackArt pack={pack} className="w-full" />
            </div>
            <div className={stage === "tearing" ? "pack-tear-body" : ""} style={{ clipPath: "inset(14% 0 0 0)" }}>
              <PackArt pack={pack} className="w-full" />
            </div>
            {stage === "pack" && <p className="mt-6 animate-pulse text-sm text-ink-2">{t("tapToOpen")}</p>}
          </button>
        )}

        {stage === "reveal" && (
          <>
            <div className={`grid gap-3 sm:gap-4 ${pulls.length === 1 ? "" : "grid-cols-3 sm:grid-cols-5"}`}>
              {pulls.map((entry, i) => (
                <RevealCard key={i} entry={entry} index={i} flipped={flipped[i]} onFlip={() => onFlip(i)} className={cardWidth} flipLabel={t("tapToFlip")} />
              ))}
            </div>
            <div className="mt-8 flex gap-3">
              {allFlipped ? (
                <button ref={primary} onClick={onResults} className="btn-primary rounded-full px-6 py-2.5 text-sm font-semibold">
                  {t("seeResults")}
                </button>
              ) : (
                <button ref={primary} onClick={onRevealAll} className="rounded-full border border-line bg-surface px-6 py-2.5 text-sm font-semibold hover:bg-surface-3">
                  {t("revealAll")}
                </button>
              )}
            </div>
          </>
        )}

        {stage === "results" && (
          <div className="w-full max-w-2xl">
            <h2 className="text-center text-2xl font-bold">{t("resultsTitle")}</h2>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-2 px-4 py-3">
                <dt className="text-[11px] text-ink-3">{t("spent")}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{formatUsdt(spent, 2)}</dd>
              </div>
              <div className="rounded-xl bg-surface-2 px-4 py-3">
                <dt className="text-[11px] text-ink-3">{t("pulledValue")}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{formatUsdt(pulledValue, 2)}</dd>
              </div>
            </dl>
            {paySig && (
              <p className="mt-3 flex justify-center gap-4 text-xs text-ink-3">
                <a href={solscanUrl("tx", paySig)} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                  {t("paymentTx")} ↗
                </a>
                {refundTx && (
                  <a href={solscanUrl("tx", refundTx)} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                    {t("refundTx")} ↗
                  </a>
                )}
              </p>
            )}
            {refunded && <p className="mt-2 text-center text-xs text-notice-ink">{t("partialRefund")}</p>}
            <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface">
              {pulls.map((entry, i) => {
                const card = entryCard(entry);
                const choice = choices[i];
                const buyback = round2(entry.valueUsdt * BUYBACK_RATE);
                const nft = minted[i];
                return (
                  <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <TierPill tier={entry.tier} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {card.group} {card.member}
                      </p>
                      <p className="truncate text-xs text-ink-3">
                        {card.album} · {card.version} · {formatUsdt(entry.valueUsdt, entry.valueUsdt < 10 ? 2 : 0)}
                      </p>
                      {nft && (
                        <p className="mt-0.5 flex gap-3 text-[11px] text-ink-3">
                          <a href={solscanUrl("account", nft.asset)} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                            {t("collectible")} ↗
                          </a>
                          {nft.tx && (
                            <a href={solscanUrl("tx", nft.tx)} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                              {t("transferTx")} ↗
                            </a>
                          )}
                          {nft.buybackTx && (
                            <a href={solscanUrl("tx", nft.buybackTx)} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                              {t("buybackTx")} ↗
                            </a>
                          )}
                        </p>
                      )}
                    </div>
                    {choice ? (
                      <span className="text-xs text-up">{choice === "kept" ? t("kept") : t("soldBack")}</span>
                    ) : (
                      <ChoiceButtons buybackLabel={t("buyback", { value: buyback })} onKeep={() => onChoose(i, "kept")} onSell={() => onSellBack(i)} />
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 flex justify-center gap-3">
              {onAgain && (
                <button ref={primary} onClick={onAgain} className="btn-primary rounded-full px-6 py-2.5 text-sm font-semibold">
                  {t("again")}
                </button>
              )}
              <button onClick={onClose} className="rounded-full border border-line bg-surface px-6 py-2.5 text-sm font-semibold hover:bg-surface-3">
                {t("close")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RevealCard({
  entry,
  index,
  flipped,
  onFlip,
  className,
  flipLabel,
}: {
  entry: PoolEntry;
  index: number;
  flipped: boolean;
  onFlip: () => void;
  className: string;
  flipLabel: string;
}) {
  const card = entryCard(entry);
  const glow = TIER_COLOR[entry.tier];
  return (
    <div className={`flip-card-deal ${className}`} style={{ animationDelay: `${index * 70}ms` }}>
      <div className="relative">
        {flipped && entry.tier === "SSR" && <div className="ssr-burst" />}
        <button
          className="flip-card relative block aspect-[55/85] w-full"
          data-flipped={flipped}
          onClick={flipped ? undefined : onFlip}
          aria-label={flipped ? `${entry.tier} ${card.group} ${card.member}` : flipLabel}
        >
          <div className="flip-card-inner">
            <div className="flip-card-face overflow-hidden rounded-[14px]">
              <CardBackArt card={card} className="block h-full w-full" />
            </div>
            <div
              className="flip-card-face flip-card-front holo-stage rounded-[14px]"
              style={flipped && entry.tier !== "N" ? { boxShadow: `0 0 0 2px ${glow}, 0 0 32px ${glow}` } : undefined}
            >
              {flipped && <HoloCardFace card={card} />}
            </div>
          </div>
        </button>
      </div>
      <div className={`mt-2 flex items-center justify-between gap-1 transition-opacity ${flipped ? "opacity-100" : "opacity-0"}`}>
        <TierPill tier={entry.tier} />
        <span className="truncate text-[11px] text-ink-2">{card.member}</span>
      </div>
    </div>
  );
}

export function TierPill({ tier }: { tier: PoolEntry["tier"] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: TIER_COLOR[tier] }} />
      {tier}
    </span>
  );
}

// 結果頁每張卡的選擇：留著或賣回；賣回在鏈上執行時顯示處理中
function ChoiceButtons({ buybackLabel, onKeep, onSell }: { buybackLabel: string; onKeep: () => void; onSell: () => Promise<void> }) {
  const t = useTranslations("Packs");
  const [selling, setSelling] = useState(false);
  const [failed, setFailed] = useState(false);
  const btn = "rounded-full border border-line px-3 py-1 text-[11px] hover:bg-surface-3 disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button onClick={onKeep} disabled={selling} className={btn}>
        {t("keep")}
      </button>
      <button
        disabled={selling}
        onClick={async () => {
          setSelling(true);
          setFailed(false);
          try {
            await onSell();
          } catch {
            setFailed(true);
          } finally {
            setSelling(false);
          }
        }}
        className={btn}
      >
        {selling ? t("confirmInWallet") : buybackLabel}
      </button>
      {failed && <span className="text-[11px] text-down">{t("error_generic")}</span>}
    </div>
  );
}
