import { eq } from "drizzle-orm";
import { fail, requireUser } from "@/lib/server/require-user";
import { users } from "@/lib/server/schema";
import { publicUser } from "@/lib/server/auth";

// 改暱稱：賣家頁和刊登頁顯示的名字。錢包帳號預設是縮寫的地址，設了暱稱買家才認得是誰。
// 2–24 個字，去掉頭尾空白，不收控制字元
export async function PATCH(request: Request) {
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { displayName?: unknown };
  const name = typeof body.displayName === "string" ? body.displayName.trim().replace(/\s+/g, " ") : "";
  if ([...name].length < 2 || [...name].length > 24 || /[\p{Cc}\p{Cf}]/u.test(name)) return fail("invalid_name");
  const [row] = await a.db.update(users).set({ displayName: name }).where(eq(users.id, a.user.id)).returning();
  return Response.json({ user: publicUser(row) });
}
