import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { redemptions, vaultCards } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { vaultState } from "@/lib/server/vault-chain";

// 待出貨和已出貨的提貨申請，附鏈上狀態
export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const [rows, state] = await Promise.all([
    a.db
      .select({ r: redemptions, serial: vaultCards.serial, group: vaultCards.groupName, member: vaultCards.member })
      .from(redemptions)
      .leftJoin(vaultCards, eq(vaultCards.id, redemptions.cardId))
      .orderBy(desc(redemptions.createdAt)),
    vaultState(),
  ]);
  return Response.json({
    redemptions: rows.map(({ r, serial, group, member }) => ({ ...r, card: serial ? `${serial} · ${group} ${member}` : r.cardId, onChain: state[r.cardId] ?? null })),
  });
}
