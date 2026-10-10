import { getDb } from "@/lib/server/db";
import { readDisplay } from "@/lib/server/media";

// 對外只提供加了浮水印的展示圖。內容按 id 固定不變，可以長期快取
export async function GET(_request: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const db = await getDb();
  if (!db) return new Response(null, { status: 503 });
  const image = await readDisplay(db, id);
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable" },
  });
}
