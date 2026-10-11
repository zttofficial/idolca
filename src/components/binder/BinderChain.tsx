"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthContext";
import CardArt from "@/components/market/CardArt";
import { Link } from "@/i18n/navigation";
import { formatUsdt } from "@/lib/fx";
import { postAction, useVaultCards } from "@/lib/chain-client";
import { solscanUrl } from "@/lib/solana/config";


// 收藏冊的「鏈上卡」：我錢包裡的金庫卡（買來的、開卡包抽到的）
export function OnChainCards() {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const { user } = useAuth();
  const vault = useVaultCards();
  const wallet = user?.walletAddress;

  if (!wallet) return <p className="mt-6 text-sm text-ink-3">{t("onchainNoWallet")}</p>;
  if (!vault) return <div className="mt-6 h-32 animate-pulse rounded-2xl bg-surface-2" />;
  // 錢包裡的金庫卡：買來的、開卡包抽到的、自己寄存的；掛單中的持有人是賣家本人
  const owned = vault.filter((c) => c.owner === wallet);
  if (!owned.length) return <p className="mt-6 text-sm text-ink-3">{t("onchainEmpty")}</p>;
  return (
    <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-6">
      {owned.map((c) => (
        <Link key={c.id} href={`/card/${c.id}`} className="group">
          <div className="aspect-[55/85] overflow-hidden rounded-xl">
            <CardArt card={c} rarityLabel={tRarity(c.rarity)} className="block h-full w-full transition group-hover:scale-[1.03]" />
          </div>
          <p className="mt-2 truncate text-sm font-semibold">{c.member}</p>
          <p className="text-xs text-ink-3">{c.status === "listed" ? t("onchainListed", { price: formatUsdt(c.priceUsdt) }) : c.status === "redeeming" ? t("onchainRedeeming") : t("onchainHeld")}</p>
        </Link>
      ))}
    </div>
  );
}

type Order = {
  id: string;
  role: "buyer" | "seller";
  status: "paid" | "shipped" | "disputed" | "refunding" | "releasing" | "completed" | "refunded" | "cancelled";
  itemId: string;
  title: string;
  photo: string | null;
  priceUsdt: number;
  feeUsdt: number;
  payTx: string | null;
  payoutTx: string | null;
  payoutHeld: boolean;
  transferTx: string | null;
  refundTx: string | null;
  disputeReason: string | null;
  shipBy: string | null;
  autoReleaseAt: string | null;
};

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// 擔保交易訂單：賣家標記寄出，買家確認收貨（平台隨即放款、轉移 NFT）。
// 賣家過了寄出期限沒寄，買家可以取消退款；買家收到有問題可以申訴，申訴中暫停自動放款
export function Orders() {
  const t = useTranslations("Binder");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [disputing, setDisputing] = useState<string>();
  const [reason, setReason] = useState("");
  // 期限比較用的現在時間，讀訂單時更新
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/orders");
    setOrders(res.ok ? ((await res.json()) as { orders: Order[] }).orders : []);
    setNow(Date.now());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 進入頁籤時讀訂單
    load();
  }, [load]);

  const act = async (id: string, step: "ship" | "receive" | "refund" | "dispute", body?: unknown) => {
    setBusy(id);
    setError(undefined);
    try {
      await postAction(`/api/orders/${id}/${step}`, body);
      setDisputing(undefined);
      setReason("");
      await load();
    } catch {
      setError(id);
    } finally {
      setBusy(undefined);
    }
  };

  if (!orders) return <div className="mt-6 h-32 animate-pulse rounded-2xl bg-surface-2" />;
  if (!orders.length) return <p className="mt-6 text-sm text-ink-3">{t("ordersEmpty")}</p>;
  const tx = (label: string, sig: string | null) =>
    sig && (
      <a href={solscanUrl("tx", sig)} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
        {label} ↗
      </a>
    );
  return (
    <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
      {orders.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
          <div className="aspect-[55/85] w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
            {o.photo && <img src={o.photo} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{o.title}</p>
            <p className="text-xs text-ink-3">
              {t(`orderRole_${o.role}`)} · {formatUsdt(o.priceUsdt)} · <span className="font-medium text-ink-2">{t(`orderStatus_${o.status}`)}</span>
              {o.role === "seller" && o.status === "completed" && o.payoutHeld && <span className="text-notice-ink"> · {t("payoutHeld")}</span>}
            </p>
            <p className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-ink-3">
              {tx(t("txPayment"), o.payTx)}
              {tx(t("txTransfer"), o.transferTx)}
              {tx(t("txRefund"), o.refundTx ?? (o.status === "cancelled" ? o.payoutTx : null))}
              {o.status !== "cancelled" && tx(t("txPayout"), o.payoutTx)}
            </p>
            {o.status === "paid" && o.shipBy && <p className="mt-0.5 text-[11px] text-ink-3">{t(o.role === "seller" ? "shipBySeller" : "shipByBuyer", { date: dateOf(o.shipBy) })}</p>}
            {o.status === "shipped" && o.autoReleaseAt && <p className="mt-0.5 text-[11px] text-ink-3">{t("autoRelease", { date: dateOf(o.autoReleaseAt) })}</p>}
            {o.status === "disputed" && <p className="mt-0.5 text-[11px] text-notice-ink">{t("disputedNote")}{o.disputeReason ? ` · ${o.disputeReason}` : ""}</p>}
          </div>
          {o.role === "seller" && o.status === "paid" && (
            <button disabled={busy === o.id} onClick={() => act(o.id, "ship")} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
              {t("markShipped")}
            </button>
          )}
          {o.role === "buyer" && o.status === "shipped" && (
            <button disabled={busy === o.id} onClick={() => act(o.id, "receive")} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
              {busy === o.id ? t("releasing") : t("confirmReceived")}
            </button>
          )}
          {o.role === "buyer" && o.status === "shipped" && disputing !== o.id && (
            <button disabled={busy === o.id} onClick={() => setDisputing(o.id)} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold hover:bg-surface-2 disabled:opacity-50">
              {t("reportProblem")}
            </button>
          )}
          {o.role === "buyer" && o.status === "paid" && o.shipBy && now >= Date.parse(o.shipBy) && (
            <button disabled={busy === o.id} onClick={() => act(o.id, "refund")} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
              {busy === o.id ? t("refunding") : t("cancelRefund")}
            </button>
          )}
          {disputing === o.id && (
            <form
              className="flex w-full flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act(o.id, "dispute", { reason });
              }}
            >
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder={t("disputePlaceholder")}
                className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-1.5 text-xs outline-none focus:border-ink-3"
              />
              <button disabled={busy === o.id || !reason.trim()} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
                {t("submitDispute")}
              </button>
              <button type="button" onClick={() => setDisputing(undefined)} className="rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface-2">
                {t("cancelDispute")}
              </button>
            </form>
          )}
          {error === o.id && <p className="w-full text-xs text-down">{t("orderError")}</p>}
        </li>
      ))}
    </ul>
  );
}
