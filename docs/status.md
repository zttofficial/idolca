# 實施現況

截至 2026-10-14。功能規則和選型理由見 [tech-stack.md](tech-stack.md)，這裡記已經做出來的東西在哪、環境怎麼配、開發要守的約定和還沒做的事。

## 總覽

- 線上 <https://idolca.trade>，卡片和交易跑在 Solana devnet，所有流程都用錢包真實上鏈驗證過。開卡包和擔保交易另外可以在 Arc 上用 USDC 付款（線上接 Arc 主網、只限管理員），設計見 [arc.md](arc.md)。
- 代碼按正式上線標準寫：換主網只改環境變數和部署合約，不改代碼（步驟見 tech-stack.md「上線主網」）。
- 黑客松：已提交 Colosseum Crypto World's Fair 主賽和 Superteam Canada track；GitHub 倉庫是私有的，已分享給 hackathon@colosseum.com。

## 功能與代碼位置

| 功能 | 頁面 | 主要代碼 |
|---|---|---|
| 帳號：郵箱密碼或錢包簽名登入、驗證信箱、忘記和修改密碼、設定錢包（收藏錢包或綁定自己的；綁定之前登入過的錢包時，那個錢包帳號併進郵箱帳號）、管理員 | 帳號選單、`/verify-email`、`/reset-password` | `src/lib/server/auth.ts`、`account-merge.ts`、`email-auth.ts`、`mail.ts`、`wallet-auth.ts`、`admin.ts`，`src/components/auth/`，`scripts/grant-admin.ts` |
| 收藏錢包（Privy 嵌入式錢包，用到時才載入）、刷卡加值 | 帳號選單、付款時的「設定錢包」 | `src/lib/privy/bridge.ts`，`src/components/auth/PrivyMount.tsx`、`PrivyHost.tsx`、`WalletSetup.tsx` |
| 結算代幣（USDT、USDC）、平台代付手續費和帳戶租金 | 所有付款 | `src/lib/coins.ts`，`src/lib/server/vault-chain.ts` 的 `forUser`、`pickCoin`，`funds.ts` |
| 市場（金庫卡、自由刊登兩條線） | `/market` | `src/components/market/MarketBrowser.tsx`、`src/lib/market.ts`、`src/lib/server/market-data.ts` |
| 金庫卡買賣、掛單（Anchor 託管程序） | `/card/[id]` | `src/lib/server/vault-chain.ts`、`src/components/card/`、`onchain/` |
| 鏈上紀錄、金庫卡拍賣的出價紀錄；時間軸元件和自由刊登的交易紀錄共用 | `/card/[id]` | `src/components/card/ActivityList.tsx`，`src/lib/server/history.ts`，`src/app/api/chain/history`、`src/app/api/chain/bids` |
| 金庫（溫哥華、重慶兩個；每張卡記所在金庫，入庫和寄進金庫時選） | `/vault`、`/card/[id]`、`/admin` | `src/lib/vaults.ts`，`src/components/vault/VaultTable.tsx` |
| 提貨（凍結、委託銷毀、付按卡所在金庫和目的地計價的運費，加拿大境內另加收件省份的 GST/HST；後台出貨或取消） | `/card/[id]`、`/admin` | `RedeemDialog.tsx`、`vault-chain.ts`，`src/app/api/chain/vault/tx`、`confirm`，`src/lib/shipping.ts`（運費計算）、`src/lib/rates/`（兩個金庫的郵資表）、`policy.ts`（計價規則），`src/lib/rates/ca-tax.ts`（GST/HST 稅率） |
| 公開運費表（每個國家或地區從兩個金庫寄的運費，可搜尋和排序；計價方式和報價來源；頁尾和服務條款連過去） | `/shipping` | `src/app/[locale]/shipping/page.tsx`、`src/components/shipping/RateTable.tsx`，`src/lib/rates/` 的 `*_SOURCES`、`*_QUOTED_ON`，服務條款裡的 `[文字](/路徑)` 由 `src/components/legal/LegalPage.tsx` 顯示成站內連結 |
| 收件地址表單和顯示（提貨、擔保交易共用，預填上次的地址） | 提貨、購買、訂單、後台 | `src/components/shipping/AddressDialog.tsx`，`src/app/api/account/address`、`src/app/api/orders/[id]/address` |
| 物流單號（擔保交易賣家寄出、提貨後台出貨共用；物流商清單、檢查碼、查詢連結、可更正） | 訂單、`/card/[id]`、`/admin` | `src/lib/tracking.ts`、`src/components/shipping/Tracking.tsx`、`src/lib/server/redemption-tracking.ts`，`src/app/api/orders/[id]/ship`、`tracking`，`src/app/api/admin/redemptions/[cardId]/ship`、`tracking`，`src/app/api/redemptions/[cardId]` |
| 自由上鏈、自由刊登、擔保交易（買家的收件地址，7 天沒填自動退款；寄出期限）；刊登頁成交後仍保留（成交狀態、交易紀錄） | 收藏冊、`/listing/[id]` | `src/components/binder/AddCard.tsx`、`src/lib/server/items.ts`、`orders.ts`、`src/lib/escrow.ts`、`src/lib/policy.ts` |
| 拍賣（兩條線：自由刊登進平台託管，金庫卡在鏈上）、上架時選一口價或拍賣 | `/listing/[id]`、`/card/[id]`、收藏冊 | `src/lib/server/auctions.ts`、`vault-chain.ts`，`src/lib/auction.ts`，`src/components/auction/`、`src/components/market/ListingControl.tsx` |
| 寄進金庫、收藏卡轉金庫卡 | 收藏冊、`/admin` | `src/app/api/items/[id]/vault`、`src/app/api/admin/items/[id]/vault`、`VaultConvert.tsx` |
| 付款方式面板（Solana 錢包、Arc 上的 USDC、信用卡佔位） | 購買按鈕 | `src/components/pay/PaymentPicker.tsx`，標誌在 `public/pay/` |
| Arc 收款通道（USDC 授權轉帳、平台代送、退款） | 開卡包、擔保交易 | `src/lib/arc.ts`、`src/lib/server/arc-pay.ts`、`src/lib/evm/arc-wallet.ts` |
| 評級（IDG 自家評級和第三方評級） | `/card/[id]`、`/admin`、介紹頁 `/grading` | `src/lib/grading.ts`、`src/components/admin/VaultGrade.tsx`、`src/app/api/admin/vault/[id]/grade` |
| 盲盒卡包（承諾—揭示抽卡、即時回購） | `/packs` | `src/lib/server/packs.ts`、`pack-pool.ts`，`src/lib/pack-draw.ts`、`src/lib/packs.ts`，`src/components/packs/PackOpener.tsx` |
| 收藏冊（卡冊、搜尋和團體 → 成員篩選、整理、同步） | `/binder` | `BinderView.tsx`、`BinderBook.tsx`、`BinderArranger.tsx`、`BinderChain.tsx`（訂單），`src/lib/binder.ts`、`binder-layout.ts`、`binder-filter.ts`，`src/app/api/binder` |
| 卡片篩選元件（搜尋框、團體 → 成員；市場用側欄，收藏冊用上方可收起的面板），市場和收藏冊共用 | `/market`、`/binder` | `src/components/market/CardFilters.tsx`、`src/lib/facets.ts` |
| 圖鑑 | `/catalog` | `src/lib/catalog.ts` |
| 團體名錄（表單的團體、成員建議；按照片檔名預填名稱、團體、成員） | 上鏈、入庫表單 | `src/lib/kpop-groups.ts` |
| 金庫頁（存貨證明） | `/vault` | `src/components/vault/` |
| 專輯銷量榜 | `/charts` | `src/lib/server/circle-chart.ts` |
| 後台（入庫、卡包、擔保訂單、提貨、假卡） | `/admin` | `src/components/admin/`、`src/app/api/admin/` |
| 照片處理和浮水印 | — | `src/lib/server/media.ts`、`src/lib/crop-card.ts` |
| 站內通知（拍賣、擔保訂單、金庫卡成交、提貨寄出） | 頁首通知鈴 | `src/lib/server/notifications.ts`、`vault-notify.ts`，`src/components/notifications/NotificationBell.tsx`，`src/app/api/notifications` |
| 每日排程（逾時訂單和提醒填地址、結標拍賣和退款、清地址、清過期會話、郵件連結和 90 天前的通知） | — | `src/app/api/cron/daily`、`vercel.json` |
| SEO（標題、hreflang、站點地圖、分享圖、JSON-LD） | 全站 | `src/lib/seo.ts`、`src/app/sitemap.ts`、`robots.ts`、`opengraph-image.tsx` |
| 下拉選單元件 | 全站 | `src/components/ui/Combobox.tsx`（可自由輸入的建議清單）、`Select.tsx`（選單，可帶搜尋） |
| 多語言（8 種） | 全站 | `messages/*.json` |
| 產品分析（PostHog，不用 cookie） | 全站 | `src/instrumentation-client.ts`、`src/lib/analytics.ts`；付款類事件在 `PaymentPicker.tsx` |
| 官方社群帳號（頁尾圖示、結構化資料） | 全站 | `src/lib/social.ts` |

## 資料表

全部定義在 `src/lib/server/schema.ts`，`BOOTSTRAP_SQL` 在第一次連線時建表和補欄位。

| 表 | 存什麼 |
|---|---|
| `users`、`sessions`、`login_nonces`、`email_tokens` | 帳號（郵箱或錢包、錢包種類、信箱是否驗證、角色、年齡確認）、會話、錢包登入挑戰碼、郵件裡的驗證和重設密碼連結 |
| `binder_entries`、`binder_wants`、`binder_layouts` | 收藏冊的標記、想要清單、擺法 |
| `collector_items` | 自由上鏈的卡：資料、刊登價格、鑑定狀態、NFT 地址、寄進金庫申請和選的金庫（`vault_target`） |
| `vault_cards` | 金庫卡實物資料和所在金庫（`vault`）；持有人和掛單以鏈上為準 |
| `packs`、`pack_pulls`、`pack_orders` | 卡包、每一抽的紀錄、開包訂單 |
| `orders` | 自由刊登的擔保訂單（拍賣得標的記著 `auction_id`；買家的收件地址和填寫時間 `shipping_address`、`address_at`；賣家寄出時的物流單號 `tracking_carrier`、`tracking_number`）；`orders`、`bids`、`pack_orders`、`redemptions` 都記著付款用的幣種（`coin`） |
| `auctions`、`bids` | 自由刊登的拍賣和每一口出價（付款、退款、是否被接受、拍賣進行中時的收件地址）；金庫卡的拍賣在鏈上 |
| `redemptions` | 提貨申請、收件地址、運費和加拿大境內另收的 GST/HST（`fee_cents`、`tax_cents`）、出貨時的物流單號 |
| `notifications` | 站內通知（種類、卡名和金額、連結、已讀時間；`key` 去重） |
| `media` | 照片（原圖和浮水印展示圖） |
| `faucet_claims`、`rate_limits` | devnet 水龍頭領取紀錄、頻率限制計數 |

## 環境

| | 線上 | 本機開發 | 本機端到端測試 |
|---|---|---|---|
| 網站 | Vercel 專案 `ai-artist-projects/idolca`，推送 main 自動部署 | `npm run dev` | `PGLITE_DIR=.data/pglite-e2e npm run dev` |
| 資料庫 | Neon（Vercel 整合，變數前綴 `idolca_api_`） | PGlite，`.data/pglite` | PGlite，`.data/pglite-e2e` |
| 平台金鑰 | `PLATFORM_SECRET_KEY`（敏感變數） | `.data/platform-devnet.json` | 同左 |
| 寄信 | Resend，`idolca.trade` 已驗證；`RESEND_API_KEY` 是只能寄信的金鑰，寄件人用預設的 `noreply@idolca.trade` | 不設金鑰，信寫進 `.data/outbox.jsonl` 並印在終端 | 同左，`test:e2e:email` 從這裡讀連結 |
| 收藏錢包 | Privy 應用 `cmv7f33v0005i0gl28se4t7nm`，`NEXT_PUBLIC_PRIVY_APP_ID`（還沒設到 Vercel，見已知問題） | `.env.local` 同一個 App ID（Privy 的 Allowed origins 加了 `http://localhost:3000`） | 同左，`test:e2e:privy` 用 Privy 的測試帳號 |
| 管理員 | `ADMIN_WALLETS` 目前是測試錢包 `5ftP1ayDW7EpPmTXBjdC1dvuoRbdqfEKDX4tRWnFCBZu` | `.env.local` 的 `ADMIN_WALLETS`，金鑰 `.data/admin-test-devnet.json` | 同左 |

- 線上已設的變數：資料庫、`PLATFORM_SECRET_KEY`、`ADMIN_WALLETS`、`CRON_SECRET`（Production 和 Preview）；Production 的 `SOLANA_RPC_URL`（Helius devnet）；Arc 主網的 `NEXT_PUBLIC_ARC_NETWORK`、`ARC_PLATFORM_KEY`、`ARC_PAY_ADMIN_ONLY`，以及只有 Production 的 Resend `RESEND_API_KEY`、`NEXT_PUBLIC_SITE_URL`（`https://idolca.trade`）和 PostHog 的 `NEXT_PUBLIC_POSTHOG_KEY`。全部變數見 `.env.example`。
- Solana RPC 用 Helius devnet，伺服器、瀏覽器和端到端測試在本機共用一把 key（`.env.local` 的 `SOLANA_RPC_URL`、`NEXT_PUBLIC_SOLANA_RPC_URL`、`E2E_RPC_URL`；端到端腳本不讀 `.env.local`，跑的時候要把 `E2E_RPC_URL` 帶進環境）。線上只設伺服器的 `SOLANA_RPC_URL`：瀏覽器變數會打包進網頁，Helius 免費方案又不能限定來源網域，所以線上瀏覽器端用公共端點。公共端點按用戶 IP 限流，devnet 上一般用戶碰不到；主網前改成伺服器轉發（見「還沒做」）。
- Vercel CLI 在 `C:/Software/VercelCLI/node_modules/.bin/vercel`，已登入並連結專案。每次部署的專屬網址有 Vercel 登入保護，對外只用 idolca.trade。
- 網域 `idolca.trade` 接在 Vercel 專案上，`www.idolca.trade` 308 轉到主網域。`idolca.vercel.app` 上的頁面由 `src/proxy.ts` 308 轉到主網域，接口不轉：早期鑄造的 NFT 元數據網址（`/api/meta/...`）寫在鏈上，指向它。預覽部署回應 `X-Robots-Tag: noindex`。
- 改 `next.config.ts` 或執行環境相關的設定，本機跑過不算數：Vercel 和本機的 Node 載入行為不同，要在部署後馬上檢查鏈上接口。出事先 `vercel rollback`；回滾後新的部署不會自動上線，修好後要 `vercel promote`。
- 鏈上地址（程序、集合、平台錢包、測試 USDT）在 `src/lib/chain/devnet.json`，說明見 tech-stack.md「devnet 部署」。
- 合約在 WSL 的 `~/idolca-onchain` 編譯（`/mnt/c` 下會記憶體錯誤），要用 `anchor build --arch v0`；改了 `onchain/programs` 先複製過去。編譯後把 `target/idl`、`target/types` 複製回倉庫的 `onchain/target/` 和 `src/lib/chain/idl/`。
- 合約測試：WSL 裡沒有 Node，`anchor test` 跑不起來。在 WSL 開本地驗證節點（`solana-test-validator --reset --upgradeable-program <程序 id> <.so> <平台錢包> --clone-upgradeable-program CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d --url https://api.mainnet-beta.solana.com`），再在 Windows 的 `onchain/` 下跑 `ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=../.data/platform-devnet.json npx ts-mocha -p ./tsconfig.json -t 1000000 tests/idolca-market.ts`。每次重跑都要用全新的節點（`--reset`），Config 只能初始化一次。關節點用 `pkill -f "[s]olana-test-validator"`（不加方括號會連自己的 shell 一起結束）。
- `.data/` 不進倉庫，放金鑰、本機資料庫和一次性的除錯腳本。

## 開發約定

- **Next.js 16**：寫代碼前先讀 `node_modules/next/dist/docs/` 的對應指南。開了 Cache Components：讀請求資料的路由處理器先 `await connection()`，動態頁面內容包在 `Suspense` 裡。沒有 `.next` 時先 `npx next typegen` 再跑 `tsc`。
- **dev 伺服器**：開著時不要跑 `npm run build`（會覆寫 `.next`，頁面無限重載）；要驗證構建就先停 dev，構建後刪 `.next` 再重啟。頁面無限重載時同樣停 dev、刪 `.next`、重開。改了 `schema.ts` 要重啟 dev 才會執行新的建表語句。停 dev 時連 3000 埠上的 node 子程序一起結束。
- **測試資料不進日常資料庫**：端到端測試只對 `PGLITE_DIR=.data/pglite-e2e` 啟動的網站跑，不對日常開發庫或線上跑；跑的時候不要改 `src`（熱更新會打斷測試）。瀏覽器自動化只結束命令列帶 `remote-debugging-port` 的 Chrome，不動用戶自己的瀏覽器。
- **多語言**：先定英文和繁中，再一次翻成其他六種。單元測試會檢查八種語言的鍵和參數一致，以及程式碼裡寫死的每個鍵都存在。
- **用詞**：面向粉絲的文字照 tech-stack.md「首頁」的用詞表（數位珍藏、公開認證紀錄等）；後台保留技術用語。
- **不放假數據**：頁面數字只來自鏈上或自己的資料庫，沒有就不顯示。
- **多條寫入**：必須一起生效的寫入用 `atomic()`（`src/lib/server/db.ts`）。
- **提交**：用戶說 commit 時才提交，並推送到 `origin/main`；CI 跑 lint、型別檢查、單元測試和正式構建。

## 已知問題

- **線上還沒設收藏錢包的 App ID**：部署時把 `NEXT_PUBLIC_PRIVY_APP_ID` 設到 Vercel 的 Production。
- **線上還沒設金庫收件地址**：`NEXT_PUBLIC_VAULT_ADDRESS_YVR`、`NEXT_PUBLIC_VAULT_ADDRESS_CKG` 設到 Vercel 之前，寄進金庫的地址顯示「尚未公布」。
- **刷卡加值只做了程式**：主網上線前要在 Privy 的 Funding 頁開 card onramps；目標市場的韓元、台幣、日圓等要完成 Meld 的 KYB。入金服務不支援測試網，devnet 上測不了。
- **Privy 的 custom auth 要付費**：所以收藏錢包用驗證碼登入 Privy，換裝置或登入過期時多輸入一次驗證碼。開付費方案後可以改成我們發 JWT，免輸入。


- **測試環境和線上共用 devnet 鏈上資產**：本機、端到端測試和線上用同一個平台錢包、同兩個集合和同一個託管程序。
  - 本機和測試鑄的卡也在線上的集合裡，元數據網址指向線上，線上資料庫查不到，錢包裡顯示成沒名字、沒圖片。這些卡都在平台錢包和測試錢包裡，沒有進真實用戶的錢包。
  - 一邊賣掉的卡，另一邊的資料庫不知道；卡包的剩餘張數按鏈上狀態核過，所以只會顯示成已抽走，不會賣出去。
  - 要徹底分開，測試環境要有自己的平台錢包、一組集合，再部署一份託管程序（一份程序只有一個設定）。收藏集合裡的孤兒卡可以用集合的 PermanentTransferDelegate 收回再銷毀，金庫集合裡的平台動不了。
- **Vercel 預覽部署連的是正式資料庫**：資料庫變數同時設在 Production 和 Preview。非 main 的分支推上去會建預覽部署，有人打開時會在正式資料庫上跑建表語句。要改成 Neon 給每個預覽部署開分支，或從 Preview 拿掉資料庫變數。
- **用戶錢包連在主網時看不到 devnet 資產**：Phantom 要在開發者設定裡開測試網模式並選 Devnet，Solflare 在網路設定裡選 Devnet。README 的 Try it 寫了，登入框還沒有這個提示。
- **線上管理員是測試錢包**：要換成用戶自己的錢包（`ADMIN_WALLETS` 或 `npm run admin:grant`）。Vercel 上的舊變數 `ADMIN_TOKEN` 已不再使用，可以刪掉。
- **榜單數據**：讀 Circle Chart 網頁用的接口，正式營運前要換授權來源。
- **團體名錄**：122 個團體裡 64 個附成員，其餘只有團名。

## 還沒做

- Google 和 Apple 登入、換綁信箱、收藏錢包匯出私鑰（Privy 有 `useExportWallet`，還沒接）。
- 交易通知信：站內通知已有，暫不寄信（Resend 按量計費）。要寄時在 `notifications.ts` 的 `notify` 旁加寄信，用戶要能在帳號設定裡關掉。
- 專輯代購代拆。
- 瀏覽器端的 RPC 改走伺服器轉發（例如 `/api/rpc`）：伺服器帶著 key 轉給付費 RPC，只放行送交易、查狀態、取區塊這幾個網頁用得到的方法，按 IP 限流，key 不出現在網頁裡。Vercel 不能轉發 WebSocket，Privy 等交易確認的訂閱改成輪詢或繼續連公共端點。主網前要做。
- 主網部署，清單見 tech-stack.md「上線主網」。資金、定價、庫存和法務的待辦見 [business.md](business.md)。
