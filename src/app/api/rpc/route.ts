import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { SERVER_RPC } from "@/lib/server/chain";
import { allow, clientIp, tooMany } from "@/lib/server/rate-limit";
import { RPC_MAX_BYTES, rejectRpc } from "@/lib/rpc-proxy";

// 瀏覽器的 Solana RPC 轉發：方法照 src/lib/rpc-proxy.ts 的白名單放行，再由伺服器帶著 SOLANA_RPC_URL 的 key 轉過去。
// 每個 IP 每分鐘最多 RPC_PER_MINUTE 次，避免這個接口被拿去當免費節點用。WebSocket 訂閱轉發不了，瀏覽器直接連公共端點（見 lib/solana/config.ts）
const RPC_PER_MINUTE = 120;

const rpcError = (code: number, message: string, status = 400) => Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status });

export async function POST(request: Request) {
  await connection();
  const text = await request.text();
  if (text.length > RPC_MAX_BYTES) return rpcError(-32600, "request_too_large", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return rpcError(-32700, "parse_error");
  }
  const reason = rejectRpc(body);
  if (reason) return rpcError(reason === "method_not_allowed" ? -32601 : -32600, reason, reason === "method_not_allowed" ? 403 : 400);

  const db = await getDb();
  if (db && !(await allow(db, `rpc:${clientIp(request)}`, RPC_PER_MINUTE, 60))) return tooMany();

  const upstream = await fetch(SERVER_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: text, cache: "no-store" });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
}
