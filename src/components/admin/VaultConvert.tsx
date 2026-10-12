"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RARITY_LIST, type Rarity } from "@/lib/cards";
import type { CollectorItem } from "@/lib/items";
import Select from "@/components/ui/Select";
import { GRADERS } from "@/lib/grading";

// 申請寄進金庫的收藏卡：實物寄到後鑑定。真品就填類型、評級、倉位，轉成金庫卡（照片和資料沿用）；
// 不收就退回；假卡用外面的「標成假卡」
export default function VaultConvert({ item, busy, onConvert, onReturn }: { item: CollectorItem; busy: boolean; onConvert: (body: unknown) => void; onReturn: () => void }) {
  const t = useTranslations("Admin");
  const tRarity = useTranslations("Rarity");
  const [f, setF] = useState({ rarity: "album" as Rarity, grader: "", gradeScore: "", gradeCert: "", location: "", condition: "", album: item.album ?? "", version: item.version ?? "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const field = "rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-ink";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConvert(f);
      }}
      className="mt-2 flex w-full flex-wrap items-center gap-2 rounded-xl bg-notice-bg p-3"
    >
      <span className="w-full text-xs font-semibold text-notice-ink">{t("vaultRequestAt", { date: item.vaultRequestedAt!.slice(0, 10), ref: `IDOLCA-${item.id.slice(0, 8).toUpperCase()}` })}</span>
      {!item.album && <input required placeholder={t("fieldAlbum")} value={f.album} onChange={set("album")} className={field} />}
      {!item.version && <input required placeholder={t("fieldVersion")} value={f.version} onChange={set("version")} className={field} />}
      <Select value={f.rarity} onChange={(rarity) => setF((x) => ({ ...x, rarity }))} options={RARITY_LIST.map((r) => ({ value: r, label: tRarity(r) }))} ariaLabel={t("fieldRarity")} className={field} />
      <Select value={f.grader} onChange={(grader) => setF((x) => ({ ...x, grader }))} options={[{ value: "", label: t("noGrade") }, ...GRADERS.map((g) => ({ value: g.id, label: g.name }))]} ariaLabel={t("fieldGrader")} className={field} />
      {f.grader && (
        <>
          <input required type="number" min={1} max={10} step={0.5} placeholder={t("fieldGradeScore")} value={f.gradeScore} onChange={set("gradeScore")} className={`${field} w-20`} />
          {!GRADERS.find((g) => g.id === f.grader)?.inHouse && <input required placeholder={t("fieldGradeCert")} value={f.gradeCert} onChange={set("gradeCert")} maxLength={40} className={`${field} w-32`} />}
        </>
      )}
      <input required placeholder={t("fieldLocation")} value={f.location} onChange={set("location")} className={`${field} w-28`} />
      <input placeholder={t("fieldCondition")} value={f.condition} onChange={set("condition")} className={`${field} min-w-40 flex-1`} />
      <button disabled={busy} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
        {busy ? "…" : t("convertToVault")}
      </button>
      <button type="button" disabled={busy} onClick={() => window.confirm(t("returnConfirm")) && onReturn()} className="rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50">
        {t("returnCard")}
      </button>
    </form>
  );
}
