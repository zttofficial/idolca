"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_NAMES, routing, type Locale } from "@/i18n/routing";

export default function LocaleSwitcher() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t("language")}</span>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-3" aria-hidden>
        <path
          fill="currentColor"
          d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm5.9 7.75h-2.6a13 13 0 0 0-1.2-5.1 7 7 0 0 1 3.8 5.1ZM10 3.1c.8 1 1.6 3.1 1.8 6.15H8.2C8.4 6.2 9.2 4.1 10 3.1ZM7.9 4.15a13 13 0 0 0-1.2 5.1H4.1a7 7 0 0 1 3.8-5.1ZM4.1 10.75h2.6a13 13 0 0 0 1.2 5.1 7 7 0 0 1-3.8-5.1Zm5.9 6.15c-.8-1-1.6-3.1-1.8-6.15h3.6c-.2 3.05-1 5.15-1.8 6.15Zm2.1-1.05a13 13 0 0 0 1.2-5.1h2.6a7 7 0 0 1-3.8 5.1Z"
        />
      </svg>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Locale;
          startTransition(() => {
            // pathname 不帶語言前綴（如 /card/c1），換語言時留在同一頁
            router.replace(pathname, { locale: next });
          });
        }}
        className="appearance-none rounded-full border border-line bg-surface py-1.5 pr-3 pl-7 text-xs text-ink transition hover:bg-surface-3 focus:outline-none"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l} className="bg-surface">
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
