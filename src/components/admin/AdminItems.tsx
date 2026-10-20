"use client";

import { useTranslations } from "next-intl";
import { itemTitle } from "@/lib/item-title";
import type { CollectorItem } from "@/lib/items";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import VaultConvert from "./VaultConvert";
import { TxLink, type Act, type Call } from "./shared";

// 用戶自由上鏈的收藏卡：標假卡；申請寄進金庫的，鑑定後轉成金庫卡或退回
export default function AdminItems({ items, busy, act, call }: { items: CollectorItem[] | null; busy?: string; act: Act; call: Call }) {
  const t = useTranslations("Admin");
  return (
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
                  {i.mintTx && i.asset ? (
                    <a href={solscanUrl("account", i.asset)} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                      {shortAddress(i.asset)} ↗
                    </a>
                  ) : (
                    <span>{t("notOnChain")}</span>
                  )}
                  <TxLink label={t("fakeTx")} sig={i.fakeTx} />
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
              {i.vaultRequestedAt && i.verification !== "fake" && (
                <VaultConvert
                  item={i}
                  busy={busy !== undefined}
                  onConvert={(body) => act(`${i.id}:vault`, () => call("POST", `/api/admin/items/${i.id}/vault`, body))}
                  onReturn={() => act(`${i.id}:vault`, () => call("DELETE", `/api/admin/items/${i.id}/vault`))}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
