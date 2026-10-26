"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import type { AdminUser, AdminUserDetail } from "@/lib/server/admin-queries";
import AdminList from "./AdminList";
import { Facts, TxLink, Wallet, adminHref, when, type Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const USER_ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User" };
const WALLET_KIND_LABEL: Record<string, string> = { external: "External wallet", privy: "Idolca collection wallet" };
const USER_COUNT_LABEL: Record<string, string> = {
  bought: "Bought",
  sold: "Sold",
  items: "Collector cards",
  deposited: "Deposited",
  trades: "Vault trades",
  packOrders: "Pack orders",
  redemptions: "Redemptions",
};
const SALE_KIND_LABEL: Record<string, string> = { buy: "Fixed price", auction: "Auction" };

// 用戶查詢：搜郵箱、錢包、暱稱或帳號 id；點開在右側看帳號資料、各類紀錄的數量和最近的訂單、成交、開包，
// 可以在這裡設為管理員或撤銷（同管理員頁籤，用同一個接口）
export default function AdminUserList({ call, me }: { call: Call; me: string }) {
  const tb = useTranslations("Binder");
  return (
    <section>
      <h2 className="text-lg font-semibold">Users</h2>
      <p className="mt-1 mb-4 text-xs text-ink-3">Find an account by email, wallet, display name or ID to see its activity. Admin rights can be granted here too.</p>
      <AdminList<AdminUser, AdminUserDetail>
        endpoint="/api/admin/users"
        call={call}
        rowKey={(u) => u.id}
        search="Search email, wallet, display name or user ID"
        dates
        filters={[{ key: "role", label: "Role", options: ["", "admin", "user"].map((v) => ({ value: v, label: v ? USER_ROLE_LABEL[v] : "Any" })) }]}
        renderRow={(u) => (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {u.name}
                {u.admin && <span className="ml-2 text-xs font-normal text-accent-ink">Admin</span>}
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs text-ink-3">
                {u.email && <span className="break-all">{u.email}</span>}
                {u.wallet && (
                  <span className="font-mono">
                    {u.wallet.slice(0, 4)}…{u.wallet.slice(-4)}
                  </span>
                )}
              </span>
            </span>
            <span className="text-xs text-ink-3">{when(u.createdAt)}</span>
          </>
        )}
        detail={{
          title: (d) => d.user.name,
          path: "/api/admin/users/",
          render: ({ user: u, counts, orders, trades, packOrders }, { busy, act, call }) => {
            const target = u.email ?? u.wallet;
            return (
              <div className="space-y-6">
                <Facts
                  rows={[
                    [
                      "User ID",
                      <span key="id" className="font-mono text-xs break-all">
                        {u.id}
                      </span>,
                    ],
                    ["Email", u.email && `${u.email}${u.emailVerified ? "" : ` · ${"unverified"}`}`],
                    ["Wallet", u.wallet && <Wallet key="w" address={u.wallet} />],
                    ["Wallet type", u.walletKind && WALLET_KIND_LABEL[u.walletKind]],
                    ["Role", `${u.admin ? "Admin" : "User"}${u.adminByEnv ? ` · ${"Set by the ADMIN_WALLETS environment variable"}` : ""}`],
                    ["Created", when(u.createdAt)],
                  ]}
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["bought", "sold", "items", "deposited", "trades", "packOrders", "redemptions"] as const).map((k) => (
                    <div key={k} className="rounded-xl bg-surface-2 px-3 py-2">
                      <p className="text-[11px] text-ink-3">{USER_COUNT_LABEL[k]}</p>
                      <p className="font-semibold tabular-nums">{counts[k]}</p>
                    </div>
                  ))}
                </div>
                <p className="flex flex-wrap gap-3 text-xs">
                  <Link href={adminHref("orders", { status: "all", q: u.email ?? u.wallet ?? u.id })} className="text-accent-ink hover:underline">
                    All orders
                  </Link>
                  <Link href={adminHref("sales", { q: u.wallet ?? u.email ?? u.id })} className="text-accent-ink hover:underline">
                    All sales
                  </Link>
                  <Link href={adminHref("items", { q: u.email ?? u.wallet ?? u.id })} className="text-accent-ink hover:underline">
                    All collector cards
                  </Link>
                </p>
                {orders.length > 0 && (
                  <Recent title="Escrow orders">
                    {orders.map((o) => (
                      <li key={o.id} className="flex flex-wrap gap-x-3 py-2 text-sm">
                        <Link href={adminHref("orders", { status: "all", q: o.id, open: o.id })} className="min-w-0 flex-1 truncate hover:underline">
                          {o.title || o.id}
                        </Link>
                        <span className="text-xs text-ink-3">
                          {o.role === "buyer" ? "Buyer" : "Seller"} · {tb(`orderStatus_${o.status}`)} · {formatPrice(o.priceUsdt, 2)} · {when(o.at)}
                        </span>
                      </li>
                    ))}
                  </Recent>
                )}
                {trades.length > 0 && (
                  <Recent title="Vault card trades">
                    {trades.map((x) => (
                      <li key={x.signature} className="flex flex-wrap gap-x-3 py-2 text-sm">
                        <Link href={adminHref("cards", { state: "all", open: x.cardId })} className="min-w-0 flex-1 truncate hover:underline">
                          {x.serial ?? x.cardId}
                        </Link>
                        <span className="text-xs text-ink-3">
                          {x.role === "buyer" ? "Buyer" : "Seller"} · {SALE_KIND_LABEL[x.kind]} · {formatPrice(x.priceUsdt, 2)} · {when(x.at)}
                        </span>
                        <TxLink label="Tx" sig={x.signature} />
                      </li>
                    ))}
                  </Recent>
                )}
                {packOrders.length > 0 && (
                  <Recent title="Pack orders">
                    {packOrders.map((o) => (
                      <li key={o.id} className="flex flex-wrap gap-x-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {o.pack} ×{o.qty}
                        </span>
                        <span className="text-xs text-ink-3">
                          {formatPrice(o.amountUsdt, 2)} · {when(o.at)}
                        </span>
                      </li>
                    ))}
                  </Recent>
                )}
                {target && (
                  <div className="border-t border-line pt-4">
                    {!u.admin ? (
                      <button
                        disabled={busy !== undefined}
                        onClick={() => window.confirm(`Give ${target} admin access?`) && act(`${u.id}:admin`, () => call("POST", "/api/admin/admins", { target }))}
                        className="btn-secondary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {busy === `${u.id}:admin` ? "…" : "Make admin"}
                      </button>
                    ) : (
                      u.role === "admin" &&
                      u.id !== me && (
                        <button
                          disabled={busy !== undefined}
                          onClick={() => window.confirm(`Revoke admin access for ${u.name}?`) && act(`${u.id}:admin`, () => call("DELETE", `/api/admin/admins/${u.id}`))}
                          className="btn-danger rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          {busy === `${u.id}:admin` ? "…" : "Revoke"}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          },
        }}
      />
    </section>
  );
}

function Recent({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-1 divide-y divide-line">{children}</ul>
    </div>
  );
}
