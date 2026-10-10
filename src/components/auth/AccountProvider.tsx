"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext, type AuthState, type AuthUser } from "./AuthContext";
import AccountModal from "./AccountModal";
import { attachAccount, detachAccount } from "@/lib/binder";
import { AddCardHost } from "@/components/binder/AddCard";
import { clearItems, refreshItems } from "@/lib/items";

type Me = { configured: boolean; user: AuthUser | null };

export default function AccountProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me>();
  const [open, setOpen] = useState(false);

  const signedIn = useCallback((user: AuthUser) => {
    setMe({ configured: true, user });
    setOpen(false);
    attachAccount().catch(() => {});
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
          attachAccount().catch(() => {});
          refreshItems().catch(() => {});
        }
      })
      .catch(() => !cancelled && setMe({ configured: false, user: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready: me !== undefined,
      configured: me?.configured ?? false,
      user: me?.user ?? null,
      login: () => setOpen(true),
      logout: async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        detachAccount();
        clearItems();
        setMe((m) => ({ configured: m?.configured ?? true, user: null }));
      },
    }),
    [me],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AddCardHost />
      {open && <AccountModal configured={value.configured} onClose={() => setOpen(false)} onSignedIn={signedIn} />}
    </AuthContext.Provider>
  );
}
