"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthContext";
import VaultIntake from "./VaultIntake";
import AdminQueue, { type Queue } from "./AdminQueue";
import AdminCards from "./AdminCards";
import AdminPacks from "./AdminPacks";
import AdminOrders from "./AdminOrders";
import AdminRedemptions from "./AdminRedemptions";
import AdminItems from "./AdminItems";
import AdminSales from "./AdminSales";
import AdminUserList from "./AdminUserList";
import AdminFees from "./AdminFees";
import AdminUsers from "./AdminUsers";
import type { Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const TAB_LABEL: Record<string, string> = {
  intake: "Intake",
  packs: "Packs",
  orders: "Escrow orders",
  redemptions: "Redemptions",
  items: "Collection cards",
  fees: "Fees",
  admins: "Admins",
  queue: "To do",
  cards: "Vault cards",
  sales: "Sales",
  users: "Users",
};

const TABS = ["queue", "intake", "cards", "packs", "orders", "redemptions", "items", "sales", "users", "fees", "admins"] as const;
type Tab = (typeof TABS)[number];

// 後台：管理員帳號登入後使用，權限由伺服器按會話檢查。
// 頁籤跟著網址走（?tab=fees），各列表的搜尋和篩選也在網址上，重新整理或分享連結時停在同一頁。
// 一進來只讀待處理（各項數量和最前面幾筆，頁籤上的數字也來自這裡）；其他頁籤打開時才讀自己的資料，而且一次只讀一頁
export default function AdminConsole() {
  const { ready, user, login } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const wanted = sp.get("tab") as Tab | null;
  const tab: Tab = wanted && TABS.includes(wanted) ? wanted : "queue";
  // 換頁籤時清掉上一個頁籤的篩選
  const setTab = (next: Tab) => router.replace(next === "queue" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string>();

  const call: Call = useCallback(async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? String(res.status));
    return data;
  }, []);

  const loadQueue = useCallback(async () => {
    if (!user?.isAdmin) return;
    try {
      setError(undefined);
      setQueue(await call<Queue>("GET", "/api/admin/queue"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [call, user?.isAdmin]);

  // 回到待處理時重讀一次，數字跟上別的頁籤裡做完的事
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 有權限時讀待處理
    if (tab === "queue" || !queue) loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在換到待處理、或還沒讀過時讀
  }, [loadQueue, tab]);

  if (!ready) return <div className="mt-8 h-32 animate-pulse rounded-2xl bg-surface-2" />;
  if (!user) {
    return (
      <button onClick={login} className="btn-primary mt-8 rounded-full px-6 py-2.5 text-sm font-semibold">
        Log in with an admin account
      </button>
    );
  }
  if (!user.isAdmin) return <p className="mt-8 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">{"This account isn't an admin."}</p>;

  const counts = queue?.tabs as Partial<Record<Tab, number>> | undefined;
  const shared = { call, onChanged: loadQueue };

  return (
    <div className="mt-8">
      <div role="tablist" className="-mx-4 flex gap-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-semibold transition ${tab === id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
          >
            {TAB_LABEL[id]}
            {!!counts?.[id] && <span className="ml-1.5 text-notice-ink tabular-nums">{counts[id]}</span>}
          </button>
        ))}
      </div>

      <div className="mt-8 space-y-10">
        {error && <p className="rounded-xl bg-down/10 px-4 py-2 text-sm text-down">{`Error: ${error}`}</p>}
        {tab === "queue" && <AdminQueue queue={queue} />}
        {tab === "intake" && <VaultIntake />}
        {tab === "cards" && <AdminCards {...shared} />}
        {tab === "packs" && <AdminPacks {...shared} />}
        {tab === "orders" && <AdminOrders {...shared} />}
        {tab === "redemptions" && <AdminRedemptions {...shared} />}
        {tab === "items" && <AdminItems {...shared} />}
        {tab === "sales" && <AdminSales call={call} />}
        {tab === "users" && <AdminUserList call={call} me={user.id} />}
        {tab === "fees" && <AdminFees call={call} />}
        {tab === "admins" && <AdminUsers call={call} me={user.id} />}
      </div>
    </div>
  );
}
