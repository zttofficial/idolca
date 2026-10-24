import { requireUser } from "@/lib/server/require-user";
import { setBinderPublic, shareState } from "@/lib/server/public-binder";

// 自己的收藏冊有沒有公開、公開網址的代號
export async function GET() {
  const a = await requireUser();
  if ("error" in a) return a.error;
  return Response.json(await shareState(a.db, a.user.id));
}

// 打開或關掉公開收藏冊
export async function PUT(request: Request) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as { public?: unknown };
  if (typeof body.public !== "boolean") return Response.json({ error: "bad_request" }, { status: 400 });
  return Response.json(await setBinderPublic(a.db, a.user.id, body.public));
}
