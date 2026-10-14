// 擔保交易的期限（伺服器和測試共用）

const DAY = 86_400_000;

// 賣家的寄出期限：從付款和買家填好收件地址兩者較晚的時間起算 shipDays 天。
// 還沒付款或買家還沒填地址時沒有期限：賣家不知道寄到哪，不能讓他因此逾時被退款
export function shipDeadline(paidAt: Date | null, addressAt: Date | null, shipDays: number): Date | null {
  if (!paidAt || !addressAt) return null;
  return new Date(Math.max(paidAt.getTime(), addressAt.getTime()) + shipDays * DAY);
}

// 買家填地址的期限：付款後 addressDays 天。已經填了、或還沒付款時沒有期限；過了期限還沒填，訂單自動取消並退款
export function addressDeadline(paidAt: Date | null, addressAt: Date | null, addressDays: number): Date | null {
  if (!paidAt || addressAt) return null;
  return new Date(paidAt.getTime() + addressDays * DAY);
}

// 付款後過了幾天還沒填地址，就提醒買家一次（拍賣得標的訂單要買家自己補填）
export const ADDRESS_REMIND_DAYS = 2;
export const needsAddressReminder = (paidAt: Date | null, addressAt: Date | null, now: number) => Boolean(paidAt && !addressAt && now - paidAt.getTime() >= ADDRESS_REMIND_DAYS * DAY);
