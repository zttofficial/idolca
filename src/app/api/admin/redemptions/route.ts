import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { redemptions, vaultCards } from "@/lib/server/schema";
import { requireAdmin } from "@/lib/server/admin";
import { vaultState } from "@/lib/server/vault-chain";
import { vaultOf } from "@/lib/vaults";

// 待出貨和已出貨的提貨申請，附鏈上狀態和卡所在的金庫（從那裡寄出）
export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a.error) return a.error;
  const [rows, state] = await Promise.all([
    a.db
      .select({ r: redemptions, serial: vaultCards.serial, group: vaultCards.groupName, member: vaultCards.member, vault: vaultCards.vault })
      .from(redemptions)
      .leftJoin(vaultCards, eq(vaultCards.id, redemptions.cardId))
      .orderBy(desc(redemptions.createdAt)),
    vaultState(),
  ]);
  return Response.json({
    redemptions: rows.map(({ r, serial, group, member, vault }) => ({
      ...r,
      card: serial ? `${serial} · ${group} ${member}` : r.cardId,
      vault: vaultOf(vault).id,
      onChain: state[r.cardId] ?? null,
    })),
  });
}
