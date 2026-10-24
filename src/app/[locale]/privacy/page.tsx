import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getLocale } from "next-intl/server";
import LegalPage from "@/components/legal/LegalPage";
import { ADDRESS_RETENTION_DAYS } from "@/lib/policy";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({ locale: await getLocale(), path: "/privacy", title: "Privacy Policy", description: "What personal data Idolca collects, why, and how long we keep it. We collect only what the service needs and never sell personal data." });
}

// 隱私權政策：收什麼、為什麼、存多久、交給誰處理
export default async function PrivacyPage() {
  const locale = await getLocale();
  return (
    <LegalPage
      title="Privacy Policy"
      updated="2026-10-24"
      note={locale === "en" ? undefined : "This policy is provided in English, and the English version governs."}
      intro="This policy explains what personal data Idolca collects, why, and how long we keep it. We collect only what the service needs and do not sell personal data or use it for advertising."
      sections={[
        {
          title: "What we collect",
          body: [
            "Account data: your email address and a salted scrypt hash of your password (never the password itself), or your Solana wallet address if you sign in with a wallet, and a display name.",
            "Collection data: cards you mark in your binder, cards you mint or list, the photos you upload, and your orders.",
            "Public binder: if you turn on binder sharing, anyone with the link can see your display name, the cards in your binder (vault cards you hold, digital collectibles you created with their photos, and catalog cards you marked) and the cards you are looking for. Cards you take out of the binder or hide from the public page are not shown, and neither are your own photos of catalog cards, your wallet address or your orders. You can hide individual cards or turn sharing off at any time in your binder.",
            "Redemption data: the recipient name, phone number and shipping address you enter when you redeem a vault card.",
            "Technical data: a session cookie that keeps you signed in, your IP address for rate limiting, and the country your request comes from, which decides whether random trading card packs are offered.",
            "Usage data: which pages are viewed, where visitors came from, and anonymous counts of actions such as listing, bidding, buying and opening packs, with the amount and payment method. These events carry no email, wallet address or shipping address.",
          ],
        },
        {
          title: "Public blockchain data",
          body: [
            "Wallet addresses, NFT ownership, listings and payments are recorded on the Solana blockchain. That record is public and permanent, and Idolca cannot delete it. We never write your email, name or shipping address on-chain.",
          ],
        },
        {
          title: "How we use it",
          body: [
            "To run your account, process trades, escrow and redemptions, authenticate and store cards, prevent fraud and abuse, and comply with legal obligations. We do not send marketing messages.",
          ],
        },
        {
          title: "How long we keep it",
          body: [
            `Shipping addresses and tracking numbers are deleted ${ADDRESS_RETENTION_DAYS} days after a redemption ships or an escrow order ends, or immediately if a redemption is cancelled. The address on an escrow order is shown only to that order's seller and to Idolca, and its tracking number only to that order's buyer, seller and Idolca. Expired sessions are deleted daily. Account and order records are kept while your account is open and afterwards as long as tax and anti-money-laundering rules require.`,
            "Unwatermarked originals of uploaded photos are kept for authentication; only watermarked versions are shown publicly.",
          ],
        },
        {
          title: "Who processes it",
          body: [
            "Vercel hosts the site, Neon hosts the database and Resend delivers account emails such as email verification and password reset; PostHog, in its EU region, processes usage data. All four process data on our behalf under their data processing terms. Shipping carriers receive the recipient name, phone and address for the shipment. Our Asia vault is run by a warehouse partner outside Canada, which receives the same details to ship cards stored there. When you buy a free listing, its seller receives them to ship the card. We do not share personal data with anyone else unless the law requires it.",
          ],
        },
        {
          title: "Your rights",
          body: [
            "You can ask for a copy of your data, ask us to correct it, or close your account and have your personal data deleted, except what we must keep by law and what is already public on the blockchain.",
          ],
        },
        {
          title: "Cookies",
          body: ["Idolca sets one essential cookie for your session. The site remembers a few preferences, such as your last shipping address, in your own browser's storage. Usage analytics run without cookies or browser storage: PostHog recognises a visit by a privacy-preserving hash computed on its servers. We use no advertising or cross-site tracking cookies."],
        },
      ]}
    />
  );
}
