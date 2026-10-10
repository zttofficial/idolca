import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // 一律存小寫，登入時也轉小寫比對
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// id 是會話令牌的 SHA-256；令牌本身只存在用戶的 httpOnly cookie 裡
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const binderEntries = pgTable(
  "binder_entries",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    count: integer("count").notNull(),
    photo: text("photo"),
    mint: text("mint"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.templateId] })],
);

export const binderWants = pgTable(
  "binder_wants",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.templateId] })],
);

// 用戶自由上鏈的卡（自述收藏 NFT）。不要求在圖鑑裡，名稱由用戶填；
// verification 只有平台能改：self_reported（預設）→ authentic（金庫鑑定為真，隨後轉成金庫 NFT）或 fake（鑑定為假）
export const VERIFICATION = ["self_reported", "authentic", "fake"] as const;
export type Verification = (typeof VERIFICATION)[number];

export const collectorItems = pgTable("collector_items", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // 正反面都要：背面能看出版本和真偽線索
  photo: text("photo").notNull(),
  photoBack: text("photo_back"),
  groupName: text("group_name").notNull(),
  // 來源：專輯、預購特典、幸運抽、簽售、演唱會周邊…（見 src/lib/sources.ts）
  source: text("source").notNull().default("album"),
  member: text("member").notNull(),
  album: text("album"),
  version: text("version"),
  // 和圖鑑卡款對得上時記下，方便收集進度和行情；對不上就留空
  templateId: text("template_id"),
  // NFT 地址（演示模式下是隨機字串）
  asset: text("asset").notNull(),
  verification: text("verification").$type<Verification>().notNull().default("self_reported"),
  verificationNote: text("verification_note"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 建表語句：資料庫第一次連上時執行，全部可重複執行
export const BOOTSTRAP_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS binder_entries (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id text NOT NULL,
    count integer NOT NULL,
    photo text,
    mint text,
    PRIMARY KEY (user_id, template_id)
  )`,
  `CREATE TABLE IF NOT EXISTS collector_items (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    photo text NOT NULL,
    group_name text NOT NULL,
    member text NOT NULL,
    album text,
    version text,
    template_id text,
    asset text NOT NULL,
    verification text NOT NULL DEFAULT 'self_reported',
    verification_note text,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS collector_items_user_id_idx ON collector_items(user_id)`,
  // 舊資料庫補欄位
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS photo_back text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'album'`,
  `CREATE TABLE IF NOT EXISTS binder_wants (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id text NOT NULL,
    PRIMARY KEY (user_id, template_id)
  )`,
];
