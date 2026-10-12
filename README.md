# Idolca

**Every photocard finds its fan.** Idolca is a global marketplace for K-pop photocards built on Solana. A card is mailed once, into the Idolca vault, where it is checked by hand and paired with a digital collectible. After that it can change owners with fans anywhere in the world in seconds, at one price in every country, and ship to its owner's door whenever they want it.

Live on devnet: **https://idolca.vercel.app** · 中文說明：[README.zh-Hant.md](README.zh-Hant.md)

## The problem

Photocards are the currency of K-pop fandom: every album hides one at random, and fans spend years completing sets. The secondary market is large and growing, yet stuck in the pre-internet era:

- **It's fragmented by country.** Each big platform is built around one home market: Pocamarket (Korea, 1.5M members) ships abroad but runs on Korean payments and logistics, KOCA serves Taiwan and Southeast Asia, and Korea's Bunjang requires a Korean phone number.
- **Value sits across borders.** On Bunjang, overseas buyers pay about ₩42,000 per photocard against ₩3,000 domestically, roughly 14 times more ([Newsis](https://www.newsis.com/view/NISX20260327_0003567419), [Daum](https://v.daum.net/v/20260828050554866)). Cross-border volume grew 56% year on year in the first half of 2026.
- **Every trade ships the card.** A card that changes hands five times crosses the world five times, with fees, customs, damage and lost parcels each time.
- **Trust is manual.** Fakes and "paid but never shipped" scams are routine in the X and open-chat trades where most fans actually buy.

## How Idolca solves it

| | Pocamarket, KOCA | Courtyard, Collector Crypt | **Idolca** |
|---|---|---|---|
| Audience | Built around one home market | Graded Pokémon and sports cards, US-centric | **K-pop fans worldwide, 8 languages** |
| Each trade | Card is mailed again | Card stays vaulted | **Card stays vaulted; ownership moves in seconds** |
| Paying across borders | Local currency, local payment methods | USD on-chain | **One USDT price in every country, no FX or bank fees** |
| Proof a card is genuine | Platform inspection or in-house grading | Grading certificate | **Hand-checked in the vault, permanent public record** |
| Fans who still hold their cards | Marketplace with disputes | Not supported | **Escrow-protected fan listings, convertible into vault cards** |

Solana is what makes the middle three rows possible: settlement in seconds for fractions of a cent, a stablecoin that works the same in every country, programmable escrow, and a permanent record of provenance anyone can check.

### Built for fans who don't like crypto

K-pop fandoms have loudly rejected NFT projects before. Idolca keeps the technology and changes the language: NFTs are **digital collectibles** that certify a card is authentic and yours; the on-chain history is a **public record**; email sign-in works with no wallet at all, and a wallet is simply the place where only you hold the keys. Cards still carry an "On Solana" badge, so the chain is visible to anyone who looks for it.

## What's in it

| Feature | How it works |
|---|---|
| Sign in | Email and password, or a Solana wallet signature (Wallet Standard: MetaMask, Phantom, Solflare, Backpack). Email users get custodied collectibles and can link a wallet later. |
| Vault intake | Admins photograph the card front and back, record version, grade and shelf location, and mint a Metaplex Core NFT to the depositor's wallet. |
| Vault trading | Anchor escrow program: listing moves the NFT into a PDA, `buy` pays the seller and a 2.5% fee and transfers the NFT in one transaction. |
| Redemption | One signed transaction freezes the NFT, delegates burn authority to Idolca and pays the shipping fee. Shipping burns the NFT; cancelling unfreezes it and refunds the fee. Redeemed cards stay visible with their full history. |
| Fan listings and escrow | For cards still in a fan's hands: the buyer's USDT is held in escrow. The seller has 7 days to ship or the buyer is refunded; the buyer has 14 days to confirm or report a problem before payment releases. Admins settle disputes. |
| Vault conversion | A fan sends a self-minted card to the vault. If genuine, a vault NFT is minted to them and the collector NFT is burned (recovered through the collection's PermanentTransferDelegate). |
| Fake cards | Admins can mark a collector NFT as fake: renamed, relabelled and frozen on-chain, visible in every wallet and marketplace. |
| Mystery packs | Every card in a pack is a real vault card; a pull transfers its existing NFT. Odds are each tier's share of the cards left, updated live. Packs can be single-pull, stay listed as sold out, and instant buyback returns a card to the pool. |
| Provably fair draws | Commit and reveal, no oracle: the SHA-256 of a secret seed is published before sales; each pull uses `HMAC-SHA256(seed, paymentSignature:index)`, and the signature comes from the buyer's wallet, so Idolca cannot predict it. The seed is revealed when the pack ends, and `/api/packs/{id}/draws` lets anyone recompute every pull. |
| Catalog and binder | Every card version by group, album and member; a binder to track what you have and want, and collection progress. |
| Album chart | This week's top 10 from Circle Chart, Korea's official album chart. |
| Reach | Eight languages with hreflang, a sitemap, structured data and share images, so every card page can be found in search. |

No mock data: every price, owner and history entry comes from the chain or the database.

## Try it

The site runs on Solana devnet with test USDT, so nothing costs real money.

1. Open **https://idolca.vercel.app**, choose **Log in → Wallet** with a devnet wallet (Phantom, Solflare, Backpack or MetaMask).
2. In the account menu, **Get devnet test funds** sends 0.02 SOL and 500 test USDT.
3. **Market**: buy a listed vault card. The card page shows the public record of every transfer.
4. **Mystery Pack → Idolca Series 01**: open a single-pull pack, flip the card, keep it or sell it back. After the pool sells out, the draw log and seed let you verify every pull.
5. **Binder → Add my card**: photograph a card you own and make it a digital collectible, then list it or send it to the vault.
6. On a card you own: **Request redemption** with a shipping address to see the freeze, fee and burn flow.

## Business model

- 2.5% fee on every vault trade and fan listing, collected inside the settlement transaction.
- Mystery packs priced above the expected value of their pool, with the odds and expected value published live.
- Instant buyback at 70% of the card's pack value, which returns the card to the pool.
- Shipping fees on redemption. Planned: intake and storage fees for fans who deposit cards.

## On-chain

Solana devnet, all exercised with real transactions:

| | Address |
|---|---|
| Escrow program (Anchor) | [`4vQ6uRMFPRfU79JuwwriDVRoFsEZBCSW2FnsefwmtetD`](https://solscan.io/account/4vQ6uRMFPRfU79JuwwriDVRoFsEZBCSW2FnsefwmtetD?cluster=devnet) |
| Vault collection (Metaplex Core) | [`9C5Sj6UHgqTqxaEp6uW18mDWPhCoYiX46mbw7CTzzt3H`](https://solscan.io/account/9C5Sj6UHgqTqxaEp6uW18mDWPhCoYiX46mbw7CTzzt3H?cluster=devnet) |
| Collector collection | [`AJUuGEU343B48NtkLUa5MA9mRAY1Fa9iYRP9W322Xh8t`](https://solscan.io/account/AJUuGEU343B48NtkLUa5MA9mRAY1Fa9iYRP9W322Xh8t?cluster=devnet) |
| Platform wallet | [`2iSmLoVcb9zNvBjdXAcN2duc1CY6Dar7vjsuPJDVa7FJ`](https://solscan.io/account/2iSmLoVcb9zNvBjdXAcN2duc1CY6Dar7vjsuPJDVa7FJ?cluster=devnet) |
| Test USDT | [`E8cviabpxswY9ouL7CPNJhTs5wqChuF3XDUobYuoKqEK`](https://solscan.io/account/E8cviabpxswY9ouL7CPNJhTs5wqChuF3XDUobYuoKqEK?cluster=devnet) |

Going to mainnet is configuration, not code: addresses live in `src/lib/chain/<cluster>.json` and `NEXT_PUBLIC_SOLANA_CLUSTER` picks one. The launch checklist is in [docs/tech-stack.md](docs/tech-stack.md#上線主網).

## Stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, three.js for the 3D card · Solana, Metaplex Core, Anchor 1.2, Wallet Standard, USDT (SPL) · PostgreSQL (Neon) with Drizzle; embedded PGlite for local development · Vercel with a daily cron · next-intl.

Few third-party services by design: accounts, photo storage, rate limiting and pack randomness are all built in.

## Run locally

```bash
npm install
cp .env.example .env.local   # every variable is explained there
npm run dev                  # http://localhost:3000
```

With no `DATABASE_URL`, local development uses PGlite in `.data/` and seeds the 19 sample vault cards already minted on devnet. Minting and payments need a platform keypair (`PLATFORM_KEYPAIR`). Admin access: put your wallet in `ADMIN_WALLETS`, or run `npm run admin:grant -- <email or wallet>`.

## Tests

```bash
npm run lint && npx next typegen && npx tsc --noEmit
npm test                     # unit: odds, fair-draw verification, address validation, translation consistency
```

End-to-end suites run against a live site and devnet with real transactions. Start the site on a separate test database first (`PGLITE_DIR=.data/pglite-e2e npm run dev`):

```bash
npm run test:e2e:vault       # intake, packs, fairness check, buyback, redemption and cancel, vault conversion
npm run test:e2e:ui          # headless Chrome with an injected Wallet Standard test wallet, clicking through every flow
npm run test:e2e:binder      # binder sync: deletions stay deleted across devices, unsent changes are uploaded
E2E_CRON_SECRET=testcron npm run test:e2e:escrow   # needs shortened deadlines, see README.zh-Hant.md
```

GitHub Actions runs lint, type checking, unit tests and a production build on every push.

## Repository

```
src/app/[locale]/   pages: market, vault, card, listing, packs, catalog, binder, charts, admin, terms, privacy
src/app/api/        accounts, items, escrow orders, packs, vault trading and redemption, admin, cron
src/lib/server/     database, auth, chain actions, payments, escrow, packs, vault cards
onchain/            Anchor workspace for the escrow program
tests/  e2e/        unit and end-to-end tests
docs/               market research and competitor analysis, technical design (Chinese)
```

## Notes

- Sample card photos on devnet are CC BY images from Wikimedia Commons, credited at `/credits`. They are demonstration material only and are not sold.
- Album chart data is read from Circle Chart's public pages with attribution; a licensed source will replace it before commercial launch.
