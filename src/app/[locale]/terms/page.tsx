import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getLocale } from "next-intl/server";
import LegalPage from "@/components/legal/LegalPage";
import { BUYBACK_RATE } from "@/lib/packs";
import { ADDRESS_RETENTION_DAYS, AUCTION_DAYS, AUCTION_EXTEND_MINUTES, AUCTION_FEE_BPS, AUCTION_MIN_START, ESCROW_ADDRESS_DAYS, ESCROW_CONFIRM_DAYS, ESCROW_SHIP_DAYS, FEE_BPS } from "@/lib/policy";
import { REDEEM_FEE_RANGE } from "@/lib/shipping";
import { CURRENCY } from "@/lib/fx";
import { VAULT_LIST } from "@/lib/vaults";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({ locale: await getLocale(), path: "/terms", title: "Terms of Service", description: "The rules for buying, selling, auctions, escrow, mystery packs and vault shipping on Idolca, including fees and how disputes are handled." });
}

const pct = (bps: number) => `${bps / 100}%`;

// 服務條款。數字（抽成、期限、拍賣規則、回購比例、運費）直接讀平台規則，改規則時條款跟著變
export default async function TermsPage() {
  const locale = await getLocale();
  return (
    <LegalPage
      title="Terms of Service"
      updated="2026-10-14"
      note={locale === "en" ? undefined : "These terms are provided in English, and the English version governs."}
      intro="These terms govern your use of Idolca, a marketplace and vault for K-pop photocards that records ownership on the Solana blockchain. By creating an account, connecting a wallet or making a transaction, you agree to them."
      sections={[
        {
          title: "Accounts and wallets",
          body: [
            "You can sign in with an email and password or with a Solana wallet signature. You must be old enough to form a binding contract where you live, and at least 18 to open mystery packs.",
            "Your wallet and its private keys are yours. Idolca never asks for your seed phrase, cannot reverse transactions you sign, and cannot recover a lost wallet. Email accounts can add and list cards without a wallet; paying, bidding and holding NFTs require a linked wallet.",
          ],
        },
        {
          title: "Vault cards",
          body: [
            "A vault card is a physical photocard that Idolca has received, authenticated, photographed and stored. Each vault card has one Solana NFT in the Idolca Vault collection; whoever holds the NFT owns the physical card.",
            `We keep vault cards in ${VAULT_LIST.length} vaults: ${VAULT_LIST.map((v) => `${v.city}, ${new Intl.DisplayNames(["en"], { type: "region" }).of(v.country)}`).join(" and ")}. Each card is stored in one vault, shown on its card page, and ships from that vault when redeemed. When you send us a card, you choose which vault receives it.`,
            "Idolca is responsible for vault cards while they are in our custody. If a vault card is lost or damaged before it ships to you, we compensate the holder at its fair market value.",
          ],
        },
        {
          title: "Trading vault cards",
          body: [
            `Vault cards are listed and sold through Idolca's on-chain escrow program. The buyer's stablecoin payment and the NFT swap in a single transaction; a marketplace fee of ${pct(FEE_BPS)} of the sale price goes to Idolca. Completed on-chain trades are final.`,
          ],
        },
        {
          title: "Redemption",
          body: [
            `Holders can redeem a vault card to have the physical card shipped. Redemption freezes the NFT and charges a shipping fee in the same transaction. The fee is priced by the vault the card is stored in and the destination: it covers postage from that vault and packing plus a margin for exchange-rate, fuel-surcharge and postal price changes, currently ${REDEEM_FEE_RANGE.min} to ${REDEEM_FEE_RANGE.max} ${CURRENCY}. Shipments within Canada also carry GST/HST at the rate of the destination province or territory, charged in the same transaction. The redemption form shows the exact fee and tax before you confirm, and the full rate table for every vault and destination is on the [Shipping rates](/shipping) page. When we ship, the NFT is burned and the card leaves the vault.`,
            "We ship by tracked mail to the countries and regions the card's vault serves, which the redemption form lists. If we cannot ship to the address you give, we cancel the redemption, unfreeze the NFT and refund the shipping fee and any tax charged on it. Risk passes to you when the carrier delivers the card.",
          ],
        },
        {
          title: "Free listings and escrow",
          body: [
            "Free listings are cards that stay with the seller. Idolca does not inspect them; they are marked unverified, and the listing photos and description are the seller's responsibility.",
            `Purchases of free listings go through Idolca escrow. The buyer's payment is held until the buyer confirms receipt. The buyer gives a shipping address before paying, or for a won auction, in their Orders afterwards; only the seller and Idolca can see it. If the buyer has not added an address within ${ESCROW_ADDRESS_DAYS} days of payment, the order is cancelled and refunded in full. If the seller does not mark the order shipped within ${ESCROW_SHIP_DAYS} days of payment or of the buyer adding the address, whichever is later, the order is refunded in full. If the buyer neither confirms nor reports a problem within ${ESCROW_CONFIRM_DAYS} days of shipping, payment is released to the seller.`,
            `A buyer who reports a problem pauses the release; Idolca reviews the case and either refunds the buyer or releases payment to the seller. On release, the seller receives the price minus a ${pct(FEE_BPS)} fee, and if the seller made the card an NFT, it moves to the buyer.`,
            "Idolca may mark a card as fake if it is reported or found to be counterfeit. A fake card is delisted, relabelled and frozen on-chain, and this cannot be undone.",
          ],
        },
        {
          title: "Auctions",
          body: [
            `Sellers can sell a free listing or a vault card by auction instead of at a fixed price. The seller sets a starting bid of at least ${AUCTION_MIN_START} ${CURRENCY}, an optional reserve price that is not shown to bidders, and a duration of ${AUCTION_DAYS.join(", ")} days. An auction can be cancelled only before the first bid.`,
            `Every bid is paid in full when it is placed and cannot be withdrawn. Bids on free listings are held by Idolca; bids on vault cards are locked in the on-chain escrow program. When you are outbid, or a bid arrives after the auction has ended, it is refunded in full to the wallet or address it was paid from. A bid placed in the last ${AUCTION_EXTEND_MINUTES} minutes moves the end time to ${AUCTION_EXTEND_MINUTES} minutes after that bid.`,
            `When the auction ends, the highest bid wins if it meets the reserve price. A won free-listing auction becomes an escrow purchase under the terms above. A won vault-card auction settles on-chain: the NFT moves to the winner and the seller receives the winning bid in the same transaction. Either way the seller pays a fee of ${pct(AUCTION_FEE_BPS)} of the winning bid, and the winner pays only the bid. If no bid meets the reserve, the card stays with the seller and the highest bid is refunded.`,
          ],
        },
        {
          title: "Mystery packs",
          body: [
            "Every card in a pack's pool is a vault card owned by Idolca. Odds are the share of cards left in each tier and change as cards are pulled. Before a pack opens we publish a hash of a secret seed; each pull is derived from that seed and your payment signature, and we publish the seed when the pack ends or sells out so anyone can verify every pull.",
            "Opened packs are non-refundable. If a pack runs out of cards after you pay, the packs we could not fill are refunded automatically.",
            `Instant buyback pays ${Math.round(BUYBACK_RATE * 100)}% of the card's value shown in the pack. Packs are available only to users 18 and older and are not offered in some regions.`,
          ],
        },
        {
          title: "Prohibited conduct",
          body: [
            "Do not list counterfeit or stolen cards, misrepresent a card's condition, manipulate prices with your own accounts (including bidding on your own auctions), interfere with the service, or use Idolca to launder money or evade sanctions. We may suspend accounts that do.",
          ],
        },
        {
          title: "Blockchain risks",
          body: [
            `Blockchain transactions are public and irreversible. Network congestion, wallet software and token contracts are outside Idolca's control. USDT, USDC and other stablecoins are issued by third parties, and their value is not guaranteed by Idolca.`,
          ],
        },
        {
          title: "Liability",
          body: [
            "Except for our custody obligation for vault cards, Idolca is provided as is. To the extent the law allows, Idolca is not liable for indirect or consequential losses, and our total liability for any claim is limited to the fees you paid us in the twelve months before it.",
          ],
        },
        {
          title: "Changes",
          body: [`We may update these terms. Material changes are announced on the site before they take effect. Shipping addresses are kept for ${ADDRESS_RETENTION_DAYS} days after a redemption ships or an escrow order ends, as described in the privacy policy.`],
        },
      ]}
    />
  );
}
