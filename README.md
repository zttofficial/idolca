# PocaVault

K-pop 小卡倉儲交易平台：實物入庫、即時轉手、隨時提貨。

## 開發

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # 生產構建
npm run lint
```

## 目錄

```
src/
  app/                  頁面、全域樣式
  components/
    hero/               首頁主視覺：3D 旋轉小卡（HoloCard3D）
    market/             卡片列表、全息懸停卡（HoloTile）、成交跑馬燈
    landing/            首頁說明區塊
    layout/             導航列
  lib/
    mock-cards.ts       假資料（虛構團體和成員）
    card-art.ts         canvas 生成的佔位卡面
docs/
  tech-stack.md         技術選型
```

技術選型和後續規劃見 [docs/tech-stack.md](docs/tech-stack.md)。
