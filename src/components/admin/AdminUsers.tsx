"use client";

import { useCallback, useEffect, useState } from "react";

import { shortAddress } from "@/lib/solana/config";
import { field, label, type Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const ADMIN_ERROR_LABEL: Record<string, string> = {
  no_account: "No account found. They need to sign in to the site once first.",
  invalid_target: "Enter an email or wallet address.",
  cannot_revoke_self: "You can't revoke your own admin access.",
  not_found: "This account no longer exists.",
};

type Admin = { id: string | null; displayName: string | null; email: string | null; walletAddress: string | null; source: "role" | "env" };

const ADMIN_ERRORS = ["no_account", "invalid_target", "cannot_revoke_self", "not_found"];

// 管理員名單：資料庫 role 是 admin 的帳號可以在這裡授予和撤銷；ADMIN_WALLETS 設定的錢包只顯示，要改得改環境變數
export default function AdminUsers({ call, me }: { call: Call; me: string }) {
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const message = (code: string) => (ADMIN_ERRORS.includes(code) ? ADMIN_ERROR_LABEL[code] : `Error: ${code}`);

  const load = useCallback(async () => {
    try {
      setAdmins((await call<{ admins: Admin[] }>("GET", "/api/admin/admins")).admins);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [call]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 進入頁籤時讀名單
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const grant = (e: React.FormEvent) => {
    e.preventDefault();
    const value = target.trim();
    if (!value || !window.confirm(`Give ${value} admin access?`)) return;
    act("grant", () => call("POST", "/api/admin/admins", { target: value })).then((ok) => ok && setTarget(""));
  };

  return (
    <section>
      <h2 className="text-lg font-semibold">Admins</h2>
      <p className="mt-1 text-xs text-ink-3">Admins can use every tool in this console. Grant access by email or wallet address; the person needs to have signed in to the site once.</p>
      {error && <p className="mt-3 rounded-xl bg-down/10 px-4 py-2 text-sm text-down">{message(error)}</p>}

      <form onSubmit={grant} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-5">
        <label className={`${label} min-w-64 flex-1`}>
          Email or wallet address
          <input required value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Email or wallet address" className={field} />
        </label>
        <button disabled={busy !== undefined} className="btn-primary rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
          {busy === "grant" ? "…" : "Make admin"}
        </button>
      </form>

      {!admins?.length ? (
        <p className="mt-4 text-sm text-ink-3">{admins ? "Nothing here yet." : "…"}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {admins.map((a) => {
            const name = a.displayName ?? a.email ?? (a.walletAddress ? shortAddress(a.walletAddress) : "");
            return (
              <li key={a.id ?? a.walletAddress} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {a.displayName ?? "(no account yet)"}
                    {a.id === me && <span className="ml-2 text-xs font-normal text-ink-3">you</span>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-3 text-xs text-ink-3">
                    {a.email && <span>{a.email}</span>}
                    {a.walletAddress && (
                      <span className="font-mono" title={a.walletAddress}>
                        {shortAddress(a.walletAddress)}
                      </span>
                    )}
                  </p>
                </div>
                {a.source === "env" ? (
                  <span className="text-xs text-ink-3">Set by the ADMIN_WALLETS environment variable</span>
                ) : (
                  a.id &&
                  a.id !== me && (
                    <button
                      disabled={busy !== undefined}
                      onClick={() => window.confirm(`Revoke admin access for ${name}?`) && act(a.id!, () => call("DELETE", `/api/admin/admins/${a.id}`))}
                      className="btn-danger rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      {busy === a.id ? "…" : "Revoke"}
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
