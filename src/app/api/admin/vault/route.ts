import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { users, vaultCards } from "@/lib/server/schema";
import { saveUploads } from "@/lib/server/media";
import { mintVaultNft } from "@/lib/server/chain";
import { invalidateVaultCards, newVaultCardId, nextSerial, toCard } from "@/lib/server/vault-cards";
import { RARITY_LIST, type Rarity } from "@/lib/cards";
import { parseGrade } from "@/lib/grading";
import { matchTemplate } from "@/lib/server/items";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 入庫：實物鑑定通過後建立金庫卡並鑄造 NFT。寄存人填郵箱或錢包地址，NFT 鑄到他綁定的錢包；
// 不填就是平台自有庫存（例如卡包卡池），NFT 鑄給平台錢包
export async function POST(request: Request) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const group = text(body.group, 60);
  const member = text(body.member, 60);
  const album = text(body.album, 80);
  const version = text(body.version, 80);
  const location = text(body.location, 40);
  const condition = text(body.condition, 300) || null;
  const rarity = body.rarity as Rarity;
  // 自家評級的鑑定編號就是這張卡的金庫編號，所以先取編號
  const serial = await nextSerial(a.db);
  const parsed = parseGrade(body, serial);
  if (!group || !member || !album || !version || !location) return fail("missing_fields");
  if (!RARITY_LIST.includes(rarity)) return fail("invalid_rarity");
  if ("error" in parsed) return fail(parsed.error);
  const { grade } = parsed;

  let depositor: { id: string; wallet: string } | null = null;
  const who = text(body.depositor, 100);
  if (who) {
    const [u] = await a.db
      .select({ id: users.id, wallet: users.walletAddress })
      .from(users)
      .where(who.includes("@") ? eq(users.email, who.toLowerCase()) : eq(users.walletAddress, who));
    if (!u) return fail("depositor_not_found", 404);
    if (!u.wallet) return fail("depositor_no_wallet", 409);
    depositor = { id: u.id, wallet: u.wallet };
  }

  // 正反面都要，存成未加浮水印的原圖加展示圖兩份
  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (photos.length !== 2) return fail("invalid_photo");
  const urls = await saveUploads(a.db, a.user.id, photos);
  if (!urls) return fail("invalid_photo");

  const id = newVaultCardId();
  const intakeDate = new Date().toISOString().slice(0, 10);
  let minted: { asset: string; tx: string };
  try {
    minted = await mintVaultNft(id, { serial, group, member, album, version, rarity, grade, location, intakeDate }, depositor?.wallet ?? null);
  } catch (err) {
    console.error("vault mint failed", err);
    return fail("mint_failed", 502);
  }
  const [row] = await a.db
    .insert(vaultCards)
    .values({
      id,
      serial,
      groupName: group,
      member,
      album,
      version,
      rarity,
      grader: grade?.grader ?? null,
      grade: grade?.score ?? null,
      gradeCert: grade?.cert ?? null,
      condition,
      imageFront: urls[0],
      imageBack: urls[1],
      location,
      intakeDate,
      asset: minted.asset,
      mintTx: minted.tx,
      depositorId: depositor?.id ?? null,
    })
    .returning();
  invalidateVaultCards();
  return Response.json({ card: toCard(row), mintTx: minted.tx, templateId: matchTemplate(group, member, album, version) });
}
