import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/server/require-user";
import { binderEntries, binderLayouts, binderWants } from "@/lib/server/schema";
import { findTemplate } from "@/lib/catalog";
import { isLayoutKey, MAX_LAYOUT_KEYS } from "@/lib/binder-layout";

type Entry = { count: number; photo?: string; mint?: string };
type BinderBody = { have?: Record<string, Entry>; want?: Record<string, true>; layout?: { order?: unknown; hidden?: unknown } };

const keyList = (v: unknown, allowEmpty: boolean) =>
  Array.isArray(v) ? v.slice(0, MAX_LAYOUT_KEYS).map((k) => (isLayoutKey(k) ? k : allowEmpty ? "" : null)).filter((k): k is string => k !== null) : [];

// 自己拍的照片是壓縮過的 JPEG data URL，限制大小避免把資料庫塞爆
const MAX_PHOTO = 200_000;

export async function GET() {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const [entries, wants, [layout]] = await Promise.all([
    a.db.select().from(binderEntries).where(eq(binderEntries.userId, a.user.id)),
    a.db.select().from(binderWants).where(eq(binderWants.userId, a.user.id)),
    a.db.select().from(binderLayouts).where(eq(binderLayouts.userId, a.user.id)),
  ]);
  return Response.json({
    have: Object.fromEntries(entries.map((e) => [e.templateId, { count: e.count, photo: e.photo ?? undefined, mint: e.mint ?? undefined }])),
    want: Object.fromEntries(wants.map((w) => [w.templateId, true])),
    layout: { order: layout ? (JSON.parse(layout.orderKeys) as string[]) : [], hidden: layout ? (JSON.parse(layout.hiddenKeys) as string[]) : [] },
  });
}

// 整本收藏冊覆蓋寫入：收藏冊不大，比逐條同步簡單可靠
export async function PUT(request: Request) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as BinderBody;
  const have = Object.entries(body.have ?? {}).filter(([id, e]) => findTemplate(id) && Number.isInteger(e.count) && e.count > 0 && e.count < 1000);
  const want = Object.keys(body.want ?? {}).filter((id) => findTemplate(id));

  await a.db.delete(binderEntries).where(eq(binderEntries.userId, a.user.id));
  await a.db.delete(binderWants).where(eq(binderWants.userId, a.user.id));
  if (have.length) {
    await a.db.insert(binderEntries).values(
      have.map(([templateId, e]) => ({
        userId: a.user.id,
        templateId,
        count: e.count,
        photo: e.photo && e.photo.length <= MAX_PHOTO && e.photo.startsWith("data:image/") ? e.photo : null,
        mint: e.mint ?? null,
      })),
    );
  }
  if (want.length) await a.db.insert(binderWants).values(want.map((templateId) => ({ userId: a.user.id, templateId })));
  const orderKeys = JSON.stringify(keyList(body.layout?.order, true));
  const hiddenKeys = JSON.stringify(keyList(body.layout?.hidden, false));
  await a.db
    .insert(binderLayouts)
    .values({ userId: a.user.id, orderKeys, hiddenKeys })
    .onConflictDoUpdate({ target: binderLayouts.userId, set: { orderKeys, hiddenKeys } });
  return Response.json({ ok: true });
}
