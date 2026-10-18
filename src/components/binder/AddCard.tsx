"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CURRENCY } from "@/lib/fx";
import { useTranslations } from "next-intl";
import { cropToCard } from "@/lib/crop-card";
import { useAuth } from "@/components/auth/AuthContext";
import VerifyEmailNotice, { useNeedsEmailVerify } from "@/components/auth/VerifyEmailNotice";
import { Link } from "@/i18n/navigation";
import { GROUPS, TEMPLATES } from "@/lib/catalog";
import { findDirectoryGroup, groupOptions, parseCardFilename } from "@/lib/directory";
import Combobox from "@/components/ui/Combobox";
import Select from "@/components/ui/Select";
import { addItem, type CollectorItem } from "@/lib/items";
import { solscanUrl } from "@/lib/solana/config";
import { CARD_SOURCES, type CardSource } from "@/lib/sources";
import { CloseButton } from "@/components/ui/Dialog";
import InfoTip from "@/components/ui/InfoTip";

// 「新增我的卡」= 自由上鏈：拍正反面（可以再補幾張）、選來源、填名字、上鏈，可以順手標價刊登。
// 一則可以是一張卡，也可以是一組卡。平台不查驗：新卡一律「待驗證」，刊登時買家看到免責聲明。可以從任何頁面打開
type Prefill = { group?: string; member?: string; album?: string; version?: string; source?: CardSource };

const listeners = new Set<() => void>();
let state: { open: boolean; prefill: Prefill } = { open: false, prefill: {} };
const set = (next: typeof state) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const openAddCard = (prefill: Prefill = {}) => set({ open: true, prefill });

export function AddCardButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  const t = useTranslations("Binder");
  return (
    <button onClick={() => openAddCard()} className={className}>
      {children ?? t("addCard")}
    </button>
  );
}

// 掛在全站的 Provider 裡
export function AddCardHost() {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return s.open ? <AddCardDialog prefill={s.prefill} onClose={() => set({ open: false, prefill: {} })} /> : null;
}

const MAX_EXTRA = 6;

const unique = (xs: string[]) => [...new Set(xs)];

function AddCardDialog({ prefill, onClose }: { prefill: Prefill; onClose: () => void }) {
  const t = useTranslations("Mint");
  const tSource = useTranslations("Source");
  const { user, login } = useAuth();
  const needsVerify = useNeedsEmailVerify();
  const [front, setFront] = useState<string>();
  const [back, setBack] = useState<string>();
  const [extras, setExtras] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [sell, setSell] = useState(false);
  const [price, setPrice] = useState("");
  const [source, setSource] = useState<CardSource>(prefill.source ?? "album");
  const [group, setGroup] = useState(prefill.group ?? "");
  const [member, setMember] = useState(prefill.member ?? "");
  const [album, setAlbum] = useState(prefill.album ?? "");
  const [version, setVersion] = useState(prefill.version ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<CollectorItem | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 團體名錄和圖鑑只用來給輸入建議，填什麼都可以。認得的團體列出它的成員；圖鑑裡有的團體列出它的專輯
  const known = findDirectoryGroup(group);
  const g = GROUPS.find((x) => x.name.toLowerCase() === (known?.name ?? group).trim().toLowerCase());
  const memberOptions = known?.members ?? [];
  const albumOptions = unique((g ? TEMPLATES.filter((x) => x.groupId === g.id) : group.trim() ? [] : TEMPLATES).map((x) => x.album));
  const versionOptions = unique(TEMPLATES.map((x) => x.version));
  const priceValue = Number(price);
  const priceOk = !sell || (!needsVerify && price !== "" && priceValue > 0 && priceValue <= 100_000);
  const ready = Boolean(front && back && group.trim() && member.trim() && priceOk);

  // 選照片時按檔名預填空著的欄位；已填的團體和認出的不同，就不填成員
  const prefillFrom = (file: File) => {
    const hit = parseCardFilename(file.name);
    if (!hit) return;
    const sameGroup = !group.trim() || !hit.group || findDirectoryGroup(group)?.name === hit.group;
    setTitle((v) => v || hit.title);
    if (hit.group) setGroup((v) => v || hit.group!);
    if (hit.member && sameGroup) setMember((v) => v || hit.member!);
  };

  const mint = async () => {
    if (!front || !back || !ready) return;
    setBusy(true);
    setError(undefined);
    try {
      setDone(await addItem({ photos: [front, back, ...extras], title, description, quantity, source, group, member, album, version, priceUsdt: sell ? priceValue : undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      setBusy(false);
    }
  };

  const field = "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink";

  return (
    <div role="dialog" aria-modal="true" aria-label={t("title")} className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{t("title")}</h2>
            <p className="mt-1 text-sm text-ink-2">{t("subtitle")}</p>
          </div>
          <CloseButton onClick={onClose} className="shrink-0" />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-[230px_1fr]">
          <div>
            <div className="grid grid-cols-2 gap-3">
              <PhotoSlot label={t("front")} value={front} onChange={setFront} onFile={prefillFrom} disabled={Boolean(done)} hint={t("choosePhoto")} retake={t("retake")} />
              <PhotoSlot label={t("back")} value={back} onChange={setBack} onFile={prefillFrom} disabled={Boolean(done)} hint={t("chooseBack")} retake={t("retake")} />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-ink-2">
              {t("morePhotos")}
              <InfoTip text={t("morePhotosHint")} label={t("morePhotos")} align="start" />
            </p>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {extras.map((x, i) => (
                <button
                  key={i}
                  onClick={() => !done && setExtras(extras.filter((_, j) => j !== i))}
                  aria-label={t("removePhoto")}
                  className="group relative aspect-[55/85] overflow-hidden rounded-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 本機剛裁好的 data URL */}
                  <img src={x} alt="" className="h-full w-full object-cover" />
                  {!done && <span className="absolute inset-0 grid place-items-center bg-ink/50 text-sm font-bold text-white opacity-0 group-hover:opacity-100">×</span>}
                </button>
              ))}
              {!done && extras.length < MAX_EXTRA && <AddPhoto label={t("addPhoto")} onAdd={(x) => setExtras([...extras, x])} />}
            </div>
          </div>

          {done ? (
            <div>
              <div className="rounded-xl bg-up/10 p-4 text-sm text-up">
                {t("done")}
                {done.mintTx && (
                  <a href={solscanUrl("tx", done.mintTx)} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-semibold underline underline-offset-2">
                    {t("viewMintTx")}
                  </a>
                )}
              </div>
              <Link href="/binder" onClick={onClose} className="btn-primary mt-4 block rounded-full py-3 text-center text-sm font-semibold">
                {t("viewBinder")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 text-xs font-medium text-ink-2 sm:col-span-1">
                  {t("titleLabel")}
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={t("titlePlaceholder")} className={field} />
                </label>
                <label className="col-span-2 text-xs font-medium text-ink-2 sm:col-span-1">
                  {t("quantity")}
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.min(99, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                    className={`${field} tabular-nums`}
                  />
                </label>
                <label className="text-xs font-medium text-ink-2">
                  {t("group")} *
                  <Combobox value={group} onChange={setGroup} options={groupOptions} maxLength={60} placeholder="IVE" className={field} />
                </label>
                <label className="text-xs font-medium text-ink-2">
                  {t("member")} *
                  <Combobox value={member} onChange={setMember} options={memberOptions} maxLength={60} placeholder="Wonyoung" className={field} />
                </label>
                <label className="col-span-2 text-xs font-medium text-ink-2">
                  {t("source")} *
                  <Select value={source} onChange={setSource} options={CARD_SOURCES.map((x) => ({ value: x, label: tSource(x) }))} className={field} />
                </label>
                <label className="text-xs font-medium text-ink-2">
                  {t("releaseName")}
                  <Combobox
                    value={album}
                    onChange={setAlbum}
                    options={albumOptions}
                    maxLength={80}
                    placeholder={t(`releasePlaceholder_${source === "album" || source === "pob" || source === "luckydraw" || source === "fansign" ? "album" : "event"}`)}
                    className={field}
                  />
                </label>
                <label className="text-xs font-medium text-ink-2">
                  {t("detail")}
                  <Combobox value={version} onChange={setVersion} options={versionOptions} maxLength={80} className={field} />
                </label>
                <label className="col-span-2 text-xs font-medium text-ink-2">
                  {t("descriptionLabel")}
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder={t("descriptionPlaceholder")}
                    className={`${field} resize-y leading-relaxed`}
                  />
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-line p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={sell} onChange={() => setSell(!sell)} className="h-4 w-4 accent-[var(--accent)]" />
                  {t("sellNow")}
                  <InfoTip text={t("freeMintNote")} label={t("sellNow")} align="start" />
                </label>
                {sell && needsVerify && <VerifyEmailNotice className="mt-2" />}
                {sell && !needsVerify && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">
                    {t("price")}
                    <input
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="25"
                      className="w-28 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-ink"
                    />
                    {CURRENCY}
                  </label>
                )}
              </div>

              {error && <p className="mt-3 text-xs text-down">{t(error === "impersonation" ? "errorImpersonation" : "error")}</p>}
              {user ? (
                <button onClick={mint} disabled={!ready || busy} className="btn-primary mt-4 w-full rounded-full py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
                  {busy ? "…" : ready ? t(sell ? "confirmSell" : "confirm") : !(front && back) ? t("needPhoto") : !priceOk ? t("needPrice") : t("needName")}
                </button>
              ) : (
                <button onClick={login} className="btn-primary mt-4 w-full rounded-full py-3 text-sm font-semibold">
                  {t("loginToMint")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotoSlot({
  label,
  value,
  onChange,
  onFile,
  disabled,
  hint,
  retake,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  onFile: (f: File) => void;
  disabled: boolean;
  hint: string;
  retake: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-2">{label} *</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          onFile(f);
          onChange(await cropToCard(f));
        }}
      />
      <button
        onClick={() => !disabled && input.current?.click()}
        aria-label={`${label}: ${value ? retake : hint}`}
        className="group relative block aspect-[55/85] w-full overflow-hidden rounded-xl border-2 border-dashed border-line bg-surface-2 hover:border-ink-3"
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- 本機剛裁好的 data URL
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1.5 px-2 text-center text-[11px] text-ink-2">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {hint}
          </span>
        )}
        {value && !disabled && (
          <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-1 text-center text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">{retake}</span>
        )}
      </button>
    </div>
  );
}

// 補充照片的「＋」格子
function AddPhoto({ label, onAdd }: { label: string; onAdd: (v: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onAdd(await cropToCard(f));
        }}
      />
      <button
        onClick={() => input.current?.click()}
        aria-label={label}
        className="grid aspect-[55/85] place-items-center rounded-md border-2 border-dashed border-line bg-surface-2 text-lg text-ink-3 hover:border-ink-3"
      >
        +
      </button>
    </>
  );
}
