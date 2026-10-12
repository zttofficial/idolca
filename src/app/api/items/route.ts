import { and, desc, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/server/require-user";
import { allow, tooMany } from "@/lib/server/rate-limit";
import { collectorItems } from "@/lib/server/schema";
import { MAX_DESCRIPTION, MAX_PHOTOS, matchTemplate, newItemId, priceToCents, publicItem } from "@/lib/server/items";
import { saveUploads } from "@/lib/server/media";
import { isCardSource } from "@/lib/sources";

export async function GET() {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const rows = await a.db
    .select()
    .from(collectorItems)
    .where(and(eq(collectorItems.userId, a.user.id), isNull(collectorItems.vaultCardId)))
    .orderBy(desc(collectorItems.createdAt));
  return Response.json({ items: rows.map(publicItem) });
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 自由上鏈：不要求卡款在圖鑑裡，也不檢查真假；新卡一律是待驗證。帶價格時同時刊登出售。
// 鏈上已配置時在 Solana 上真實鑄造收藏 NFT：錢包登入的用戶鑄到自己的錢包，郵箱帳號鑄到平台代管錢包
export async function POST(request: Request) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  // 每張卡平台都要付鑄造費，限制每個帳號每小時 30 張
  if (!(await allow(a.db, `mint:${a.user.id}`, 30, 3600))) return tooMany();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const group = text(body.group, 60);
  const member = text(body.member, 60);
  const album = text(body.album, 80) || null;
  const version = text(body.version, 80) || null;
  const title = text(body.title, 80) || null;
  const description = text(body.description, MAX_DESCRIPTION) || null;
  const quantity = Number.isInteger(body.quantity) && (body.quantity as number) >= 1 && (body.quantity as number) <= 99 ? (body.quantity as number) : 1;
  const source = isCardSource(body.source) ? body.source : "album";
  if (!group || !member) return Response.json({ error: "missing_name" }, { status: 400 });
  const price = body.priceUsdt === undefined || body.priceUsdt === null ? null : priceToCents(body.priceUsdt);
  if (price === undefined) return Response.json({ error: "invalid_price" }, { status: 400 });

  // 第一張是正面、第二張是背面，都必填；其餘是補充照片
  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (photos.length < 2 || photos.length > MAX_PHOTOS) return Response.json({ error: "invalid_photo" }, { status: 400 });
  const urls = await saveUploads(a.db, a.user.id, photos);
  if (!urls) return Response.json({ error: "invalid_photo" }, { status: 400 });
  const [photo, photoBack, ...extra] = urls;

  const id = newItemId();
  const [row] = await a.db
    .insert(collectorItems)
    .values({
      id,
      userId: a.user.id,
      photo,
      photoBack,
      extraPhotos: extra.length ? JSON.stringify(extra) : null,
      title,
      description,
      quantity,
      source,
      groupName: group,
      member,
      album,
      version,
      templateId: quantity === 1 ? matchTemplate(group, member, album, version) : null,
      priceCents: price,
      listedAt: price === null ? null : new Date(),
    })
    .returning();
  return Response.json({ item: publicItem(row) });
}
