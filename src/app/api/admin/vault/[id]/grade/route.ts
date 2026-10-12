import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/server/admin";
import { fail } from "@/lib/server/require-user";
import { vaultCards } from "@/lib/server/schema";
import { setVaultGradeOnChain } from "@/lib/server/chain";
import { getVaultRow, invalidateVaultCards, toCard } from "@/lib/server/vault-cards";
import { parseGrade } from "@/lib/grading";

// 已入庫的卡評級、改評級或清掉評級：先改鏈上的 NFT 屬性，成功後再寫表。已提貨銷毀的卡不能改
export async function POST(request: Request, ctx: RouteContext<"/api/admin/vault/[id]/grade">) {
  const a = await requireAdmin();
  if (a.error) return a.error;
  const row = await getVaultRow(a.db, (await ctx.params).id);
  if (!row) return fail("not_found", 404);
  if (row.burnedAt) return fail("redeemed", 409);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseGrade(body, row.serial);
  if ("error" in parsed) return fail(parsed.error);
  const { grade } = parsed;
  let tx: string;
  try {
    tx = await setVaultGradeOnChain(row.asset, grade);
  } catch (err) {
    console.error("grade update failed", err);
    return fail("chain_failed", 502);
  }
  const [updated] = await a.db
    .update(vaultCards)
    .set({ grader: grade?.grader ?? null, grade: grade?.score ?? null, gradeCert: grade?.cert ?? null })
    .where(eq(vaultCards.id, row.id))
    .returning();
  invalidateVaultCards();
  return Response.json({ card: toCard(updated), tx });
}
