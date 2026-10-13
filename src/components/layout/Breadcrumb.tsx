import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SITE_URL, jsonLd, localePath } from "@/lib/seo";

// 每一層的名稱和網址（不帶語言前綴）；最後一層是當前頁面
export type Crumb = { label: string; href: string };

// 頁面頂部的路徑導航，同時輸出 BreadcrumbList 結構化資料，讓搜尋結果顯示這條路徑而不是一長串網址
export default async function Breadcrumb({ items }: { items: Crumb[] }) {
  const locale = await getLocale();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: `${SITE_URL}${localePath(locale, c.href)}` })),
        })}
      />
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
        {items.map((c, i) =>
          i === items.length - 1 ? (
            <span key={c.href} className="text-ink">
              {c.label}
            </span>
          ) : (
            <span key={c.href} className="contents">
              <Link href={c.href} className="hover:text-ink">
                {c.label}
              </Link>
              <span>/</span>
            </span>
          ),
        )}
      </nav>
    </>
  );
}
