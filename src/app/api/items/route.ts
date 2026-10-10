import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/server/require-user";
import { collectorItems } from "@/lib/server/schema";
import { MAX_PHOTOS, demoAssetId, matchTemplate, newItemId, priceToCents, publicItem } from "@/lib/server/items";
import { saveUploads } from "@/lib/server/media";
import { isCardSource } from "@/lib/sources";

export async function GET() {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const rows = await a.db.select().from(collectorItems).where(eq(collectorItems.userId, a.user.id)).orderBy(desc(collectorItems.createdAt));
  return Response.json({ items: rows.map(publicItem) });
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 自由上鏈：不要求卡款在圖鑑裡，也不檢查真假；新卡一律是待驗證。帶價格時同時刊登出售
export async function POST(request: Request) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const group = text(body.group, 60);
  const member = text(body.member, 60);
  const album = text(body.album, 80) || null;
  const version = text(body.version, 80) || null;
  const title = text(body.title, 80) || null;
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

  const [row] = await a.db
    .insert(collectorItems)
    .values({
      id: newItemId(),
      userId: a.user.id,
      photo,
      photoBack,
      extraPhotos: extra.length ? JSON.stringify(extra) : null,
      title,
      quantity,
      source,
      groupName: group,
      member,
      album,
      version,
      templateId: quantity === 1 ? matchTemplate(group, member, album, version) : null,
      asset: demoAssetId(),
      priceCents: price,
      listedAt: price === null ? null : new Date(),
    })
    .returning();
  return Response.json({ item: publicItem(row) });
}
