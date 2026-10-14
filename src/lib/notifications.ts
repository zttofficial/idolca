// 站內通知的種類和顯示資料，伺服器和瀏覽器共用。文字在 messages 的 Notifications.kind_*，參數是卡名、金額和寄出期限
export const NOTIFICATION_KINDS = [
  "bid_received",
  "outbid",
  "auction_won_free",
  "auction_won_vault",
  "auction_sold_free",
  "auction_sold_vault",
  "auction_unsold",
  "auction_lost",
  "order_paid",
  "vault_sold",
  "order_shipped",
  "order_completed",
  "order_completed_held",
  "order_refunded",
  "order_refunded_seller",
  "order_disputed",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// price 是 USD
export type NotificationParams = { card: string; price?: number };

export type NotificationView = { id: string; kind: NotificationKind; params: NotificationParams; href: string; read: boolean; at: string };
