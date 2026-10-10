// 收藏品的顯示標題：賣家沒取標題時用團體、成員和版本組成。伺服器和瀏覽器都會用到，所以不放在 "use client" 模組裡
export const itemTitle = (i: { title: string | null; group: string; member: string; version: string | null }) =>
  i.title || [i.group, i.member, i.version].filter(Boolean).join(" ");
