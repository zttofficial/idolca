import { getDb } from "@/lib/server/db";
import { endSession } from "@/lib/server/auth";

export async function POST() {
  const db = await getDb();
  if (db) await endSession(db);
  return Response.json({ ok: true });
}
