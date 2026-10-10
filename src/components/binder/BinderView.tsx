"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import CardArt from "@/components/market/CardArt";
import { AddCardButton, openAddCard } from "./AddCard";
import VerificationBadge from "./VerificationBadge";
import BinderBook from "./BinderBook";
import { OnChainCards, Orders } from "./BinderChain";
import { useChainState, useTemplateMarket } from "@/lib/chain-client";
import { useAuth } from "@/components/auth/AuthContext";
import { Thumbs } from "@/components/market/PhotoGallery";
import { Link } from "@/i18n/navigation";
import { binderActions, useBinder, type BinderEntry } from "@/lib/binder";
import { GROUPS, TEMPLATES, templateCard, type Template } from "@/lib/catalog";
import { CARDS, type Card } from "@/lib/mock-cards";
import { formatUsdt } from "@/lib/fx";
import { PACKS, entryCard } from "@/lib/packs";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import { itemTitle } from "@/lib/item-title";
import { setDescription, setListing, useMyItems, type CollectorItem } from "@/lib/items";

type Tab = "binder" | "onchain" | "orders" | "progress" | "wants";
const TABS: Tab[] = ["binder", "onchain", "orders", "progress", "wants"];
type Owned = { template: Template; entry: BinderEntry };
type Pull = { entryId: string; cardId: string; asset: string; tx: string; packId: string };
// 卡冊裡的一格：錢包裡的金庫卡、開卡包抽到的卡、自己上鏈的卡，或在圖鑑裡標記「有」的卡款
type Slot = { kind: "vault"; card: Card } | { kind: "pull"; pull: Pull } | { kind: "item"; item: CollectorItem } | { kind: "card"; owned: Owned };

export default function BinderView() {
  const t = useTranslations("Binder");
  const binder = useBinder();
  const [tab, setTab] = useState<Tab>("binder");
  const { user, ready, login } = useAuth();
  // 從其他頁連過來時用 ?tab= 指定頁籤（例如付款後看訂單）
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 只在進入頁面時讀網址
    if (wanted && TABS.includes(wanted)) setTab(wanted);
  }, []);
  const chain = useChainState();
  const [pulls, setPulls] = useState<Pull[]>([]);
  useEffect(() => {
    if (!user) return;
    fetch("/api/packs/mine")
      .then((r) => (r.ok ? r.json() : { pulls: [] }))
      .then((d: { pulls: Pull[] }) => setPulls(d.pulls))
      .catch(() => {});
  }, [user]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const items = useMyItems();

  // 按圖鑑順序排列，和實體卡冊一樣同一團體、同一成員的卡放在一起
  const owned: Owned[] = TEMPLATES.filter((x) => binder.have[x.id]).map((template) => ({ template, entry: binder.have[template.id] }));
  const wants = TEMPLATES.filter((x) => binder.want[x.id]);

  // 學 Pocamarket 和 KOCA：收藏冊要登入才用；未登入時介紹功能，不擺一堆空卡位
  if (!ready) return <div className="mt-10 h-64 animate-pulse rounded-2xl bg-surface-2" />;
  if (!user) return <LoggedOut localCount={owned.length + wants.length} onLogin={login} />;

  if (!owned.length && !wants.length && !items.length && !user.walletAddress) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{t("emptyBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <AddCardButton className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold" />
          <Link href="/catalog" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface-2">
            {t("browse")}
          </Link>
        </div>
      </div>
    );
  }

  const copies = owned.reduce((n, o) => n + o.entry.count, 0) + items.length + vaultCardsCount(chain, user?.walletAddress) + pulls.length;
  const groups = new Set([...owned.map((o) => o.template.group), ...items.map((i) => i.group.trim())].map((g) => g.toLowerCase())).size;
  const stats = [
    { label: t("statCards"), value: copies.toLocaleString("en-US") },
    { label: t("statGroups"), value: groups },
    { label: t("statMinted"), value: items.length },
  ];

  // 自己上鏈的卡排在最前面，後面是圖鑑順序的卡款
  // 真實的卡排前面：錢包裡的金庫卡、開卡包抽到的卡、自己上鏈的卡；圖鑑標記的卡款裡，有照片的排在沒照片的前面
  const wallet = user?.walletAddress;
  const vaultCards = wallet && chain?.ready ? CARDS.filter((c) => { const s = chain.cards[c.id]; return s && !s.burned && (s.owner === wallet || s.listing?.seller === wallet); }) : [];
  const withPhoto = (o: Owned) => Boolean(ownedCard(o).image);
  const slots: Slot[] = [
    ...vaultCards.map((card) => ({ kind: "vault" as const, card })),
    ...pulls.map((pull) => ({ kind: "pull" as const, pull })),
    ...items.map((item) => ({ kind: "item" as const, item })),
    ...[...owned.filter(withPhoto), ...owned.filter((o) => !withPhoto(o))].map((o) => ({ kind: "card" as const, owned: o })),
  ];
  const selectedOwned = owned.find((o) => o.template.id === selected);
  const pickedItem = items.find((i) => i.id === selectedItem);

  return (
    <div className="mt-8">
      <div className="mb-4 flex justify-end">
        <AddCardButton className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold" />
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4">
            <dt className="text-xs text-ink-3">{s.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex items-center justify-between gap-4 border-b border-line">
        <div role="tablist" className="flex gap-6 overflow-x-auto">
          {TABS.filter((id) => user || (id !== "onchain" && id !== "orders")).map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition ${tab === id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
            >
              {t(`tab_${id}`)}
              {id === "wants" && wants.length > 0 && <span className="ml-1.5 text-ink-3 tabular-nums">{wants.length}</span>}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.confirm(t("clearConfirm")) && binderActions.clear()}
          className="pb-3 text-xs text-ink-3 hover:text-down"
        >
          {t("clear")}
        </button>
      </div>

      {tab === "binder" && (
        <div className="mt-6">
          <BinderBook
            slots={slots.map((slot, i) =>
              slot.kind === "vault" ? (
                <VaultSlot key={i} card={slot.card} />
              ) : slot.kind === "pull" ? (
                <PullSlot key={i} pull={slot.pull} />
              ) : slot.kind === "item" ? (
                <ItemPocket key={i} item={slot.item} onSelect={() => setSelectedItem(slot.item.id)} />
              ) : (
                <Pocket key={i} owned={slot.owned} onSelect={() => setSelected(slot.owned.template.id)} />
              ),
            )}
          />
        </div>
      )}

      {tab === "onchain" && <OnChainCards />}
      {tab === "orders" && <Orders />}
      {tab === "progress" && <Progress />}

      {tab === "wants" &&
        (wants.length ? (
          <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
            {wants.map((w) => (
              <li key={w.id} className="flex items-center gap-4 px-4 py-3">
                <div className="aspect-[55/85] w-10 shrink-0 overflow-hidden rounded-md">
                  <CardArt card={templateCard(w)} rarityLabel="" className="block h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {w.group} {w.member}
                  </p>
                  <p className="truncate text-xs text-ink-3">
                    {w.album} · {w.version}
                  </p>
                </div>
                <WantMarket template={w} />
                {w.listingId && (
                  <Link href={`/card/${w.listingId}`} className="text-xs font-semibold text-accent-ink hover:underline">
                    {t("view")}
                  </Link>
                )}
                <button onClick={() => binderActions.toggleWant(w.id)} className="text-xs text-ink-3 hover:text-down">
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-ink-3">{t("wantsEmpty")}</p>
        ))}

      {selectedOwned && <CardSheet owned={selectedOwned} onClose={() => setSelected(null)} />}
      {pickedItem && <ItemSheet item={pickedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

function ownedCard({ template, entry }: Owned) {
  const base = templateCard(template);
  return entry.photo ? { ...base, image: { front: entry.photo } } : base;
}

function Pocket({ owned, onSelect }: { owned: Owned; onSelect: () => void }) {
  const tRarity = useTranslations("Rarity");
  const card = ownedCard(owned);
  return (
    <button onClick={onSelect} className="group relative block h-full w-full overflow-hidden text-left">
      {card.image ? (
        <CardArt card={card} rarityLabel={tRarity(owned.template.rarity)} className="block h-full w-full" />
      ) : (
        // 還沒有照片的卡款：簡潔的文字卡，不畫剪影佔位圖
        <span className="flex h-full w-full flex-col justify-between bg-white p-2.5">
          <span className="text-[10px] font-semibold tracking-wide text-ink-3 uppercase">{tRarity(owned.template.rarity)}</span>
          <span>
            <span className="block text-sm leading-tight font-bold">{owned.template.member}</span>
            <span className="mt-0.5 block text-[10px] leading-snug text-ink-2">{owned.template.version}</span>
            <span className="block truncate text-[10px] text-ink-3">{owned.template.album}</span>
          </span>
        </span>
      )}
      {owned.entry.count > 1 && (
        <span className="absolute top-1 right-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-bold text-white">×{owned.entry.count}</span>
      )}
      <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
    </button>
  );
}

function CardSheet({ owned, onClose }: { owned: Owned; onClose: () => void }) {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const { template, entry } = owned;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="grid w-full max-w-xl gap-6 rounded-2xl border border-line bg-surface p-6 shadow-2xl sm:grid-cols-[180px_1fr]" onClick={(e) => e.stopPropagation()}>
        <div className="aspect-[55/85] overflow-hidden rounded-xl">
          <CardArt card={ownedCard(owned)} rarityLabel={tRarity(template.rarity)} className="block h-full w-full" />
        </div>
        <div className="flex flex-col">
          <p className="text-xs text-ink-3">
            {template.group} · {template.album}
          </p>
          <h3 className="mt-1 text-xl font-bold">{template.member}</h3>
          <p className="text-sm text-ink-2">{template.version}</p>

          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="text-ink-3">{t("copies")}</span>
            <div className="flex items-center rounded-full border border-line">
              <button onClick={() => binderActions.setCount(template.id, entry.count - 1)} className="h-8 w-8 rounded-full hover:bg-surface-2">
                −
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">{entry.count}</span>
              <button onClick={() => binderActions.setCount(template.id, entry.count + 1)} className="h-8 w-8 rounded-full hover:bg-surface-2">
                +
              </button>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">{t("notMinted")}</p>

          <div className="mt-auto flex flex-col gap-2 pt-5">
            <button
              onClick={() => {
                onClose();
                openAddCard({ group: template.group, member: template.member, album: template.album, version: template.version });
              }}
              className="btn-primary rounded-full py-2.5 text-sm font-semibold"
            >
              {t("mint")}
            </button>
            <button onClick={onClose} className="py-1 text-xs text-ink-3 hover:text-ink">
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 自己上鏈的卡：照片 + 狀態；假卡打紅框、轉灰階並蓋上斜向 FAKE 字樣；刊登中的標出價格
function ItemPocket({ item, onSelect }: { item: CollectorItem; onSelect: () => void }) {
  const fake = item.verification === "fake";
  return (
    <button onClick={onSelect} className={`group relative block h-full w-full overflow-hidden text-left ${fake ? "ring-2 ring-down ring-inset" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
      <img src={item.photo} alt={itemTitle(item)} className={`h-full w-full object-cover ${fake ? "grayscale" : ""}`} />
      {fake && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="-rotate-[30deg] rounded border-2 border-down bg-white/70 px-2 text-lg font-black tracking-widest text-down">FAKE</span>
        </span>
      )}
      {item.quantity > 1 && <span className="absolute top-1 right-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-bold text-white">×{item.quantity}</span>}
      <span className="absolute bottom-1 left-1 flex gap-1">
        <VerificationBadge status={item.verification} />
        {item.priceUsdt !== null && <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-white tabular-nums">{formatUsdt(item.priceUsdt)}</span>}
      </span>
      <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
    </button>
  );
}

function ItemSheet({ item, onClose }: { item: CollectorItem; onClose: () => void }) {
  const t = useTranslations("Binder");
  const tMint = useTranslations("Mint");
  const tSource = useTranslations("Source");
  const [shown, setShown] = useState(0);
  const fake = item.verification === "fake";
  const photo = item.photos[shown] ?? item.photo;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="grid w-full max-w-xl gap-6 rounded-2xl border border-line bg-surface p-6 shadow-2xl sm:grid-cols-[200px_1fr]" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className={`aspect-[55/85] overflow-hidden rounded-xl ${fake ? "ring-2 ring-down" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
            <img src={photo} alt="" className={`h-full w-full object-cover ${fake ? "grayscale" : ""}`} />
          </div>
          {item.photos.length > 1 && <Thumbs photos={item.photos} shown={shown} onShow={setShown} />}
        </div>
        <div className="flex flex-col">
          <p className="text-xs text-ink-3">{[item.group, tSource(item.source), item.album].filter(Boolean).join(" · ")}</p>
          <h3 className="mt-1 text-xl font-bold">{itemTitle(item)}</h3>
          <p className="text-sm text-ink-2">{[item.member, item.version, item.quantity > 1 ? t("setOf", { count: item.quantity }) : null].filter(Boolean).join(" · ")}</p>
          <div className="mt-3">
            <VerificationBadge status={item.verification} className="text-[10px]" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-2">{tMint(`statusBody_${item.verification}`)}</p>
          {item.verificationNote && <p className="mt-2 text-xs text-ink-3">{item.verificationNote}</p>}
          <DescriptionEditor item={item} />
          {item.verifiedAt && <p className="mt-1 text-[11px] text-ink-3">{tMint("verifiedOn", { date: item.verifiedAt.slice(0, 10) })}</p>}
          {item.mintTx ? (
            <a href={solscanUrl("account", item.asset)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-ink-2 hover:text-ink">
              <span className="font-mono">{shortAddress(item.asset, 6, 6)}</span>
              <span className="font-semibold text-accent-ink">{tMint("onSolscan")} ↗</span>
            </a>
          ) : (
            <p className="mt-3 font-mono text-[11px] text-ink-3">{shortAddress(item.asset, 6, 6)}</p>
          )}
          {item.fakeTx && (
            <a href={solscanUrl("tx", item.fakeTx)} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] font-semibold text-down hover:underline">
              {tMint("fakeTx")} ↗
            </a>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-5">
            {!fake && <ListingControl item={item} />}
            {!fake && (
              <Link href="/#how" className="rounded-full border border-line py-2.5 text-center text-sm font-semibold hover:bg-surface-2">
                {t("sendToVault")}
              </Link>
            )}
            <button onClick={onClose} className="py-1 text-xs text-ink-3 hover:text-ink">
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 刊登出售 / 改價 / 下架
function ListingControl({ item }: { item: CollectorItem }) {
  const t = useTranslations("Binder");
  const listed = item.priceUsdt !== null;
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(item.priceUsdt?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const value = Number(price);
  const valid = price !== "" && value > 0 && value <= 100_000;
  const run = async (next: number | null) => {
    setBusy(true);
    try {
      await setListing(item.id, next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (listed && !editing) {
    return (
      <div className="rounded-xl bg-accent-soft p-3 text-sm">
        <p className="font-semibold text-accent-ink">{t("listedAt", { price: formatUsdt(item.priceUsdt!) })}</p>
        <div className="mt-2 flex gap-3 text-xs">
          <Link href={`/listing/${item.id}`} className="font-semibold text-accent-ink hover:underline">
            {t("viewListing")}
          </Link>
          <button onClick={() => setEditing(true)} className="text-ink-2 hover:text-ink">
            {t("editPrice")}
          </button>
          <button disabled={busy} onClick={() => run(null)} className="text-ink-2 hover:text-down">
            {t("unlist")}
          </button>
        </div>
      </div>
    );
  }
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="btn-primary rounded-full py-2.5 text-sm font-semibold">
        {t("listForSale")}
      </button>
    );
  }
  return (
    <form
      className="rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) run(value);
      }}
    >
      <label className="flex items-center gap-2 text-xs text-ink-2">
        {t("price")}
        <input
          autoFocus
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
          className="w-24 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-ink"
        />
        USDT
      </label>
      <p className="mt-2 text-[11px] leading-snug text-ink-3">{t("listingNote")}</p>
      <div className="mt-2 flex gap-2">
        <button disabled={!valid || busy} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40">
          {t(listed ? "savePrice" : "confirmList")}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="px-2 text-xs text-ink-3 hover:text-ink">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

// 每個團體、每位成員的收集進度
function Progress() {
  const t = useTranslations("Binder");
  const binder = useBinder();
  const rows = GROUPS.flatMap((g) =>
    g.albums.flatMap((a) =>
      a.members.map((m) => {
        const list = TEMPLATES.filter((x) => x.groupId === g.id && x.albumId === a.id && x.member === m);
        return { key: `${g.id}-${a.id}-${m}`, groupId: g.id, label: `${g.name} ${m}`, album: a.title, have: list.filter((x) => binder.have[x.id]).length, total: list.length };
      }),
    ),
  )
    .filter((r) => r.have > 0)
    .sort((x, y) => y.have / y.total - x.have / x.total);

  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={`/catalog/${r.groupId}`} className="block rounded-2xl border border-line bg-surface p-4 hover:border-accent">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-semibold">
                {r.label} <span className="font-normal text-ink-3">· {r.album}</span>
              </p>
              <span className="text-xs text-ink-2 tabular-nums">
                {r.have}/{r.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(r.have / r.total) * 100}%` }} />
            </div>
            {r.have === r.total && <p className="mt-2 text-[11px] font-semibold text-up">{t("complete")}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}


// 想要清單裡一個卡款的真實在售情況
function WantMarket({ template }: { template: Template }) {
  const t = useTranslations("Binder");
  const market = useTemplateMarket()(template);
  return (
    <span className="text-xs text-ink-2">
      {!market ? "…" : market.forSale && market.fromUsdt !== null ? t("forSaleNow", { count: market.forSale, price: formatUsdt(market.fromUsdt) }) : t("noneForSale")}
    </span>
  );
}

// 持有人自己的描述：看、改、清空；元數據即時跟著變
function DescriptionEditor({ item }: { item: CollectorItem }) {
  const t = useTranslations("Mint");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.description ?? "");
  const [busy, setBusy] = useState(false);
  if (!editing) {
    return (
      <div className="mt-3 text-xs">
        {item.description ? <p className="whitespace-pre-line leading-relaxed text-ink-2">{item.description}</p> : null}
        <button onClick={() => setEditing(true)} className="mt-1 font-semibold text-accent-ink hover:underline">
          {t(item.description ? "editDescription" : "addDescription")}
        </button>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder={t("descriptionPlaceholder")}
        className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-xs leading-relaxed outline-none focus:border-ink"
      />
      <div className="mt-1 flex gap-3 text-xs">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await setDescription(item.id, text);
              setEditing(false);
            } finally {
              setBusy(false);
            }
          }}
          className="font-semibold text-accent-ink hover:underline disabled:opacity-50"
        >
          {t("saveDescription")}
        </button>
        <button onClick={() => setEditing(false)} className="text-ink-3 hover:text-ink">
          {t("cancelEdit")}
        </button>
      </div>
    </div>
  );
}

// 未登入：上面說明收藏冊能做什麼，下面是一本用金庫裡真實卡片填好的樣例卡冊，可以翻頁、點進卡片
function LoggedOut({ localCount, onLogin }: { localCount: number; onLogin: () => void }) {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const points = ["loggedOutPoint1", "loggedOutPoint2", "loggedOutPoint3"] as const;
  return (
    <div className="mt-8 space-y-8">
      <div className="grid gap-6 rounded-3xl border border-line bg-surface-2 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("loggedOutTitle")}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {points.map((k, i) => (
              <li key={k} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">{i + 1}</span>
                {t(k)}
              </li>
            ))}
          </ul>
          {localCount > 0 && <p className="mt-4 text-xs text-ink-3">{t("loggedOutLocal", { count: localCount })}</p>}
        </div>
        <div className="flex flex-wrap gap-3 lg:flex-col">
          <button onClick={onLogin} className="btn-primary rounded-full px-6 py-2.5 text-sm font-semibold">
            {t("loggedOutCta")}
          </button>
          <Link href="/catalog" className="rounded-full border border-line bg-surface px-6 py-2.5 text-center text-sm font-semibold hover:bg-surface-3">
            {t("browse")}
          </Link>
        </div>
      </div>
      <BinderBook
        title={t("sampleTitle")}
        slots={CARDS.map((c) => (
          <Link key={c.id} href={`/card/${c.id}`} className="group block h-full w-full">
            <CardArt card={c} rarityLabel={tRarity(c.rarity)} className="block h-full w-full transition group-hover:scale-[1.03]" />
          </Link>
        ))}
      />
    </div>
  );
}

function vaultCardsCount(chain: ReturnType<typeof useChainState>, wallet?: string | null) {
  if (!wallet || !chain?.ready) return 0;
  return CARDS.filter((c) => {
    const s = chain.cards[c.id];
    return s && !s.burned && (s.owner === wallet || s.listing?.seller === wallet);
  }).length;
}

// 錢包裡的金庫卡：點進卡片頁
function VaultSlot({ card }: { card: Card }) {
  const tRarity = useTranslations("Rarity");
  return (
    <Link href={`/card/${card.id}`} className="group block h-full w-full">
      <CardArt card={card} rarityLabel={tRarity(card.rarity)} className="block h-full w-full transition group-hover:scale-[1.03]" />
    </Link>
  );
}

// 開卡包抽到的卡：點開它在 Solscan 上的 NFT
function PullSlot({ pull }: { pull: Pull }) {
  const tRarity = useTranslations("Rarity");
  const entry = PACKS.find((p) => p.id === pull.packId)?.pool.find((e) => e.id === pull.entryId);
  if (!entry) return null;
  const card = entryCard(entry);
  return (
    <a href={solscanUrl("account", pull.asset)} target="_blank" rel="noreferrer" className="group block h-full w-full">
      <CardArt card={card} rarityLabel={tRarity(card.rarity)} className="block h-full w-full transition group-hover:scale-[1.03]" />
    </a>
  );
}
