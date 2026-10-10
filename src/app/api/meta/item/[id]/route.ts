import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { collectorItems } from "@/lib/server/schema";
import { SITE_URL } from "@/lib/server/chain";
import { itemTitle } from "@/lib/item-title";

// 收藏 NFT 的元數據 JSON。鑑定狀態隨時可能變（標成假卡），所以每次請求都讀資料庫
export async function GET(_request: Request, ctx: RouteContext<"/api/meta/item/[id]">) {
  await connection();
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });
  const [r] = await db.select().from(collectorItems).where(eq(collectorItems.id, (await ctx.params).id));
  if (!r) return Response.json({ error: "not_found" }, { status: 404 });
  const fake = r.verification === "fake";
  const title = itemTitle({ title: r.title, group: r.groupName, member: r.member, version: r.version });
  const photos = [r.photo, r.photoBack, ...(r.extraPhotos ? (JSON.parse(r.extraPhotos) as string[]) : [])].filter((x): x is string => Boolean(x)).map((p) => `${SITE_URL}${p}`);
  return Response.json({
    name: fake ? `[FAKE] ${title}` : title,
    symbol: "IDOLCA",
    description: fake
      ? "Idolca found this card is not genuine. This label is permanent and the NFT is frozen."
      : "Minted by its owner on Idolca. Idolca has not checked whether this card is genuine.",
    image: photos[0],
    external_url: `${SITE_URL}/listing/${r.id}`,
    attributes: [
      { trait_type: "Group", value: r.groupName },
      { trait_type: "Member", value: r.member },
      { trait_type: "Source", value: r.source },
      { trait_type: "Cards", value: r.quantity },
      ...(r.album ? [{ trait_type: "Release", value: r.album }] : []),
      ...(r.version ? [{ trait_type: "Version", value: r.version }] : []),
      { trait_type: "Custody", value: "self" },
      { trait_type: "Verification", value: r.verification },
    ],
    properties: { category: "image", files: photos.map((uri) => ({ uri, type: "image/jpeg" })) },
  });
}
