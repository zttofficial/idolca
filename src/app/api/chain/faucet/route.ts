import { eq } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import { faucetClaims } from "@/lib/server/schema";
import { fail, requireWalletUser } from "@/lib/server/require-user";
import { FAUCET_SOL, FAUCET_USDT, sendTestFunds } from "@/lib/server/funds";
import { marketReady } from "@/lib/server/vault-chain";

const COOLDOWN_MS = 10 * 60_000;

// devnet 測試幣：一點 SOL 付手續費和 500 測試 USDT，每個帳號 10 分鐘一次
export async function POST() {
  const a = await requireWalletUser();
  if ("error" in a) return a.error;
  if (!marketReady()) return fail("not_configured", 503);
  const [last] = await a.db.select().from(faucetClaims).where(eq(faucetClaims.userId, a.user.id));
  if (last && Date.now() - last.claimedAt.getTime() < COOLDOWN_MS) return fail("cooldown", 429);
  try {
    const tx = await sendTestFunds(new PublicKey(a.wallet));
    const row = { userId: a.user.id, wallet: a.wallet, claimedAt: new Date() };
    await a.db.insert(faucetClaims).values(row).onConflictDoUpdate({ target: faucetClaims.userId, set: row });
    return Response.json({ tx, sol: FAUCET_SOL, usdt: FAUCET_USDT });
  } catch (err) {
    console.error("faucet failed", err);
    return fail("chain_failed", 502);
  }
}
