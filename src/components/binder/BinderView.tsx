"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { showFee, useFees, usePromoNote } from "@/lib/use-fees";
import { GetWalletPrompt } from "@/components/auth/WalletSetup";
import CardArt from "@/components/market/CardArt";
import { AddCardButton, openAddCard } from "./AddCard";
import VerificationBadge from "./VerificationBadge";
import ListingControl from "@/components/market/ListingControl";
import Dialog from "@/components/ui/Dialog";
import InfoTip from "@/components/ui/InfoTip";
import BinderBook from "./BinderBook";
import { ItemPocket, Pocket, VaultSlot, type Owned } from "./BinderSlots";
import BinderArranger from "./BinderArranger";
import { PublicToggle, ShareBinderButton } from "./ShareBinder";
import { arrange, clearPocket, EMPTY_LAYOUT, isTrackedOnly, takeOut } from "@/lib/binder-layout";
import { Orders } from "./BinderChain";
import { listVaultCard, refreshChainState, useChainState, useTemplateMarket, useVaultCards, vaultAction } from "@/lib/chain-client";
import { useAuth } from "@/components/auth/AuthContext";
import { Thumbs } from "@/components/market/PhotoGallery";
import { Link } from "@/i18n/navigation";
import { binderActions, useBinder, type Binder } from "@/lib/binder";
import { binderSearch, filterBinder, isNarrowed, parseBinderQuery, type BinderQuery, type FilterFields } from "@/lib/binder-filter";
import { groupTree, nameKey } from "@/lib/facets";
import { ClearFilters, FilterBar, FiltersButton, GroupMemberFilter, SearchField } from "@/components/market/CardFilters";
import { GROUPS, TEMPLATES, templateCard, type Template } from "@/lib/catalog";
import type { Card } from "@/lib/cards";
import { formatPrice } from "@/lib/fx";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import { itemTitle } from "@/lib/item-title";
import { putOnChain, setAuction, setDescription, setListing, useMyItems, type CollectorItem, requestVault } from "@/lib/items";
import { VAULT_LIST, suggestVault, vaultOf, type Vault, type VaultId } from "@/lib/vaults";
import type { ShippingAddress } from "@/lib/shipping";
import { WalletNotFoundHint } from "@/components/auth/WalletPicker";

type Tab = "binder" | "orders" | "progress" | "wants";
const TABS: Tab[] = ["binder", "orders", "progress", "wants"];
// 卡冊裡的一格：錢包裡的金庫卡、開卡包抽到的卡、自己上鏈的卡，或在圖鑑裡標記「有」的卡款（card 是它畫成卡片的樣子）
type Slot = { kind: "vault"; card: Card } | { kind: "item"; item: CollectorItem } | { kind: "card"; owned: Owned; card: Card };

export default function BinderView() {
  const t = useTranslations("Binder");
  const tMarket = useTranslations("Market");
  const binder = useBinder();
  const { user, ready, login } = useAuth();
  // 頁籤和篩選跟著網址走：?tab=orders 看訂單；卡冊頁籤的 ?filter=listed 只看在售中（上架很多張時管理價格和下架，不必翻卡冊），
  // ?q=、?group=、?member= 搜尋和篩團體、成員（binder-filter.ts）。帳號選單和付款後的連結直接帶參數過來；已經在收藏冊時點這些連結也會切換。
  // 錢包裡的金庫卡本來就在卡冊裡，舊的 ?tab=onchain（數位珍藏頁籤）不再單獨列，落回卡冊
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const wanted = sp.get("tab") as Tab | null;
  const tab: Tab = wanted && TABS.includes(wanted) ? wanted : "binder";
  const query = useMemo(() => parseBinderQuery(new URLSearchParams(sp.toString())), [sp]);
  const narrowed = isNarrowed(query);
  const setView = (next: { tab?: Tab; query?: BinderQuery }) => {
    const t2 = next.tab ?? tab;
    const params = new URLSearchParams();
    if (t2 !== "binder") params.set("tab", t2);
    else binderSearch(next.query ?? query, params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setTab = (next: Tab) => setView({ tab: next });
  const setQuery = (patch: Partial<BinderQuery>) => setView({ query: { ...query, ...patch } });
  const vault = useVaultCards();
  // 鏈上持有人隨時會變（開卡包、買賣），每次進收藏冊都重讀一次
  useEffect(() => {
    refreshChainState();
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const items = useMyItems();
  const wallet = user?.walletAddress ?? undefined;
  // 卡冊的內容和擺法只在資料變了才重算，翻頁、開關詳情不重算（幾千張卡時每次重畫都跑一遍會卡）。
  // 內容和擺法分開算：整理時只改擺法，卡的資料（content.byKey）不變，整理畫面裡沒動到的頁就不必重畫
  const content = useMemo(() => binderContent(vault, wallet, items, binder.have), [vault, wallet, items, binder.have]);
  const model = useMemo(() => arrangeBinder(content, binder.layout), [content, binder.layout]);
  // 「全部」篩冊子裡的卡（照擺放順序），「在售中」篩在售的卡（拿出冊子的也算）
  const filtered = useMemo(() => filterBinder(query.listed ? model.listedSlots : model.ordered, slotFields, query), [model, query]);
  const wants = TEMPLATES.filter((x) => binder.want[x.id]);

  // 學 Pocamarket 和 KOCA：收藏冊要登入才用；未登入時介紹功能，不擺一堆空卡位
  if (!ready) return <div className="mt-10 h-64 animate-pulse rounded-2xl bg-surface-2" />;
  if (!user) return <LoggedOut localCount={model.owned.length + wants.length} onLogin={login} />;

  const { owned, byKey, layout, pockets, hiddenCards, present, inBinder, listedSlots } = model;
  if (!owned.length && !wants.length && !items.length && !wallet) {
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

  // 統計冊子裡的卡（拿出收藏冊的不算）：張數、團體數、自己上鏈的張數，跟著擺法即時變
  const copies = inBinder.reduce((n, slot) => n + (slot.kind === "card" ? slot.owned.entry.count : 1), 0);
  const groups = new Set(inBinder.map((slot) => nameKey(slotFields(slot).group))).size;
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
  // 整理收藏冊是在整本冊子的卡套上換位置，只能在「全部」且沒有搜尋、篩選時進行；篩選結果是擠在一起的連續卡套，在上面換位置對不上原本的卡套
  const canArrange = !query.listed && !narrowed;
  const arrangingNow = arranging && canArrange;
  const activeFilters = (query.cat || query.group ? 1 : 0) + (query.member ? 1 : 0);
  const openSlot = (slot: Slot) => (slot.kind === "vault" ? setSelectedVault(slot.card.id) : slot.kind === "item" ? setSelectedItem(slot.item.id) : setSelected(slot.owned.template.id));
  const selectedOwned = owned.find((o) => o.template.id === selected);
  const pickedItem = items.find((i) => i.id === selectedItem);
  const pickedVault = model.myVault.find((c) => c.id === selectedVault);
  // 篩選結果和在售中：同一本書，卡套連續排；在售中的卡套上掛售價
  const shownSlots = filtered.shown.map((slot) =>
    query.listed ? (
      <span key={slotKey(slot)} className="relative block h-full w-full">
        <SlotView slot={slot} onSelect={() => openSlot(slot)} />
        <span className="pointer-events-none absolute right-1 bottom-1 rounded-md bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
          {formatPrice(slot.kind === "vault" ? slot.card.priceUsdt : slot.kind === "item" ? (slot.item.priceUsdt ?? 0) : 0)}
        </span>
      </span>
    ) : (
      <SlotView key={slotKey(slot)} slot={slot} onSelect={() => openSlot(slot)} />
    ),
  );

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap justify-end gap-3">
        {/* 公開收藏冊只列圖鑑裡標記的「有」和「想要」 */}
        <ShareBinderButton userId={user.id} keys={inBinder.map(slotKey)} want={wants.length} />
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
          {TABS.map((id) => (
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
          {/* 錢包裡的金庫卡（買來的、卡包抽到的）跟著鏈上持有放進卡冊；沒綁錢包時提醒一句 */}
          {!wallet && <p className="mb-4 text-xs text-ink-3">{t("vaultCardsNeedWallet")}</p>}
          <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
            {!arrangingNow && (
              <>
                {/* 搜尋和團體 → 成員篩選跟市場同一套元件和比對規則（CardFilters.tsx、facets.ts） */}
                <SearchField value={query.q} onSearch={(q) => setQuery({ q })} placeholder={t("searchPlaceholder")} />
                <FiltersButton always active={activeFilters} open={showFilters} onClick={() => setShowFilters((v) => !v)} />
                {/* 面板收起時也看得到、清得掉生效中的篩選 */}
                {!showFilters && activeFilters > 0 && <ClearFilters onClick={() => setQuery({ cat: null, group: null, member: null })} />}
                <div role="radiogroup" aria-label={t("filterLabel")} className="flex rounded-full bg-surface-2 p-1 text-xs font-semibold">
                  {([false, true] as const).map((only) => (
                    <button
                      key={String(only)}
                      role="radio"
                      aria-checked={query.listed === only}
                      onClick={() => setQuery({ listed: only })}
                      className={`rounded-full px-3 py-1 transition ${query.listed === only ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
                    >
                      {only ? t("filterListed", { count: listedSlots.length }) : t("filterAll")}
                    </button>
                  ))}
                </div>
              </>
            )}
            {arrangingNow && (
              <button onClick={() => window.confirm(t("resetLayoutConfirm")) && binderActions.setLayout(EMPTY_LAYOUT)} className="mr-auto text-xs text-ink-3 hover:text-ink">
                {t("resetLayout")}
              </button>
            )}
            {canArrange && (
              <button
                onClick={() => setArranging(!arrangingNow)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${arrangingNow ? "btn-primary" : "border border-line hover:bg-surface-2"}`}
              >
                {t(arrangingNow ? "arrangeDone" : "arrange")}
              </button>
            )}
          </div>
          {arrangingNow ? (
            <BinderArranger
              layout={layout}
              pockets={pockets}
              boxed={hiddenCards}
              present={present}
              version={byKey}
              render={(key) => <SlotView slot={byKey.get(key)!} />}
              onChange={binderActions.setLayout}
              onTakeOut={takeOutCard}
            />
          ) : (
            <>
              {/* 篩選面板放在卡冊上方、預設收起，卡冊保持整個寬度 */}
              <FilterBar open={showFilters}>
                <GroupMemberFilter
                  layout="chips"
                  tree={groupTree(filtered.facets.groups, false)}
                  total={filtered.facets.total}
                  members={filtered.facets.members}
                  category={query.cat}
                  group={query.group}
                  member={query.member}
                  onCategory={(cat) => setQuery({ cat, group: null, member: null })}
                  onGroup={(group) => setQuery({ cat: null, group, member: null })}
                  onMember={(member) => setQuery({ member })}
                />
                {activeFilters > 0 && <ClearFilters onClick={() => setQuery({ cat: null, group: null, member: null })} />}
              </FilterBar>

              {/* min-w-0：卡冊不被裡面的內容撐寬，窄螢幕上不出現橫向捲動 */}
              <div className="min-w-0">
                {/* 面板收起時也看得出篩的是哪個團體、成員 */}
                {narrowed && (
                  <p className="mb-3 text-sm text-ink-2">
                    {query.group && <span className="font-semibold text-ink">{[query.group, query.member].filter(Boolean).join(" › ")} · </span>}
                    {tMarket("results", { count: filtered.shown.length })}
                  </p>
                )}
                {!narrowed && !query.listed && hiddenCards.length > 0 && <p className="mb-3 text-xs text-ink-3">{t("hiddenCount", { count: hiddenCards.length })}</p>}
                {narrowed || query.listed ? (
                  shownSlots.length ? (
                    // 換了篩選條件就回到第一頁
                    <BinderBook key={binderSearch(query).toString()} slots={shownSlots} />
                  ) : (
                    <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-3">{narrowed ? tMarket("noResults") : t("listedEmpty")}</p>
                  )
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
            </>
          )}
        </div>
      )}

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

// 卡冊裡有哪些卡：只依賴卡的資料，資料沒變時由 useMemo 沿用
function binderContent(vault: Card[] | null, wallet: string | undefined, items: CollectorItem[], have: Binder["have"]) {
  // 錢包裡的金庫卡（買來的、開卡包抽到的、寄存的）
  const myVault = wallet && vault ? vault.filter((c) => c.owner === wallet) : [];
  // 按圖鑑順序排列，和實體卡冊一樣同一團體、同一成員的卡放在一起
  const owned: Owned[] = TEMPLATES.filter((x) => have[x.id]).map((template) => ({ template, entry: have[template.id] }));
  const tracked = owned.map((o) => ({ kind: "card" as const, owned: o, card: ownedCard(o, vault) }));
  // 真實的卡排前面：錢包裡的金庫卡、開卡包抽到的卡、自己上鏈的卡；圖鑑標記的卡款裡，有照片的排在沒照片的前面
  const slots: Slot[] = [
    ...myVault.map((card) => ({ kind: "vault" as const, card })),
    ...items.map((item) => ({ kind: "item" as const, item })),
    ...tracked.filter((s) => s.card.image),
    ...tracked.filter((s) => !s.card.image),
  ];
  const byKey = new Map(slots.map((slot) => [slotKey(slot), slot]));
  return {
    myVault,
    owned,
    slots,
    byKey,
    present: new Set(byKey.keys()),
    // 在售中：一口價刊登或拍賣中的收藏卡，和在託管程序裡掛單或拍賣的金庫卡（拿出冊子的也算）
    listedSlots: slots.filter(
      (slot) =>
        (slot.kind === "vault" && (slot.card.status === "listed" || slot.card.status === "auction")) ||
        (slot.kind === "item" && (slot.item.priceUsdt !== null || Boolean(slot.item.auction))),
    ),
  };
}

// 照擺法把卡放進卡套
function arrangeBinder(content: ReturnType<typeof binderContent>, saved: Binder["layout"]) {
  const { slots, byKey } = content;
  // 只是記錄的卡不進卡盒；以前被拿出冊子的放回冊子
  const arranged = arrange([...byKey.keys()], { ...saved, hidden: saved.hidden.filter((k) => !isTrackedOnly(k)) });
  const hidden = new Set(arranged.hiddenCards);
  return {
    ...content,
    ...arranged,
    inBinder: slots.filter((slot) => !hidden.has(slotKey(slot))),
    // 冊子裡的卡照擺放順序排好，篩選結果用這個順序
    ordered: arranged.pockets.flatMap((key) => (key ? [byKey.get(key)!] : [])),
  };
}

// 篩選比對的欄位：和市場的搜尋範圍一致，金庫卡多比對編號，收藏卡多比對標題
function slotFields(slot: Slot): FilterFields {
  if (slot.kind === "vault") {
    const c = slot.card;
    return { group: c.group, member: c.member, text: `${c.group} ${c.member} ${c.album} ${c.version} ${c.serial}` };
  }
  if (slot.kind === "item") {
    const i = slot.item;
    return { group: i.group, member: i.member, text: `${itemTitle(i)} ${i.group} ${i.member} ${i.album ?? ""} ${i.version ?? ""}` };
  }
  const x = slot.owned.template;
  return { group: x.group, member: x.member, text: `${x.group} ${x.member} ${x.album} ${x.version}` };
}

// 卡在擺法裡的鍵（見 binder-layout.ts）
const slotKey = (slot: Slot) => (slot.kind === "vault" ? `vault:${slot.card.id}` : slot.kind === "item" ? `item:${slot.item.id}` : `card:${slot.owned.template.id}`);

function SlotView({ slot, onSelect }: { slot: Slot; onSelect?: () => void }) {
  if (slot.kind === "vault") return <VaultSlot card={slot.card} onSelect={onSelect} />;
  if (slot.kind === "item") return <ItemPocket item={slot.item} onSelect={onSelect} />;
  return <Pocket owned={slot.owned} card={slot.card} onSelect={onSelect} />;
}

function ownedCard({ template, entry }: Owned, vault: Card[] | null) {
  const base = templateCard(template, vault);
  return entry.photo ? { ...base, image: { front: entry.photo } } : base;
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
            <PublicSlotToggle slotKey={`card:${template.id}`} />
          </div>
        </div>
      </div>
    </Dialog>
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
            {item.openOrder && (
              <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <p className="font-semibold">{t("itemSold", { status: t(`orderStatus_${item.openOrder}`) })}</p>
                <Link href="/binder?tab=orders" className="mt-1 inline-block text-xs font-semibold text-accent-ink hover:underline">
                  {t("goToOrders")}
                </Link>
              </div>
            )}
            {!fake && !item.vaultRequestedAt && !item.openOrder && (
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
            {!fake && !item.auction && !item.openOrder && <VaultRequest item={item} />}
            <TakeOutButton onTakeOut={onTakeOut} />
            <PublicSlotToggle slotKey={`item:${item.id}`} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// 寄進金庫：先選寄到哪個金庫（兩個地址都列出，按我上次的收件國家建議較近的），申請後下架，照提示把實物寄到那個金庫；
// 鑑定為真後轉成金庫卡（金庫 NFT 鑄到綁定的錢包），之後提貨也從那個金庫寄出
function VaultRequest({ item }: { item: CollectorItem }) {
  const t = useTranslations("Binder");
  const tVault = useTranslations("Vaults");
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [vault, setVault] = useState<VaultId>();
  const [suggested, setSuggested] = useState<VaultId>();
  useEffect(() => {
    if (!picking) return;
    let live = true;
    (async () => {
      // 上次填的收件國家；沒有就看瀏覽器語言帶的地區
      let country: string | null = null;
      try {
        const res = await fetch("/api/account/address");
        if (res.ok) country = ((await res.json()) as { address: ShippingAddress | null }).address?.country ?? null;
      } catch {}
      if (!country) {
        try {
          country = new Intl.Locale(navigator.language).maximize().region ?? null;
        } catch {}
      }
      if (!live) return;
      const s = suggestVault(country);
      setSuggested(s);
      setVault((v) => v ?? s);
    })();
    return () => {
      live = false;
    };
  }, [picking]);
  const run = async (target: VaultId | null) => {
    setBusy(true);
    setError(undefined);
    try {
      await requestVault(item.id, target);
      setPicking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  };
  const addressOf = (v: Vault) => (v.address ? <p className="mt-1 whitespace-pre-line text-ink">{v.address}</p> : <p className="mt-1 text-ink-3">{t("vaultAddressPending")}</p>);
  if (item.vaultRequestedAt) {
    const v = vaultOf(item.vaultTarget);
    return (
      <div className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
        <p className="font-semibold text-ink">{t("vaultRequested")}</p>
        <p className="mt-1">
          {t("vaultShipInstructions", {
            ref: `IDOLCA-${item.id.slice(0, 8).toUpperCase()}`,
            vault: tVault(v.id),
          })}
        </p>
        <div className="mt-2">{addressOf(v)}</div>
        <button disabled={busy} onClick={() => run(null)} className="btn-secondary mt-2 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50">
          {t("vaultCancel")}
        </button>
        {error && <p className="mt-1 text-[11px] text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : t("orderError")}</p>}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          disabled={busy || !user?.walletAddress}
          onClick={() => setPicking((p) => !p)}
          aria-expanded={picking}
          className="btn-secondary flex-1 rounded-full py-2.5 text-center text-sm font-semibold disabled:opacity-50"
        >
          {t("sendToVault")}
        </button>
        <InfoTip text={t("vaultHint")} label={t("sendToVault")} align="end" />
      </div>
      {!user?.walletAddress && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{t("vaultNeedsWallet")}</p>}
      {picking && (
        <div className="mt-2 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
          <p>{t("vaultPick")}</p>
          <div role="radiogroup" aria-label={t("vaultPickLabel")} className="mt-2 grid gap-2 sm:grid-cols-2">
            {VAULT_LIST.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={vault === v.id}
                onClick={() => setVault(v.id)}
                className={`rounded-xl border bg-surface p-3 text-left transition ${vault === v.id ? "border-ink" : "border-line hover:border-line-strong"}`}
              >
                <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                  {tVault(v.id)}
                  {suggested === v.id && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink">{t("vaultSuggested")}</span>}
                </span>
                {addressOf(v)}
              </button>
            ))}
          </div>
          <button disabled={busy || !vault} onClick={() => vault && run(vault)} className="btn-primary mt-3 w-full rounded-full py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? "…" : vault ? t("vaultConfirm", { vault: tVault(vault) }) : t("sendToVault")}
          </button>
        </div>
      )}
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
  const [error, setError] = useState<string>();
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
            setError(undefined);
            try {
              await setDescription(item.id, text);
              setEditing(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "network");
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
      {error && <p className="mt-2 text-xs text-down">{t(error === "impersonation" ? "errorImpersonation" : "descriptionError")}</p>}
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
            <PublicSlotToggle slotKey={`vault:${card.id}`} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// 拿出收藏冊：鏈上的卡還是你的，只是不放在冊子裡顯示，整理收藏冊時可以放回；只是記錄的卡則是移除標記
// 卡的詳情裡：這張卡在不在公開收藏冊上顯示
function PublicSlotToggle({ slotKey }: { slotKey: string }) {
  const userId = useAuth().user?.id;
  return userId ? <PublicToggle userId={userId} slotKey={slotKey} /> : null;
}

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
  const mint = useFees().mint;
  const promoNote = usePromoNote();
  const fee = showFee("mint", mint.value);
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
        <InfoTip text={[t("mintWhat"), t("mintSelfNote", { fee }), promoNote(mint)].filter(Boolean).join(" ")} label={t("mintWhatLabel")} />
      </div>
      {error && <p className="mt-1 text-[11px] text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : t("mintSelfError", { fee })}</p>}
      <WalletNotFoundHint error={error} />
    </div>
  );
}
