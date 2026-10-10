import { formatUsdt } from "@/lib/fx";

// USDT 價格
export default function UsdtPrice({ amount, className = "" }: { amount: number; className?: string }) {
  return <span className={`inline-flex items-baseline ${className}`}>{formatUsdt(amount)}</span>;
}
