// 授予或撤銷管理員：npm run admin:grant -- <郵箱或錢包地址> [--revoke]
// 讀 DATABASE_URL（或帶前綴的 *_DATABASE_URL）；沒有時改本機 PGlite（先停掉 dev，PGlite 不能兩個進程同時開）
export {};
const [target, flag] = process.argv.slice(2);
if (!target) {
  console.error("usage: npm run admin:grant -- <email|wallet> [--revoke]");
  process.exit(1);
}
const role = flag === "--revoke" ? "user" : "admin";
const url = process.env.DATABASE_URL || Object.entries(process.env).find(([k, v]) => k.endsWith("_DATABASE_URL") && v)?.[1];
const where = target.includes("@") ? "email = $2" : "wallet_address = $2";
const value = target.includes("@") ? target.trim().toLowerCase() : target.trim();
const sql = `UPDATE users SET role = $1 WHERE ${where} RETURNING id, email, wallet_address, role`;

let rows: unknown[];
if (url) {
  const { neon } = await import("@neondatabase/serverless");
  rows = await neon(url).query(sql, [role, value]);
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(process.env.PGLITE_DIR || ".data/pglite");
  rows = (await db.query(sql, [role, value])).rows;
  await db.close();
}
if (!rows.length) {
  console.error(`no account with ${target}; sign in once on the site first`);
  process.exit(1);
}
console.log(rows[0]);
