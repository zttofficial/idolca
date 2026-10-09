export default function OnSolanaBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur ${className}`}
    >
      <svg viewBox="0 0 16 12" className="h-2 w-2.5" aria-hidden>
        <defs>
          <linearGradient id="sol-grad" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="#9945ff" />
            <stop offset="1" stopColor="#14f195" />
          </linearGradient>
        </defs>
        <path fill="url(#sol-grad)" d="M3 0h13l-3 3H0zM0 4.5h13l3 3H3zM3 9h13l-3 3H0z" />
      </svg>
      On Solana
    </span>
  );
}
