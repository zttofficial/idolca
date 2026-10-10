"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { findCard } from "@/lib/mock-cards";
import { itemTitle } from "@/lib/item-title";
import type { CollectorItem } from "@/lib/items";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

type Redemption = { cardId: string; wallet: string; requestTx: string; shipTx: string | null; createdAt: string; onChain: { redeeming: boolean; burned: boolean } | null };

const TOKEN_KEY = "idolca:admin-token";

// 後台：令牌只存在這個分頁（sessionStorage），每個請求帶在 x-admin-token 頭裡
export default function AdminConsole() {
  const t = useTranslations("Admin");
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);
  const [items, setItems] = useState<CollectorItem[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 水合後才能讀 sessionStorage
      setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    } catch {}
  }, []);

  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      const res = await fetch(path, { method, headers: { "content-type": "application/json", "x-admin-token": token }, body: body ? JSON.stringify(body) : undefined });
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) throw new Error(data.error ?? String(res.status));
      return data;
    },
    [token],
  );

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(undefined);
      const [r, i] = await Promise.all([call<{ redemptions: Redemption[] }>("GET", "/api/admin/redemptions"), call<{ items: CollectorItem[] }>("GET", "/api/admin/items")]);
      setRedemptions(r.redemptions);
      setItems(i.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [call, token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 有令牌時讀資料
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(undefined);
    }
  };

  if (!token) {
    return (
      <form
        className="mt-8 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            sessionStorage.setItem(TOKEN_KEY, input);
          } catch {}
          setToken(input);
        }}
      >
        <input type="password" value={input} onChange={(e) => setInput(e.target.value)} placeholder="ADMIN_TOKEN" className="flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-ink" />
        <button className="btn-primary rounded-full px-5 text-sm font-semibold">{t("unlock")}</button>
      </form>
    );
  }

  const tx = (label: string, sig: string | null) =>
    sig && (
      <a href={solscanUrl("tx", sig)} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
        {label} ↗
      </a>
    );

  return (
    <div className="mt-8 space-y-10">
      {error && <p className="rounded-xl bg-down/10 px-4 py-2 text-sm text-down">{t("error", { error })}</p>}

      <section>
        <h2 className="text-lg font-semibold">{t("redemptions")}</h2>
        <p className="mt-1 text-xs text-ink-3">{t("redemptionsHint")}</p>
        {!redemptions?.length ? (
          <p className="mt-4 text-sm text-ink-3">{redemptions ? t("none") : "…"}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {redemptions.map((r) => {
              const card = findCard(r.cardId);
              const shipped = r.shipTx || r.onChain?.burned;
              return (
                <li key={r.cardId} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/card/${r.cardId}`} className="font-semibold hover:underline">
                      {card ? `${card.serial} · ${card.group} ${card.member}` : r.cardId}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap gap-3 text-xs text-ink-3">
                      <span className="font-mono">{shortAddress(r.wallet)}</span>
                      {tx(t("requestTx"), r.requestTx)}
                      {tx(t("shipTx"), r.shipTx)}
                    </p>
                  </div>
                  {shipped ? (
                    <span className="text-xs font-semibold text-up">{t("shipped")}</span>
                  ) : (
                    <button
                      disabled={busy !== undefined}
                      onClick={() => act(r.cardId, () => call("POST", `/api/admin/redemptions/${r.cardId}/ship`))}
                      className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      {busy === r.cardId ? "…" : t("ship")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">{t("items")}</h2>
        <p className="mt-1 text-xs text-ink-3">{t("itemsHint")}</p>
        {!items?.length ? (
          <p className="mt-4 text-sm text-ink-3">{items ? t("none") : "…"}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                <div className="aspect-[55/85] w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
                  <img src={i.photo} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{itemTitle(i)}</p>
                  <p className="mt-0.5 flex flex-wrap gap-3 text-xs text-ink-3">
                    {i.mintTx ? (
                      <a href={solscanUrl("account", i.asset)} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                        {shortAddress(i.asset)} ↗
                      </a>
                    ) : (
                      <span>{t("demoItem")}</span>
                    )}
                    {tx(t("fakeTx"), i.fakeTx)}
                  </p>
                </div>
                {i.verification === "fake" ? (
                  <span className="text-xs font-semibold text-down">{t("isFake")}</span>
                ) : (
                  <button
                    disabled={busy !== undefined}
                    onClick={() => window.confirm(t("fakeConfirm")) && act(i.id, () => call("PATCH", `/api/admin/items/${i.id}`, { verification: "fake", note: t("fakeNote") }))}
                    className="rounded-full border border-down px-4 py-1.5 text-xs font-semibold text-down hover:bg-down/10 disabled:opacity-50"
                  >
                    {busy === i.id ? "…" : t("markFake")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
