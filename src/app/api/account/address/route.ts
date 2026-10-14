import { connection } from "next/server";
import { requireUser } from "@/lib/server/require-user";
import { lastAddress } from "@/lib/server/orders";

// 我上一次填過的收件地址（擔保訂單或提貨），收件地址表單用來預填
export async function GET() {
  await connection();
  const a = await requireUser();
  if (a.error) return a.error;
  return Response.json({ address: await lastAddress(a.db, a.user.id) });
}
