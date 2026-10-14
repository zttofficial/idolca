# Arc 結算通道

用 Arc 參加 Circle 的 Arc Microgrants。分工是**卡片留在 Solana，錢在 Arc 結算**：在現有的 Solana 付款之外，加一條「用 Arc 上的 USDC 付款」的通道。只在 `arc-settlement` 分支上，main 和線上不動。

## 參賽要求

| | |
|---|---|
| 活動 | [Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants)（DoraHacks） |
| 截止 | 2026-10-14 23:59（美東時間），10/21 前公布結果 |
| 獎勵 | 20 個名額，每個 500 USDC |
| 硬性條件 | 應用已經在 **Arc 主網**上線；曾經拿過 Circle 或 Arc 資助的項目不能參加 |

## 定位與敘事

- **兩條鏈各做擅長的事**：
  - Solana 是交易層：卡片 NFT、金庫卡的原子交換、外部市場的流動性。
  - Arc 是結算層：粉絲付款、退款，平台收入落在這裡。
- **Arc 帶來 Solana 給不了的**：
  - 粉絲付款只要在錢包裡簽一個名：不用準備 gas 幣，也不付手續費（平台代付，每筆不到 1 美分）。
  - 合規結算：錢落在受監管的穩定幣發行方自己的鏈上。
- **限制**：Arc 只解決付款。抽到的卡在 Solana 上，收卡仍然要一個 Solana 錢包；郵箱用戶可以在 Idolca 建收藏錢包（Privy，見 tech-stack.md）。
- **穩定幣按司法管轄區配置**：Arc 通道收 USDC；之後要收別的穩定幣，加進設定就行。
- **對評委的一句話**：收藏品留在流動性最好的鏈上交易，錢在 Arc 上合規結算，粉絲付款只要簽個名。

## 哪些流程走 Arc

價格一律標 USD，付款時才選用哪種方式、扣哪種穩定幣（Solana 上的 USDT、USDC 或 Arc 上的 USDC，1:1）。

| 流程 | Arc 通道 | 說明 |
|---|---|---|
| 開卡包 | 支援 | 在 Arc 上付款，卡在 Solana 上交付；卡池不夠時，沒交付的部分在 Arc 上退回付款地址 |
| 自由刊登的擔保交易 | 支援 | 買家在 Arc 上付款，退款退回付款地址；放款給賣家在 Solana 上，用 USDC |
| 金庫卡掛單成交 | 不支援 | 卡和錢在同一筆 Solana 交易裡原子交換 |
| 提貨運費、即時回購 | 不支援 | 和凍結、轉移 NFT 綁在同一筆 Solana 交易裡 |

## 設計

### 付款方式：USDC 授權轉帳（EIP-3009），不寫合約

Arc 上的 USDC 原生支援 EIP-3009 的 `transferWithAuthorization`（主網、測試網都查過）。付款流程：

1. 建單時伺服器給出要簽的授權：收款人是平台錢包、金額、30 分鐘有效期，nonce 是訂單編號的雜湊（一張訂單只能付一次）。
2. 買家在 EVM 錢包裡簽 EIP-712 訊息。只是簽名，不發交易。
3. 伺服器逐項核對後，用平台熱錢包把授權送上鏈，再從回執確認 USDC 進了平台錢包、這個 nonce 已經用掉。
4. 重複回報時（例如送出後連線中斷），從最近的區塊找出用掉這個 nonce 的交易照樣對帳，不會重複扣款。

和自寫收款合約相比，少了一份要審計的合約，也省掉 `approve` 那一步。買家只簽一次名，不付手續費。

### 抽卡公平性

開卡包的隨機數照舊是 `HMAC-SHA256(種子, 付款證明:序號)`。付款證明要是買家產生、平台事先算不出來的值：

- Solana 付款：付款交易的簽名。
- Arc 付款：買家對授權的簽名。Arc 上的交易是平台送出的，平台可以反覆試不同的交易哈希，所以不能用交易哈希。

`/api/packs/[id]/draws` 每一抽都列出 `rail`、`payTx` 和 `proof`，任何人都能重算。

### 代碼

| | 位置 |
|---|---|
| 公開設定（網路、USDC、平台收款地址、EIP-712 內容） | `src/lib/arc.ts`，平台地址在 `src/lib/chain/arc-testnet.json`、`arc-mainnet.json` |
| 發出授權、送上鏈對帳、退款 | `src/lib/server/arc-pay.ts`；開通檢查在 `arc-gate.ts` |
| 訂單的收款通道 | `orders`、`pack_orders` 表的 `rail`、`payer`（Arc 付款地址），`pack_orders.pay_proof`（抽卡用的付款證明） |
| 開卡包、擔保交易 | `src/lib/server/packs.ts`、`orders.ts`，建單時帶 `rail: "arc"` |
| 瀏覽器 EVM 錢包（EIP-6963 偵測、切到 Arc、簽授權） | `src/lib/evm/arc-wallet.ts` |
| 付款方式面板 | `src/components/pay/PaymentPicker.tsx`：開卡包、擔保交易、金庫卡購買都只有一顆購買按鈕，按下後在面板裡選 Solana 錢包、Arc 上的 USDC，或信用卡（先佔位，顯示「即將推出」）；不適用的方式顯示原因，例如金庫卡成交只能用 Solana 錢包 |
| 測試 | `tests/arc.test.ts`（EIP-712 網域和鏈上一致）、`e2e/arc.mjs`（`npm run test:e2e:arc`，測試網真實交易） |

### 環境變數

- `NEXT_PUBLIC_ARC_NETWORK`：`testnet` 或 `mainnet`，留空時只有 Solana 付款。
- `ARC_PLATFORM_KEY`：平台熱錢包私鑰，代送授權、付手續費、退款；本機可以用 `ARC_PLATFORM_KEYFILE` 指向金鑰檔。地址必須和 `arc-<網路>.json` 的 `platform` 一致，否則通道不開通。
- `ARC_PAY_ADMIN_ONLY=1`：只有管理員能用 Arc 付款。
- `ARC_RPC_URL`：伺服器端 RPC，留空用官方公共端點。

## Arc 網路

| | 主網 | 測試網 |
|---|---|---|
| 鏈 ID | 5042 | 5042002 |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| 區塊瀏覽器 | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` |
| USDC | `0x3600000000000000000000000000000000000000`，ERC-20 介面 6 位小數；作為 gas 是 18 位 | 同左 |
| 測試幣 | — | <https://faucet.circle.com> |

出塊約 0.5 秒。手續費每筆不到 0.01 USDC。

## 現況

- **線上**：<https://idolca.trade> 接 Arc 主網、只限管理員付款（`ARC_PAY_ADMIN_ONLY=1`）。卡片那邊還是 Solana devnet。
- **主網平台錢包**：`0x7a6c4D22fb05f715Cc47F4feC38d615a9369eF32`，私鑰在本機 `.data/arc-platform-mainnet.json` 和 Vercel 的 `ARC_PLATFORM_KEY`。
- **體驗包**：正式站的 Idolca Trial Pack（`/packs/idolca-trial`），每包 0.01 USD，三張平台自有的 ITZY 卡，用樣本照片。
- **第一筆主網付款**：[`0x800ef7da…6b9ee`](https://explorer.arc.io/tx/0x800ef7da983f4407793c335f7097b31dc5f06090afdbd39b3bc1f3221316b9ee)。這是一筆 0.01 USDC 的授權轉帳，由平台代送，gas 約 0.0017 USDC；抽到的 IC-001891 交付到 Solana。
- **測試**：測試網端到端（`npm run test:e2e:arc`）和原有的金庫測試都通過。

## 之後

- **Circle Wallets**：Circle 的用戶自控錢包同時支援 Arc 和 Solana，同一個用戶可以各開一個。郵箱或 Google 登入後，Solana 錢包收卡、Arc 錢包付款，粉絲完全感覺不到兩條鏈。
- **賣家在 Arc 上收款**：賣家填 Arc 收款地址，擔保交易的貨款在 Arc 上放款。
- **CCTP**：接收其他鏈的 USDC，在 Arc 上結算。
- **跨鏈的實物卡登記表**：每張實物卡的金庫編號、照片指紋、評級、目前由哪條鏈上的哪個代幣代表，登記在 Arc 上的公開登記表裡，同一張卡就不會在不同的鏈或平台上重複被代表。
