import { requireUser } from "@/lib/server/require-user";
import { setBinderPublic, setSlotHidden, shareState } from "@/lib/server/public-binder";
import { isLayoutKey } from "@/lib/binder-layout";

// 自己的收藏冊有沒有公開、公開網址的代號、哪些卡不在公開頁顯示
export async function GET() {
  const a = await requireUser();
  if ("error" in a) return a.error;
  return Response.json(await shareState(a.db, a.user.id));
}

// 打開或關掉公開（{ public }），或設定一張卡在不在公開頁顯示（{ key, hidden }）
export async function PUT(request: Request) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as { public?: unknown; key?: unknown; hidden?: unknown };
  if (typeof body.public === "boolean") return Response.json(await setBinderPublic(a.db, a.user.id, body.public));
  if (isLayoutKey(body.key) && typeof body.hidden === "boolean") return Response.json(await setSlotHidden(a.db, a.user.id, body.key, body.hidden));
  return Response.json({ error: "bad_request" }, { status: 400 });
}
