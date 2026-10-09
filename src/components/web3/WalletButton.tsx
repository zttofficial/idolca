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
  "rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium transition hover:bg-white/10";

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
      <button className="btn-holo rounded-full px-4 py-1.5 text-sm font-semibold text-white" onClick={login}>
        {t("connect")}
      </button>
    );
  }

  const usdt = balance?.owner === walletAddress ? balance.usdt : undefined;
  const balanceLabel = usdt === undefined ? "…" : usdt === null ? "—" : formatUsdt(usdt, 2);

  return (
    <div className="relative">
      <button className={`${BUTTON} flex items-center gap-2 font-mono`} onClick={() => setOpen((v) => !v)}>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span>{shortAddress(walletAddress)}</span>
        <span className="hidden text-white/50 sm:inline">{balanceLabel}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-white/10 bg-black/90 p-3 text-sm shadow-xl backdrop-blur">
          <p className="text-xs text-white/45">{t("address")}</p>
          <p className="mt-1 break-all font-mono text-xs text-white/85">{walletAddress}</p>
          <p className="mt-3 text-xs text-white/45">{t("balance")}</p>
          <p className="mt-1 font-mono">{balanceLabel}</p>
          <div className="mt-3 flex gap-2">
            <a
              href={solscanUrl("account", walletAddress)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-lg border border-white/10 py-1.5 text-center text-xs hover:bg-white/10"
            >
              Solscan
            </a>
            <button
              className="flex-1 rounded-lg border border-white/10 py-1.5 text-xs hover:bg-white/10"
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
