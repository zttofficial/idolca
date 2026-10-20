"use client";

import { Link } from "@/i18n/navigation";
import { itemTitle } from "@/lib/item-title";
import type { AdminItem } from "@/lib/server/admin-queries";
import type { CollectorItem } from "@/lib/items";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import AdminList from "./AdminList";
import VaultConvert from "./VaultConvert";
import { Facts, Party, Thumb, TxLink, when, type Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const ITEM_VIEW_LABEL: Record<string, string> = { all: "All", vault: "Vault requests", unverified: "Unverified", fake: "Fake" };

export const ITEM_STATUSES = ["all", "vault", "unverified", "fake"] as const;
const requested = (i: AdminItem) => Boolean(i.vaultRequestedAt) && i.verification !== "fake";

// 用戶自由上鏈的收藏卡：申請寄進金庫的排最前面。點一列在右側標假卡；申請寄進金庫的，鑑定後轉成金庫卡或退回
export default function AdminItems({ call, onChanged }: { call: Call; onChanged: () => void }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">User-minted cards</h2>
      <p className="mt-1 mb-4 text-xs text-ink-3">Marking a card fake is permanent on-chain and removes it from sale.</p>
      <AdminList<AdminItem>
        endpoint="/api/admin/items"
        call={call}
        onChanged={onChanged}
        rowKey={(i) => i.id}
        search="Search title, group, member, owner email or wallet, item ID"
        dates
        filters={[{ key: "status", label: "Status", options: ITEM_STATUSES.map((s) => ({ value: s, label: ITEM_VIEW_LABEL[s] })) }]}
        renderRow={(i) => (
          <>
            <Thumb src={i.photo} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{itemTitle(i)}</span>
              <span className="flex flex-wrap gap-x-3 text-xs text-ink-3">
                <span>{i.owner.email ?? i.owner.name}</span>
                <span>{when(i.createdAt)}</span>
                {!i.mintTx && <span>not on-chain</span>}
              </span>
            </span>
            {i.verification === "fake" ? (
              <span className="text-xs font-semibold text-down">Fake</span>
            ) : (
              requested(i) && <span className="rounded-full bg-notice-bg px-2.5 py-0.5 text-xs font-semibold text-notice-ink">Vault request</span>
            )}
          </>
        )}
        detail={{
          title: (i) => itemTitle(i),
          render: (i, { busy, act, call }) => (
            <div className="space-y-5">
              <div className="flex gap-3 overflow-x-auto">
                {i.photos.map((src) => (
                  <span key={src} className="w-24 shrink-0">
                    <Thumb src={src} />
                  </span>
                ))}
              </div>
              <Facts
                rows={[
                  [
                    "Item ID",
                    <span key="id" className="font-mono text-xs break-all">
                      {i.id}
                    </span>,
                  ],
                  ["Owner", <Party key="o" party={i.owner} />],
                  ["Group", `${i.group} · ${i.member}`],
                  ["Album", [i.album, i.version].filter(Boolean).join(" · ")],
                  ["Created", when(i.createdAt)],
                  ["Listed", i.priceUsdt !== null && `${i.priceUsdt} USD · ${when(i.listedAt)}`],
                  [
                    "NFT",
                    i.mintTx && i.asset ? (
                      <a key="a" href={solscanUrl("account", i.asset)} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                        {shortAddress(i.asset)} ↗
                      </a>
                    ) : (
                      "not on-chain"
                    ),
                  ],
                  [
                    "Verification",
                    i.verification === "fake" ? (
                      <span key="f" className="font-semibold text-down">
                        Fake
                      </span>
                    ) : (
                      i.verificationNote
                    ),
                  ],
                ]}
              />
              <p className="flex flex-wrap gap-3 text-xs">
                <Link href={`/listing/${i.id}`} className="text-accent-ink hover:underline">
                  {"Listing page"} ↗
                </Link>
                <TxLink label="Fake label" sig={i.fakeTx} />
              </p>
              {requested(i) && (
                <VaultConvert
                  item={i as CollectorItem}
                  busy={busy !== undefined}
                  onConvert={(body) => act(`${i.id}:vault`, () => call("POST", `/api/admin/items/${i.id}/vault`, body))}
                  onReturn={() => act(`${i.id}:vault`, () => call("DELETE", `/api/admin/items/${i.id}/vault`))}
                />
              )}
              {i.verification !== "fake" && (
                <div className="border-t border-line pt-4">
                  <button
                    disabled={busy !== undefined}
                    onClick={() =>
                      window.confirm("Mark this card fake? On-chain this is permanent.") &&
                      act(i.id, () => call("PATCH", `/api/admin/items/${i.id}`, { verification: "fake", note: "Found not genuine by Idolca" }))
                    }
                    className="rounded-full border border-down px-4 py-1.5 text-xs font-semibold text-down hover:bg-down/10 disabled:opacity-50"
                  >
                    {busy === i.id ? "…" : "Mark fake"}
                  </button>
                </div>
              )}
            </div>
          ),
        }}
      />
    </section>
  );
}
