"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthContext";
import CardArt from "@/components/market/CardArt";
import { Link } from "@/i18n/navigation";
import { formatUsdt } from "@/lib/fx";
import { CARDS } from "@/lib/mock-cards";
import { PACKS, entryCard } from "@/lib/packs";
import { postAction, useChainState } from "@/lib/chain-client";
import { solscanUrl } from "@/lib/solana/config";

type Pull = { entryId: string; cardId: string; asset: string; tx: string; packId: string; openedAt: string };

// 收藏冊的「鏈上卡」：我錢包裡的金庫卡（買來的、開卡包抽到的）
export function OnChainCards() {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const { user } = useAuth();
  const chain = useChainState();
  const [pulls, setPulls] = useState<Pull[] | null>(null);
  const wallet = user?.walletAddress;

  useEffect(() => {
    if (!user) return;
    fetch("/api/packs/mine")
      .then((r) => (r.ok ? r.json() : { pulls: [] }))
      .then((d: { pulls: Pull[] }) => setPulls(d.pulls))
      .catch(() => setPulls([]));
  }, [user]);

  if (!wallet) return <p className="mt-6 text-sm text-ink-3">{t("onchainNoWallet")}</p>;
  const owned = chain?.ready ? CARDS.filter((c) => {
    const s = chain.cards[c.id];
    return s && !s.burned && (s.owner === wallet || s.listing?.seller === wallet);
  }) : [];
  const packCards = (pulls ?? []).flatMap((p) => {
    const entry = PACKS.find((x) => x.id === p.packId)?.pool.find((e) => e.id === p.entryId);
    return entry ? [{ pull: p, card: entryCard(entry) }] : [];
  });

  if (!owned.length && !packCards.length) return <p className="mt-6 text-sm text-ink-3">{t("onchainEmpty")}</p>;
  return (
    <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-6">
      {owned.map((c) => {
        const s = chain!.cards[c.id];
        return (
          <Link key={c.id} href={`/card/${c.id}`} className="group">
            <div className="aspect-[55/85] overflow-hidden rounded-xl">
              <CardArt card={c} rarityLabel={tRarity(c.rarity)} className="block h-full w-full transition group-hover:scale-[1.03]" />
            </div>
            <p className="mt-2 truncate text-sm font-semibold">{c.member}</p>
            <p className="text-xs text-ink-3">{s.listing ? t("onchainListed", { price: formatUsdt(s.listing.priceUsdt) }) : s.redeeming ? t("onchainRedeeming") : t("onchainHeld")}</p>
          </Link>
        );
      })}
      {packCards.map(({ pull, card }) => (
        <a key={pull.asset} href={solscanUrl("account", pull.asset)} target="_blank" rel="noreferrer" className="group">
          <div className="aspect-[55/85] overflow-hidden rounded-xl">
            <CardArt card={card} rarityLabel={tRarity(card.rarity)} className="block h-full w-full transition group-hover:scale-[1.03]" />
          </div>
          <p className="mt-2 truncate text-sm font-semibold">{card.member}</p>
          <p className="text-xs text-ink-3">{t("onchainFromPack")} ↗</p>
        </a>
      ))}
    </div>
  );
}

type Order = {
  id: string;
  role: "buyer" | "seller";
  status: "paid" | "shipped" | "completed" | "cancelled";
  itemId: string;
  title: string;
  photo: string | null;
  priceUsdt: number;
  feeUsdt: number;
  payTx: string | null;
  payoutTx: string | null;
  payoutHeld: boolean;
  transferTx: string | null;
};

// 擔保交易訂單：賣家標記寄出，買家確認收貨（平台隨即放款、轉移 NFT）
export function Orders() {
  const t = useTranslations("Binder");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const res = await fetch("/api/orders");
    setOrders(res.ok ? ((await res.json()) as { orders: Order[] }).orders : []);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 進入頁籤時讀訂單
    load();
  }, [load]);

  const act = async (id: string, step: "ship" | "receive") => {
    setBusy(id);
    setError(undefined);
    try {
      await postAction(`/api/orders/${id}/${step}`);
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
              {tx(o.status === "cancelled" ? t("txRefund") : t("txPayout"), o.payoutTx)}
            </p>
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
          {error === o.id && <p className="w-full text-xs text-down">{t("orderError")}</p>}
        </li>
      ))}
    </ul>
  );
}
