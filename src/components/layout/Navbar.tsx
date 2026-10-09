import Link from "next/link";
import WalletButton from "@/components/web3/WalletButton";

const LINKS = [
  { href: "/#market", label: "市場" },
  { href: "/vault", label: "金庫" },
  { href: "/#how", label: "怎麼運作" },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-background/60 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="btn-holo grid h-8 w-8 place-items-center rounded-lg text-xs">IC</span>
          <span>Idolca</span>
        </Link>
        <ul className="hidden items-center gap-6 text-sm text-white/60 md:flex">
          {LINKS.map((l) => (
            <li key={l.label}>
              <Link href={l.href} className="transition hover:text-white">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-3">
          <label className="hidden items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/40 lg:flex">
            <input
              type="search"
              placeholder="搜尋團體、成員、專輯"
              className="w-56 bg-transparent text-white placeholder:text-white/35 focus:outline-none"
            />
          </label>
          <WalletButton />
        </div>
      </nav>
    </header>
  );
}
