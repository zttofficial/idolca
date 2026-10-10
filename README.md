# Idolca

K-pop 小卡鏈上倉儲交易平台：實物入庫鑑定，每張卡在 Solana 上對應一個 Metaplex Core NFT，以 USDT 結算，銷毀 NFT 即可提貨。

市場調研和競品分析見 [docs/research.md](docs/research.md)，技術選型見 [docs/tech-stack.md](docs/tech-stack.md)，命名方案見 [docs/naming.md](docs/naming.md)。

## 開發

```bash
npm install
cp .env.example .env.local   # 按註釋填寫；全部留空也能跑，頁面用展示資料
npm run dev     # http://localhost:3000
npm run build   # 生產構建
npm run lint
```

環境變數的含義見 [.env.example](.env.example)。各項留空時的表現：

| 變數 | 留空時 |
|---|---|
| `DATABASE_URL` | Vercel 接 Neon 時自動填入，帶前綴的 `xxx_DATABASE_URL` 也認得。本機開發自動用 PGlite，資料存在 `.data/`；線上環境沒配置時帳號功能顯示「未開通」 |
| `ADMIN_TOKEN` | 管理接口（標記假卡）關閉 |
| `PLATFORM_SECRET_KEY` 或 `PLATFORM_KEYPAIR` | 自由上鏈退回演示模式：不真的鑄造，NFT 地址是隨機字串 |
| `HELIUS_API_KEY` | 金庫頁用樣本卡資料（NFT 地址是 devnet 上真實鑄造的），不即時讀鏈上持有人 |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | 默認 devnet |

## 多語言

英文是默認語言（`/`），其他語言帶前綴：`/zh-Hant`、`/zh-Hans`、`/ja`、`/ko`、`/th`、`/id`、`/vi`。介面文字在 [messages/](messages/)，每種語言一個 JSON，鍵必須一致；新增文字時八個文件都要補。

## 卡樣圖片

樣本卡的藝人資料寫在 `src/lib/mock-cards.ts`，照片來自維基共享資源，CC BY 授權，不放在倉庫裡：`src/lib/sample-credits.json` 記著每張的來源網址、裁切位置、作者和授權，第一次顯示時由伺服器抓圖、裁切、加浮水印後存進資料庫（`media` 表）。網站的 `/credits` 頁公開署名；更換或新增照片時改這個檔案即可。

## 平台端鏈上腳本

需要在 `.env.local` 設定 `PLATFORM_KEYPAIR`（Solana CLI 格式的金鑰檔路徑，不要放進倉庫），錢包裡要有 SOL 付手續費。devnet 的地址和交易記在 `src/lib/chain/devnet.json`，說明見技術選型的「devnet 部署」。

```bash
# devnet 建置，三步都可以重複執行
npm run chain:setup-devnet     # 兩個集合 + 19 張樣本金庫卡
npm run chain:devnet-market    # 初始化託管程序、掛單、示範成交（要先部署程序，見下節）
npm run chain:devnet-history   # 從鏈上讀回每張卡的鑄造、掛單、成交紀錄

# 入庫鑑定通過後鑄造 NFT；卡片資料格式見 scripts/cards/IC-000128.json，估值低於 10 USDT 的卡會被拒絕
npm run chain:mint-card -- --card scripts/cards/IC-000128.json --owner <寄存人錢包> --uri https://.../IC-000128.json

# 提貨：request 由持有人簽名（腳本僅供 devnet 模擬），ship 寄出時解凍並銷毀，cancel 取消申請
npm run chain:redeem -- request --asset <NFT 地址> --owner-keypair <持有人金鑰檔>
npm run chain:redeem -- ship --asset <NFT 地址>
npm run chain:redeem -- cancel --asset <NFT 地址>
```

## 掛單託管程序

[onchain/](onchain/) 是獨立的 Anchor 工作區，有自己的依賴。需要 Rust、Solana CLI 和 Anchor 1.2.1，在 WSL 或 Linux 裡建置。在 WSL 裡要把工作區放在 Linux 檔案系統（例如 `~/idolca-onchain`）再編譯，直接在 `/mnt/c` 上編譯會因記憶體錯誤失敗。

```bash
cd onchain
npm install
anchor keys sync          # 生成程序地址並寫進 lib.rs 和 Anchor.toml
anchor build --arch v0    # devnet 還沒啟用 Anchor 1.2.1 預設的 SBF v3
anchor test               # 本地驗證節點會從主網複製 Metaplex Core 程序
solana program deploy target/deploy/idolca_market.so --program-id target/deploy/idolca_market-keypair.json --url devnet
```

程序地址預設從 `src/lib/chain/devnet.json` 讀取，也可以用 `NEXT_PUBLIC_MARKET_PROGRAM_ID` 覆蓋。

## 目錄

```
src/
  app/[locale]/           所有頁面都在語言段下
    page.tsx              首頁
    market/               市場頁：金庫卡和自由刊登兩個頁籤，搜尋、團體和成員、類型、價格、排序、分頁
    vault/                金庫頁：每張卡的 NFT 地址、持有人、狀態，可按狀態篩選和搜尋
    card/[id]/            金庫卡內頁：看卡、購買、鑑定報告、價格走勢、同款在售、鏈上紀錄、費用與保障
    listing/[id]/         自由刊登商品頁：賣家照片、價格、免責聲明、擔保交易流程
    packs/                盲盒卡包列表和卡包頁（機率、卡池、開包）
    catalog/              圖鑑：團體列表、團體卡款（標記有 / 想要）
    binder/               收藏冊：卡冊、收集進度、想要清單、上鏈、刊登
    charts/               專輯銷量榜看板（週榜、初動）
  app/api/                帳號（註冊、登入、登出、當前用戶）、收藏冊同步、自由上鏈與刊登、自由刊登列表、卡片照片、標記假卡（管理）
  i18n/                   next-intl 路由、導航、請求配置
  proxy.ts                語言前綴路由
  components/
    hero/                 首頁主視覺：3D 旋轉小卡（HoloCard3D）
    card/                 卡片內頁的看卡切換、購買面板、價格走勢圖
    packs/                卡包包裝、倒數、開包流程（撕包、翻卡、結果）
    binder/               圖鑑卡款、卡冊、上鏈對話框
    market/               市場瀏覽、金庫卡全息懸停卡（HoloTile）、自由刊登卡、照片圖庫
    vault/                金庫清單
    landing/              首頁說明區塊
    brand/                文字標誌
    layout/               導航列、語言選單、頁腳
    web3/                 帳號 Provider、USDT 價格、On Solana 徽章
  lib/
    server/               資料庫連線（Neon / PGlite）、表結構、密碼與會話、錢包簽名驗證、照片處理與浮水印、鏈上鑄造與標假卡
    solana/               網路與地址配置、瀏覽器錢包偵測與簽名登入、USDT 餘額、Helius DAS、掛單 PDA
    vault.ts              金庫資料：有 Helius 配置時讀鏈上集合，否則用展示資料
    card-detail.ts        卡片內頁的樣本資料：鑑定、成交、鏈上紀錄、同款在售、賣家
    packs.ts              盲盒卡包：卡池、按剩餘張數計算的機率、抽卡
    charts.ts             專輯銷量榜樣本數據
    market.ts             市場兩條線的篩選、排序、分頁和網址參數
    sources.ts            小卡來源分類
    catalog.ts            圖鑑：團體、成員、專輯、版本和卡款
    binder.ts             收藏冊資料（目前存在瀏覽器 localStorage）
    fx.ts                 當地貨幣參考價
    mock-cards.ts         19 張樣本卡（真實藝人和專輯，示意價格，隨機生成的地址）
    card-art.ts           canvas 生成的佔位卡面
messages/                 八種語言的介面文字
scripts/                  平台端 Metaplex Core 腳本：建集合、鑄造、提貨
onchain/                  Anchor 工作區：idolca-market 掛單託管程序和測試
docs/
  research.md             市場調研與競品分析
  tech-stack.md           技術選型
  naming.md               命名方案
```
