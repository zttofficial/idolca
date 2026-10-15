// 郵資表的報價來源，運費表頁（/shipping）列出來給粉絲查證。kind 決定頁面上的分類標籤，name 是出處名稱（專有名詞不翻譯）
export type RateSource = { kind: "postage" | "surcharge" | "packing" | "fx"; name: string; url: string };
