import { connection } from "next/server";
import { CHAIN } from "@/lib/chain";
import { marketReady, vaultState } from "@/lib/server/vault-chain";

// 金庫卡的即時鏈上狀態：持有人、掛單價格、是否在提貨中；公開
export async function GET() {
  await connection();
  if (!marketReady()) return Response.json({ ready: false, cards: {} });
  return Response.json({ ready: true, usdtMint: CHAIN.market!.usdtMint, cards: await vaultState() });
}
