import { requireUser } from "@/lib/server/require-user";
import { markAllRead } from "@/lib/server/notifications";

// 打開通知列表時全部標成已讀
export async function POST() {
  const a = await requireUser();
  if (a.error) return a.error;
  await markAllRead(a.db, a.user.id);
  return Response.json({ ok: true });
}
