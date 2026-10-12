"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ARC } from "@/lib/arc";
import { useEvmWallets, type EvmWallet } from "@/lib/evm/arc-wallet";

// 「用 Arc 上的 USDC 付款」：買家在 EVM 錢包簽一個授權就付款完成，不用 SOL、不付手續費。
// 裝了多個 EVM 錢包時先讓買家選一個。Arc 通道沒開通時不顯示
export default function ArcPayButton({ label, disabled, pay }: { label: string; disabled?: boolean; pay: (wallet: EvmWallet) => Promise<void> }) {
  const t = useTranslations("Arc");
  const wallets = useEvmWallets();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!ARC) return null;

  const run = async (wallet: EvmWallet) => {
    setChoosing(false);
    setBusy(true);
    setError(undefined);
    try {
      await pay(wallet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "generic");
    } finally {
      setBusy(false);
    }
  };
  const start = () => {
    if (!wallets.length) return setError("no_evm_wallet");
    if (wallets.length === 1) return run(wallets[0]);
    setChoosing(true);
  };

  return (
    <div className="mt-2">
      <button
        onClick={start}
        disabled={disabled || busy}
        className="w-full rounded-full border border-line-strong bg-surface px-6 py-3 text-sm font-semibold hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t("signing") : label}
      </button>
      {choosing && (
        <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-xs text-ink-3">{t("chooseWallet")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {wallets.map((w) => (
              <button key={w.id} onClick={() => run(w)} className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- 錢包自己提供的 data URI 圖示 */}
                <img src={w.icon} alt="" className="h-4 w-4" />
                {w.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-1.5 text-center text-[11px] text-ink-3">{t("note")}</p>
      {error && <p className="mt-1 text-center text-xs text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : t("error_generic")}</p>}
    </div>
  );
}
