import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { MARKET_PROGRAM_ID } from "./config";

// 掛單帳戶的 PDA，種子與 onchain/programs/idolca-market 的 Listing 一致：["listing", asset]
export async function listingAddress(asset: string) {
  if (!MARKET_PROGRAM_ID) return null;
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(MARKET_PROGRAM_ID),
    seeds: ["listing", getAddressEncoder().encode(address(asset))],
  });
  return pda as string;
}
