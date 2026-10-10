import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// 兩種登入方式：郵箱 + 密碼（不懂加密的粉絲），或錢包簽名（加密用戶）。至少有其中一種
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // 一律存小寫，登入時也轉小寫比對
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  // 用錢包登入的帳號：Solana 地址（base58）
  walletAddress: text("wallet_address").unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 錢包登入的挑戰碼：伺服器發一段含隨機數的訊息，錢包簽名後換成會話；用過或過期就作廢
export const loginNonces = pgTable("login_nonces", {
  nonce: text("nonce").primaryKey(),
  address: text("address").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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

// 用戶自由上鏈的卡（收藏 NFT）。不要求在圖鑑裡，名稱由用戶填；可以是一張卡，也可以是一組卡。
// 平台不查驗這類卡：一律是 unverified（待驗證）；只有被查出是假卡時，平台才改成 fake，持有人改不回來。
// 「真品」只屬於金庫卡：卡寄進金庫鑑定通過後另鑄金庫 NFT，和這張表無關
export const VERIFICATION = ["unverified", "fake"] as const;
export type Verification = (typeof VERIFICATION)[number];

export const collectorItems = pgTable("collector_items", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // 正反面必填（背面能看出版本和真偽線索），另外最多 6 張補充照片（一組卡的合照、細節），存成 JSON 陣列
  photo: text("photo").notNull(),
  photoBack: text("photo_back"),
  extraPhotos: text("extra_photos"),
  // 賣家自己取的標題，例如「IVE 幸運抽一組 6 張」；留空時用團體和成員組成
  title: text("title"),
  quantity: integer("quantity").notNull().default(1),
  groupName: text("group_name").notNull(),
  // 來源：專輯、預購特典、幸運抽、簽售、演唱會周邊…（見 src/lib/sources.ts）
  source: text("source").notNull().default("album"),
  member: text("member").notNull(),
  album: text("album"),
  version: text("version"),
  // 和圖鑑卡款對得上時記下，方便收集進度和行情；對不上就留空
  templateId: text("template_id"),
  // NFT 地址。鏈上未配置的環境（演示模式）是隨機字串，mint_tx 為空
  asset: text("asset").notNull(),
  mintTx: text("mint_tx"),
  // NFT 的持有地址：錢包登入的用戶是自己的錢包，郵箱帳號是平台代管錢包
  ownerAddress: text("owner_address"),
  // 標成假卡時改寫鏈上元數據並凍結的交易
  fakeTx: text("fake_tx"),
  verification: text("verification").$type<Verification>().notNull().default("unverified"),
  verificationNote: text("verification_note"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  // 自由刊登：有價格就是刊登中（USDT，存到分）
  priceCents: integer("price_cents"),
  listedAt: timestamp("listed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 卡片照片。original 是裁切後未加浮水印的版本，留給鑑定；display 加了浮水印，經 /api/media/{id} 對外提供。
// 都存 base64 文字，Neon 和 PGlite 的驅動處理方式一致
export const media = pgTable("media", {
  id: text("id").primaryKey(),
  // 樣本卡照片沒有上傳者
  ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
  original: text("original").notNull(),
  display: text("display").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 自由刊登的擔保交易：買家付款進平台錢包（pending → paid），賣家寄出（shipped），買家確認收貨後平台放款並轉移 NFT（completed）。
// 賣家沒有綁定錢包時貨款先留在平台（payout_held），綁定後補發
export const ORDER_STATUS = ["pending", "paid", "shipped", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];
export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  buyerId: text("buyer_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sellerId: text("seller_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  priceCents: integer("price_cents").notNull(),
  feeCents: integer("fee_cents").notNull(),
  status: text("status").$type<OrderStatus>().notNull().default("pending"),
  buyerWallet: text("buyer_wallet").notNull(),
  payTx: text("pay_tx").unique(),
  payoutTx: text("payout_tx"),
  payoutHeld: integer("payout_held").notNull().default(0),
  transferTx: text("transfer_tx"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 開卡包：先建待付款訂單，付款交易確認後抽卡並把抽到的卡鑄成 NFT。pulls 是 JSON：[{ entryId, cardId, asset, tx }]
export const packOrders = pgTable("pack_orders", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull(),
  qty: integer("qty").notNull(),
  amountCents: integer("amount_cents").notNull(),
  wallet: text("wallet").notNull(),
  payTx: text("pay_tx").unique(),
  pulls: text("pulls"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 金庫卡提貨申請：持有人簽名凍結 NFT（requested），平台寄出時銷毀（shipped）
export const redemptions = pgTable("redemptions", {
  cardId: text("card_id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  wallet: text("wallet").notNull(),
  requestTx: text("request_tx").notNull(),
  shipTx: text("ship_tx"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// devnet 測試幣的領取紀錄，用來限制頻率
export const faucetClaims = pgTable("faucet_claims", {
  userId: text("user_id").primaryKey(),
  wallet: text("wallet").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
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
    verification text NOT NULL DEFAULT 'unverified',
    verification_note text,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS collector_items_user_id_idx ON collector_items(user_id)`,
  // 舊資料庫補欄位
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS photo_back text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'album'`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS extra_photos text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS title text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS price_cents integer`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS listed_at timestamptz`,
  `ALTER TABLE collector_items ALTER COLUMN verification SET DEFAULT 'unverified'`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS mint_tx text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS owner_address text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS fake_tx text`,
  `UPDATE collector_items SET verification = 'unverified' WHERE verification NOT IN ('unverified', 'fake')`,
  `CREATE INDEX IF NOT EXISTS collector_items_listed_idx ON collector_items(listed_at) WHERE price_cents IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS binder_wants (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id text NOT NULL,
    PRIMARY KEY (user_id, template_id)
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address text UNIQUE`,
  `ALTER TABLE users ALTER COLUMN email DROP NOT NULL`,
  `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
  `CREATE TABLE IF NOT EXISTS login_nonces (
    nonce text PRIMARY KEY,
    address text NOT NULL,
    message text NOT NULL,
    expires_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id text PRIMARY KEY,
    item_id text NOT NULL,
    buyer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price_cents integer NOT NULL,
    fee_cents integer NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    buyer_wallet text NOT NULL,
    pay_tx text UNIQUE,
    payout_tx text,
    payout_held integer NOT NULL DEFAULT 0,
    transfer_tx text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS pack_orders (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id text NOT NULL,
    qty integer NOT NULL,
    amount_cents integer NOT NULL,
    wallet text NOT NULL,
    pay_tx text UNIQUE,
    pulls text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS redemptions (
    card_id text PRIMARY KEY,
    user_id text REFERENCES users(id) ON DELETE SET NULL,
    wallet text NOT NULL,
    request_tx text NOT NULL,
    ship_tx text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS faucet_claims (
    user_id text PRIMARY KEY,
    wallet text NOT NULL,
    claimed_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media (
    id text PRIMARY KEY,
    owner_id text REFERENCES users(id) ON DELETE CASCADE,
    original text NOT NULL,
    display text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];
