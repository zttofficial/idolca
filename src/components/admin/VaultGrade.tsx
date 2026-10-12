"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Select from "@/components/ui/Select";
import { GRADERS, gradeLabel } from "@/lib/grading";
import { refreshVaultCards, useVaultCards } from "@/lib/chain-client";
import { solscanUrl } from "@/lib/solana/config";

// 給已入庫的卡評級或改評級：Idolca 自家評級（IDG），或送評回來的第三方評級。改的是鏈上 NFT 屬性和資料表
export default function VaultGrade() {
  const t = useTranslations("Admin");
  const cards = useVaultCards();
  const [cardId, setCardId] = useState("");
  const [f, setF] = useState({ grader: "", gradeScore: "", gradeCert: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ id: string; serial: string; tx: string }>();
  const card = cards?.find((c) => c.id === cardId);
  const inHouse = GRADERS.find((g) => g.id === f.grader)?.inHouse;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/admin/vault/${cardId}/grade`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      const data = (await res.json().catch(() => ({}))) as { tx?: string; error?: string };
      if (!res.ok || !data.tx) throw new Error(data.error ?? String(res.status));
      setDone({ id: cardId, serial: card?.serial ?? "", tx: data.tx });
      refreshVaultCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  };

  const field = "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink";
  const label = "block text-xs text-ink-3";
  return (
    <section>
      <h2 className="text-lg font-semibold">{t("gradeTitle")}</h2>
      <p className="mt-1 text-xs text-ink-3">{t("gradeHint")}</p>
      <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>
          {t("fieldCard")}
          <Select
            required
            searchable
            value={cardId}
            onChange={setCardId}
            placeholder="IC-…"
            options={(cards ?? []).map((c) => ({ value: c.id, label: `${c.serial} · ${c.group} ${c.member} · ${c.version}` }))}
            className={field}
          />
          {card && <span className="mt-1 block">{t("currentGrade", { grade: card.grade ? `${gradeLabel(card.grade)} · #${card.grade.cert}` : t("noGrade") })}</span>}
        </label>
        <label className={label}>
          {t("fieldGrader")}
          <Select value={f.grader} onChange={(grader) => setF((x) => ({ ...x, grader }))} options={[{ value: "", label: t("noGrade") }, ...GRADERS.map((g) => ({ value: g.id, label: g.name }))]} className={field} />
        </label>
        {f.grader && (
          <label className={label}>
            {t("fieldGradeScore")}
            <input required type="number" min={1} max={10} step={0.5} value={f.gradeScore} onChange={(e) => setF((x) => ({ ...x, gradeScore: e.target.value }))} className={field} />
          </label>
        )}
        {f.grader && !inHouse && (
          <label className={label}>
            {t("fieldGradeCert")}
            <input required value={f.gradeCert} onChange={(e) => setF((x) => ({ ...x, gradeCert: e.target.value }))} maxLength={40} className={field} />
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button disabled={busy || !cardId} className="btn-primary rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? "…" : t("gradeSubmit")}
          </button>
          {error && <span className="text-xs text-down">{t("error", { error })}</span>}
          {done && (
            <span className="text-xs text-up">
              {t("gradeDone", { serial: done.serial })}{" "}
              <Link href={`/card/${done.id}`} className="font-semibold underline">
                {t("viewCard")}
              </Link>{" "}
              <a href={solscanUrl("tx", done.tx)} target="_blank" rel="noreferrer" className="font-semibold underline">
                {t("gradeTx")} ↗
              </a>
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
