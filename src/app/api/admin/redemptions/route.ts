import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { redemptions } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { vaultState } from "@/lib/server/vault-chain";

// 待出貨和已出貨的提貨申請，附鏈上狀態
export async function GET(request: Request) {
  await connection();
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  const [rows, state] = await Promise.all([a.db.select().from(redemptions).orderBy(desc(redemptions.createdAt)), vaultState()]);
  return Response.json({ redemptions: rows.map((r) => ({ ...r, onChain: state[r.cardId] ?? null })) });
}
