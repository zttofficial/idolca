import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { currentUser } from "@/lib/server/auth";
import { collectorItems } from "@/lib/server/schema";
import { demoAssetId, isPhoto, matchTemplate, newItemId, publicItem } from "@/lib/server/items";
import { isCardSource } from "@/lib/sources";

async function authed() {
  const db = await getDb();
  if (!db) return { error: Response.json({ error: "not_configured" }, { status: 503 }) };
  const user = await currentUser(db);
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  return { db, user };
}

export async function GET() {
  const a = await authed();
  if ("error" in a) return a.error;
  const rows = await a.db.select().from(collectorItems).where(eq(collectorItems.userId, a.user.id)).orderBy(desc(collectorItems.createdAt));
  return Response.json({ items: rows.map(publicItem) });
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 自由上鏈：不要求卡款在圖鑑裡，也不檢查真假；新卡一律是 self_reported
export async function POST(request: Request) {
  const a = await authed();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const group = text(body.group, 60);
  const member = text(body.member, 60);
  const album = text(body.album, 80) || null;
  const version = text(body.version, 80) || null;
  if (!isPhoto(body.photo) || !isPhoto(body.photoBack)) return Response.json({ error: "invalid_photo" }, { status: 400 });
  const source = isCardSource(body.source) ? body.source : "album";
  if (!group || !member) return Response.json({ error: "missing_name" }, { status: 400 });

  const [row] = await a.db
    .insert(collectorItems)
    .values({
      id: newItemId(),
      userId: a.user.id,
      photo: body.photo,
      photoBack: body.photoBack,
      source,
      groupName: group,
      member,
      album,
      version,
      templateId: matchTemplate(group, member, album, version),
      asset: demoAssetId(),
    })
    .returning();
  return Response.json({ item: publicItem(row) });
}
