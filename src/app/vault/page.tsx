import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CARDS, STATUS_LABEL, type VaultStatus } from "@/lib/mock-cards";
import { CARD_COLLECTION, shortAddress, solscanUrl } from "@/lib/solana/config";
import { getVaultSnapshot } from "@/lib/vault";

export const metadata: Metadata = {
  title: "金庫 · Idolca",
  description: "每張入庫小卡對應的 Solana NFT、持有人和狀態，公開可查",
};

const STATUS_STYLE: Record<VaultStatus, string> = {
  vaulted: "bg-emerald-400/15 text-emerald-300",
  listed: "bg-violet-400/15 text-violet-200",
  redeeming: "bg-amber-400/15 text-amber-200",
};

export default async function VaultPage() {
  const { source, entries, lastAuditDate } = await getVaultSnapshot();
  const redeeming = entries.filter((e) => e.status === "redeeming").length;
  const cardIdBySerial = new Map(CARDS.map((c) => [c.serial, c.id]));

  const summary = [
    { label: "鏈上 NFT（未銷毀）", value: entries.length },
    { label: "提貨中（已凍結）", value: redeeming },
    { label: "倉庫實物", value: entries.length },
    { label: "最近盤點", value: lastAuditDate },
  ];

  return (
    <>
      <div className="aurora" />
      <div className="grid-bg" />
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">金庫</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
          倉庫裡的每張卡都對應一個 Metaplex Core NFT。未銷毀的 NFT 總數恆等於倉庫實物數量：提貨中的卡 NFT 已凍結，寄出時銷毀並同步下架。
          {CARD_COLLECTION && (
            <>
              {" "}
              集合地址{" "}
              <a href={solscanUrl("account", CARD_COLLECTION)} target="_blank" rel="noreferrer" className="font-mono text-violet-300 hover:text-violet-200">
                {shortAddress(CARD_COLLECTION, 6, 6)}
              </a>
              。
            </>
          )}
        </p>
        {source === "demo" && (
          <p className="mt-4 inline-block rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100/80">
            展示資料：配置 HELIUS_API_KEY 和 NEXT_PUBLIC_CARD_COLLECTION 後改為讀取鏈上集合
          </p>
        )}

        <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <dt className="text-xs text-white/45">{s.label}</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-white/[0.04] text-xs text-white/45">
              <tr>
                <th className="px-4 py-3 font-medium">編號</th>
                <th className="px-4 py-3 font-medium">卡片</th>
                <th className="px-4 py-3 font-medium">NFT 地址</th>
                <th className="px-4 py-3 font-medium">持有人</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">入庫日期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((e) => {
                const cardId = cardIdBySerial.get(e.serial);
                return (
                  <tr key={e.asset} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs">
                      {cardId ? (
                        <Link href={`/card/${cardId}`} className="text-violet-300 hover:text-violet-200">
                          {e.serial}
                        </Link>
                      ) : (
                        e.serial
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/85">{e.title}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <a href={solscanUrl("account", e.asset)} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white">
                        {shortAddress(e.asset, 6, 6)}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/55">{shortAddress(e.owner)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/55">{e.intakeDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
      <Footer />
    </>
  );
}
