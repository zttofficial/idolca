"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ARC } from "@/lib/arc";
import { formatPrice } from "@/lib/fx";
import { useEvmWallets, type EvmWallet } from "@/lib/evm/arc-wallet";
import { CloseButton } from "@/components/ui/Dialog";
import { track, type AnalyticsEvent } from "@/lib/analytics";

// 結帳的付款方式面板：所有購買按鈕都先打開這裡，再選用哪種方式付。
// solana：Solana 錢包付 USDT 或 USDC（手續費由平台付，錢包不用有 SOL）；arc：在 EVM 錢包簽一個 USDC 授權，不用 gas 幣、不付手續費；
// card：信用卡，還沒開通，先佔位。某種方式不適用時傳 null（Arc 通道沒開通時整列不顯示）。
// 標誌在 public/pay/：Solana、Arc 是兩家品牌包裡的原檔（Arc 用官方的網路圖示），不改動；卡組織是各自的受理標誌
export type PayRun = { solana: (() => Promise<void>) | null; arc: ((wallet: EvmWallet) => Promise<void>) | null };

export default function PaymentPicker({
  amountUsd,
  run,
  event,
  arcUnavailableNote,
  describeError,
  onClose,
}: {
  amountUsd: number;
  run: PayRun;
  // 付款成功時記的分析事件和附帶的屬性；付款方式和金額自動帶上
  event: { name: AnalyticsEvent; props?: Record<string, string | number> };
  // Arc 不適用時的說明（例如金庫卡成交只能在 Solana 上原子交換）
  arcUnavailableNote?: string;
  // 呼叫方自己的錯誤說明（例如卡包賣完）；沒有對應時用通用說明
  describeError?: (code: string) => string | null;
  onClose: () => void;
}) {
  const t = useTranslations("Pay");
  const wallets = useEvmWallets();
  const [step, setStep] = useState<"methods" | "evm">("methods");
  const [busy, setBusy] = useState<"solana" | "arc" | null>(null);
  const [error, setError] = useState<string>();

  const pay = async (method: "solana" | "arc", go: () => Promise<void>) => {
    setBusy(method);
    setError(undefined);
    try {
      await go();
      track(event.name, { ...event.props, rail: method, amount_usd: amountUsd });
      onClose();
    } catch (e) {
      console.error("payment failed", e);
      setError(e instanceof Error ? e.message : "generic");
      setStep("methods");
    } finally {
      setBusy(null);
    }
  };
  const payOnArc = (wallet: EvmWallet) => pay("arc", () => run.arc!(wallet));
  const chooseArc = () => {
    if (!wallets.length) return setError("no_evm_wallet");
    if (wallets.length === 1) return payOnArc(wallets[0]);
    setStep("evm");
  };

  const message = error ? (describeError?.(error) ?? (t.has(`error_${error}`) ? t(`error_${error}`) : t("error_generic"))) : null;
  const row = "flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition enabled:hover:border-line-strong enabled:hover:bg-surface-2 disabled:cursor-not-allowed";

  return (
    <div role="dialog" aria-modal="true" aria-label={t("title")} className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="flex min-h-full items-end justify-center p-4 sm:items-center">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{t("title")}</h2>
              <p className="mt-0.5 text-sm text-ink-2">{t("total", { amount: formatPrice(amountUsd) })}</p>
            </div>
            <CloseButton onClick={() => busy === null && onClose()} />
          </div>

          {step === "evm" ? (
            <div className="mt-4">
              <p className="text-xs text-ink-3">{t("chooseWallet")}</p>
              <div className="mt-2 space-y-2">
                {wallets.map((w) => (
                  <button key={w.id} onClick={() => payOnArc(w)} disabled={busy !== null} className={row}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 錢包自己提供的 data URI 圖示 */}
                    <img src={w.icon} alt="" className="h-6 w-6" />
                    <span className="text-sm font-semibold">{w.name}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep("methods")} disabled={busy !== null} className="mt-3 text-xs text-ink-3 hover:text-ink">
                ← {t("back")}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <button onClick={() => pay("solana", run.solana!)} disabled={!run.solana || busy !== null} className={`${row} ${run.solana ? "" : "opacity-50"}`}>
                <Logo src="/pay/solana.svg" />
                <Method name={t("solanaName")} desc={t("solanaDesc")} busy={busy === "solana" ? t("waiting") : null} />
              </button>
              {ARC && (
                <button onClick={chooseArc} disabled={!run.arc || busy !== null} className={`${row} ${run.arc ? "" : "opacity-50"}`}>
                  <Logo src="/pay/arc.svg" />
                  <Method name={t("arcName")} desc={run.arc ? t("arcDesc") : (arcUnavailableNote ?? t("arcDesc"))} busy={busy === "arc" ? t("waiting") : null} />
                </button>
              )}
              <button disabled className={`${row} opacity-60`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6" aria-hidden>
                    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                    <path d="M2.5 9.5h19M6 15h4" strokeLinecap="round" />
                  </svg>
                </span>
                <Method name={t("cardName")} desc={t("cardSoon")} busy={null}>
                  <span className="mt-1.5 flex gap-1.5">
                    {[
                      ["visa", "Visa"],
                      ["mastercard", "Mastercard"],
                      ["amex", "American Express"],
                    ].map(([id, name]) => (
                      <span key={id} className="grid h-6 w-9 place-items-center rounded border border-line bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 小尺寸的 SVG 標誌 */}
                        <img src={`/pay/${id}.svg`} alt={name} className="h-4 w-7 object-contain" />
                      </span>
                    ))}
                  </span>
                </Method>
              </button>
            </div>
          )}

          {message && <p className="mt-3 rounded-lg bg-down/10 px-3 py-2 text-xs text-down">{message}</p>}
        </div>
      </div>
    </div>
  );
}

// 付款方式的標誌：放在淺底方塊裡，Solana、Arc 兩列對齊
function Logo({ src }: { src: string }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- 小尺寸的 SVG 標誌 */}
      <img src={src} alt="" className="h-6 w-6 object-contain" />
    </span>
  );
}

function Method({ name, desc, busy, children }: { name: string; desc: string; busy: string | null; children?: React.ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
        {name}
        {busy && <span className="text-xs font-normal text-accent-ink">{busy}</span>}
      </span>
      <span className="mt-0.5 block text-xs leading-snug text-ink-3">{desc}</span>
      {children}
    </span>
  );
}
