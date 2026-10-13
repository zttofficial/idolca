import type { Metadata } from "next";
import { DEFAULT_SHARE_IMAGE, SITE_URL } from "@/lib/seo";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "../globals.css";
import Web3Providers from "@/components/web3/Providers";
import { routing } from "@/i18n/routing";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: "Idolca", template: "%s · Idolca" },
    description: t("description"),
    applicationName: "Idolca",
    openGraph: { siteName: "Idolca", type: "website", images: [DEFAULT_SHARE_IMAGE] },
    twitter: { card: "summary_large_image", images: [DEFAULT_SHARE_IMAGE] },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <Web3Providers>{children}</Web3Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
