import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { getFees } from "@/lib/server/fees";

// 現在的手續費（一口價抽成、拍賣手續費、鑄造費，含進行中的促銷和已排定的調整）；公開，給上架、做成數位珍藏的說明文字用。
// CDN 快取 30 秒：促銷開始、結束後最多晚一分鐘顯示，實際收費以伺服器建單、組交易當下的費率為準
export async function GET() {
  await connection();
  const fees = await getFees(await getDb());
  return Response.json(fees, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=30" } });
}
