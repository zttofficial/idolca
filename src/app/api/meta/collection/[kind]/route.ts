import { SITE_URL } from "@/lib/server/chain";

const COLLECTIONS = {
  vault: {
    name: "Idolca Vault",
    description: "K-pop photocards authenticated and stored in the Idolca vault. Each NFT is one physical card; burn it to have the card shipped.",
  },
  collector: {
    name: "Idolca Collector",
    description: "Photocards minted by their owners on Idolca. Idolca does not check these cards; cards found to be fake are permanently labeled and frozen.",
  },
} as const;

// 兩個集合的元數據 JSON
export async function GET(_request: Request, ctx: RouteContext<"/api/meta/collection/[kind]">) {
  const kind = (await ctx.params).kind as keyof typeof COLLECTIONS;
  const c = COLLECTIONS[kind];
  if (!c) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ...c, symbol: "IDOLCA", image: `${SITE_URL}/icon.svg`, external_url: SITE_URL });
}
