import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { collectorItems, users, vaultCards } from "@/lib/server/schema";
import { refreshCardStates } from "@/lib/server/vault-chain";
import { burnCollectorNft, mintVaultNft } from "@/lib/server/chain";
import { invalidateVaultCards, newVaultCardId, nextSerial, toCard } from "@/lib/server/vault-cards";
import { RARITY_LIST, type Rarity } from "@/lib/cards";
import { parseGrade } from "@/lib/grading";
import { isVaultId } from "@/lib/vaults";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 寄進金庫的收藏卡鑑定為真：照片和資料帶過來建立金庫卡（記下收到它的金庫，沒指定就用持有人申請時選的），金庫 NFT 鑄到持有人綁定的錢包，再銷毀原本的收藏 NFT。
// 先鑄後銷：銷毀失敗時金庫卡已經建好，重送這個請求只會補做銷毀
export async function POST(request: Request, ctx: RouteContext<"/api/admin/items/[id]/vault">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const { id } = await ctx.params;
  const [item] = await a.db.select().from(collectorItems).where(eq(collectorItems.id, id));
  if (!item || !item.vaultRequestedAt) return fail("not_requested", 409);

  let cardId = item.vaultCardId;
  if (!cardId) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const rarity = body.rarity as Rarity;
    // 自家評級的鑑定編號就是這張卡的金庫編號，所以先取編號
    const serial = await nextSerial(a.db);
    const parsed = parseGrade(body, serial);
    const location = text(body.location, 40);
    const album = text(body.album, 80) || item.album || "";
    const version = text(body.version, 80) || item.version || "";
    const vault = body.vault || item.vaultTarget;
    if (!RARITY_LIST.includes(rarity)) return fail("invalid_rarity");
    if (!isVaultId(vault)) return fail("invalid_vault");
    if ("error" in parsed) return fail(parsed.error);
    const { grade } = parsed;
    if (!location || !album || !version) return fail("missing_fields");
    const [owner] = await a.db.select({ wallet: users.walletAddress }).from(users).where(eq(users.id, item.userId));
    if (!owner?.wallet) return fail("depositor_no_wallet", 409);

    cardId = newVaultCardId();
    const intakeDate = new Date().toISOString().slice(0, 10);
    let minted: { asset: string; tx: string };
    try {
      minted = await mintVaultNft(cardId, { serial, group: item.groupName, member: item.member, album, version, rarity, grade, vault, location, intakeDate }, owner.wallet);
    } catch (err) {
      console.error("vault mint failed", err);
      return fail("mint_failed", 502);
    }
    await a.db.insert(vaultCards).values({
      id: cardId,
      serial,
      groupName: item.groupName,
      member: item.member,
      album,
      version,
      rarity,
      grader: grade?.grader ?? null,
      grade: grade?.score ?? null,
      gradeCert: grade?.cert ?? null,
      condition: text(body.condition, 300) || null,
      imageFront: item.photo,
      imageBack: item.photoBack,
      vault,
      location,
      intakeDate,
      asset: minted.asset,
      mintTx: minted.tx,
      depositorId: item.userId,
    });
    await a.db.update(collectorItems).set({ vaultCardId: cardId, priceCents: null, listedAt: null }).where(eq(collectorItems.id, id));
    invalidateVaultCards();
    // 新鑄的卡馬上寫進鏈上狀態索引（例如放進卡包後立刻能抽）
    await refreshCardStates([cardId]);
  }

  let burnTx = item.vaultBurnTx;
  if (!burnTx && item.mintTx && item.asset) {
    try {
      burnTx = await burnCollectorNft(item.asset);
      await a.db.update(collectorItems).set({ vaultBurnTx: burnTx }).where(eq(collectorItems.id, id));
    } catch (err) {
      console.error("collector burn failed", err);
      return fail("burn_failed", 502);
    }
  }
  const [card] = await a.db.select().from(vaultCards).where(eq(vaultCards.id, cardId));
  return Response.json({ card: toCard(card), burnTx });
}

// 鑑定沒通過但不是假卡（例如品相不符、寄錯卡）：退回實物，清掉申請，收藏卡回到持有人手上
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/items/[id]/vault">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const [item] = await a.db.select().from(collectorItems).where(eq(collectorItems.id, (await ctx.params).id));
  if (!item || !item.vaultRequestedAt || item.vaultCardId) return fail("not_requested", 409);
  await a.db.update(collectorItems).set({ vaultRequestedAt: null, vaultTarget: null }).where(eq(collectorItems.id, item.id));
  return Response.json({ ok: true });
}
