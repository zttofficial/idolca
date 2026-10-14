"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MINT_FEE_USD } from "@/lib/policy";
import { GetWalletPrompt } from "@/components/auth/WalletSetup";
import CardArt from "@/components/market/CardArt";
import { AddCardButton, openAddCard } from "./AddCard";
import VerificationBadge from "./VerificationBadge";
import ListingControl from "@/components/market/ListingControl";
import Dialog from "@/components/ui/Dialog";
import InfoTip from "@/components/ui/InfoTip";
import BinderBook from "./BinderBook";
import BinderArranger from "./BinderArranger";
import { arrange, clearPocket, EMPTY_LAYOUT, isTrackedOnly, takeOut } from "@/lib/binder-layout";
import { OnChainCards, Orders } from "./BinderChain";
import { listVaultCard, refreshChainState, useChainState, useTemplateMarket, useVaultCards, vaultAction } from "@/lib/chain-client";
import { useAuth } from "@/components/auth/AuthContext";
import { Thumbs } from "@/components/market/PhotoGallery";
import { Link } from "@/i18n/navigation";
import { binderActions, useBinder, type BinderEntry } from "@/lib/binder";
import { GROUPS, TEMPLATES, templateCard, type Template } from "@/lib/catalog";
import type { Card } from "@/lib/cards";
import { formatPrice } from "@/lib/fx";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import { itemTitle } from "@/lib/item-title";
import { putOnChain, setAuction, setDescription, setListing, useMyItems, type CollectorItem, requestVault } from "@/lib/items";

type Tab = "binder" | "onchain" | "orders" | "progress" | "wants";
const TABS: Tab[] = ["binder", "onchain", "orders", "progress", "wants"];
type Owned = { template: Template; entry: BinderEntry };
// 卡冊裡的一格：錢包裡的金庫卡、開卡包抽到的卡、自己上鏈的卡，或在圖鑑裡標記「有」的卡款
type Slot = { kind: "vault"; card: Card } | { kind: "item"; item: CollectorItem } | { kind: "card"; owned: Owned };

export default function BinderView() {
  const t = useTranslations("Binder");
  const binder = useBinder();
  const { user, ready, login } = useAuth();
  // 頁籤和篩選跟著網址走：?tab=orders 看訂單，?filter=listed 只看在售中（上架很多張時管理價格和下架，不必翻卡冊）。
  // 帳號選單和付款後的連結直接帶參數過來；已經在收藏冊時點這些連結也會切換
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const wanted = sp.get("tab") as Tab | null;
  const tab: Tab = wanted && TABS.includes(wanted) ? wanted : "binder";
  const onlyListed = sp.get("filter") === "listed";
  const setView = (next: { tab?: Tab; listed?: boolean }) => {
    const params = new URLSearchParams();
    const t2 = next.tab ?? tab;
    if (t2 !== "binder") params.set("tab", t2);
    if (t2 === "binder" && (next.listed ?? onlyListed)) params.set("filter", "listed");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setTab = (next: Tab) => setView({ tab: next });
  const setOnlyListed = (listed: boolean) => setView({ listed });
  const vault = useVaultCards();
  // 鏈上持有人隨時會變（開卡包、買賣），每次進收藏冊都重讀一次
  useEffect(() => {
    refreshChainState();
  }, []);
  // 錢包裡的金庫卡（買來的、開卡包抽到的、寄存的）
  const myVault = user?.walletAddress && vault ? vault.filter((c) => c.owner === user.walletAddress) : [];
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
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

  // 真實的卡排前面：錢包裡的金庫卡、開卡包抽到的卡、自己上鏈的卡；圖鑑標記的卡款裡，有照片的排在沒照片的前面
  const withPhoto = (o: Owned) => Boolean(ownedCard(o, vault).image);
  const slots: Slot[] = [
    ...myVault.map((card) => ({ kind: "vault" as const, card })),
    ...items.map((item) => ({ kind: "item" as const, item })),
    ...[...owned.filter(withPhoto), ...owned.filter((o) => !withPhoto(o))].map((o) => ({ kind: "card" as const, owned: o })),
  ];
  const byKey = new Map(slots.map((slot) => [slotKey(slot), slot]));
  const keys = [...byKey.keys()];
  // 只是記錄的卡不進卡盒；以前被拿出冊子的放回冊子
  const { layout, pockets, hiddenCards } = arrange(keys, {
    ...binder.layout,
    hidden: binder.layout.hidden.filter((k) => !isTrackedOnly(k)),
  });
  const present = new Set(keys);
  // 統計冊子裡的卡（拿出收藏冊的不算）：張數、團體數、自己上鏈的張數，跟著擺法即時變
  const inBinder = slots.filter((slot) => !hiddenCards.includes(slotKey(slot)));
  const copies = inBinder.reduce((n, slot) => n + (slot.kind === "card" ? slot.owned.entry.count : 1), 0);
  const groupOf = (slot: Slot) => (slot.kind === "vault" ? slot.card.group : slot.kind === "item" ? slot.item.group : slot.owned.template.group);
  const groups = new Set(inBinder.map((slot) => groupOf(slot).trim().toLowerCase())).size;
  const stats = [
    { label: t("statCards"), value: copies.toLocaleString("en-US") },
    { label: t("statGroups"), value: groups },
    {
      label: t("statMinted"),
      value: inBinder.filter((slot) => slot.kind === "item").length,
    },
  ];
  // 鏈上的卡拿出冊子放進卡盒；只是記錄的卡直接刪掉標記和它的位置
  const takeOutCard = (key: string) => {
    if (!isTrackedOnly(key)) return binderActions.setLayout(takeOut(layout, key));
    binderActions.setLayout(clearPocket(layout, key));
    binderActions.setCount(key.slice("card:".length), 0);
  };
  // 在售中：一口價刊登或拍賣中的收藏卡，和在託管程序裡掛單或拍賣的金庫卡（拿出冊子的也算）
  const listedSlots = slots.filter(
    (slot) => (slot.kind === "vault" && (slot.card.status === "listed" || slot.card.status === "auction")) || (slot.kind === "item" && (slot.item.priceUsdt !== null || Boolean(slot.item.auction))),
  );
  const openSlot = (slot: Slot) => (slot.kind === "vault" ? setSelectedVault(slot.card.id) : slot.kind === "item" ? setSelectedItem(slot.item.id) : setSelected(slot.owned.template.id));
  const selectedOwned = owned.find((o) => o.template.id === selected);
  const pickedItem = items.find((i) => i.id === selectedItem);
  const pickedVault = myVault.find((c) => c.id === selectedVault);

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
        {/* 只清得掉手動標記的卡和想要清單；錢包裡的金庫卡和自己上鏈的卡跟著鏈上持有顯示，清不掉也不必加回 */}
        {(owned.length > 0 || wants.length > 0) && (
          <button onClick={() => window.confirm(t("clearConfirm")) && binderActions.clear()} className="btn-danger mb-2 shrink-0 rounded-full px-3 py-1 text-xs font-semibold">
            {t("clear")}
          </button>
        )}
      </div>

      {tab === "binder" && (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {!arranging && (
              <div role="radiogroup" aria-label={t("filterLabel")} className="mr-auto flex rounded-full bg-surface-2 p-1 text-xs font-semibold">
                {([false, true] as const).map((only) => (
                  <button
                    key={String(only)}
                    role="radio"
                    aria-checked={onlyListed === only}
                    onClick={() => setOnlyListed(only)}
                    className={`rounded-full px-3 py-1 transition ${onlyListed === only ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
                  >
                    {only ? t("filterListed", { count: listedSlots.length }) : t("filterAll")}
                  </button>
                ))}
              </div>
            )}
            {!arranging && !onlyListed && hiddenCards.length > 0 && <p className="text-xs text-ink-3">{t("hiddenCount", { count: hiddenCards.length })}</p>}
            {arranging && (
              <button onClick={() => window.confirm(t("resetLayoutConfirm")) && binderActions.setLayout(EMPTY_LAYOUT)} className="mr-auto text-xs text-ink-3 hover:text-ink">
                {t("resetLayout")}
              </button>
            )}
            {!onlyListed && (
              <button
                onClick={() => setArranging(!arranging)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${arranging ? "btn-primary" : "border border-line hover:bg-surface-2"}`}
              >
                {t(arranging ? "arrangeDone" : "arrange")}
              </button>
            )}
          </div>
          {onlyListed ? (
            listedSlots.length ? (
              // 和卡冊同一本書，只放在售中的卡，卡套上掛售價
              <BinderBook
                slots={listedSlots.map((slot) => (
                  <span key={slotKey(slot)} className="relative block h-full w-full">
                    <SlotView slot={slot} onSelect={() => openSlot(slot)} />
                    <span className="pointer-events-none absolute right-1 bottom-1 rounded-md bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                      {formatPrice(slot.kind === "vault" ? slot.card.priceUsdt : slot.kind === "item" ? (slot.item.priceUsdt ?? 0) : 0)}
                    </span>
                  </span>
                ))}
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-3">{t("listedEmpty")}</p>
            )
          ) : arranging ? (
            <BinderArranger
              layout={layout}
              pockets={pockets}
              boxed={hiddenCards}
              present={present}
              render={(key) => <SlotView slot={byKey.get(key)!} />}
              onChange={binderActions.setLayout}
              onTakeOut={takeOutCard}
            />
          ) : (
            <BinderBook
              slots={pockets.map((key, i) => {
                const slot = key ? byKey.get(key) : undefined;
                if (!slot) return null;
                return <SlotView key={i} slot={slot} onSelect={() => openSlot(slot)} />;
              })}
            />
          )}
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
                  <CardArt card={templateCard(w, vault)} rarityLabel="" className="block h-full w-full" />
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
                <button onClick={() => binderActions.toggleWant(w.id)} className="text-xs text-ink-3 hover:text-down">
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-ink-3">{t("wantsEmpty")}</p>
        ))}

      {selectedOwned && (
        <CardSheet
          owned={selectedOwned}
          onClose={() => setSelected(null)}
          onTakeOut={() => {
            setSelected(null);
            takeOutCard(`card:${selectedOwned.template.id}`);
          }}
        />
      )}
      {pickedItem && (
        <ItemSheet
          item={pickedItem}
          onClose={() => setSelectedItem(null)}
          onTakeOut={() => {
            setSelectedItem(null);
            takeOutCard(`item:${pickedItem.id}`);
          }}
        />
      )}
      {pickedVault && (
        <VaultSheet
          card={pickedVault}
          onClose={() => setSelectedVault(null)}
          onTakeOut={() => {
            setSelectedVault(null);
            takeOutCard(`vault:${pickedVault.id}`);
          }}
        />
      )}
    </div>
  );
}

// 卡在擺法裡的鍵（見 binder-layout.ts）
const slotKey = (slot: Slot) => (slot.kind === "vault" ? `vault:${slot.card.id}` : slot.kind === "item" ? `item:${slot.item.id}` : `card:${slot.owned.template.id}`);

function SlotView({ slot, onSelect }: { slot: Slot; onSelect?: () => void }) {
  if (slot.kind === "vault") return <VaultSlot card={slot.card} onSelect={onSelect} />;
  if (slot.kind === "item") return <ItemPocket item={slot.item} onSelect={onSelect} />;
  return <Pocket owned={slot.owned} onSelect={onSelect} />;
}

function ownedCard({ template, entry }: Owned, vault: Card[] | null) {
  const base = templateCard(template, vault);
  return entry.photo ? { ...base, image: { front: entry.photo } } : base;
}

// 手動標記的卡（不是鏈上的卡）：虛線框加「僅記錄」標籤，和真卡分開。沒給 onSelect 時只畫卡面，不能點（整理收藏冊時用）
function Pocket({ owned, onSelect }: { owned: Owned; onSelect?: () => void }) {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const card = ownedCard(owned, useVaultCards());
  const Tag = onSelect ? "button" : "span";
  return (
    <Tag onClick={onSelect} className="group relative block h-full w-full overflow-hidden rounded-[5px] border-2 border-dashed border-ink-3/60 text-left">
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
      {owned.entry.count > 1 && <span className="absolute top-1 right-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-bold text-white">×{owned.entry.count}</span>}
      <span className="absolute inset-x-0 bottom-0 bg-ink/55 py-0.5 text-center text-[9px] font-semibold tracking-wide text-white">{t("trackedOnly")}</span>
      <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
    </Tag>
  );
}

function CardSheet({ owned, onClose, onTakeOut }: { owned: Owned; onClose: () => void; onTakeOut: () => void }) {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const { template, entry } = owned;
  const vault = useVaultCards();
  return (
    <Dialog label={`${template.group} ${template.member}`} onClose={onClose}>
      <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <div className="aspect-[55/85] overflow-hidden rounded-xl">
          <CardArt card={ownedCard(owned, vault)} rarityLabel={tRarity(template.rarity)} className="block h-full w-full" />
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
                openAddCard({
                  group: template.group,
                  member: template.member,
                  album: template.album,
                  version: template.version,
                });
              }}
              className="btn-primary rounded-full py-2.5 text-sm font-semibold"
            >
              {t("mint")}
            </button>
            <TakeOutButton onTakeOut={onTakeOut} label="removeFromBinder" />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// 自己上鏈的卡：只放照片，狀態和價格在點開的詳情裡；假卡打紅框、轉灰階並蓋上斜向 FAKE 字樣
function ItemPocket({ item, onSelect }: { item: CollectorItem; onSelect?: () => void }) {
  const fake = item.verification === "fake";
  const Tag = onSelect ? "button" : "span";
  return (
    <Tag onClick={onSelect} className={`group relative block h-full w-full overflow-hidden text-left ${fake ? "ring-2 ring-down ring-inset" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
      <img src={item.photo} alt={itemTitle(item)} className={`h-full w-full object-cover ${fake ? "grayscale" : ""}`} />
      {fake && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="-rotate-[30deg] rounded border-2 border-down bg-white/70 px-2 text-lg font-black tracking-widest text-down">FAKE</span>
        </span>
      )}
      <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
    </Tag>
  );
}

function ItemSheet({ item, onClose, onTakeOut }: { item: CollectorItem; onClose: () => void; onTakeOut: () => void }) {
  const t = useTranslations("Binder");
  const tMint = useTranslations("Mint");
  const tSource = useTranslations("Source");
  const [shown, setShown] = useState(0);
  const fake = item.verification === "fake";
  const photo = item.photos[shown] ?? item.photo;
  return (
    <Dialog label={itemTitle(item)} onClose={onClose}>
      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
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
            <a href={solscanUrl("account", item.asset!)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-ink-2 hover:text-ink">
              <span className="font-mono">{shortAddress(item.asset!, 6, 6)}</span>
              <span className="font-semibold text-accent-ink">{tMint("onSolscan")} ↗</span>
            </a>
          ) : (
            !fake && !item.vaultRequestedAt && <MintSelf item={item} />
          )}
          {item.fakeTx && (
            <a href={solscanUrl("tx", item.fakeTx)} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] font-semibold text-down hover:underline">
              {tMint("fakeTx")} ↗
            </a>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-5">
            {!fake && !item.vaultRequestedAt && (
              <ListingControl
                lane="free"
                price={item.priceUsdt}
                auction={item.auction}
                viewHref={`/listing/${item.id}`}
                note={t("listingNote")}
                onList={(price) => setListing(item.id, price)}
                onUnlist={() => setListing(item.id, null)}
                onAuction={(input) => setAuction(item.id, input)}
                onCancelAuction={() => setAuction(item.id, null)}
              />
            )}
            {!fake && !item.auction && <VaultRequest item={item} />}
            <TakeOutButton onTakeOut={onTakeOut} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// 寄進金庫：申請後下架，照提示把實物寄到金庫；鑑定為真後轉成金庫卡（金庫 NFT 鑄到綁定的錢包）
function VaultRequest({ item }: { item: CollectorItem }) {
  const t = useTranslations("Binder");
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (cancel: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await requestVault(item.id, cancel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  };
  if (item.vaultRequestedAt) {
    const address = process.env.NEXT_PUBLIC_VAULT_ADDRESS;
    return (
      <div className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
        <p className="font-semibold text-ink">{t("vaultRequested")}</p>
        <p className="mt-1">
          {t("vaultShipInstructions", {
            ref: `IDOLCA-${item.id.slice(0, 8).toUpperCase()}`,
          })}
        </p>
        {address ? <p className="mt-2 whitespace-pre-line text-ink">{address}</p> : <p className="mt-2 text-ink-3">{t("vaultAddressPending")}</p>}
        <button disabled={busy} onClick={() => run(true)} className="btn-secondary mt-2 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50">
          {t("vaultCancel")}
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <button disabled={busy || !user?.walletAddress} onClick={() => run(false)} className="btn-secondary flex-1 rounded-full py-2.5 text-center text-sm font-semibold disabled:opacity-50">
          {busy ? "…" : t("sendToVault")}
        </button>
        <InfoTip text={t("vaultHint")} label={t("sendToVault")} align="end" />
      </div>
      {!user?.walletAddress && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{t("vaultNeedsWallet")}</p>}
      {error && <p className="mt-1 text-[11px] text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : t("orderError")}</p>}
    </div>
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
        return {
          key: `${g.id}-${a.id}-${m}`,
          groupId: g.id,
          label: `${g.name} ${m}`,
          album: a.title,
          have: list.filter((x) => binder.have[x.id]).length,
          total: list.length,
        };
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
      {!market
        ? "…"
        : market.forSale && market.fromUsdt !== null
          ? t("forSaleNow", {
              count: market.forSale,
              price: formatPrice(market.fromUsdt),
            })
          : t("noneForSale")}
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
        <button onClick={() => setEditing(true)} className="btn-secondary mt-2 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50">
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
      <div className="mt-2 flex gap-2">
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
          className="btn-primary rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
        >
          {t("saveDescription")}
        </button>
        <button onClick={() => setEditing(false)} className="btn-secondary rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50">
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
  const sample = (useVaultCards() ?? []).filter((c) => c.image);
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
      {/* 金庫裡有卡時才放樣例卡冊 */}
      {sample.length > 0 && (
        <BinderBook
          title={t("sampleTitle")}
          slots={sample.map((c) => (
            <Link key={c.id} href={`/card/${c.id}`} className="group block h-full w-full">
              <CardArt card={c} rarityLabel={tRarity(c.rarity)} className="block h-full w-full transition group-hover:scale-[1.03]" />
            </Link>
          ))}
        />
      )}
    </div>
  );
}

// 錢包裡的金庫卡：和自己上鏈的卡一樣先打開詳情，再從詳情進卡片頁
function VaultSlot({ card, onSelect }: { card: Card; onSelect?: () => void }) {
  const tRarity = useTranslations("Rarity");
  const Tag = onSelect ? "button" : "span";
  return (
    <Tag onClick={onSelect} className="group relative block h-full w-full overflow-hidden text-left">
      <CardArt card={card} rarityLabel={tRarity(card.rarity)} className="block h-full w-full" />
      <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
    </Tag>
  );
}

// 錢包裡的金庫卡：和自己上鏈的卡一樣，可以直接在這裡上架、改價、下架（走鏈上託管程序，要錢包簽名）
function VaultSheet({ card, onClose, onTakeOut }: { card: Card; onClose: () => void; onTakeOut: () => void }) {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const tStatus = useTranslations("Status");
  const wallet = useAuth().user?.walletAddress;
  const listed = card.status === "listed";
  const chain = useChainState();
  const auction = chain?.cards[card.id]?.auction ?? null;
  return (
    <Dialog label={`${card.group} ${card.member}`} onClose={onClose}>
      <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <div className="aspect-[55/85] overflow-hidden rounded-xl">
          <CardArt card={card} rarityLabel={tRarity(card.rarity)} className="block h-full w-full" />
        </div>
        <div className="flex flex-col">
          <p className="text-xs text-ink-3">
            {card.group} · {card.album}
          </p>
          <h3 className="mt-1 text-xl font-bold">{card.member}</h3>
          <p className="text-sm text-ink-2">{card.version}</p>
          <p className="mt-3 font-mono text-[11px] text-ink-3">{card.serial}</p>
          {!listed && !auction && <p className="mt-3 text-sm font-semibold text-accent-ink">{tStatus(card.status)}</p>}
          <div className="mt-auto flex flex-col gap-2 pt-5">
            {wallet && (card.status === "vaulted" || listed || auction) && (
              <ListingControl
                lane="vault"
                price={listed ? card.priceUsdt : null}
                auction={auction}
                viewHref={`/card/${card.id}`}
                note={t("vaultListingNote")}
                onList={(price) => listVaultCard(card.id, wallet, price, listed)}
                onUnlist={() => vaultAction("cancel", card.id, wallet)}
                onAuction={chain?.auctions ? (input) => vaultAction("auction", card.id, wallet, input) : undefined}
                onCancelAuction={() => vaultAction("cancelAuction", card.id, wallet)}
              />
            )}
            {!listed && !auction && (
              <Link href={`/card/${card.id}`} className="btn-secondary rounded-full py-2.5 text-center text-sm font-semibold">
                {t("viewCard")} →
              </Link>
            )}
            <TakeOutButton onTakeOut={onTakeOut} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// 拿出收藏冊：鏈上的卡還是你的，只是不放在冊子裡顯示，整理收藏冊時可以放回；只是記錄的卡則是移除標記
function TakeOutButton({ onTakeOut, label = "takeOut" }: { onTakeOut: () => void; label?: "takeOut" | "removeFromBinder" }) {
  const t = useTranslations("Binder");
  return (
    <button onClick={onTakeOut} className="btn-secondary rounded-full py-2.5 text-center text-sm font-semibold">
      {t(label)}
    </button>
  );
}

// 做成數位珍藏（可選）：刊登和擔保交易都不需要；想要的話付鑄造費（USDT 或 USDC），押金和網路手續費由平台付。
// 旁邊的問號說明數位珍藏有什麼用，吸引用戶做
function MintSelf({ item }: { item: CollectorItem }) {
  const t = useTranslations("Mint");
  const wallet = useAuth().user?.walletAddress;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!wallet) return <GetWalletPrompt text={t("mintNeedsWallet")} className="mt-3" />;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await putOnChain(item.id, wallet);
            } catch (e) {
              setError(e instanceof Error ? e.message : "mint_failed");
            } finally {
              setBusy(false);
            }
          }}
          className="btn-secondary rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
        >
          {busy ? t("mintSelfBusy") : t("mintSelf")}
        </button>
        <InfoTip text={`${t("mintWhat")} ${t("mintSelfNote", { fee: formatPrice(MINT_FEE_USD) })}`} label={t("mintWhatLabel")} />
      </div>
      {error && <p className="mt-1 text-[11px] text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : t("mintSelfError", { fee: formatPrice(MINT_FEE_USD) })}</p>}
    </div>
  );
}
