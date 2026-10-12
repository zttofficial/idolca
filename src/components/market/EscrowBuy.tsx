"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthContext";
import { Link } from "@/i18n/navigation";
import { formatStable, formatPrice } from "@/lib/fx";
import { payAndConfirm, payOnArc } from "@/lib/chain-client";
import { solscanUrl } from "@/lib/solana/config";
import { arcExplorerUrl } from "@/lib/arc";
import type { EvmWallet } from "@/lib/evm/arc-wallet";
import ArcPayButton from "@/components/pay/ArcPayButton";

// 自由刊登的購買：貨款用 Solana 錢包或在 Arc 上用 USDC 付進平台託管，賣家寄出、買家確認收貨後才放款
export default function EscrowBuy({ itemId, priceUsdt }: { itemId: string; priceUsdt: number }) {
  const t = useTranslations("Listing");
  const tArc = useTranslations("Arc");
  const { user, login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [paid, setPaid] = useState<{ tx: string; rail: "solana" | "arc" }>();
  const wallet = user?.walletAddress;

  const buy = async () => {
    if (!wallet) return;
    setBusy(true);
    setError(undefined);
    try {
      const { signature } = await payAndConfirm("/api/orders", { itemId }, (id) => `/api/orders/${id}/confirm`, wallet);
      setPaid({ tx: signature, rail: "solana" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      setBusy(false);
    }
  };

  // 在 Arc 上付款：錯誤由按鈕自己顯示
  const buyOnArc = async (evm: EvmWallet) => {
    const { payTx } = await payOnArc<{ payTx: string }>("/api/orders", { itemId }, (id) => `/api/orders/${id}/confirm`, evm);
    setPaid({ tx: payTx, rail: "arc" });
  };

  const button = "btn-primary mt-4 w-full rounded-full py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  if (paid) {
    return (
      <div className="mt-4 rounded-xl bg-up/10 p-4 text-sm text-up">
        <p className="font-semibold">{t("paid")}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <a href={paid.rail === "arc" ? arcExplorerUrl("tx", paid.tx) : solscanUrl("tx", paid.tx)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {t("viewPayment")} ↗
          </a>
          <Link href="/binder?tab=orders" className="font-semibold underline underline-offset-2">
            {t("viewOrders")}
          </Link>
        </div>
      </div>
    );
  }
  return (
    <>
      {!user ? (
        <button className={button} onClick={login}>
          {t("loginToBuy")}
        </button>
      ) : !wallet ? (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-center text-sm text-ink-2">{t("linkWalletToBuy")}</p>
      ) : (
        <>
          <button className={button} disabled={busy} onClick={buy}>
            {busy ? t("confirmInWallet") : t("buyEscrow", { price: formatPrice(priceUsdt) })}
          </button>
          <ArcPayButton label={tArc("pay", { total: formatStable(priceUsdt, "USDC") })} disabled={busy} pay={buyOnArc} />
        </>
      )}
      {error && <p className="mt-2 text-xs text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : t("error_generic")}</p>}
    </>
  );
}
