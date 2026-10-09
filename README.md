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
  app/
    page.tsx              首頁
    vault/                金庫頁：每張卡的 NFT 地址、持有人、狀態
    card/[id]/            卡片詳情：鏈上資料、屬性、Solscan / Magic Eden / Tensor 連結
  components/
    hero/                 首頁主視覺：3D 旋轉小卡（HoloCard3D）
    market/               卡片列表、全息懸停卡（HoloTile）、鏈上成交跑馬燈
    landing/              首頁說明區塊
    layout/               導航列、頁腳
    web3/                 Privy 登入、錢包按鈕、USDT 價格、On Solana 徽章
  lib/
    solana/               網路與地址配置、USDT 餘額、Helius DAS、掛單 PDA
    vault.ts              金庫資料：有 Helius 配置時讀鏈上集合，否則用展示資料
    fx.ts                 當地貨幣參考價
    mock-cards.ts         展示資料（虛構團體和成員，隨機生成的地址）
    card-art.ts           canvas 生成的佔位卡面
scripts/                  平台端 Metaplex Core 腳本：建集合、鑄造、提貨
onchain/                  Anchor 工作區：idolca-market 掛單託管程序和測試
docs/
  tech-stack.md           技術選型
  naming.md               命名方案
```
