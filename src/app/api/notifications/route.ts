import { connection } from "next/server";
import { requireUser } from "@/lib/server/require-user";
import { listNotifications } from "@/lib/server/notifications";

// 自己最近的站內通知和未讀數，頁首的通知鈴定時讀
export async function GET() {
  await connection();
  const a = await requireUser();
  if (a.error) return a.error;
  return Response.json(await listNotifications(a.db, a.user.id));
}
