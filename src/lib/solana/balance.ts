import { address, createSolanaRpc } from "@solana/kit";
import { RPC_URL, USDT_MINT } from "./config";

const rpc = createSolanaRpc(RPC_URL);

// 錢包持有的 USDT 總額（同一個 mint 可能分散在多個代幣帳戶裡）
export async function getUsdtBalance(owner: string): Promise<number> {
  const { value } = await rpc
    .getTokenAccountsByOwner(address(owner), { mint: address(USDT_MINT) }, { encoding: "jsonParsed" })
    .send();
  return value.reduce((sum, { account }) => sum + Number(account.data.parsed.info.tokenAmount.uiAmountString), 0);
}
