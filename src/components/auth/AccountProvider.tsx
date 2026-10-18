"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext, type AuthState, type AuthUser } from "./AuthContext";
import AccountModal from "./AccountModal";
import { attachAccount, detachAccount } from "@/lib/binder";
import { AddCardHost } from "@/components/binder/AddCard";
import { clearItems, refreshItems } from "@/lib/items";
import { setPrivyAccount } from "@/lib/privy/bridge";
import PrivyMount from "./PrivyMount";
import { forgetMobileWallet } from "@/lib/solana/wallets";

type Me = { configured: boolean; user: AuthUser | null };

export default function AccountProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me>();
  const [open, setOpen] = useState(false);

  const signedIn = useCallback((user: AuthUser) => {
    setMe({ configured: true, user });
    setOpen(false);
    attachAccount(user.id).catch(() => {});
    refreshItems().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json() as Promise<Me>)
      .then((data) => {
        if (cancelled) return;
        setMe(data);
        if (data.user) {
          attachAccount(data.user.id).catch(() => {});
          refreshItems().catch(() => {});
        }
      })
      .catch(() => !cancelled && setMe({ configured: false, user: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  // 簽名時要知道帳號的錢包是不是收藏錢包（lib/privy/bridge.ts）
  useEffect(() => {
    const u = me?.user;
    setPrivyAccount({ email: u?.email ?? null, walletAddress: u?.walletAddress ?? null, walletKind: u?.walletKind ?? null });
  }, [me]);

  const value = useMemo<AuthState>(
    () => ({
      ready: me !== undefined,
      configured: me?.configured ?? false,
      user: me?.user ?? null,
      login: () => setOpen(true),
      updateUser: (user) => setMe((m) => ({ configured: m?.configured ?? true, user })),
      logout: async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        detachAccount();
        clearItems();
        void forgetMobileWallet();
        setMe((m) => ({ configured: m?.configured ?? true, user: null }));
      },
    }),
    [me],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AddCardHost />
      <PrivyMount />
      {open && <AccountModal configured={value.configured} onClose={() => setOpen(false)} onSignedIn={signedIn} />}
    </AuthContext.Provider>
  );
}
