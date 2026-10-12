# Idolca

**Every photocard finds its fan.** Idolca is a global marketplace for K-pop photocards built on Solana. A card is mailed once, into the Idolca vault, where it is checked by hand and paired with a digital collectible. After that it can change owners with fans anywhere in the world in seconds, at one price in every country, and ship to its owner's door whenever they want it.

Live at **https://idolca.vercel.app**: cards and trading on Solana devnet, payments on Arc mainnet · 中文說明：[README.zh-Hant.md](README.zh-Hant.md)

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
| Paying across borders | Local currency, local payment methods | USD on-chain | **One USD price in every country, paid in USDT on Solana or USDC on Arc** |
| Proof a card is genuine | Platform inspection or in-house grading | Grading certificate | **Hand-checked in the vault, permanent public record** |
| Fans who still hold their cards | Marketplace with disputes | Not supported | **Escrow-protected fan listings, convertible into vault cards** |

Solana is what makes the middle three rows possible: settlement in seconds for fractions of a cent, stablecoins that work the same in every country, programmable escrow, and a permanent record of provenance anyone can check.

### Cards on Solana, money on Arc

Each chain does what it is best at. Solana is the trading layer: the collectibles, atomic swaps of vault cards, and liquidity on Magic Eden and Tensor. [Arc](https://arc.io), Circle's chain, is a settlement layer for payments: a fan pays for a pack or an escrow order by signing one USDC authorization (EIP-3009) in an EVM wallet, with no gas token and no fee, and the card is delivered on Solana. Prices are always shown in USD; the stablecoin is chosen at checkout. The Arc rail is live on mainnet: the [first payment](https://explorer.arc.io/tx/0x800ef7da983f4407793c335f7097b31dc5f06090afdbd39b3bc1f3221316b9ee) bought a 0.01 USDC pack whose card was delivered on Solana.

### Built for fans who don't like crypto

K-pop fandoms have loudly rejected NFT projects before. Idolca keeps the technology and changes the language: NFTs are **digital collectibles** that certify a card is authentic and yours; the on-chain history is a **public record**; email sign-in works with no wallet at all, and a wallet is simply the place where only you hold the keys. Cards still carry an "On Solana" badge, so the chain is visible to anyone who looks for it.

## What's in it

| Feature | How it works |
|---|---|
| Sign in | Email and password, or a Solana wallet signature (Wallet Standard: MetaMask, Phantom, Solflare, Backpack). Email users get custodied collectibles and can link a wallet later. |
| Vault intake | Admins photograph the card front and back, record version, grade and shelf location, and mint a Metaplex Core NFT to the depositor's wallet. |
| Vault trading | Anchor escrow program: listing moves the NFT into a PDA, `buy` pays the seller and a 2.5% fee and transfers the NFT in one transaction. |
| Redemption | One signed transaction freezes the NFT, delegates burn authority to Idolca and pays the shipping fee. Shipping burns the NFT; cancelling unfreezes it and refunds the fee. Redeemed cards stay visible with their full history. |
| Payments | One buy button opens a payment picker: a Solana wallet (USDT), USDC on Arc, or card (coming soon). Methods that don't fit a flow say why; vault trades, for example, settle only on Solana. |
| Fan listings and escrow | For cards still in a fan's hands, listed with photos and a description, no minting needed: the buyer's payment is held in escrow. The seller has 7 days to ship or the buyer is refunded; the buyer has 14 days to confirm or report a problem before payment releases. Admins settle disputes. |
| Self-minted collectibles | A fan with a wallet can turn a listed card into a digital collectible: the server builds the mint, the fan's wallet signs and pays about 0.003 SOL, and Idolca co-signs as collection authority. |
| Seller profiles | Each listing shows the seller's name, join date, completed sales and other cards for sale. |
| Vault conversion | A fan sends a self-minted card to the vault. If genuine, a vault NFT is minted to them and the collector NFT is burned (recovered through the collection's PermanentTransferDelegate). |
| Fake cards | Admins can mark a collector NFT as fake: renamed, relabelled and frozen on-chain, visible in every wallet and marketplace. |
| Mystery packs | Every card in a pack is a real vault card; a pull transfers its existing NFT. Odds are each tier's share of the cards left, updated live, next to the expected value and return rate of the next pack. Sales pause when the remaining pool's return rate would exceed the cap, until it is restocked. Instant buyback returns a card to the pool. |
| Provably fair draws | Commit and reveal, no oracle: the SHA-256 of a secret seed is published before sales; each pull uses `HMAC-SHA256(seed, paymentProof:index)`. The proof comes from the buyer, so Idolca cannot predict it: the Solana payment signature, or on Arc the buyer's signature on the authorization (not the transaction hash, which Idolca submits and could grind). The seed is revealed when the pack ends, and `/api/packs/{id}/draws` lets anyone recompute every pull. |
| Grading | Idolca Grading (IDG) scores vault cards on centering, corners, edges and surface; the vault serial is the cert number and the grade is written into the collectible. Third-party grades are recorded too. |
| Catalog and binder | Every card version by group, album and member; a binder to track what you have and want, and collection progress. |
| Album chart | This week's top 10 from Circle Chart, Korea's official album chart. |
| Reach | Eight languages with hreflang, a sitemap, structured data and share images, so every card page can be found in search. |

No mock data: every price, owner and history entry comes from the chain or the database.

## Try it

Cards and Solana payments run on devnet, so nothing costs real money. Arc payments run on mainnet and are limited to admin accounts until launch.

1. Open **https://idolca.vercel.app** and browse without signing in: **Market**, **Vault** (every card with its owner and status), a card page with the public record of every transfer, **Mystery Pack** with live odds, expected value and the fairness check, and **Grading**.
2. **Log in → Wallet** with a wallet set to devnet (Phantom: developer settings → testnet mode → Devnet; Solflare: network settings → Devnet), or sign up with email.
3. **Binder → Add my card**: photograph a card you own and list it for sale. To make it a digital collectible, the wallet needs a little devnet SOL from [faucet.solana.com](https://faucet.solana.com).
4. Buying a vault card, opening a pack and redemption are paid in Idolca's devnet test USDT, which the site does not hand out; the [end-to-end suites](#tests) run these flows with real devnet transactions.

## Business model

- 2.5% fee on every vault trade (split inside the swap transaction) and fan listing (deducted when escrow releases).
- Mystery packs: the return rate (expected value ÷ price) is capped at 80% and published, so every pack is profitable and buyers see what they get.
- Instant buyback at 70% of the card's pack value, which returns the card to the pool to sell again.
- Shipping fees on redemption. Fans pay to mint their own collectibles, so free listings cost Idolca nothing.

Vault cards carry real costs (intake, grading, storage), so packs and buyback fund the vault, while the 2.5% fee carries the asset-light fan listings. Details in [docs/business.md](docs/business.md) (Chinese).

## Compliance by design

Collectibles, payments and paid draws each carry regulatory risk. Each one has an answer in the product itself:

- **Regulated settlement.** Payments can settle in USDC on Arc, the issuer's own chain, alongside USDT on Solana. Prices are quoted in USD and each payment rail's stablecoin is configuration, so the accepted coins can follow what each jurisdiction allows.
- **Packs are treated as gambling-adjacent.** Live odds, the expected value and return rate of the next pack, a hard return-rate cap, provably fair draws anyone can recompute, 18+ confirmation, region blocking (`PACKS_BLOCKED_COUNTRIES`, Belgium and the Netherlands by default) and no refunds on opened packs. Open regions are confirmed with counsel before mainnet.
- **Consumer protection.** Fan trades go through escrow with fixed deadlines and admin dispute resolution; fake cards are frozen and relabelled on-chain, visible in every wallet and marketplace.
- **Data minimization.** Shipping addresses never go on-chain and are deleted 90 days after shipping; IP addresses are used only for rate limiting and region checks. The terms and privacy policy read their numbers (fees, deadlines, buyback rate, retention) from the same code the platform runs on.
- **AML.** No fiat touches Idolca today. Fiat on-ramp goes through a licensed provider, and withdrawals above a threshold will require KYC.
- **Intellectual property.** Listings and collectibles show scans of the physical card only, and idol photos are never used for marketing. Devnet sample photos are CC BY and credited at `/credits`; album chart data is read from Circle Chart with attribution and moves to a licensed source before launch.

## On-chain

Solana devnet, all exercised with real transactions:

| | Address |
|---|---|
| Escrow program (Anchor) | [`4vQ6uRMFPRfU79JuwwriDVRoFsEZBCSW2FnsefwmtetD`](https://solscan.io/account/4vQ6uRMFPRfU79JuwwriDVRoFsEZBCSW2FnsefwmtetD?cluster=devnet) |
| Vault collection (Metaplex Core) | [`9C5Sj6UHgqTqxaEp6uW18mDWPhCoYiX46mbw7CTzzt3H`](https://solscan.io/account/9C5Sj6UHgqTqxaEp6uW18mDWPhCoYiX46mbw7CTzzt3H?cluster=devnet) |
| Collector collection | [`AJUuGEU343B48NtkLUa5MA9mRAY1Fa9iYRP9W322Xh8t`](https://solscan.io/account/AJUuGEU343B48NtkLUa5MA9mRAY1Fa9iYRP9W322Xh8t?cluster=devnet) |
| Platform wallet | [`2iSmLoVcb9zNvBjdXAcN2duc1CY6Dar7vjsuPJDVa7FJ`](https://solscan.io/account/2iSmLoVcb9zNvBjdXAcN2duc1CY6Dar7vjsuPJDVa7FJ?cluster=devnet) |
| Test USDT | [`E8cviabpxswY9ouL7CPNJhTs5wqChuF3XDUobYuoKqEK`](https://solscan.io/account/E8cviabpxswY9ouL7CPNJhTs5wqChuF3XDUobYuoKqEK?cluster=devnet) |

Arc mainnet (chain ID 5042):

| | Address |
|---|---|
| Platform wallet | [`0x7a6c4D22fb05f715Cc47F4feC38d615a9369eF32`](https://explorer.arc.io/address/0x7a6c4D22fb05f715Cc47F4feC38d615a9369eF32) |
| USDC | `0x3600000000000000000000000000000000000000` |

Moving Solana to mainnet is configuration, not code: addresses live in `src/lib/chain/<cluster>.json` and `NEXT_PUBLIC_SOLANA_CLUSTER` picks one; `NEXT_PUBLIC_ARC_NETWORK` does the same for Arc, whose design is in [docs/arc.md](docs/arc.md). The launch checklist is in [docs/tech-stack.md](docs/tech-stack.md#上線主網).

## Stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, three.js for the 3D card · Solana, Metaplex Core, Anchor 1.2, Wallet Standard, USDT (SPL) · Arc, USDC with EIP-3009, viem, EIP-6963 · PostgreSQL (Neon) with Drizzle; embedded PGlite for local development · Vercel with a daily cron · next-intl.

Few third-party services by design: accounts, photo storage, rate limiting and pack randomness are all built in, and Arc payments need no contract of their own.

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
npm test                     # unit: odds, fair-draw verification, Arc EIP-712 domain, address validation, binder layout, translations
```

End-to-end suites run against a live site and devnet with real transactions. Start the site on a separate test database first (`PGLITE_DIR=.data/pglite-e2e npm run dev`):

```bash
npm run test:e2e:vault       # intake, packs, fairness check, buyback, redemption and cancel, vault conversion
npm run test:e2e:ui          # headless Chrome with an injected Wallet Standard test wallet, clicking through every flow
npm run test:e2e:binder      # binder sync: deletions stay deleted across devices, unsent changes are uploaded
npm run test:e2e:arc         # Arc testnet: USDC authorization, relayed payment, pack delivery and refund
E2E_CRON_SECRET=testcron npm run test:e2e:escrow   # needs shortened deadlines, see README.zh-Hant.md
```

GitHub Actions runs lint, type checking, unit tests and a production build on every push.

## Repository

```
src/app/[locale]/   pages: market, vault, card, listing, packs, catalog, binder, grading, charts, admin, terms, privacy
src/app/api/        accounts, items, escrow orders, packs, vault trading and redemption, admin, cron
src/lib/server/     database, auth, chain actions, payments on Solana and Arc, escrow, packs, vault cards
onchain/            Anchor workspace for the escrow program
tests/  e2e/        unit and end-to-end tests
docs/               market research, technical design, business model, Arc rail, implementation status (Chinese)
```

