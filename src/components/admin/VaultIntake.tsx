"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RARITY_LIST, type Card, type Rarity } from "@/lib/cards";
import { GROUPS, TEMPLATES } from "@/lib/catalog";
import { cropToCard } from "@/lib/crop-card";
import { refreshVaultCards } from "@/lib/chain-client";
import { solscanUrl } from "@/lib/solana/config";

const unique = (xs: string[]) => [...new Set(xs)];
const EMPTY = { group: "", member: "", album: "", version: "", rarity: "album" as Rarity, grade: "", condition: "", location: "", depositor: "" };

// 入庫：實物鑑定通過後拍正反面、填卡片資料和倉位，建立金庫卡並鑄造 NFT。
// 寄存人留空就是平台自有庫存（之後可以放進卡包卡池）
export default function VaultIntake() {
  const t = useTranslations("Admin");
  const tRarity = useTranslations("Rarity");
  const [form, setForm] = useState(EMPTY);
  const [photos, setPhotos] = useState<(string | null)[]>([null, null]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ card: Card; mintTx: string }>();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const g = GROUPS.find((x) => x.name.toLowerCase() === form.group.trim().toLowerCase());
  const members = g ? g.members : unique(GROUPS.flatMap((x) => x.members));
  const albums = g ? g.albums.map((a) => a.title) : unique(GROUPS.flatMap((x) => x.albums.map((a) => a.title)));
  const versions = unique(TEMPLATES.map((x) => x.version));

  const pick = (i: number) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await cropToCard(file);
    setPhotos((p) => p.map((x, j) => (j === i ? url : x)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/admin/vault", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, photos }),
      });
      const data = (await res.json().catch(() => ({}))) as { card?: Card; mintTx?: string; error?: string };
      if (!res.ok || !data.card || !data.mintTx) throw new Error(data.error ?? String(res.status));
      setDone({ card: data.card, mintTx: data.mintTx });
      setForm({ ...EMPTY, location: form.location });
      setPhotos([null, null]);
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
      <h2 className="text-lg font-semibold">{t("intake")}</h2>
      <p className="mt-1 text-xs text-ink-3">{t("intakeHint")}</p>
      <form onSubmit={submit} className="mt-4 grid gap-5 rounded-2xl border border-line bg-surface p-5 md:grid-cols-[200px_1fr]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          {[0, 1].map((i) => (
            <label key={i} className="block cursor-pointer">
              <span className={label}>{t(i === 0 ? "photoFront" : "photoBack")}</span>
              <span className="mt-1 grid aspect-[55/85] place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-surface-2 text-xs text-ink-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- 本機預覽 */}
                {photos[i] ? <img src={photos[i]!} alt="" className="h-full w-full object-cover" /> : t("choosePhoto")}
              </span>
              <input type="file" accept="image/*" onChange={pick(i)} className="sr-only" />
            </label>
          ))}
        </div>
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <label className={label}>
            {t("fieldGroup")}
            <input required list="intake-groups" value={form.group} onChange={set("group")} className={field} />
          </label>
          <label className={label}>
            {t("fieldMember")}
            <input required list="intake-members" value={form.member} onChange={set("member")} className={field} />
          </label>
          <label className={label}>
            {t("fieldAlbum")}
            <input required list="intake-albums" value={form.album} onChange={set("album")} className={field} />
          </label>
          <label className={label}>
            {t("fieldVersion")}
            <input required list="intake-versions" value={form.version} onChange={set("version")} className={field} />
          </label>
          <label className={label}>
            {t("fieldRarity")}
            <select value={form.rarity} onChange={set("rarity")} className={field}>
              {RARITY_LIST.map((r) => (
                <option key={r} value={r}>
                  {tRarity(r)}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t("fieldGrade")}
            <input type="number" min={1} max={10} value={form.grade} onChange={set("grade")} className={field} />
          </label>
          <label className={label}>
            {t("fieldLocation")}
            <input required value={form.location} onChange={set("location")} placeholder="SEL-A03-12" className={field} />
          </label>
          <label className={label}>
            {t("fieldDepositor")}
            <input value={form.depositor} onChange={set("depositor")} placeholder={t("depositorPlaceholder")} className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            {t("fieldCondition")}
            <input value={form.condition} onChange={set("condition")} maxLength={300} className={field} />
          </label>
          <datalist id="intake-groups">
            {GROUPS.map((x) => (
              <option key={x.id} value={x.name} />
            ))}
          </datalist>
          <datalist id="intake-members">
            {members.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <datalist id="intake-albums">
            {albums.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <datalist id="intake-versions">
            {versions.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button disabled={busy || !photos[0] || !photos[1]} className="btn-primary rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">
              {busy ? t("minting") : t("intakeSubmit")}
            </button>
            {error && <span className="text-xs text-down">{t("error", { error })}</span>}
            {done && (
              <span className="text-xs text-up">
                {t("intakeDone", { serial: done.card.serial })}{" "}
                <Link href={`/card/${done.card.id}`} className="font-semibold underline">
                  {t("viewCard")}
                </Link>{" "}
                <a href={solscanUrl("tx", done.mintTx)} target="_blank" rel="noreferrer" className="font-semibold underline">
                  {t("mintTx")} ↗
                </a>
              </span>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
