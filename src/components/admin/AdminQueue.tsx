"use client";

import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import { itemTitle } from "@/lib/item-title";
import type { AdminOrder } from "@/lib/server/orders";
import type { AdminItem, AdminRedemption } from "@/lib/server/admin-queries";
import type { AdminPack } from "@/lib/server/admin-packs";
import { VAULTS } from "@/lib/vaults";
import { adminHref, when } from "./shared";

export type Queue = {
  counts: { disputed: number; late: number; redemptions: number; vaultRequests: number; packsLive: number; packsUpcoming: number; packsLow: number };
  tabs: Record<"orders" | "redemptions" | "items" | "packs", number>;
  disputes: AdminOrder[];
  late: AdminOrder[];
  redemptions: AdminRedemption[];
  vaultRequests: AdminItem[];
  packs: AdminPack[];
};

// 待處理：後台的預設頁。每一項是數量加最前面幾筆，點一筆直接打開它的詳情，點「全部」到對應頁籤並帶上篩選
export default function AdminQueue({ queue }: { queue: Queue | null }) {
  if (!queue) return <div className="h-32 animate-pulse rounded-2xl bg-surface-2" />;
  const { counts } = queue;
  const nothing = !counts.disputed && !counts.late && !counts.redemptions && !counts.vaultRequests && !queue.packs.length;
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">To do</h2>
        <p className="mt-1 text-xs text-ink-3">What needs attention now. Open an item to handle it, or use “All” for the full filtered list.</p>
      </div>
      {nothing && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">Nothing needs attention right now.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Disputed orders" count={counts.disputed} all={adminHref("orders", { status: "disputed" })}>
          {queue.disputes.map((o) => (
            <Row key={o.id} href={adminHref("orders", { status: "disputed", open: o.id })} title={o.title} meta={`${formatPrice(o.priceUsdt)} · ${o.disputeReason ?? ""}`} />
          ))}
        </Block>
        <Block title="Ship-by deadline passed or within a day" count={counts.late} all={adminHref("orders", { status: "late" })} tone="down">
          {queue.late.map((o) => (
            <Row key={o.id} href={adminHref("orders", { status: "late", open: o.id })} title={o.title} meta={`Ship by ${when(o.shipBy)}`} />
          ))}
        </Block>
        <Block title="Redemptions ready to ship" count={counts.redemptions} all={adminHref("redemptions", { status: "ready" })}>
          {queue.redemptions.map((r) => (
            <Row key={r.cardId} href={adminHref("redemptions", { status: "ready", open: r.cardId })} title={r.card} meta={`${`Ships from ${VAULTS[r.vault].code}`} · ${when(r.createdAt)}`} />
          ))}
        </Block>
        <Block title="Cards waiting for vault intake" count={counts.vaultRequests} all={adminHref("items", { status: "vault" })}>
          {queue.vaultRequests.map((i) => (
            <Row key={i.id} href={adminHref("items", { status: "vault", open: i.id })} title={itemTitle(i)} meta={`${i.owner.email ?? i.owner.name} · ${when(i.vaultRequestedAt)}`} />
          ))}
        </Block>
        <Block
          title="Packs low on stock or paused"
          count={counts.packsLow}
          all={adminHref("packs", { status: "live" })}
          note={`${counts.packsLive} on sale · ${counts.packsUpcoming} starting within 7 days`}
        >
          {queue.packs.map((p) => (
            <Row
              key={p.id}
              href={adminHref("packs", { open: p.id })}
              title={p.name}
              meta={[p.status === "upcoming" ? `Starts ${when(p.startsAt)}` : `${p.remaining} / ${p.total} left`, p.paused ? "Paused" : p.lowStock ? "Low stock" : ""]
                .filter(Boolean)
                .join(" · ")}
              alert={p.paused || p.lowStock}
            />
          ))}
        </Block>
      </div>
    </section>
  );
}

function Block({ title, count, all, note, tone = "notice", children }: { title: string; count: number; all: string; note?: string; tone?: "notice" | "down"; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={`text-sm font-semibold tabular-nums ${count ? (tone === "down" ? "text-down" : "text-notice-ink") : "text-ink-3"}`}>{count}</span>
        <Link href={all} className="ml-auto text-xs text-accent-ink hover:underline">
          All
        </Link>
      </div>
      {note && <p className="mt-0.5 text-xs text-ink-3">{note}</p>}
      <ul className="mt-2 divide-y divide-line">{children}</ul>
    </div>
  );
}

function Row({ href, title, meta, alert = false }: { href: string; title: string; meta: string; alert?: boolean }) {
  return (
    <li>
      <Link href={href} className="-mx-2 flex flex-col rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
        <span className="truncate font-medium">{title}</span>
        <span className={`truncate text-xs ${alert ? "text-notice-ink" : "text-ink-3"}`}>{meta}</span>
      </Link>
    </li>
  );
}
