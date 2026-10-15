# 第三方服務

Idolca 用到的外部服務：各自管什麼、帳號在哪、和代碼怎麼接、上主網要動什麼。金鑰不寫在這裡，線上的在 Vercel 環境變數，本機的在 `.env.local` 和 `.data/`。

## 網站運行

這些服務停了或設錯，線上就壞。

| 服務 | 管什麼 | 帳號和設定位置 | 和代碼的連接 | 上主網要做的 |
|---|---|---|---|---|
| [Cloudflare](https://dash.cloudflare.com) | 網域 `idolca.trade` 的註冊和 DNS | Cloudflare Registrar，2026-10-13 註冊，2027-10-13 到期 | DNS 指向 Vercel；Resend 的寄信記錄（SPF、DKIM）和 Google Search Console 的驗證 TXT 也在這裡 | 開自動續費 |
| [Vercel](https://vercel.com/ai-artist-projects/idolca) | 網站託管、自動部署、每日排程 | 團隊 `ai-artist-projects`，專案 `idolca`；本機 CLI 在 `C:/Software/VercelCLI` | 推送 main 自動部署；所有線上環境變數；排程在 `vercel.json`（每天 09:00 UTC 打 `/api/cron/daily`） | 換主網的環境變數（見 tech-stack.md「上線主網」） |
| [Neon](https://console.neon.tech) | 線上的 Postgres 資料庫 | 經 Vercel 的整合建立，在 Vercel 專案的 Storage 頁進入 | 變數前綴 `idolca_api_`，Production 和 Preview 共用 | 新建一個主網資料庫；Preview 改用 Neon 分支或拿掉資料庫變數 |
| [Helius](https://dashboard.helius.dev) | Solana RPC | 現在用 devnet 端點 | 只有伺服器用：`SOLANA_RPC_URL`（線上 Production、本機 `.env.local`）；瀏覽器經 `/api/rpc` 轉發 | 換主網端點、按用量升級方案；瀏覽器的 WebSocket 要用的 key 放在另一個 Helius 專案（見下方「Helius 的網域限制」） |
| [Privy](https://dashboard.privy.io) | 收藏錢包（嵌入式錢包）、刷卡加值 | 應用 `cmv7f33v0005i0gl28se4t7nm`，本機和線上同一個；Allowed origins 有 `https://idolca.trade` 和 `http://localhost:3000` | `NEXT_PUBLIC_PRIVY_APP_ID`（線上只設在 Production） | Funding 頁開 card onramps；韓元、台幣、日圓等要完成 Meld 的 KYB；要免輸入驗證碼得開付費方案（custom auth） |
| [Resend](https://resend.com) | 寄驗證信和重設密碼信 | 網域 `idolca.trade` 已驗證，寄件人 `noreply@idolca.trade` | `RESEND_API_KEY`（只能寄信的金鑰，只設在 Production） | 不用動；寄交易通知信時注意按量計費 |
| [PostHog](https://eu.posthog.com) | 產品分析 | 歐盟機房；專案設定開了 cookieless | `NEXT_PUBLIC_POSTHOG_KEY`（只設在 Production） | 不用動 |
| [GitHub](https://github.com/zttofficial/idolca) | 代碼倉庫、CI | `zttofficial/idolca`，私有，已分享給 hackathon@colosseum.com | CI 跑 lint、型別檢查、單元測試和構建 | 不用動 |

### Helius 的網域限制

Helius 後台的 Access Control（Allowed Domains）作用於整個專案的所有 key，而且沒帶 Origin 標頭的請求一律拒絕。伺服器轉發 RPC 時不帶 Origin，所以伺服器那把 key 所在的專案不能設 Allowed Domains，設了 `/api/rpc` 會整個回 `Forbidden`（2026-10-15 實測）。要給瀏覽器用的 key 加網域限制，就另開一個 Helius 專案或帳號放它。

## 鏈

| 服務 | 管什麼 | 帳號和設定位置 | 和代碼的連接 |
|---|---|---|---|
| Solana | 卡片 NFT、託管程序、USDT 和 USDC 付款 | 不用帳號；平台錢包金鑰在 `PLATFORM_SECRET_KEY`、`.data/platform-devnet.json` | 地址在 `src/lib/chain/<網路>.json`；交易在 [Solscan](https://solscan.io) 查 |
| Arc（Circle） | 用 USDC 付款的第二條通道 | 不用帳號；測試幣在 [faucet.circle.com](https://faucet.circle.com)，交易在 [explorer.arc.io](https://explorer.arc.io) 查 | `NEXT_PUBLIC_ARC_NETWORK`、`ARC_PLATFORM_KEY`，地址在 `src/lib/chain/arc-<網路>.json`（見 arc.md） |

## 搜尋引擎

| 服務 | 管什麼 | 設定 |
|---|---|---|
| [Google Search Console](https://search.google.com/search-console) | Google 的收錄和搜尋表現 | 用 Cloudflare DNS 的 TXT 記錄驗證網域；Google 靠站點地圖 `/sitemap.xml` |
| [Bing Webmaster Tools](https://www.bing.com/webmasters) | Bing 的收錄；IndexNow 的提交記錄 | IndexNow 金鑰檔是 `public/a7f39318d986b3ecc24a83211ea73056.txt`，代碼在 `src/lib/server/indexnow.ts`；Naver、Yandex 經 IndexNow 一起通知 |

## 官方社群帳號

[X](https://x.com/IdolcaOfficial)、[Telegram](https://t.me/IdolcaOfficial)、[YouTube](https://www.youtube.com/@IdolcaOfficial)，帳號名都是 `IdolcaOfficial`。網址在 `src/lib/social.ts`，頁尾和首頁結構化資料共用。

## 比賽和資助

- Colosseum Crypto World's Fair：主賽和 Superteam Canada track 都已提交。
- Arc Microgrants：在 [DoraHacks](https://dorahacks.io/hackathon/arc-microgrants) 上，見 arc.md。

## 數據來源（不用帳號）

- [Circle Chart](https://circlechart.kr)：專輯銷量榜，讀它網頁用的接口，正式營運前要換授權來源。
- [Wikidata](https://www.wikidata.org)：團體名錄的收錄依據（CC0）。

## 還沒開的帳號

- 刷卡加值的 Meld KYB（從 Privy 後台申請）。
- 物流：加拿大郵政 Solutions for Small Business、中國郵政協議客戶（e 郵寶、e 特快）、韻達月結（見 business.md）。
