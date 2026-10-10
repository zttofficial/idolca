import { findCard } from "@/lib/mock-cards";
import { SITE_URL } from "@/lib/server/chain";

// 金庫卡 NFT 的元數據 JSON（Metaplex 標準），錢包和外部市場讀它顯示名稱、圖片和屬性
export async function GET(_request: Request, ctx: RouteContext<"/api/meta/card/[id]">) {
  const card = findCard((await ctx.params).id);
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
      { trait_type: "Custody", value: "vault" },
      { trait_type: "Verification", value: "authentic" },
    ],
    properties: { category: "image", files: image ? [{ uri: image, type: "image/jpeg" }] : [] },
  });
}
