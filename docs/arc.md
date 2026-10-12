# Arc 版本計劃

在 Arc 主網上部署一套 Idolca，參加 Circle 的 Arc Microgrants。只在 `arc-settlement` 分支上做；main 和線上的 Solana 版本不動。

## 參賽要求

| | |
|---|---|
| 活動 | [Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants)（DoraHacks） |
| 截止 | 2026-10-14 23:59（美東時間），10/21 前公布結果 |
| 獎勵 | 20 個名額，每個 500 USDC |
| 硬性條件 | 應用已經在 **Arc 主網**上線；曾經拿過 Circle 或 Arc 資助的項目不能參加 |

## 定位與敘事

- Idolca 支援多條鏈、多種穩定幣。**鏈和結算幣都是部署時的配置**，不寫死在代碼和文案裡。
- 每個司法管轄區決定收哪些穩定幣：Arc 版本用 USDC 結算；之後要加 USDT、EURC 或其他穩定幣，只改配置，合約和代碼都不用動。
- 參賽敘事：
  - 收藏品交易用受監管的美元穩定幣結算，可以在加拿大、美國這類只接受 USDC 的市場合規營運。
  - Arc 上 gas 也用 USDC 付，粉絲只需要持有一種資產；用 Circle Wallets 郵箱登入，連錢包擴充套件都不用裝。
- Arc 版本裡所有東西都在 Arc 上：卡片 NFT、掛單託管、付款和放款。不做 NFT 在 Solana、付款在 Arc 的混合方案，那樣用戶要開兩個錢包，金庫卡交易也做不到原子交換。

## 穩定幣配置

- 每份鏈配置（`src/lib/chain/<network>.json`）列出：
  - 可用的結算代幣：符號、地址、小數位。
  - 預設顯示幣種。
- 託管市場合約維護一份代幣白名單。掛單時賣家選定代幣，買家用同一種代幣付款。
- 前台和多語言文案不再寫「USDT」，改用 `{currency}` 參數，取自當前部署的預設幣種。目前 8 種語言各有 19 處要改。
- 資料庫的金額欄位（`priceUsdt` 等）語義改成「以美元穩定幣計的金額，6 位小數」。欄位名這次不改。

## Arc 網路

| | 值 |
|---|---|
| 主網鏈 ID | 5042 |
| 主網 RPC | `https://rpc.mainnet.arc.io` |
| USDC | `0x3600000000000000000000000000000000000000`（主網和測試網相同） |
| USDC 小數位 | 作為原生 gas 是 18 位，透過 ERC-20 介面是 6 位。合約和伺服器一律走 ERC-20 介面（6 位）；顯示 gas 餘額時要換算 10¹² 倍 |
| 測試幣 | Circle Faucet |

開工前要在 [docs.arc.io](https://docs.arc.io) 核對：測試網鏈 ID、RPC、瀏覽器網址；USDC 是否支援 EIP-2612 permit；Arc 上有沒有 USDT；Circle Wallets 用戶自控錢包是否已支援 Arc 主網，以及 Web SDK 的版本。

## 架構

### 鏈的選擇

- `NEXT_PUBLIC_CHAIN` 取 `solana` 或 `arc`；網路沿用現有變數（devnet/mainnet、testnet/mainnet）。
- 伺服器端抽出鏈適配器介面，Solana 的現有實作搬進 `src/lib/server/chains/solana/`，Arc 的實作放在 `src/lib/server/chains/arc/`。介面的方法對應現在的函數：
  - 鑄卡：`mintVaultNft`、`mintCollectorNft`
  - 鏈上狀態：`vaultState`
  - 組交易：`buildBuy`、`buildList`、`buildCancel`、`buildRedeemRequest`、`buildPayment`、`buildBuybackTx`
  - 對帳：`verifyPayment`
  - 平台動作：`payout`、`transferVaultNft`、`transferCollectorNft`、`shipRedemption`、`cancelRedemption`、`markFakeOnChain`、`burnCollectorNft`
  - 讀取：`balances`、`assetHistory`
- 前台的 `solscanUrl`、`shortAddress`、`CLUSTER` 改從適配器取，例如 `explorerUrl`、網路名稱。

### 錢包與登入

用戶在登入框裡二選一，兩種錢包可以並存，帳號都落在同一張 `users` 表裡。

- **自己的錢包**：
  - 用 EIP-6963 偵測瀏覽器裡的 EVM 錢包（MetaMask、Rabby、Coinbase Wallet 等），延續現在 Wallet Standard 的做法。
  - 登入用 SIWE（EIP-4361）訊息加 `personal_sign`，伺服器用 viem 的 `verifyMessage` 驗簽。nonce 流程和 `login_nonces` 表沿用。
- **Circle Wallets**（用戶自控錢包）：
  - 用郵箱或 Google 登入後，Circle 為用戶開一個 Arc 上的錢包，私鑰由用戶設的 PIN 保護，平台拿不到。
  - 前台用 Circle 的 Web SDK 處理登入和 PIN；伺服器用 Circle 的 API 金鑰建立用戶、查錢包地址。
  - 不用裝任何擴充套件，粉絲第一次就能直接買。
  - 現有郵箱密碼帳號可以在帳號選單裡開一個 Circle 錢包並綁定。之後上鏈卡鑄進這個錢包，不再放平台代管錢包。
- 地址一律存成 EIP-55 校驗格式。`addressBytes` 按鏈分開驗證格式。

### 交易流程

- 維持「伺服器組交易、錢包簽名送出、伺服器確認」的流程，伺服器回傳一串呼叫 `{to, data}`（例如先 `approve`、再 `buy`）。
- 自己的錢包：前台依序用 `eth_sendTransaction` 送出，回報最後一筆的交易哈希。
- Circle Wallets：伺服器用 Circle API 為這串呼叫建立合約執行請求，拿到 challenge；前台交給 Web SDK，用戶輸入 PIN 確認後由 Circle 送出，伺服器再查交易哈希。
- 伺服器用交易回執（receipt）的事件對帳，取代 Solana 的 Memo。

## 合約

用 Solidity、OpenZeppelin、Foundry 開發。Foundry 裝在 `C:\Software\Foundry`，原始碼放在 `onchain-evm/`。

| 合約 | 職責 | 對應 Solana |
|---|---|---|
| `IdolcaCards`（ERC-721，部署兩份：金庫卡、收藏卡） | 平台鑄造；平台可凍結（假卡、提貨中）；收藏卡由平台代轉（擔保交易成交）；持有人呼叫 `requestRedeem(tokenId, token, fee)` 凍結卡片並付運費；平台 `ship` 銷毀、`cancelRedeem` 解凍；`tokenURI` 指向 `/api/meta/card/{id}` 和 `/api/meta/item/{id}` | Metaplex Core 的兩個集合、PermanentFreezeDelegate、PermanentTransferDelegate、BurnDelegate |
| `IdolcaMarket` | 金庫卡掛單託管：`list`（卡轉進合約）、`buy`（代幣付給賣家，同時扣平台抽成，抽成上限 10%，卡轉給買家）、`cancel`；代幣白名單；抽成收款地址 | Anchor 託管程序 |
| `IdolcaPayments` | `pay(token, amount, ref)`：把款項轉進平台收款地址並發出 `Paid(ref, payer, token, amount)` 事件；開卡包、擔保交易都用它；平台簽 EIP-712 報價後，持有人可以呼叫 `sellBack` 即時回購 | 轉帳加 Memo、回購的雙簽交易 |

- 合約要有 Foundry 單元測試，覆蓋每個函數的正常路徑和權限檢查。
- 部署腳本把地址寫進 `src/lib/chain/arc-testnet.json` 和 `arc-mainnet.json`。

## 範圍

**必須上線（參賽門檻）**

- 三個合約部署到 Arc 測試網和主網。
- 登入和綁定：自己的 EVM 錢包、Circle Wallets 兩種都要支援。
- 後台入庫，鑄造金庫卡。
- 金庫卡掛單、購買、取消，金庫頁和卡片頁顯示鏈上即時狀態。
- 開卡包：付款、對帳、把抽到的卡轉給買家。
- 文案改成按配置顯示幣種；區塊瀏覽器連結指向 Arc。
- 新建一個 Vercel 專案和一個 Neon 資料庫，部署 Arc 版本。

**時間夠再做**

- 提貨（凍結、付運費、出貨銷毀、取消）。
- 即時回購。
- 自由上鏈和擔保交易。
- 標記假卡。
- 卡片頁的鏈上紀錄（從合約事件讀取）。

**這次不做**

- 透過 CCTP、Gateway 接收其他鏈的 USDC。
- 資料庫欄位改名。
- 合併回 main。

## 時程

| 日期 | 工作 |
|---|---|
| 10/12 | 安裝 Foundry；寫三個合約和測試，部署到 Arc 測試網；搭好鏈適配器的骨架；完成 EVM 錢包登入 |
| 10/13 | 實作 Arc 適配器的必做範圍；接上 Circle Wallets；兩種錢包都在測試網上跑端到端流程；改文案 |
| 10/14 | 部署合約到 Arc 主網；Vercel 上線；入庫真實卡片；寫參賽說明並提交（美東 23:59 前） |

## 需要用戶準備

- **Arc 主網錢包和約 20 USDC**：
  - 平台錢包和抽成收款錢包各一個。平台錢包放約 20 USDC，夠付部署、鑄卡的 gas 和幾次自買自賣的測試。
  - 測試購買的貨款會回到自己的錢包，只有 gas 是真正花掉的。
  - USDC 的來源：從支援 Arc 網路的交易所直接提到 Arc（Backpack 已支援）；或者先提到 Base、Solana 等鏈，再用 CCTP 跨到 Arc。
- **測試網 USDC**：從 Circle Faucet 領。
- **Circle 開發者帳號**：在 Circle Developer Console 開用戶自控錢包的 App，給一份測試網和一份主網的 API 金鑰、App ID；用 Google 登入還要一個 Google OAuth Client ID。
- **主網要上架的實物卡**：只用真實存在的卡，延續不放假數據的原則。
- **DoraHacks 帳號，以及代碼怎麼給評委看**：倉庫目前是私有的，要確認活動是否接受私有倉庫，或者把 Arc 分支公開。

## 參賽說明要點

- 產品原型最早在 Solana devnet 上做，參加了 Colosseum Crypto World's Fair。
- 這次在 Arc 上做的工作：三個合約、EVM 錢包和 Circle Wallets 兩種登入、鏈適配器，以及按司法管轄區配置結算幣種的設計。
- 選 Arc 的理由照「定位與敘事」寫，再加一點：Arc 的定位就是支付和機構結算，跟實物資產代幣化很合得來。
