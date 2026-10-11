import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/server/require-user";
import { users } from "@/lib/server/schema";
import { publicUser } from "@/lib/server/auth";

// 用戶確認已滿 18 歲（開卡包前要確認一次），記下時間
export async function POST() {
  const a = await requireUser();
  if (a.error) return a.error;
  const [row] = await a.db.update(users).set({ ageConfirmedAt: new Date() }).where(eq(users.id, a.user.id)).returning();
  return Response.json({ user: publicUser(row) });
}
