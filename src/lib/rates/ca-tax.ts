// 加拿大的 GST/HST 稅率，按省和地區（加拿大郵政的省份代碼），提貨運費加稅用；規則和計算見 src/lib/shipping.ts 的 redeemTaxRate、redeemCharge。
//
// 來源：加拿大稅務局（CRA）〈GST/HST provincial rates table〉“On or after April 1, 2025” 一欄
// https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html
// （頁面更新於 2025-04-01，2026-10-14 查詢）。五個 HST 省份收合併稅率，其他省和地區只收 5% 的 GST。
// 只收這個聯邦稅：省銷售稅（BC、薩斯喀徹溫、曼尼托巴的 PST，魁北克的 QST）不在這裡。BC 的 PST 不課與買賣無關的寄送服務
// （BC 財政部 Bulletin PST 302〈Delivery Charges〉2026-04 修訂版 “Delivery Without a Sale or Lease of Goods”）；其他省的省稅見 docs/business.md。
// CRA 調整稅率時改這裡。

export const CA_GST_HST: Readonly<Record<string, number>> = {
  AB: 0.05,
  BC: 0.05,
  MB: 0.05,
  NB: 0.15,
  NL: 0.15,
  NS: 0.14,
  NT: 0.05,
  NU: 0.05,
  ON: 0.13,
  PE: 0.15,
  QC: 0.05,
  SK: 0.05,
  YT: 0.05,
};
