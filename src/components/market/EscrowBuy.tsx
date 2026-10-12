"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthContext";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import { payAndConfirm, payOnArc } from "@/lib/chain-client";
import { solscanUrl } from "@/lib/solana/config";
import { arcExplorerUrl } from "@/lib/arc";
import type { EvmWallet } from "@/lib/evm/arc-wallet";
import PaymentPicker from "@/components/pay/PaymentPicker";

// 自由刊登的購買：按下購買先選付款方式（Solana 錢包或 Arc 上的 USDC），貨款付進平台託管，賣家寄出、買家確認收貨後才放款
export default function EscrowBuy({ itemId, priceUsdt }: { itemId: string; priceUsdt: number }) {
  const t = useTranslations("Listing");
  const { user, login } = useAuth();
  const [picking, setPicking] = useState(false);
  const [paid, setPaid] = useState<{ tx: string; rail: "solana" | "arc" }>();
  const wallet = user?.walletAddress;

  // 兩種付款方式，由付款方式面板呼叫；失敗時丟錯，面板顯示說明
  const buyOnSolana = async () => {
    const { signature } = await payAndConfirm("/api/orders", { itemId }, (id) => `/api/orders/${id}/confirm`, wallet!);
    setPaid({ tx: signature, rail: "solana" });
  };
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
        <button className={button} disabled={picking} onClick={() => setPicking(true)}>
          {t("buyEscrow", { price: formatPrice(priceUsdt) })}
        </button>
      )}
      {picking && (
        <PaymentPicker
          amountUsd={priceUsdt}
          run={{ solana: buyOnSolana, arc: buyOnArc }}
          describeError={(code) => (t.has(`error_${code}`) ? t(`error_${code}`) : null)}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
