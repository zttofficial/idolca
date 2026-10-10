"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { PRIVY_APP_ID } from "./Providers";
import { getUsdtBalance } from "@/lib/solana/balance";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import { formatUsdt } from "@/lib/fx";

const BUTTON =
  "rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-medium transition hover:bg-surface-3";

export default function WalletButton() {
  const t = useTranslations("Wallet");
  if (!PRIVY_APP_ID) {
    return (
      <button className={`${BUTTON} cursor-not-allowed opacity-50`} disabled title={t("notConfigured")}>
        {t("connect")}
      </button>
    );
  }
  return <PrivyWalletButton />;
}

function PrivyWalletButton() {
  const t = useTranslations("Wallet");
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address ?? user?.wallet?.address;
  const [balance, setBalance] = useState<{ owner: string; usdt: number | null }>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    getUsdtBalance(walletAddress)
      .then((usdt) => !cancelled && setBalance({ owner: walletAddress, usdt }))
      .catch(() => !cancelled && setBalance({ owner: walletAddress, usdt: null }));
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  if (!ready) {
    return (
      <button className={`${BUTTON} opacity-50`} disabled>
        {t("connect")}
      </button>
    );
  }

  if (!authenticated || !walletAddress) {
    return (
      <button className="btn-primary rounded-full px-4 py-1.5 text-sm font-semibold" onClick={login}>
        {t("connect")}
      </button>
    );
  }

  const usdt = balance?.owner === walletAddress ? balance.usdt : undefined;
  const balanceLabel = usdt === undefined ? "…" : usdt === null ? "—" : formatUsdt(usdt, 2);

  return (
    <div className="relative">
      <button className={`${BUTTON} flex items-center gap-2 font-mono`} onClick={() => setOpen((v) => !v)}>
        <span className="h-1.5 w-1.5 rounded-full bg-up" />
        <span>{shortAddress(walletAddress)}</span>
        <span className="hidden text-ink-3 sm:inline">{balanceLabel}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-surface shadow-xl p-3 text-sm shadow-xl backdrop-blur">
          <p className="text-xs text-ink-3">{t("address")}</p>
          <p className="mt-1 break-all font-mono text-xs text-ink">{walletAddress}</p>
          <p className="mt-3 text-xs text-ink-3">{t("balance")}</p>
          <p className="mt-1 font-mono">{balanceLabel}</p>
          <div className="mt-3 flex gap-2">
            <a
              href={solscanUrl("account", walletAddress)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-lg border border-line py-1.5 text-center text-xs hover:bg-surface-3"
            >
              Solscan
            </a>
            <button
              className="flex-1 rounded-lg border border-line py-1.5 text-xs hover:bg-surface-3"
              onClick={() => {
                setOpen(false);
                logout();
              }}
            >
              {t("logout")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
