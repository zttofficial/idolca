# Idolca

K-pop 小卡鏈上倉儲交易平台：實物入庫鑑定，每張卡在 Solana 上對應一個 Metaplex Core NFT，以 USDT 結算，銷毀 NFT 即可提貨。

技術選型見 [docs/tech-stack.md](docs/tech-stack.md)，命名方案見 [docs/naming.md](docs/naming.md)。

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
| `NEXT_PUBLIC_PRIVY_APP_ID` | 「連接錢包」按鈕不可用 |
| `HELIUS_API_KEY`、`NEXT_PUBLIC_CARD_COLLECTION` | 金庫頁顯示展示資料，不讀鏈上集合 |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | 默認 devnet |

## 多語言

英文是默認語言（`/`），其他語言帶前綴：`/zh-Hant`、`/zh-Hans`、`/ja`、`/ko`、`/th`、`/id`、`/vi`。介面文字在 [messages/](messages/)，每種語言一個 JSON，鍵必須一致；新增文字時八個文件都要補。

## 卡樣圖片

樣本卡的藝人資料寫在 `src/lib/mock-cards.ts`，照片是 `public/cards/samples/c1.jpg` 到 `c8.jpg`，來自維基共享資源，CC BY 授權。作者和授權記在 `src/lib/sample-credits.json`，網站的 `/credits` 頁公開署名；更換或新增照片時要同步更新這個檔案。

## 平台端鏈上腳本

需要在 `.env.local` 設定 `PLATFORM_KEYPAIR`（Solana CLI 格式的金鑰檔路徑，不要放進倉庫），錢包裡要有 SOL 付手續費。

```bash
# 每個網路建一次集合，把輸出的地址填進 NEXT_PUBLIC_CARD_COLLECTION
npm run chain:create-collection -- --uri https://.../collection.json

# 入庫鑑定通過後鑄造 NFT；卡片資料格式見 scripts/cards/IC-000128.json，估值低於 10 USDT 的卡會被拒絕
npm run chain:mint-card -- --card scripts/cards/IC-000128.json --owner <寄存人錢包> --uri https://.../IC-000128.json

# 提貨：request 由持有人簽名（腳本僅供 devnet 模擬），ship 寄出時解凍並銷毀，cancel 取消申請
npm run chain:redeem -- request --asset <NFT 地址> --owner-keypair <持有人金鑰檔>
npm run chain:redeem -- ship --asset <NFT 地址>
npm run chain:redeem -- cancel --asset <NFT 地址>
```

## 掛單託管程序

[onchain/](onchain/) 是獨立的 Anchor 工作區，有自己的依賴。需要 Rust、Solana CLI 和 Anchor 1.2.1，建議在 WSL 或 Linux 裡建置：

```bash
cd onchain
npm install
anchor keys sync   # 生成程序地址並寫進 lib.rs 和 Anchor.toml
anchor build
anchor test        # 本地驗證節點會從主網複製 Metaplex Core 程序
```

部署後把程序地址填進 `NEXT_PUBLIC_MARKET_PROGRAM_ID`，金庫頁據此判斷哪些卡在掛單中。

## 目錄

```
src/
  app/[locale]/           所有頁面都在語言段下
    page.tsx              首頁
    vault/                金庫頁：每張卡的 NFT 地址、持有人、狀態
    card/[id]/            卡片內頁：看卡、購買、鑑定報告、價格走勢、同款在售、鏈上紀錄、費用與保障
    packs/                盲盒卡包列表和卡包頁（機率、卡池、開包）
  i18n/                   next-intl 路由、導航、請求配置
  proxy.ts                語言前綴路由
  components/
    hero/                 首頁主視覺：3D 旋轉小卡（HoloCard3D）
    card/                 卡片內頁的看卡切換、購買面板、價格走勢圖
    packs/                卡包包裝、倒數、開包流程（撕包、翻卡、結果）
    market/               卡片列表、全息懸停卡（HoloTile）、鏈上成交跑馬燈
    landing/              首頁說明區塊
    layout/               導航列、語言選單、頁腳
    web3/                 Privy 登入、錢包按鈕、USDT 價格、On Solana 徽章
  lib/
    solana/               網路與地址配置、USDT 餘額、Helius DAS、掛單 PDA
    vault.ts              金庫資料：有 Helius 配置時讀鏈上集合，否則用展示資料
    card-detail.ts        卡片內頁的樣本資料：鑑定、成交、鏈上紀錄、同款在售、賣家
    packs.ts              盲盒卡包：卡池、按剩餘張數計算的機率、抽卡
    fx.ts                 當地貨幣參考價
    mock-cards.ts         樣本卡（真實藝人和專輯，示意價格，隨機生成的地址）
    card-art.ts           canvas 生成的佔位卡面
messages/                 八種語言的介面文字
scripts/                  平台端 Metaplex Core 腳本：建集合、鑄造、提貨
onchain/                  Anchor 工作區：idolca-market 掛單託管程序和測試
docs/
  tech-stack.md           技術選型
  naming.md               命名方案
```
