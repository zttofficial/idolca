import { PublicKey } from "@solana/web3.js";
import { requireWalletUser } from "@/lib/server/require-user";
import { balances } from "@/lib/server/funds";
import { marketReady } from "@/lib/server/vault-chain";

// 目前帳號錢包的 devnet SOL 和測試 USDT 餘額
export async function GET() {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return Response.json({ sol: 0, usdt: 0 });
  return Response.json(await balances(new PublicKey(a.wallet)));
}
