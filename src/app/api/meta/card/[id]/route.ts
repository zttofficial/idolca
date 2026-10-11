import { SITE_URL } from "@/lib/server/chain";
import { getDb } from "@/lib/server/db";
import { getVaultRow, toCard } from "@/lib/server/vault-cards";

// 金庫卡 NFT 的元數據 JSON（Metaplex 標準），錢包和外部市場讀它顯示名稱、圖片和屬性
export async function GET(_request: Request, ctx: RouteContext<"/api/meta/card/[id]">) {
  const db = await getDb();
  const row = db ? await getVaultRow(db, (await ctx.params).id) : null;
  const card = row ? toCard(row) : null;
  if (!card) return Response.json({ error: "not_found" }, { status: 404 });
  const image = card.image?.front ? `${SITE_URL}${card.image.front}` : undefined;
  return Response.json({
    name: `${card.group} ${card.member} ${card.version} #${card.serial}`,
    symbol: "IDOLCA",
    description: `${card.group} ${card.member} photocard (${card.album}, ${card.version}), authenticated and stored in the Idolca vault. Burn this NFT to have the physical card shipped to you.`,
    image,
    external_url: `${SITE_URL}/card/${card.id}`,
    attributes: [
      { trait_type: "Serial", value: card.serial },
      { trait_type: "Group", value: card.group },
      { trait_type: "Member", value: card.member },
      { trait_type: "Album", value: card.album },
      { trait_type: "Version", value: card.version },
      ...(card.grade ? [{ trait_type: "Grade", value: String(card.grade) }] : []),
      { trait_type: "Custody", value: "vault" },
      { trait_type: "Verification", value: "authentic" },
    ],
    properties: { category: "image", files: image ? [{ uri: image, type: "image/jpeg" }] : [] },
  });
}
