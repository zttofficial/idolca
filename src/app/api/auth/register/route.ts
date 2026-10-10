import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { users } from "@/lib/server/schema";
import { EMAIL_RE, MIN_PASSWORD, hashPassword, newUserId, startSession } from "@/lib/server/auth";

export async function POST(request: Request) {
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string; displayName?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!EMAIL_RE.test(email)) return Response.json({ error: "invalid_email" }, { status: 400 });
  if (password.length < MIN_PASSWORD) return Response.json({ error: "weak_password" }, { status: 400 });

  const taken = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken.length) return Response.json({ error: "email_taken" }, { status: 409 });

  const user = { id: newUserId(), email, displayName: body.displayName?.trim().slice(0, 40) || email.split("@")[0] };
  await db.insert(users).values({ ...user, passwordHash: await hashPassword(password) });
  await startSession(db, user.id);
  return Response.json({ user });
}
