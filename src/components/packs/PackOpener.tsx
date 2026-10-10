"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import PackArt from "./PackArt";
import { usePackPhase } from "./Countdown";
import { HoloCardFace } from "@/components/market/HoloTile";
import { CardBackArt } from "@/components/market/CardArt";
import { formatUsdt } from "@/lib/fx";
import { BUYBACK_RATE, TIER_COLOR, drawFromPool, entryCard, type Pack, type PoolEntry } from "@/lib/packs";

const QUANTITIES = [1, 5, 10] as const;
type Stage = "closed" | "pack" | "tearing" | "reveal" | "results";
type Choice = "kept" | "listed" | "sold";

const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function PackOpener({ pack }: { pack: Pack }) {
  const t = useTranslations("Packs");
  const { phase } = usePackPhase(pack.startsAt, pack.endsAt);
  const [qty, setQty] = useState<(typeof QUANTITIES)[number]>(1);
  // 演示模式下在本機扣減卡池，連續開包時機率跟著變
  const [pool, setPool] = useState(pack.pool);
  const [stage, setStage] = useState<Stage>("closed");
  const [pulls, setPulls] = useState<PoolEntry[]>([]);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [choices, setChoices] = useState<Record<number, Choice>>({});

  const left = pool.reduce((n, e) => n + e.remaining, 0);
  const canOpen = phase === "live" && left >= qty;

  const open = () => {
    const drawn = drawFromPool(pool, qty, cryptoRandom);
    setPool((prev) => prev.map((e) => ({ ...e, remaining: e.remaining - drawn.filter((d) => d.id === e.id).length })));
    setPulls(drawn);
    setFlipped(drawn.map(() => false));
    setChoices({});
    setStage("pack");
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

  const label =
    phase === "upcoming"
      ? t("notStarted")
      : phase === "ended"
        ? t("ended")
        : left < qty
          ? t("soldOut")
          : t("openN", { count: qty, total: round2(qty * pack.priceUsdt) });

  return (
    <div>
      <div className="flex gap-2" role="radiogroup" aria-label={t("qtyLabel")}>
        {QUANTITIES.map((q) => (
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
      <button
        onClick={open}
        disabled={!canOpen}
        className="btn-primary mt-3 w-full rounded-full px-6 py-3.5 text-base font-bold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
      <p className="mt-3 rounded-lg border border-notice-line bg-notice-bg px-3 py-2 text-[11px] leading-relaxed text-notice-ink">
        {t("demoNote")}
      </p>

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
                <RevealCard
                  key={i}
                  entry={entry}
                  index={i}
                  flipped={flipped[i]}
                  onFlip={() => onFlip(i)}
                  className={cardWidth}
                  flipLabel={t("tapToFlip")}
                />
              ))}
            </div>
            <div className="mt-8 flex gap-3">
              {allFlipped ? (
                <button ref={primary} onClick={onResults} className="btn-primary rounded-full px-6 py-2.5 text-sm font-semibold">
                  {t("seeResults")}
                </button>
              ) : (
                <button
                  ref={primary}
                  onClick={onRevealAll}
                  className="rounded-full border border-line bg-surface px-6 py-2.5 text-sm font-semibold hover:bg-surface-3"
                >
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
            <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface">
              {pulls.map((entry, i) => {
                const card = entryCard(entry);
                const choice = choices[i];
                const buyback = round2(entry.valueUsdt * BUYBACK_RATE);
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
                    </div>
                    {choice ? (
                      <span className="text-xs text-up">
                        {choice === "kept" ? t("kept") : choice === "listed" ? t("listed") : t("soldBack")}
                      </span>
                    ) : (
                      <div className="flex gap-1.5">
                        <button onClick={() => onChoose(i, "kept")} className="rounded-full border border-line px-3 py-1 text-[11px] hover:bg-surface-3">
                          {t("keep")}
                        </button>
                        <button onClick={() => onChoose(i, "listed")} className="rounded-full border border-line px-3 py-1 text-[11px] hover:bg-surface-3">
                          {t("list")}
                        </button>
                        <button onClick={() => onChoose(i, "sold")} className="rounded-full border border-line px-3 py-1 text-[11px] hover:bg-surface-3">
                          {t("buyback", { value: buyback })}
                        </button>
                      </div>
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
