"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthContext";
import type { CollectorItem } from "@/lib/items";
import VaultIntake from "./VaultIntake";
import VaultGrade from "./VaultGrade";
import AdminPacks from "./AdminPacks";
import AdminOrders, { type Order } from "./AdminOrders";
import AdminRedemptions, { pendingRedemption, type Redemption } from "./AdminRedemptions";
import AdminItems from "./AdminItems";
import AdminFees from "./AdminFees";
import AdminUsers from "./AdminUsers";
import type { Act, Call } from "./shared";

const TABS = ["intake", "packs", "orders", "redemptions", "items", "fees", "admins"] as const;
type Tab = (typeof TABS)[number];

// 後台：管理員帳號登入後使用，權限由伺服器按會話檢查。
// 頁籤跟著網址走（?tab=fees），重新整理或分享連結時停在同一頁；訂單、提貨、收藏卡一進來就讀，頁籤上標出待處理的數量
export default function AdminConsole() {
  const t = useTranslations("Admin");
  const { ready, user, login } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const wanted = sp.get("tab") as Tab | null;
  const tab: Tab = wanted && TABS.includes(wanted) ? wanted : "intake";
  const setTab = (next: Tab) => router.replace(next === "intake" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);
  const [items, setItems] = useState<CollectorItem[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const call: Call = useCallback(async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? String(res.status));
    return data;
  }, []);

  const load = useCallback(async () => {
    if (!user?.isAdmin) return;
    try {
      setError(undefined);
      const [r, i, o] = await Promise.all([
        call<{ redemptions: Redemption[] }>("GET", "/api/admin/redemptions"),
        call<{ items: CollectorItem[] }>("GET", "/api/admin/items"),
        call<{ orders: Order[] }>("GET", "/api/admin/orders"),
      ]);
      setRedemptions(r.redemptions);
      setItems(i.items);
      setOrders(o.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [call, user?.isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 有令牌時讀資料
    load();
  }, [load]);

  const act: Act = async (key, fn) => {
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

  if (!ready) return <div className="mt-8 h-32 animate-pulse rounded-2xl bg-surface-2" />;
  if (!user) {
    return (
      <button onClick={login} className="btn-primary mt-8 rounded-full px-6 py-2.5 text-sm font-semibold">
        {t("login")}
      </button>
    );
  }
  if (!user.isAdmin) return <p className="mt-8 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">{t("forbidden")}</p>;

  // 待處理：申訴中的訂單、還沒出貨的提貨、申請寄進金庫的收藏卡
  const counts: Partial<Record<Tab, number>> = {
    orders: orders?.filter((o) => o.status === "disputed").length,
    redemptions: redemptions?.filter(pendingRedemption).length,
    items: items?.filter((i) => i.vaultRequestedAt && i.verification !== "fake").length,
  };
  const shared = { busy, act, call };

  return (
    <div className="mt-8">
      <div role="tablist" className="flex gap-6 overflow-x-auto border-b border-line">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-semibold transition ${tab === id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
          >
            {t(`tab_${id}`)}
            {!!counts[id] && <span className="ml-1.5 text-ink-3 tabular-nums">{counts[id]}</span>}
          </button>
        ))}
      </div>

      <div className="mt-8 space-y-10">
        {error && <p className="rounded-xl bg-down/10 px-4 py-2 text-sm text-down">{t("error", { error })}</p>}
        {tab === "intake" && (
          <>
            <VaultIntake />
            <VaultGrade />
          </>
        )}
        {tab === "packs" && <AdminPacks call={call} />}
        {tab === "orders" && <AdminOrders orders={orders} {...shared} />}
        {tab === "redemptions" && <AdminRedemptions redemptions={redemptions} error={error} {...shared} />}
        {tab === "items" && <AdminItems items={items} {...shared} />}
        {tab === "fees" && <AdminFees call={call} />}
        {tab === "admins" && <AdminUsers call={call} me={user.id} />}
      </div>
    </div>
  );
}
