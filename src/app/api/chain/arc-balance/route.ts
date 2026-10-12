import { connection } from "next/server";
import { arcUsdcBalance } from "@/lib/server/arc-pay";
import { fail } from "@/lib/server/require-user";

// 某個地址在 Arc 上的 USDC 餘額（帳號選單顯示用）。公開資料，不需要登入
export async function GET(request: Request) {
  await connection();
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return fail("invalid_address");
  const usdc = await arcUsdcBalance(address as `0x${string}`).catch(() => null);
  if (usdc === null) return fail("arc_unavailable", 503);
  return Response.json({ usdc });
}
