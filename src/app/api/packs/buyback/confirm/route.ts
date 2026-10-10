import { fail, requireUser } from "@/lib/server/require-user";
import { confirmBuyback } from "@/lib/server/packs";

// 回購交易送出後回報簽名
export async function POST(request: Request) {
  const a = await requireUser();
  if (a.error) return a.error;
  const body = (await request.json().catch(() => ({}))) as { asset?: string; signature?: string };
  if (typeof body.asset !== "string" || typeof body.signature !== "string") return fail("invalid_request");
  try {
    const result = await confirmBuyback(a.db, a.user.id, body.asset, body.signature);
    if ("error" in result) return fail(result.error ?? "not_found", 409);
    return Response.json(result);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "tx_failed");
  }
}
