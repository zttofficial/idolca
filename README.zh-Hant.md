# Idolca

K-pop 小卡鏈上倉儲交易平台：實物入庫鑑定，每張卡在 Solana 上對應一個 Metaplex Core NFT，以 USDT 結算，銷毀 NFT 即可提貨。

English: [README.md](README.md)

市場調研和競品分析見 [docs/research.md](docs/research.md)，技術選型和各功能的規則見 [docs/tech-stack.md](docs/tech-stack.md)，命名方案見 [docs/naming.md](docs/naming.md)。

## 開發

```bash
npm install
cp .env.example .env.local   # 按註釋填寫
npm run dev     # http://localhost:3000
npm run lint
npm test        # 單元測試
npm run build   # 正式構建（先停掉 dev，構建完刪掉 .next 再重開 dev）
```

環境變數的含義見 [.env.example](.env.example)。各項留空時的表現：

| 變數 | 留空時 |
|---|---|
| `NEXT_PUBLIC_SOLANA_CLUSTER` | devnet |
| `DATABASE_URL` | Vercel 接 Neon 時自動填入，帶前綴的 `xxx_DATABASE_URL` 也認得。本機開發自動用 PGlite，資料存在 `.data/`；線上環境沒配置時帳號功能顯示「未開通」 |
| `PLATFORM_SECRET_KEY` 或 `PLATFORM_KEYPAIR` | 不鑄造、不收付款：自由上鏈、入庫、交易都不可用 |
| `ADMIN_WALLETS` | 只有資料庫裡授予了 admin 的帳號能進後台 |
| `CRON_SECRET` | 每日排程關閉，逾時訂單只在用戶打開訂單列表時處理，地址和會話不會自動清除 |

devnet 的資料庫第一次連線時會寫入 19 張樣本金庫卡（已在 devnet 鑄造）；主網的金庫從空的開始，由後台入庫。

## 後台

`/admin` 只給管理員帳號：錢包地址寫進 `ADMIN_WALLETS`，或用腳本在資料庫裡授予（郵箱帳號只能這樣）：

```bash
npm run admin:grant -- you@example.com     # 或錢包地址；加 --revoke 撤銷
```

腳本讀 `DATABASE_URL`；沒有時改本機 PGlite，要先停掉 dev。

## 測試

- `npm test`：單元測試（卡包機率、抽卡公平性、收件地址驗證、八種語言的文字一致）。
- 端到端測試對著跑起來的網站和 devnet 執行，每次都是真實交易，會消耗平台錢包的 SOL，也會入庫測試卡、建測試卡包。網站要用獨立的測試資料庫啟動（`PGLITE_DIR=.data/pglite-e2e npm run dev`），不要對著日常開發的資料庫或線上環境跑。管理員錢包金鑰檔用 `E2E_ADMIN_KEYPAIR` 指定（預設 `.data/admin-test-devnet.json`），地址要在網站的 `ADMIN_WALLETS` 裡。

```bash
PGLITE_DIR=.data/pglite-e2e npm run dev   # 另開一個終端
npm run test:e2e:vault     # 入庫、卡包、公平性核對、回購、提貨和取消、收藏卡轉金庫卡
npm run test:e2e:ui        # 無頭 Chrome 點完主要流程並截圖（CHROME_PATH 指定 Chrome）
# 擔保交易要用縮短的期限啟動網站：
#   PGLITE_DIR=.data/pglite-e2e ESCROW_SHIP_DAYS=0.0003 ESCROW_CONFIRM_DAYS=0.0003 CRON_SECRET=testcron npm run dev
E2E_CRON_SECRET=testcron npm run test:e2e:escrow
```

## 多語言

英文是默認語言（`/`），其他語言帶前綴：`/zh-Hant`、`/zh-Hans`、`/ja`、`/ko`、`/th`、`/id`、`/vi`。介面文字在 [messages/](messages/)，每種語言一個 JSON，鍵和參數必須一致（單元測試會檢查）；新增文字時八個文件都要補。服務條款和隱私權政策只有英文版。

## 樣本卡照片

devnet 樣本卡的照片來自維基共享資源，CC BY 授權，不放在倉庫裡：`src/lib/sample-credits.json` 記著每張的來源網址、裁切位置、作者和授權，第一次顯示時由伺服器抓圖、裁切、加浮水印後存進資料庫（`media` 表）。`/credits` 頁公開署名金庫卡實際用到的照片。

## 鏈上建置

需要在 `.env.local` 設定 `NEXT_PUBLIC_SOLANA_CLUSTER` 和 `PLATFORM_KEYPAIR`（Solana CLI 格式的金鑰檔路徑，不要放進倉庫），錢包裡要有 SOL 付手續費。地址寫進 `src/lib/chain/<cluster>.json`（公開資訊，提交進倉庫），都可以重複執行：

```bash
npm run chain:setup            # 建金庫卡集合和收藏卡集合
npm run chain:setup-market     # 初始化託管程序（要先部署程序，見下節）；主網要設 TREASURY_ADDRESS
```

上線主網的完整步驟見技術選型的「上線主網」。

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

## 目錄

```
src/
  app/[locale]/           所有頁面都在語言段下
    page.tsx              首頁
    market/               市場頁：金庫卡和自由刊登兩個頁籤，搜尋、團體和成員、類型、價格、排序、分頁
    vault/                金庫頁：每張卡的 NFT 地址、持有人、狀態，可按狀態篩選和搜尋
    card/[id]/            金庫卡內頁：看卡、用錢包購買／掛單／申請提貨、卡片資訊、即時鏈上紀錄
    listing/[id]/         自由刊登商品頁：賣家照片、價格、免責聲明、擔保交易購買
    packs/                盲盒卡包列表和卡包頁（機率、卡池、開包、公平性核對）
    catalog/              圖鑑：團體列表、團體卡款（標記有 / 想要）
    binder/               收藏冊：卡冊、鏈上卡、擔保交易訂單、收集進度、想要清單、上鏈、刊登、寄進金庫
    charts/               Circle Chart 週專輯榜前 10 名
    admin/                後台：入庫、卡包、擔保交易、提貨、收藏卡轉金庫卡、假卡（管理員帳號）
    terms/ privacy/       服務條款、隱私權政策
    credits/              圖片署名
  app/api/                帳號、收藏冊、自由上鏈與刊登、寄進金庫、擔保訂單、卡包與回購、金庫卡交易與提貨、鏈上狀態與測試幣、照片、NFT 元數據、後台、每日排程
  i18n/                   next-intl 路由、導航、請求配置
  proxy.ts                語言前綴路由
  components/
    hero/                 首頁主視覺：3D 旋轉小卡（HoloCard3D）
    card/                 卡片內頁的看卡切換、購買面板、提貨表單、鏈上紀錄
    packs/                卡包包裝、倒數、開包流程（撕包、翻卡、結果）
    binder/               圖鑑卡款、可翻頁的活頁卡冊（BinderBook）、上鏈對話框
    market/               市場瀏覽、金庫卡全息懸停卡（HoloTile）、自由刊登卡、照片圖庫
    admin/                後台各區塊：入庫、卡包管理、收藏卡轉金庫卡
    legal/                條款頁版面
    vault/                金庫清單
    landing/              首頁說明區塊
    brand/                文字標誌
    layout/               導航列、語言選單、頁腳
    web3/                 帳號 Provider、USDT 價格、On Solana 徽章
  lib/
    server/               資料庫連線和表結構、帳號與權限、頻率限制、照片處理、鏈上鑄造與銷毀、金庫卡、金庫卡交易與提貨、收付款對帳、擔保訂單、卡包與抽卡、devnet 初始金庫
    solana/               網路與地址配置、瀏覽器錢包偵測、簽名登入、簽名送出交易
    chain.ts              按網路讀 chain/<cluster>.json 的鏈上地址
    chain/                devnet 和主網的地址、託管程序 IDL
    cards.ts              金庫卡的資料型別
    packs.ts              卡包：機率、期望價值、抽卡排序
    pack-draw.ts          抽卡公平性計算（伺服器抽卡和公開核對共用）
    policy.ts             平台規則的數字（抽成、擔保期限、地址保留天數）
    shipping.ts           提貨收件地址驗證和運費
    market.ts             市場兩條線的篩選、排序、分頁和網址參數
    chain-client.ts       瀏覽器端的金庫卡、鏈上即時狀態、錢包餘額、交易流程
    catalog.ts            圖鑑：團體、成員、專輯、版本和卡款
    binder.ts             收藏冊資料
    items.ts              我自由上鏈的卡
    card-art.ts           canvas 生成的佔位卡面
messages/                 八種語言的介面文字
scripts/                  平台端腳本：建集合、授予管理員
onchain/                  Anchor 工作區：idolca-market 掛單託管程序和測試
tests/                    單元測試
e2e/                      端到端測試和瀏覽器測試錢包
docs/
  research.md             市場調研與競品分析
  tech-stack.md           技術選型
  naming.md               命名方案
```
