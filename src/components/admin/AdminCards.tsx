"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Select from "@/components/ui/Select";
import { GRADERS, gradeLabel } from "@/lib/grading";
import { refreshVaultCards } from "@/lib/chain-client";
import { formatPrice } from "@/lib/fx";
import type { AdminCard } from "@/lib/server/admin-queries";
import { VAULTS, VAULT_LIST } from "@/lib/vaults";
import AdminList, { type ListCtx } from "./AdminList";
import { Facts, Party, Thumb, TxLink, Wallet, adminHref, field, label, when, type Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const CARD_STATE_LABEL: Record<string, string> = {
  held: "In vault",
  listed: "Listed",
  auction: "In auction",
  redeeming: "Redeeming",
  redeemed: "Redeemed",
  unknown: "Not synced",
  all: "All",
  assignable: "Assignable",
};
const CARD_OWNER_LABEL: Record<string, string> = { platform: "Platform", depositor: "Depositor" };
const CARD_PACK_LABEL: Record<string, string> = { in: "In a pack", none: "Not in a pack" };
const CARD_STATUS_LABEL: Record<string, string> = { vaulted: "In vault", listed: "Listed", auction: "In auction", redeeming: "Redeeming", redeemed: "Redeemed" };

export const CARD_STATES = ["held", "listed", "auction", "redeeming", "redeemed", "unknown", "all"] as const;

// 金庫卡：搜編號、團體、成員或錢包找到卡，點開在右側看實物資料、鏈上狀態（讀索引表，還沒同步的顯示未知），並在這裡評級或改評級
export default function AdminCards({ call, onChanged }: { call: Call; onChanged: () => void }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Vault cards</h2>
      <p className="mt-1 mb-4 text-xs text-ink-3">Find a card by serial, group, member or wallet, then open it to see its chain state and grade it. Chain state comes from the sync index.</p>
      <AdminList<AdminCard>
        endpoint="/api/admin/cards"
        call={call}
        onChanged={onChanged}
        rowKey={(c) => c.id}
        search="Search serial, group, member, album, wallet or card ID"
        filters={[
          { key: "state", label: "Status", options: CARD_STATES.map((s) => ({ value: s, label: CARD_STATE_LABEL[s] })) },
          { key: "vault", label: "Vault", options: [{ value: "", label: "Any" }, ...VAULT_LIST.map((v) => ({ value: v.id, label: v.code }))] },
          { key: "owner", label: "Owner", options: ["", "platform", "depositor"].map((v) => ({ value: v, label: v ? CARD_OWNER_LABEL[v] : "Any" })) },
          { key: "pack", label: "Pack", options: ["", "in", "none"].map((v) => ({ value: v, label: v ? CARD_PACK_LABEL[v] : "Any" })) },
          {
            key: "grade",
            label: "Grade",
            options: [{ value: "", label: "Any" }, { value: "graded", label: "Graded" }, { value: "ungraded", label: "Not graded" }, ...GRADERS.map((g) => ({ value: g.id, label: g.name }))],
          },
        ]}
        renderRow={(c) => (
          <>
            <Thumb src={c.image?.front} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {c.serial} · {c.group} {c.member}
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs text-ink-3">
                <span className="truncate">
                  {c.album} · {c.version}
                </span>
                <span>
                  {VAULTS[c.vault].code} {c.location}
                </span>
                {c.grade && <span>{gradeLabel(c.grade)}</span>}
                {c.pack && <span>{c.pack.name}</span>}
              </span>
            </span>
            <span className="text-xs font-semibold text-ink-2">{c.chain ? CARD_STATUS_LABEL[c.status] : <span className="text-ink-3">Not synced</span>}</span>
          </>
        )}
        detail={{ title: (c) => `${c.serial} · ${c.group} ${c.member}`, render: (c, ctx) => <CardDetail c={c} ctx={ctx} /> }}
      />
    </section>
  );
}

function CardDetail({ c, ctx }: { c: AdminCard; ctx: ListCtx }) {
  const tRarity = useTranslations("Rarity");
  const s = c.chain;
  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        {[c.image?.front, c.image?.back].filter(Boolean).map((src) => (
          <span key={src} className="w-24 shrink-0">
            <Thumb src={src} />
          </span>
        ))}
      </div>
      <Facts
        rows={[
          ["Album", `${c.album} · ${c.version} · ${tRarity(c.rarity)}`],
          ["Vault", `${VAULTS[c.vault].code} · ${c.location}`],
          ["Intake", c.intakeDate],
          ["Grade", c.grade ? `${gradeLabel(c.grade)} · #${c.grade.cert}` : "Not graded"],
          ["Condition notes (optional)", c.condition],
          ["Owner", c.depositor ? <Party key="d" party={c.depositor} /> : "Platform"],
          [
            "Pack",
            c.pack && (
              <Link key="p" href={adminHref("packs", { open: c.pack.id })} className="hover:underline">
                {c.pack.name} · {c.pack.tier} · {formatPrice(c.pack.valueUsdt, 2)}
                {c.pack.pulled && ` · ${"Pulled"}`}
              </Link>
            ),
          ],
          ["Redeemed", c.redeemedAt && when(c.redeemedAt)],
        ]}
      />
      <div className="rounded-xl bg-surface-2 p-4">
        <p className="text-xs font-semibold">On-chain state</p>
        {s ? (
          <div className="mt-2">
            <Facts
              rows={[
                ["Status", CARD_STATUS_LABEL[c.status]],
                ["Holder", <Wallet key="o" address={c.owner} />],
                [
                  "Listing",
                  s.listing && (
                    <span key="l">
                      {formatPrice(s.listing.priceUsdt, 2)} · <Wallet address={s.listing.seller} />
                    </span>
                  ),
                ],
                ["Auction", s.auction && `ends ${when(s.auction.endsAt)}`],
                ["Synced", when(s.syncedAt)],
              ]}
            />
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-3">No on-chain index row for this card yet. It appears after the next chain sync.</p>
        )}
      </div>
      <p className="flex flex-wrap gap-3 text-xs">
        <Link href={`/card/${c.id}`} className="text-accent-ink hover:underline">
          {"View card"} ↗
        </Link>
        <Wallet address={c.asset} />
        <TxLink label="Mint transaction" sig={c.mintTx} />
      </p>
      {c.status !== "redeemed" && <GradeForm card={c} ctx={ctx} />}
    </div>
  );
}

// 給已入庫的卡評級或改評級：Idolca 自家評級（IDG），或送評回來的第三方評級。改的是鏈上 NFT 屬性和資料表
function GradeForm({ card, ctx }: { card: AdminCard; ctx: ListCtx }) {
  const [f, setF] = useState({
    grader: card.grade?.grader ?? "",
    gradeScore: card.grade ? String(card.grade.score) : "",
    gradeCert: card.grade && !GRADERS.find((g) => g.id === card.grade?.grader)?.inHouse ? card.grade.cert : "",
  });
  const [tx, setTx] = useState<string>();
  const inHouse = GRADERS.find((g) => g.id === f.grader)?.inHouse;
  const busy = ctx.busy === `${card.id}:grade`;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    ctx.act(`${card.id}:grade`, async () => {
      const r = await ctx.call<{ tx: string }>("POST", `/api/admin/vault/${card.id}/grade`, f);
      setTx(r.tx);
      refreshVaultCards();
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h3 className="text-sm font-semibold">Grade a vault card</h3>
        <p className="mt-1 text-xs text-ink-3">
          {
            "Give a card an Idolca Grading (IDG) score, or record a third-party grade after it comes back. Updates the card's NFT attributes. IDG grades use the vault serial as the cert number."
          }
        </p>
      </div>
      <label className={label}>
        Grading company (optional)
        <Select
          value={f.grader}
          onChange={(grader) => setF((x) => ({ ...x, grader }))}
          options={[{ value: "", label: "Not graded" }, ...GRADERS.map((g) => ({ value: g.id, label: g.name }))]}
          className={field}
        />
      </label>
      {f.grader && (
        <label className={label}>
          Grade
          <input required type="number" min={1} max={10} step={0.5} value={f.gradeScore} onChange={(e) => setF((x) => ({ ...x, gradeScore: e.target.value }))} className={field} />
        </label>
      )}
      {f.grader && !inHouse && (
        <label className={label}>
          Cert number
          <input required value={f.gradeCert} onChange={(e) => setF((x) => ({ ...x, gradeCert: e.target.value }))} maxLength={40} className={field} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button disabled={ctx.busy !== undefined} className="btn-primary rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? "…" : "Save grade"}
        </button>
        {tx && (
          <span className="text-xs text-up">
            {`Grade updated for ${card.serial}`} <TxLink label="Transaction" sig={tx} />
          </span>
        )}
      </div>
    </form>
  );
}
