import { integer, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import { CARD_SOURCES } from "@/lib/sources";
import type { Coin } from "@/lib/coins";

// 兩種登入方式：郵箱 + 密碼（不懂加密的粉絲），或錢包簽名（加密用戶）。至少有其中一種
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // 一律存小寫，登入時也轉小寫比對
  email: text("email").unique(),
  // 用戶點了驗證信裡的連結（或用重設密碼信證明持有信箱）的時間；換郵箱時清空
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  passwordHash: text("password_hash"),
  // 用錢包登入的帳號：Solana 地址（base58）
  walletAddress: text("wallet_address").unique(),
  // 錢包是哪一種：external 是用戶自己的錢包（Phantom 等，簽名綁定或錢包登入），privy 是在 Idolca 建的收藏錢包（Privy 嵌入式錢包）。
  // 收藏錢包要簽名時，網站才去登入 Privy
  walletKind: text("wallet_kind").$type<"external" | "privy">(),
  displayName: text("display_name").notNull(),
  // 上次自己改暱稱的時間，限制改名頻率（見 names.ts）；註冊時的預設名不算
  nameChangedAt: timestamp("name_changed_at", { withTimezone: true }),
  // admin：可以進後台（退款放款、入庫、提貨出貨、標假卡）。用 npm run admin:grant 授予
  role: text("role").$type<"user" | "admin">().notNull().default("user"),
  // 開卡包前確認已滿 18 歲的時間
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 錢包登入的挑戰碼：伺服器發一段含隨機數的訊息，錢包簽名後換成會話；用過或過期就作廢
export const loginNonces = pgTable("login_nonces", {
  nonce: text("nonce").primaryKey(),
  address: text("address").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// 郵件裡的一次性連結：驗證信箱（verify）或重設密碼（reset）。id 是令牌的 SHA-256，令牌本身只出現在信裡；
// 記下寄出時的信箱，帳號換了信箱舊連結就失效。用過、過期或寄了新的同類連結就作廢
export const emailTokens = pgTable("email_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").$type<"verify" | "reset">().notNull(),
  email: text("email").notNull(),
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

// 收藏冊的擺法：order 是每個卡套放的卡鍵（"" 為空卡套），hidden 是拿出冊子的卡鍵，都存成 JSON 陣列
export const binderLayouts = pgTable("binder_layouts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  orderKeys: text("order_keys").notNull().default("[]"),
  hiddenKeys: text("hidden_keys").notNull().default("[]"),
});

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
  // 持有人自己寫的描述（品相、來源故事、交換條件等），選填，之後可以改
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  groupName: text("group_name").notNull(),
  // 來源：專輯、預購特典、幸運抽、簽售、演唱會周邊…（見 src/lib/sources.ts）
  source: text("source", { enum: CARD_SOURCES }).notNull().default("album"),
  member: text("member").notNull(),
  album: text("album"),
  version: text("version"),
  // 和圖鑑卡款對得上時記下，方便收集進度和行情；對不上就留空
  templateId: text("template_id"),
  // NFT 地址和鑄造交易
  // 收藏 NFT：用戶把卡做成數位珍藏時才有（見 funds.ts 的 buildUserMint），沒上鏈時三項都空。刊登和擔保交易不需要它
  asset: text("asset"),
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
  // 寄進金庫：持有人申請的時間（申請後下架，等實物寄到）和選的金庫（src/lib/vaults.ts）；鑑定為真後轉成的金庫卡，和銷毀這張收藏 NFT 的交易
  vaultRequestedAt: timestamp("vault_requested_at", { withTimezone: true }),
  vaultTarget: text("vault_target"),
  vaultCardId: text("vault_card_id"),
  vaultBurnTx: text("vault_burn_tx"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 金庫卡：實物寄進金庫、鑑定通過後由後台建立並鑄成金庫 NFT。持有人、掛單和提貨狀態以鏈上為準（vault-chain.ts 讀鏈），
// 這張表只存實物資料和 NFT 地址。編號（serial）印在卡套標籤上，和 NFT 屬性一致
export const vaultCards = pgTable("vault_cards", {
  id: text("id").primaryKey(),
  serial: text("serial").notNull().unique(),
  groupName: text("group_name").notNull(),
  member: text("member").notNull(),
  album: text("album").notNull(),
  version: text("version").notNull(),
  // album / pob / luckydraw / fansign（見 src/lib/cards.ts）
  rarity: text("rarity").notNull(),
  // 外部評級機構（src/lib/grading.ts）、分數（1–10，可以有 .5）和鑑定編號；沒有送評的卡三項都空
  grader: text("grader"),
  grade: real("grade"),
  gradeCert: text("grade_cert"),
  // 入庫時記錄的品相說明
  condition: text("condition"),
  // 入庫時拍的正反面，/api/media 的網址
  imageFront: text("image_front"),
  imageBack: text("image_back"),
  // 所在的金庫（src/lib/vaults.ts 的 id），提貨從這裡寄出、運費按它算；倉位編號是金庫裡的位置
  vault: text("vault").notNull().default("yvr"),
  location: text("location").notNull(),
  intakeDate: text("intake_date").notNull(),
  asset: text("asset").notNull().unique(),
  mintTx: text("mint_tx"),
  // 寄存人：NFT 鑄給他的錢包；平台自有庫存（卡包卡池）為空
  depositorId: text("depositor_id").references(() => users.id, { onDelete: "set null" }),
  // 已提貨寄出、NFT 已銷毀
  burnedAt: timestamp("burned_at", { withTimezone: true }),
  // 放進卡包卡池的平台自有卡：卡包、等級、價值（期望價值和回購價按它算）。
  // pack_order 是抽到它的開包訂單；為空表示還在卡池裡（被賣回平台後清空，回到卡池）
  packId: text("pack_id"),
  packTier: text("pack_tier"),
  packValueCents: integer("pack_value_cents"),
  packOrder: text("pack_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Trading card 卡包。卡池是放進這個卡包的金庫卡（vault_cards.pack_id），抽一張少一張。
// 公平性用承諾—揭示：建立卡包時生成隨機種子，只公開它的 SHA-256；每次抽卡的隨機數 = HMAC-SHA256(種子, 付款交易簽名:序號)，
// 付款簽名由買家錢包產生，平台事先算不出來。卡包結束或抽完後公開種子，任何人都能重算每一抽
export const packs = pgTable("packs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  // 一筆訂單最多開幾包（1 就是只能單抽）
  maxQty: integer("max_qty").notNull().default(10),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  // 包裝的兩個顏色，JSON 陣列
  palette: text("palette").notNull(),
  seed: text("seed").notNull(),
  seedHash: text("seed_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 每一抽：從當時卡池（按編號排序）的第 pick 張，pool_size 是當時剩幾張，r 是 HMAC 算出的隨機數（十六進位）。
// 抽到的卡由平台錢包轉給買家；賣回時記下回購交易
export const packPulls = pgTable("pack_pulls", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  packId: text("pack_id").notNull(),
  cardId: text("card_id").notNull(),
  idx: integer("idx").notNull(),
  poolSize: integer("pool_size").notNull(),
  pick: integer("pick").notNull(),
  r: text("r").notNull(),
  transferTx: text("transfer_tx"),
  buybackTx: text("buyback_tx"),
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
// 賣家逾時未寄，買家可以取消並全額退款（refunded）；買家逾時未確認自動放款；買家申訴（disputed）時暫停自動放款，交給後台處理。
// refunding / releasing 是轉帳進行中的鎖，防止同一筆被處理兩次。
// 賣家沒有綁定錢包時貨款先留在平台（payout_held），綁定後補發；cancelled 是兩人同時付款時後到的那筆（已自動退款）
export const ORDER_STATUS = ["pending", "paid", "shipped", "disputed", "refunding", "releasing", "completed", "refunded", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];
export type PayRail = "solana" | "arc";

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
  // 收款通道：solana（買家錢包轉帳加備註）或 arc（Arc 上的 USDC 授權轉帳，見 src/lib/arc.ts）；
  // payer 是 Arc 上的付款地址，退款退回這裡
  rail: text("rail").$type<PayRail>().notNull().default("solana"),
  payer: text("payer"),
  // Solana 通道付的是哪種結算代幣（付款確認時從交易認出），退款、放款用同一種
  coin: text("coin").$type<Coin>().notNull().default("usdt"),
  payTx: text("pay_tx").unique(),
  payoutTx: text("payout_tx"),
  payoutHeld: integer("payout_held").notNull().default(0),
  transferTx: text("transfer_tx"),
  refundTx: text("refund_tx"),
  disputeReason: text("dispute_reason"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  // 拍賣得標產生的訂單：記下是哪場拍賣，退款時不把卡按得標價重新上架
  auctionId: text("auction_id"),
  // 買家的收件地址 JSON（格式同提貨，見 src/lib/shipping.ts），只給這筆訂單的買家、賣家和管理員看。
  // 一口價在付款前填；拍賣得標的由得標者在訂單頁補填。address_at 是最後一次填寫的時間：寄出期限從付款和它兩者較晚的時間起算，
  // 賣家標記寄出時也要帶上看到的這個時間，買家剛改過地址就擋下。訂單結束 90 天後由排程清除
  shippingAddress: text("shipping_address"),
  addressAt: timestamp("address_at", { withTimezone: true }),
  // 賣家標記寄出時填的物流單號和物流商（見 src/lib/tracking.ts；物流商 null 表示其他），寄出後到買家確認前賣家可以更正。
  // 和收件地址一樣只給這筆訂單的買家、賣家和管理員看
  trackingCarrier: text("tracking_carrier"),
  trackingNumber: text("tracking_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 自由刊登的拍賣（金庫卡的拍賣在鏈上託管程序裡，不存這裡）。
// live 進行中；sold 成交（得標款變成一張擔保訂單）；unsold 流拍（沒人出價或沒達到保底價）；cancelled 賣家在有人出價前取消，或卡被標成假卡
export const AUCTION_STATUS = ["live", "sold", "unsold", "cancelled"] as const;
export type AuctionStatus = (typeof AUCTION_STATUS)[number];
export const auctions = pgTable("auctions", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  sellerId: text("seller_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startCents: integer("start_cents").notNull(),
  // 保底價，沒設時為空；不對外公開金額
  reserveCents: integer("reserve_cents"),
  // 開拍時的手續費，之後改規則不影響這場
  feeBps: integer("fee_bps").notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").$type<AuctionStatus>().notNull().default("live"),
  highBidId: text("high_bid_id"),
  highCents: integer("high_cents"),
  bidCount: integer("bid_count").notNull().default(0),
  orderId: text("order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 出價：每口都先付全額進平台錢包。pending 已建單、等付款；leading 目前最高；outbid 被超過或沒被接受（截止、加價不夠），等退款；
// refunding 退款中；refunded 已退款；won 得標（款項轉成擔保訂單）
export const BID_STATUS = ["pending", "leading", "outbid", "refunding", "refunded", "won"] as const;
export type BidStatus = (typeof BID_STATUS)[number];
export const bids = pgTable("bids", {
  id: text("id").primaryKey(),
  auctionId: text("auction_id").notNull(),
  bidderId: text("bidder_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  bidderWallet: text("bidder_wallet").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").$type<BidStatus>().notNull().default("pending"),
  // 付款通道和 Arc 上的付款地址，退款退回原通道
  rail: text("rail").$type<PayRail>().notNull().default("solana"),
  payer: text("payer"),
  // Solana 通道付的是哪種結算代幣（付款確認時從交易認出），退款、放款用同一種
  coin: text("coin").$type<Coin>().notNull().default("usdt"),
  payTx: text("pay_tx").unique(),
  refundTx: text("refund_tx"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  // 成為最高出價的時間；付了款但沒被接受（截止了、被別人搶先）的出價沒有，不列進出價紀錄
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  // 出價時填的收件地址 JSON（見 src/lib/shipping.ts）：得標時寫進擔保訂單，拍賣結束後清掉
  shippingAddress: text("shipping_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 開卡包訂單：pending（待付款）→ drawing（已對帳、抽卡和轉移中）→ drawn。
// 卡池不夠或轉移失敗時沒交付的張數自動退款（refund_tx）。pulls 欄位是舊版鑄卡流程留下的紀錄（status 為 legacy），新流程不再寫入
export const PACK_ORDER_STATUS = ["pending", "drawing", "drawn", "legacy"] as const;
export const packOrders = pgTable("pack_orders", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull(),
  qty: integer("qty").notNull(),
  amountCents: integer("amount_cents").notNull(),
  wallet: text("wallet").notNull(),
  // 收款通道和 Arc 付款地址，同 orders。payProof 是買家產生的簽名，抽卡的隨機數用它（平台事先算不出來）：
  // Arc 是買家的授權簽名，Solana 是買家錢包在付款交易裡的簽名（交易編號是付手續費的平台的簽名，不能用）
  rail: text("rail").$type<PayRail>().notNull().default("solana"),
  payer: text("payer"),
  // Solana 通道付的是哪種結算代幣（付款確認時從交易認出），退款、放款用同一種
  coin: text("coin").$type<Coin>().notNull().default("usdt"),
  payTx: text("pay_tx").unique(),
  payProof: text("pay_proof"),
  pulls: text("pulls"),
  status: text("status").$type<(typeof PACK_ORDER_STATUS)[number]>().notNull().default("pending"),
  refundTx: text("refund_tx"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 金庫卡提貨申請：持有人簽名凍結 NFT 並在同一筆交易付運費（requested），平台寄出時銷毀（shipped）。
// 後台也可以取消：解凍、收回委託、退運費。收件地址寄出 90 天後清除（排程執行）
export const redemptions = pgTable("redemptions", {
  cardId: text("card_id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  wallet: text("wallet").notNull(),
  requestTx: text("request_tx").notNull(),
  shipTx: text("ship_tx"),
  // 收件地址 JSON（見 src/lib/shipping.ts）
  shippingAddress: text("shipping_address"),
  // 運費（不含稅）和另收的 GST/HST（加拿大境內的提貨才有，見 src/lib/shipping.ts 的 redeemCharge），分開記方便報稅；申請交易付的是兩者的和
  feeCents: integer("fee_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  // 運費和稅已在申請交易裡對帳成功
  feePaid: integer("fee_paid").notNull().default(0),
  // 運費用哪種結算代幣付的，取消提貨退運費時用同一種
  coin: text("coin").$type<Coin>().notNull().default("usdt"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  cancelTx: text("cancel_tx"),
  refundTx: text("refund_tx"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  // 後台出貨時填的物流單號和物流商（見 src/lib/tracking.ts），只給申請人和管理員看
  trackingCarrier: text("tracking_carrier"),
  trackingNumber: text("tracking_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// devnet 測試幣的領取紀錄，用來限制頻率
export const faucetClaims = pgTable("faucet_claims", {
  userId: text("user_id").primaryKey(),
  wallet: text("wallet").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
});

// 站內通知（見 notifications.ts）。kind 決定顯示的文字，params 是 JSON（卡名、金額），href 是點下去要去的頁面；
// key 防止同一件事重複通知（同一筆交易被回報兩次、排程重跑）
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  params: text("params").notNull(),
  href: text("href").notNull(),
  key: text("key").notNull().unique(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 金庫卡在鏈上的成交（一口價和拍賣得標），從託管程序的交易同步而來（見 vault-trades.ts），訂單頁列出。
// 買賣雙方記錢包地址：成交時對方可能還沒有帳號
export const vaultTrades = pgTable("vault_trades", {
  signature: text("signature").primaryKey(),
  cardId: text("card_id")
    .notNull()
    .references(() => vaultCards.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"buy" | "auction">().notNull(),
  seller: text("seller").notNull(),
  buyer: text("buyer").notNull(),
  coin: text("coin").$type<Coin>().notNull().default("usdt"),
  priceCents: integer("price_cents").notNull(),
  feeCents: integer("fee_cents").notNull(),
  tradedAt: timestamp("traded_at", { withTimezone: true }).notNull(),
});

// 從鏈上同步時讀到的最新簽名，下次從它之後讀
export const chainCursors = pgTable("chain_cursors", {
  key: text("key").primaryKey(),
  signature: text("signature").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 頻率限制的計數（見 rate-limit.ts）
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
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
  `ALTER TABLE collector_items ALTER COLUMN asset DROP NOT NULL`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS photo_back text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'album'`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS extra_photos text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS title text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS description text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS price_cents integer`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS listed_at timestamptz`,
  `ALTER TABLE collector_items ALTER COLUMN verification SET DEFAULT 'unverified'`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS mint_tx text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS owner_address text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS fake_tx text`,
  `UPDATE collector_items SET verification = 'unverified' WHERE verification NOT IN ('unverified', 'fake')`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS vault_requested_at timestamptz`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS vault_card_id text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS vault_burn_tx text`,
  `ALTER TABLE collector_items ADD COLUMN IF NOT EXISTS vault_target text`,
  `CREATE INDEX IF NOT EXISTS collector_items_listed_idx ON collector_items(listed_at) WHERE price_cents IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS binder_wants (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id text NOT NULL,
    PRIMARY KEY (user_id, template_id)
  )`,
  `CREATE TABLE IF NOT EXISTS binder_layouts (
    user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    order_keys text NOT NULL DEFAULT '[]',
    hidden_keys text NOT NULL DEFAULT '[]'
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address text UNIQUE`,
  `ALTER TABLE users ALTER COLUMN email DROP NOT NULL`,
  `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_kind text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS name_changed_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS email_tokens (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose text NOT NULL,
    email text NOT NULL,
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS email_tokens_user_id_idx ON email_tokens(user_id)`,
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
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_tx text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispute_reason text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS rail text NOT NULL DEFAULT 'solana'`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payer text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS auction_id text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS auctions (
    id text PRIMARY KEY,
    item_id text NOT NULL,
    seller_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_cents integer NOT NULL,
    reserve_cents integer,
    fee_bps integer NOT NULL,
    ends_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'live',
    high_bid_id text,
    high_cents integer,
    bid_count integer NOT NULL DEFAULT 0,
    order_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // 一張卡同時只能有一場進行中的拍賣
  `CREATE UNIQUE INDEX IF NOT EXISTS auctions_live_item_idx ON auctions(item_id) WHERE status = 'live'`,
  `CREATE TABLE IF NOT EXISTS bids (
    id text PRIMARY KEY,
    auction_id text NOT NULL,
    bidder_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bidder_wallet text NOT NULL,
    amount_cents integer NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    rail text NOT NULL DEFAULT 'solana',
    payer text,
    pay_tx text UNIQUE,
    refund_tx text,
    paid_at timestamptz,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS bids_auction_idx ON bids(auction_id, created_at)`,
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
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS shipping_address text`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS fee_cents integer NOT NULL DEFAULT 0`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS fee_paid integer NOT NULL DEFAULT 0`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS shipped_at timestamptz`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS cancel_tx text`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS refund_tx text`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS faucet_claims (
    user_id text PRIMARY KEY,
    wallet text NOT NULL,
    claimed_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS vault_cards (
    id text PRIMARY KEY,
    serial text NOT NULL UNIQUE,
    group_name text NOT NULL,
    member text NOT NULL,
    album text NOT NULL,
    version text NOT NULL,
    rarity text NOT NULL,
    grade real,
    condition text,
    image_front text,
    image_back text,
    location text NOT NULL,
    intake_date text NOT NULL,
    asset text NOT NULL UNIQUE,
    mint_tx text,
    depositor_id text REFERENCES users(id) ON DELETE SET NULL,
    burned_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE vault_cards ADD COLUMN IF NOT EXISTS pack_id text`,
  `ALTER TABLE vault_cards ADD COLUMN IF NOT EXISTS pack_tier text`,
  `ALTER TABLE vault_cards ADD COLUMN IF NOT EXISTS pack_value_cents integer`,
  `ALTER TABLE vault_cards ADD COLUMN IF NOT EXISTS pack_order text`,
  `ALTER TABLE vault_cards ALTER COLUMN grade TYPE real`,
  `ALTER TABLE vault_cards ADD COLUMN IF NOT EXISTS grader text`,
  `ALTER TABLE vault_cards ADD COLUMN IF NOT EXISTS grade_cert text`,
  // 分兩個金庫之前入庫的卡都在溫哥華
  `ALTER TABLE vault_cards ADD COLUMN IF NOT EXISTS vault text NOT NULL DEFAULT 'yvr'`,
  // 早期的評級欄位只有分數、沒記是哪家機構評的，這種分數不顯示
  `UPDATE vault_cards SET grade = NULL WHERE grader IS NULL AND grade IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS packs (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    palette text NOT NULL,
    seed text NOT NULL,
    seed_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE packs ADD COLUMN IF NOT EXISTS max_qty integer NOT NULL DEFAULT 10`,
  `CREATE TABLE IF NOT EXISTS pack_pulls (
    id text PRIMARY KEY,
    order_id text NOT NULL,
    pack_id text NOT NULL,
    card_id text NOT NULL,
    idx integer NOT NULL,
    pool_size integer NOT NULL,
    pick integer NOT NULL,
    r text NOT NULL,
    transfer_tx text,
    buyback_tx text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS pack_pulls_pack_idx ON pack_pulls(pack_id, created_at)`,
  `ALTER TABLE pack_orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'`,
  `ALTER TABLE pack_orders ADD COLUMN IF NOT EXISTS refund_tx text`,
  `ALTER TABLE pack_orders ADD COLUMN IF NOT EXISTS rail text NOT NULL DEFAULT 'solana'`,
  `ALTER TABLE pack_orders ADD COLUMN IF NOT EXISTS payer text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS coin text NOT NULL DEFAULT 'usdt'`,
  `ALTER TABLE bids ADD COLUMN IF NOT EXISTS coin text NOT NULL DEFAULT 'usdt'`,
  `ALTER TABLE bids ADD COLUMN IF NOT EXISTS shipping_address text`,
  `ALTER TABLE pack_orders ADD COLUMN IF NOT EXISTS coin text NOT NULL DEFAULT 'usdt'`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS coin text NOT NULL DEFAULT 'usdt'`,
  `ALTER TABLE pack_orders ADD COLUMN IF NOT EXISTS pay_proof text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_carrier text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number text`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS tracking_carrier text`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS tracking_number text`,
  `ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS tax_cents integer NOT NULL DEFAULT 0`,
  `UPDATE pack_orders SET status = 'legacy' WHERE pulls IS NOT NULL AND status = 'pending'`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    count integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    params text NOT NULL,
    href text NOT NULL,
    key text NOT NULL UNIQUE,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS vault_trades (
    signature text PRIMARY KEY,
    card_id text NOT NULL REFERENCES vault_cards(id) ON DELETE CASCADE,
    kind text NOT NULL,
    seller text NOT NULL,
    buyer text NOT NULL,
    coin text NOT NULL DEFAULT 'usdt',
    price_cents integer NOT NULL,
    fee_cents integer NOT NULL,
    traded_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS vault_trades_seller_idx ON vault_trades(seller)`,
  `CREATE INDEX IF NOT EXISTS vault_trades_buyer_idx ON vault_trades(buyer)`,
  `CREATE TABLE IF NOT EXISTS chain_cursors (
    key text PRIMARY KEY,
    signature text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS media (
    id text PRIMARY KEY,
    owner_id text REFERENCES users(id) ON DELETE CASCADE,
    original text NOT NULL,
    display text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];
