import { formatPrice } from "@/lib/fx";

// 價格，幣種見 src/lib/fx.ts 的 CURRENCY
export default function Price({ amount, className = "" }: { amount: number; className?: string }) {
  return <span className={`inline-flex items-baseline ${className}`}>{formatPrice(amount)}</span>;
}
