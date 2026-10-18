import { and, eq, isNull, lt, or } from "drizzle-orm";
import { fail, requireUser } from "@/lib/server/require-user";
import { users } from "@/lib/server/schema";
import { publicUser } from "@/lib/server/auth";
import { NAME_COOLDOWN_DAYS, cleanName, isReservedName } from "@/lib/server/names";

// 改暱稱：賣家頁和刊登頁顯示的名字。錢包帳號預設是縮寫的地址，設了暱稱買家才認得是誰。
// 規則見 names.ts：長度、保留名稱（管理員除外）、每 3 天一次
export async function PATCH(request: Request) {
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { displayName?: unknown };
  const name = cleanName(body.displayName);
  if (!name) return fail("invalid_name");
  if (name === a.user.displayName) return Response.json({ user: a.user });
  if (!a.user.isAdmin && isReservedName(name)) return fail("reserved_name");
  if (a.user.renameAt) return fail("rename_cooldown", 429);
  // 冷卻條件也寫進 UPDATE：兩個請求同時進來只有一個生效
  const cutoff = new Date(Date.now() - NAME_COOLDOWN_DAYS * 86400_000);
  const [row] = await a.db
    .update(users)
    .set({ displayName: name, nameChangedAt: new Date() })
    .where(and(eq(users.id, a.user.id), or(isNull(users.nameChangedAt), lt(users.nameChangedAt, cutoff))))
    .returning();
  if (!row) return fail("rename_cooldown", 429);
  return Response.json({ user: publicUser(row) });
}
