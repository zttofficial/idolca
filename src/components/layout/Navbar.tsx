import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LocaleSwitcher from "./LocaleSwitcher";
import WalletButton from "@/components/web3/WalletButton";

export default function Navbar() {
  const t = useTranslations("Nav");
  const links = [
    { href: "/#market", label: t("market") },
    { href: "/packs", label: t("packs") },
    { href: "/catalog", label: t("catalog") },
    { href: "/binder", label: t("binder") },
    { href: "/vault", label: t("vault") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="btn-primary grid h-8 w-8 place-items-center rounded-lg text-xs">IC</span>
          <span>Idolca</span>
        </Link>
        <ul className="hidden items-center gap-6 text-sm text-ink-2 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="transition hover:text-ink">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-3">
          <label className="hidden items-center rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink-3 xl:flex">
            <input
              type="search"
              placeholder={t("search")}
              className="w-56 bg-transparent text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </label>
          <LocaleSwitcher />
          <WalletButton />
        </div>
      </nav>
    </header>
  );
}
