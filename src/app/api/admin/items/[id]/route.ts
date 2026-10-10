import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { VERIFICATION, collectorItems, type Verification } from "@/lib/server/schema";
import { publicItem } from "@/lib/server/items";

// 金庫鑑定後寫入結果。用 ADMIN_TOKEN 保護；正式版換成後台帳號權限，並同步更新鏈上元數據
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/items/[id]">) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || request.headers.get("x-admin-token") !== token) return Response.json({ error: "forbidden" }, { status: 403 });
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { verification?: string; note?: string };
  if (!VERIFICATION.includes(body.verification as Verification)) return Response.json({ error: "invalid_verification" }, { status: 400 });

  const [row] = await db
    .update(collectorItems)
    .set({
      verification: body.verification as Verification,
      verificationNote: body.note?.slice(0, 200) ?? null,
      verifiedAt: body.verification === "self_reported" ? null : new Date(),
    })
    .where(eq(collectorItems.id, id))
    .returning();
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ item: publicItem(row) });
}
