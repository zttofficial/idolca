"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthContext";
import { Link } from "@/i18n/navigation";
import { GROUPS, TEMPLATES } from "@/lib/catalog";
import { mintItem } from "@/lib/items";
import { CARD_SOURCES, type CardSource } from "@/lib/sources";

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
const OUT_W = 660;
const OUT_H = 1020;

// 置中裁成 55:85 再上傳；伺服器端會再驗證、加浮水印
async function cropToCard(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const ratio = OUT_W / OUT_H;
    let sw = img.width;
    let sh = img.height;
    if (sw / sh > ratio) sw = sh * ratio;
    else sh = sw / ratio;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    canvas.getContext("2d")!.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, OUT_W, OUT_H);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const unique = (xs: string[]) => [...new Set(xs)];

function AddCardDialog({ prefill, onClose }: { prefill: Prefill; onClose: () => void }) {
  const t = useTranslations("Mint");
  const tSource = useTranslations("Source");
  const { user, login } = useAuth();
  const [front, setFront] = useState<string>();
  const [back, setBack] = useState<string>();
  const [extras, setExtras] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [sell, setSell] = useState(false);
  const [price, setPrice] = useState("");
  const [source, setSource] = useState<CardSource>(prefill.source ?? "album");
  const [group, setGroup] = useState(prefill.group ?? "");
  const [member, setMember] = useState(prefill.member ?? "");
  const [album, setAlbum] = useState(prefill.album ?? "");
  const [version, setVersion] = useState(prefill.version ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 圖鑑只用來給輸入建議，填什麼都可以
  const g = GROUPS.find((x) => x.name.toLowerCase() === group.trim().toLowerCase());
  const memberOptions = g ? g.members : unique(GROUPS.flatMap((x) => x.members));
  const albumOptions = unique((g ? TEMPLATES.filter((x) => x.groupId === g.id) : TEMPLATES).map((x) => x.album));
  const versionOptions = unique(TEMPLATES.map((x) => x.version));
  const priceValue = Number(price);
  const priceOk = !sell || (price !== "" && priceValue > 0 && priceValue <= 100_000);
  const ready = Boolean(front && back && group.trim() && member.trim() && priceOk);

  const mint = async () => {
    if (!front || !back || !ready) return;
    setBusy(true);
    setError(false);
    try {
      await mintItem({ photos: [front, back, ...extras], title, quantity, source, group, member, album, version, priceUsdt: sell ? priceValue : undefined });
      setDone(true);
    } catch {
      setError(true);
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
          <button onClick={onClose} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:bg-surface-2">
            {t("close")}
          </button>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-[230px_1fr]">
          <div>
            <div className="grid grid-cols-2 gap-3">
              <PhotoSlot label={t("front")} value={front} onChange={setFront} disabled={done} hint={t("choosePhoto")} retake={t("retake")} />
              <PhotoSlot label={t("back")} value={back} onChange={setBack} disabled={done} hint={t("chooseBack")} retake={t("retake")} />
            </div>
            <p className="mt-3 text-xs font-medium text-ink-2">{t("morePhotos")}</p>
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
            <p className="mt-1 text-[11px] leading-snug text-ink-3">{t("morePhotosHint")}</p>
          </div>

          {done ? (
            <div>
              <div className="rounded-xl bg-up/10 p-4 text-sm text-up">{t("done")}</div>
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
                  <input value={group} onChange={(e) => setGroup(e.target.value)} list="add-groups" maxLength={60} placeholder="IVE" className={field} />
                </label>
                <label className="text-xs font-medium text-ink-2">
                  {t("member")} *
                  <input value={member} onChange={(e) => setMember(e.target.value)} list="add-members" maxLength={60} placeholder="Wonyoung" className={field} />
                </label>
                <label className="col-span-2 text-xs font-medium text-ink-2">
                  {t("source")} *
                  <select value={source} onChange={(e) => setSource(e.target.value as CardSource)} className={field}>
                    {CARD_SOURCES.map((x) => (
                      <option key={x} value={x}>
                        {tSource(x)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-ink-2">
                  {t("releaseName")}
                  <input value={album} onChange={(e) => setAlbum(e.target.value)} list="add-albums" maxLength={80} placeholder={t(`releasePlaceholder_${source === "album" || source === "pob" || source === "luckydraw" || source === "fansign" ? "album" : "event"}`)} className={field} />
                </label>
                <label className="text-xs font-medium text-ink-2">
                  {t("detail")}
                  <input value={version} onChange={(e) => setVersion(e.target.value)} list="add-versions" maxLength={80} className={field} />
                </label>
              </div>
              <datalist id="add-groups">{GROUPS.map((x) => <option key={x.id} value={x.name} />)}</datalist>
              <datalist id="add-members">{memberOptions.map((m) => <option key={m} value={m} />)}</datalist>
              <datalist id="add-albums">{albumOptions.map((a) => <option key={a} value={a} />)}</datalist>
              <datalist id="add-versions">{versionOptions.map((v) => <option key={v} value={v} />)}</datalist>

              <div className="mt-4 rounded-xl border border-line p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={sell} onChange={() => setSell(!sell)} className="h-4 w-4 accent-[var(--accent)]" />
                  {t("sellNow")}
                </label>
                {sell && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">
                    {t("price")}
                    <input
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="25"
                      className="w-28 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-ink"
                    />
                    USDT
                  </label>
                )}
              </div>

              <p className="mt-3 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">{t("freeMintNote")}</p>

              {error && <p className="mt-3 text-xs text-down">{t("error")}</p>}
              {user ? (
                <button onClick={mint} disabled={!ready || busy} className="btn-primary mt-4 w-full rounded-full py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
                  {busy ? "…" : ready ? t(sell ? "confirmSell" : "confirm") : !(front && back) ? t("needPhoto") : !priceOk ? t("needPrice") : t("needName")}
                </button>
              ) : (
                <button onClick={login} className="btn-primary mt-4 w-full rounded-full py-3 text-sm font-semibold">
                  {t("loginToMint")}
                </button>
              )}
              <p className="mt-3 text-[11px] text-ink-3">{t("demoNote")}</p>
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
  disabled,
  hint,
  retake,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
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
          if (f) onChange(await cropToCard(f));
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
          <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-1 text-center text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
            {retake}
          </span>
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
