import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Card } from "@/lib/cards";
import { templateCard, TEMPLATES } from "@/lib/catalog";
import { arrange, isLayoutKey, isTrackedOnly } from "@/lib/binder-layout";
import { applyChainStates } from "@/lib/vault-state";
import type { Db } from "./db";
import { binderEntries, binderLayouts, binderPrivate, binderWants, collectorItems, users } from "./schema";
import { listVaultCards } from "./vault-cards";
import { vaultState } from "./vault-chain";

// 公開收藏冊：用戶打開分享後，任何人從 /collector/{slug} 看得到暱稱、冊子裡的卡和想要的卡款。
// 冊子裡的卡和 /binder 一樣有三種：錢包裡的金庫卡、自己上鏈的收藏卡、圖鑑標記的卡款，照用戶的擺法排；
// 拿出冊子的卡和用戶關掉公開的卡不顯示。不公開張數、圖鑑卡款上自己拍的照片、錢包地址和其他帳號資料

// 去掉容易看錯的 l、o、0、1，口頭轉述也不會抄錯
const SLUG_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const SLUG_LEN = 8;
const newSlug = () => Array.from(randomBytes(SLUG_LEN), (b) => SLUG_CHARS[b % SLUG_CHARS.length]).join("");
export const isSlug = (s: string) => s.length === SLUG_LEN && [...s].every((c) => SLUG_CHARS.includes(c));

// hidden 是不在公開頁顯示的卡鍵
export type ShareState = { public: boolean; slug: string | null; hidden: string[] };

export async function shareState(db: Db, userId: string): Promise<ShareState> {
  const [[row], hidden] = await Promise.all([
    db.select({ public: users.binderPublic, slug: users.binderSlug }).from(users).where(eq(users.id, userId)),
    db.select({ key: binderPrivate.slotKey }).from(binderPrivate).where(eq(binderPrivate.userId, userId)),
  ]);
  return { public: row?.public ?? false, slug: row?.slug ?? null, hidden: hidden.map((h) => h.key) };
}

// 打開或關掉公開。第一次打開時產生 slug，撞號就換一個重試
export async function setBinderPublic(db: Db, userId: string, isPublic: boolean): Promise<ShareState> {
  const current = await shareState(db, userId);
  if (!isPublic || current.slug) {
    await db.update(users).set({ binderPublic: isPublic }).where(eq(users.id, userId));
    return { ...current, public: isPublic };
  }
  for (let i = 0; ; i++) {
    const slug = newSlug();
    try {
      await db.update(users).set({ binderPublic: true, binderSlug: slug }).where(eq(users.id, userId));
      return { ...current, public: true, slug };
    } catch (err) {
      if (i === 4) throw err;
    }
  }
}

// 一張卡在不在公開頁上顯示
export async function setSlotHidden(db: Db, userId: string, key: string, hidden: boolean): Promise<ShareState> {
  if (!isLayoutKey(key)) throw new Error("bad key");
  if (hidden) await db.insert(binderPrivate).values({ userId, slotKey: key }).onConflictDoNothing();
  else await db.delete(binderPrivate).where(and(eq(binderPrivate.userId, userId), eq(binderPrivate.slotKey, key)));
  return shareState(db, userId);
}

// 公開頁上一個卡套的內容：金庫卡帶卡片資料（連到卡片頁），收藏卡只帶顯示要用的欄位，圖鑑卡款只帶 id
export type PublicItem = { id: string; photo: string; title: string | null; group: string; member: string; version: string | null; verification: "unverified" | "fake" };
export type PublicSlot = { kind: "vault"; card: Card } | { kind: "item"; item: PublicItem } | { kind: "card"; templateId: string };

export type PublicBinder = {
  slug: string;
  name: string;
  joinedAt: string;
  // 冊子裡每個卡套的內容，null 是用戶留的空卡套
  slots: (PublicSlot | null)[];
  count: number;
  want: string[];
};

export async function getPublicBinder(db: Db, slug: string): Promise<PublicBinder | null> {
  if (!isSlug(slug)) return null;
  const [user] = await db
    .select({ id: users.id, name: users.displayName, joinedAt: users.createdAt, wallet: users.walletAddress })
    .from(users)
    .where(and(eq(users.binderSlug, slug), eq(users.binderPublic, true)));
  if (!user) return null;
  const [entries, wants, [layout], hidden, items, vault, states] = await Promise.all([
    db.select({ id: binderEntries.templateId }).from(binderEntries).where(eq(binderEntries.userId, user.id)),
    db.select({ id: binderWants.templateId }).from(binderWants).where(eq(binderWants.userId, user.id)),
    db.select().from(binderLayouts).where(eq(binderLayouts.userId, user.id)),
    db.select({ key: binderPrivate.slotKey }).from(binderPrivate).where(eq(binderPrivate.userId, user.id)),
    db
      .select()
      .from(collectorItems)
      .where(and(eq(collectorItems.userId, user.id), isNull(collectorItems.vaultCardId)))
      .orderBy(desc(collectorItems.createdAt)),
    listVaultCards(db),
    // 讀不到鏈上狀態時金庫卡不顯示，其他卡照常
    user.wallet ? vaultState().catch(() => null) : null,
  ]);

  // 錢包裡的金庫卡：持有人以鏈上為準，掛單和拍賣中的卡算賣家的
  const myVault = user.wallet && states ? applyChainStates(vault, states).filter((c) => c.owner === user.wallet && c.status !== "redeemed") : [];
  const marked = new Set(entries.map((e) => e.id));
  const wanted = new Set(wants.map((w) => w.id));
  const tracked = TEMPLATES.filter((x) => marked.has(x.id)).map((template) => ({ template, hasPhoto: Boolean(templateCard(template, vault).image) }));

  // 預設順序和 /binder 相同：金庫卡、收藏卡，再來是圖鑑卡款（有實拍照的在前）
  const byKey = new Map<string, PublicSlot>([
    ...myVault.map((card): [string, PublicSlot] => [`vault:${card.id}`, { kind: "vault", card }]),
    ...items.map((r): [string, PublicSlot] => [
      `item:${r.id}`,
      {
        kind: "item",
        item: { id: r.id, photo: r.photo, title: r.title, group: r.groupName, member: r.member, version: r.version, verification: r.verification === "fake" ? "fake" : "unverified" },
      },
    ]),
    ...[...tracked.filter((x) => x.hasPhoto), ...tracked.filter((x) => !x.hasPhoto)].map(({ template }): [string, PublicSlot] => [
      `card:${template.id}`,
      { kind: "card", templateId: template.id },
    ]),
  ]);
  const saved = { order: layout ? (JSON.parse(layout.orderKeys) as string[]) : [], hidden: layout ? (JSON.parse(layout.hiddenKeys) as string[]) : [] };
  const { pockets } = arrange([...byKey.keys()], { ...saved, hidden: saved.hidden.filter((k) => !isTrackedOnly(k)) });
  const off = new Set(hidden.map((h) => h.key));
  const slots = pockets.filter((k) => !k || !off.has(k)).map((k) => (k ? (byKey.get(k) ?? null) : null));
  while (slots.length && slots[slots.length - 1] === null) slots.pop();

  return {
    slug,
    name: user.name,
    joinedAt: user.joinedAt.toISOString(),
    slots,
    count: slots.filter(Boolean).length,
    want: TEMPLATES.filter((t) => wanted.has(t.id)).map((t) => t.id),
  };
}
