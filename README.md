# Idolca

**A vault and marketplace for K-pop photocards on Solana.** Every physical card that passes authentication is stored in the Idolca vault and gets its own Metaplex Core NFT. Trading moves the NFT and USDT in one transaction while the card stays put; burn the NFT and we ship the card to you.

Live on devnet: **https://idolca.vercel.app** · 中文說明：[README.zh-Hant.md](README.zh-Hant.md)

## Why

K-pop photocards are a large, mostly informal market. Fans trade on X and open chats, where "paid but never shipped" scams and fakes are routine, and every trade means mailing a fragile card across borders. Idolca keeps the card in one place, proves it is genuine once, and lets ownership move on-chain.

Two lanes, like the leading Korean marketplaces:

- **Vault cards**: authenticated and stored by Idolca. Bought and sold through our on-chain escrow program; the NFT and payment swap atomically. Redeem any time to have the card shipped.
- **Free listings**: cards that stay with the seller, minted as unverified collector NFTs. Purchases go through platform escrow with ship and confirm deadlines, disputes and automatic refunds. A free-listed card can be sent to the vault and, once authenticated, converted into a vault card.

## What's in it

| Feature | How it works |
|---|---|
| Sign in | Email and password, or a Solana wallet signature (Wallet Standard: Phantom, Solflare, Backpack). Email users get custodied NFTs and can link a wallet later. |
| Vault intake | Admins photograph the card front and back, record version, grade and shelf location, and mint a vault NFT to the depositor's wallet. |
| Vault trading | Anchor escrow program: listing moves the NFT into a PDA, `buy` pays the seller and a 2.5% fee and transfers the NFT in the same transaction. |
| Redemption | One signed transaction freezes the NFT, delegates burn authority to Idolca and pays the shipping fee. Shipping burns the NFT; cancelling unfreezes it and refunds the fee. Redeemed cards stay visible with their full on-chain history. |
| Free listings and escrow | Buyer pays USDT into escrow. Seller has 7 days to ship or the buyer is refunded; the buyer has 14 days to confirm or report a problem, after which payment releases automatically. Disputes are settled by admins. |
| Vault conversion | Owners send a self-minted card to the vault. If genuine, a vault NFT is minted to them and the old collector NFT is burned (recovered via the collection's PermanentTransferDelegate). |
| Fake cards | Admins can mark a collector NFT as fake: renamed, relabelled and frozen on-chain, visible in every wallet and marketplace. |
| Mystery packs | Every card in a pack is a real vault card. Odds are each tier's share of the cards left, updated live. Pulls transfer the existing vault NFT; instant buyback returns the card to the pool. |
| Provably fair draws | Commit and reveal, no oracle needed: the SHA-256 of a secret seed is published before sales; each pull uses `HMAC-SHA256(seed, paymentSignature:index)`, where the signature comes from the buyer's wallet, so Idolca cannot predict it. The seed is revealed when the pack ends, and `/api/packs/{id}/draws` lets anyone recompute every pull. |
| Catalog and binder | A catalog of every card version, a flip-page binder for your collection, wants, and collection progress. |
| Album chart | This week's top 10 from Circle Chart, Korea's official album sales chart. |

No mock data: every price, owner and history entry comes from the chain or the database. Eight languages (English, Traditional and Simplified Chinese, Japanese, Korean, Thai, Indonesian, Vietnamese).

## On-chain

Solana devnet, all exercised with real transactions:

| | Address |
|---|---|
| Escrow program (Anchor) | [`4vQ6uRMFPRfU79JuwwriDVRoFsEZBCSW2FnsefwmtetD`](https://solscan.io/account/4vQ6uRMFPRfU79JuwwriDVRoFsEZBCSW2FnsefwmtetD?cluster=devnet) |
| Vault collection (Metaplex Core) | [`9C5Sj6UHgqTqxaEp6uW18mDWPhCoYiX46mbw7CTzzt3H`](https://solscan.io/account/9C5Sj6UHgqTqxaEp6uW18mDWPhCoYiX46mbw7CTzzt3H?cluster=devnet) |
| Collector collection | [`AJUuGEU343B48NtkLUa5MA9mRAY1Fa9iYRP9W322Xh8t`](https://solscan.io/account/AJUuGEU343B48NtkLUa5MA9mRAY1Fa9iYRP9W322Xh8t?cluster=devnet) |
| Platform wallet | [`2iSmLoVcb9zNvBjdXAcN2duc1CY6Dar7vjsuPJDVa7FJ`](https://solscan.io/account/2iSmLoVcb9zNvBjdXAcN2duc1CY6Dar7vjsuPJDVa7FJ?cluster=devnet) |
| Test USDT | [`E8cviabpxswY9ouL7CPNJhTs5wqChuF3XDUobYuoKqEK`](https://solscan.io/account/E8cviabpxswY9ouL7CPNJhTs5wqChuF3XDUobYuoKqEK?cluster=devnet) |

To try it, sign in with a devnet wallet and use **Get devnet test funds** in the account menu (0.02 SOL and 500 test USDT).

Going to mainnet is configuration, not code: addresses live in `src/lib/chain/<cluster>.json` and `NEXT_PUBLIC_SOLANA_CLUSTER` picks one. The steps are in [docs/tech-stack.md](docs/tech-stack.md#上線主網).

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
docs/               research and competitor analysis, technical design (Chinese)
```

## Notes

- Sample card photos on devnet are CC BY images from Wikimedia Commons, credited at `/credits`. They are demonstration material only and are not sold.
- Album chart data is read from Circle Chart's public pages with attribution; a licensed source will replace it before commercial launch.
