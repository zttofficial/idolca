import * as anchor from "@anchor-lang/core";
import { expect } from "chai";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createSignerFromKeypair, generateSigner, keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair, toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { create, createCollection, fetchAsset, fetchCollection, freezeAsset, mplCore } from "@metaplex-foundation/mpl-core";
import idl from "../target/idl/idolca_market.json";
import type { IdolcaMarket } from "../target/types/idolca_market";

const MPL_CORE_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const FEE_BPS = 250;
const USD = 1_000_000; // 6 位小數

// 賣家、買家、出價者都沒有 SOL：手續費、帳戶租金和 Core 轉移的費用全由平台（provider 錢包）付，證明粉絲的錢包只要有穩定幣就能交易
describe("idolca-market", () => {
  // 用 confirmed：交易確認後馬上讀帳戶（Core 資產的持有人、代幣餘額），processed 可能讀到舊狀態
  const env = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(new Connection(env.connection.rpcEndpoint, "confirmed"), env.wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
  anchor.setProvider(provider);
  // 直接讀 IDL，不經 anchor.workspace（它要靠 cargo 找 target 目錄），在沒裝 Rust 的機器上也能對著跑起來的驗證節點測試
  const program = new anchor.Program<IdolcaMarket>(idl as IdolcaMarket, provider);
  const connection = provider.connection;
  const platform = (provider.wallet as anchor.Wallet).payer;

  const umi = createUmi(connection.rpcEndpoint, "confirmed").use(mplCore()).use(keypairIdentity(fromWeb3JsKeypair(platform)));

  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  const treasury = Keypair.generate();
  const sellerUmi = createSignerFromKeypair(umi, fromWeb3JsKeypair(seller));

  let usdt: PublicKey;
  let usdc: PublicKey;
  let collection: PublicKey;

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const listingPda = (asset: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("listing"), asset.toBuffer()], program.programId)[0];
  const ata = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
  const balance = async (mint: PublicKey, owner: PublicKey) => Number((await getAccount(connection, ata(mint, owner))).amount);
  const lamports = (who: PublicKey) => connection.getBalance(who);

  async function mintCard(serial: string) {
    const asset = generateSigner(umi);
    await create(umi, {
      asset,
      collection: await fetchCollection(umi, publicKey(collection)),
      owner: sellerUmi.publicKey,
      name: serial,
      uri: `https://example.com/${serial}.json`,
      plugins: [{ type: "Attributes", attributeList: [{ key: "serial", value: serial }] }],
    }).sendAndConfirm(umi);
    return toWeb3JsPublicKey(asset.publicKey);
  }

  async function ownerOf(asset: PublicKey) {
    return toWeb3JsPublicKey((await fetchAsset(umi, publicKey(asset))).owner);
  }

  const coreAccounts = () => ({
    config: configPda,
    collection,
    mplCoreProgram: MPL_CORE_ID,
    systemProgram: SystemProgram.programId,
  });

  async function list(asset: PublicKey, price: number) {
    await program.methods
      .list(new anchor.BN(price))
      .accountsPartial({ seller: seller.publicKey, payer: platform.publicKey, listing: listingPda(asset), asset, ...coreAccounts() })
      .signers([seller])
      .rpc();
  }

  function buyAccounts(asset: PublicKey, mint: PublicKey) {
    return {
      buyer: buyer.publicKey,
      payer: platform.publicKey,
      seller: seller.publicKey,
      listing: listingPda(asset),
      rentPayer: platform.publicKey,
      asset,
      paymentMint: mint,
      buyerToken: ata(mint, buyer.publicKey),
      sellerToken: ata(mint, seller.publicKey),
      treasury: treasury.publicKey,
      treasuryToken: ata(mint, treasury.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
      ...coreAccounts(),
    };
  }

  const buy = (asset: PublicKey, price: number, mint: PublicKey) => program.methods.buy(new anchor.BN(price)).accountsPartial(buyAccounts(asset, mint)).signers([buyer]).rpc();

  const fails = async (go: Promise<unknown>, code: string) => {
    try {
      await go;
      expect.fail("應該失敗");
    } catch (e) {
      expect(String(e)).to.include(code);
    }
  };

  before(async () => {
    usdt = await createMint(connection, platform, platform.publicKey, null, 6);
    usdc = await createMint(connection, platform, platform.publicKey, null, 6);
    for (const mint of [usdt, usdc]) {
      const buyerAta = await getOrCreateAssociatedTokenAccount(connection, platform, mint, buyer.publicKey);
      await mintTo(connection, platform, mint, buyerAta.address, platform, 10_000 * USD);
      await getOrCreateAssociatedTokenAccount(connection, platform, mint, treasury.publicKey);
    }

    const collectionSigner = generateSigner(umi);
    await createCollection(umi, { collection: collectionSigner, name: "Idolca Vault", uri: "https://example.com/c.json" }).sendAndConfirm(umi);
    collection = toWeb3JsPublicKey(collectionSigner.publicKey);

    const [programData] = PublicKey.findProgramAddressSync([program.programId.toBuffer()], BPF_UPGRADEABLE_LOADER);
    await program.methods
      .initialize(FEE_BPS)
      .accountsPartial({
        authority: platform.publicKey,
        config: configPda,
        treasury: treasury.publicKey,
        collection,
        usdtMint: usdt,
        usdcMint: usdc,
        program: program.programId,
        programData,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("掛單把資產轉進 Listing PDA，取消後退回賣家；租金由平台付、退回平台，賣家錢包始終沒有 SOL", async () => {
    const asset = await mintCard("IC-T0001");
    await list(asset, 100 * USD);
    expect((await ownerOf(asset)).toBase58()).to.equal(listingPda(asset).toBase58());
    const listing = await program.account.listing.fetch(listingPda(asset));
    expect(listing.rentPayer.toBase58()).to.equal(platform.publicKey.toBase58());
    expect(listing.version).to.equal(2);

    const rent = await lamports(listingPda(asset));
    const before = await lamports(platform.publicKey);
    await program.methods
      .cancel()
      .accountsPartial({ seller: seller.publicKey, payer: platform.publicKey, listing: listingPda(asset), rentPayer: platform.publicKey, asset, ...coreAccounts() })
      .signers([seller])
      .rpc();
    expect((await ownerOf(asset)).toBase58()).to.equal(seller.publicKey.toBase58());
    expect(await connection.getAccountInfo(listingPda(asset))).to.equal(null);
    // 平台收回租金，只扣這筆交易的手續費
    expect(await lamports(platform.publicKey)).to.be.greaterThan(before + rent - 20_000);
    expect(await lamports(seller.publicKey)).to.equal(0);
  });

  it("買家用 USDT 或 USDC 都能買同一種美元標價；賣家收到買家付的那一種，抽成也是", async () => {
    for (const [serial, mint] of [
      ["IC-T0002", usdt],
      ["IC-T0003", usdc],
    ] as const) {
      const asset = await mintCard(serial);
      const price = 1_280 * USD;
      await list(asset, price);
      const sellerBefore = await balance(mint, seller.publicKey).catch(() => 0);
      const treasuryBefore = await balance(mint, treasury.publicKey);
      await buy(asset, price, mint);

      const fee = Math.floor((price * FEE_BPS) / 10_000);
      expect(await balance(mint, seller.publicKey)).to.equal(sellerBefore + price - fee);
      expect(await balance(mint, treasury.publicKey)).to.equal(treasuryBefore + fee);
      expect((await ownerOf(asset)).toBase58()).to.equal(buyer.publicKey.toBase58());
      expect(await connection.getAccountInfo(listingPda(asset))).to.equal(null);
    }
    expect(await lamports(buyer.publicKey)).to.equal(0);
  });

  it("價格和預期不符時拒絕成交", async () => {
    const asset = await mintCard("IC-T0004");
    await list(asset, 50 * USD);
    await fails(buy(asset, 40 * USD, usdt), "PriceMismatch");
  });

  it("不接受 USDT、USDC 以外的結算代幣", async () => {
    const asset = await mintCard("IC-T0005");
    await list(asset, 10 * USD);
    const other = await createMint(connection, platform, platform.publicKey, null, 6);
    const buyerAta = await getOrCreateAssociatedTokenAccount(connection, platform, other, buyer.publicKey);
    await mintTo(connection, platform, other, buyerAta.address, platform, 100 * USD);
    await getOrCreateAssociatedTokenAccount(connection, platform, other, treasury.publicKey);
    await fails(buy(asset, 10 * USD, other), "UnsupportedPaymentMint");
  });

  it("提貨申請中（已凍結）的資產不能掛單", async () => {
    const asset = await mintCard("IC-T0006");
    await freezeAsset(umi, {
      asset: await fetchAsset(umi, publicKey(asset)),
      collection: await fetchCollection(umi, publicKey(collection)),
      delegate: umi.identity.publicKey,
      authority: sellerUmi,
    }).sendAndConfirm(umi);
    const listed = await list(asset, 10 * USD).then(
      () => true,
      () => false,
    );
    expect(listed).to.equal(false);
    expect((await ownerOf(asset)).toBase58()).to.equal(seller.publicKey.toBase58());
  });

  it("只有 authority 能換登記的結算代幣，而且必須是 6 位小數", async () => {
    const stranger = Keypair.generate();
    await fails(program.methods.setMints().accountsPartial({ authority: stranger.publicKey, config: configPda, usdtMint: usdt, usdcMint: usdc }).signers([stranger]).rpc(), "Unauthorized");
    const nine = await createMint(connection, platform, platform.publicKey, null, 9);
    await fails(program.methods.setMints().accountsPartial({ authority: platform.publicKey, config: configPda, usdtMint: usdt, usdcMint: nine }).rpc(), "UnsupportedPaymentMint");
    await program.methods.setMints().accountsPartial({ authority: platform.publicKey, config: configPda, usdtMint: usdt, usdcMint: usdc }).rpc();
  });

  describe("拍賣", () => {
    const AUCTION_FEE_BPS = 400;
    const bidder2 = Keypair.generate();
    const [auctionConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("auction_config")], program.programId);
    const auctionPda = (asset: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("auction"), asset.toBuffer()], program.programId)[0];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // 測試用的設定：最短 2 秒，方便等到截止
    const rules = (extendSecs: number) => ({ feeBps: AUCTION_FEE_BPS, minStart: new anchor.BN(10 * USD), minDuration: new anchor.BN(2), maxDuration: new anchor.BN(7 * 86_400), extendSecs: new anchor.BN(extendSecs) });
    const escrows = (asset: PublicKey) => ({ usdtMint: usdt, usdcMint: usdc, usdtEscrow: ata(usdt, auctionPda(asset)), usdcEscrow: ata(usdc, auctionPda(asset)) });

    async function createAuction(asset: PublicKey, start: number, reserve: number, duration: number) {
      await program.methods
        .createAuction(new anchor.BN(start), new anchor.BN(reserve), new anchor.BN(duration))
        .accountsPartial({ seller: seller.publicKey, payer: platform.publicKey, config: configPda, auctionConfig: auctionConfigPda, auction: auctionPda(asset), ...escrows(asset), asset, collection, mplCoreProgram: MPL_CORE_ID, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([seller])
        .rpc();
    }

    async function bid(asset: PublicKey, who: Keypair, amount: number, mint: PublicKey) {
      const a = await program.account.auction.fetch(auctionPda(asset));
      const prev = a.bidCount > 0 ? a.highBidder : who.publicKey;
      const prevMint = a.bidCount > 0 ? a.highBidMint : mint;
      await program.methods
        .bid(new anchor.BN(amount))
        .accountsPartial({
          bidder: who.publicKey,
          payer: platform.publicKey,
          config: configPda,
          auctionConfig: auctionConfigPda,
          auction: auctionPda(asset),
          bidMint: mint,
          bidderToken: ata(mint, who.publicKey),
          bidEscrow: ata(mint, auctionPda(asset)),
          prevMint,
          prevEscrow: ata(prevMint, auctionPda(asset)),
          prevBidder: prev,
          prevBidderToken: ata(prevMint, prev),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([who])
        .rpc();
    }

    async function settle(asset: PublicKey) {
      const a = await program.account.auction.fetch(auctionPda(asset));
      const high = a.bidCount > 0 ? a.highBidder : seller.publicKey;
      const winMint = a.bidCount > 0 ? a.highBidMint : usdt;
      await program.methods
        .settleAuction()
        .accountsPartial({
          cranker: platform.publicKey,
          seller: seller.publicKey,
          highBidder: high,
          config: configPda,
          auction: auctionPda(asset),
          rentPayer: a.rentPayer,
          ...escrows(asset),
          winMint,
          asset,
          collection,
          sellerToken: ata(winMint, seller.publicKey),
          highBidderToken: ata(winMint, high),
          treasury: treasury.publicKey,
          treasuryToken: ata(winMint, treasury.publicKey),
          mplCoreProgram: MPL_CORE_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    }

    const cancelAuction = (asset: PublicKey) =>
      program.methods
        .cancelAuction()
        .accountsPartial({ seller: seller.publicKey, payer: platform.publicKey, config: configPda, auction: auctionPda(asset), rentPayer: platform.publicKey, ...escrows(asset), asset, collection, mplCoreProgram: MPL_CORE_ID, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([seller])
        .rpc();

    before(async () => {
      for (const mint of [usdt, usdc]) {
        const a = await getOrCreateAssociatedTokenAccount(connection, platform, mint, bidder2.publicKey);
        await mintTo(connection, platform, mint, a.address, platform, 10_000 * USD);
      }
      await program.methods.initAuctionConfig(rules(0)).accountsPartial({ authority: platform.publicKey, config: configPda, auctionConfig: auctionConfigPda }).rpc();
    });

    it("出價鎖款，被超過時退回前一位；結標時貨款扣抽成給賣家、資產給得標者", async () => {
      const asset = await mintCard("IC-A0001");
      await createAuction(asset, 10 * USD, 0, 4);
      expect((await ownerOf(asset)).toBase58()).to.equal(auctionPda(asset).toBase58());

      const buyerBefore = await balance(usdt, buyer.publicKey);
      const sellerBefore = await balance(usdt, seller.publicKey).catch(() => 0);
      const treasuryBefore = await balance(usdt, treasury.publicKey);
      await bid(asset, buyer, 10 * USD, usdt);
      expect(await balance(usdt, buyer.publicKey)).to.equal(buyerBefore - 10 * USD);

      await fails(bid(asset, bidder2, 10.5 * USD, usdt), "BidTooLow");
      await bid(asset, bidder2, 11 * USD, usdt);
      // 前一位的出價在同一個指令裡全額退回
      expect(await balance(usdt, buyer.publicKey)).to.equal(buyerBefore);
      expect(await balance(usdt, auctionPda(asset))).to.equal(11 * USD);
      await fails(bid(asset, bidder2, 12 * USD, usdt), "AlreadyLeading");
      await fails(settle(asset), "AuctionNotEnded");

      await sleep(5_000);
      await fails(bid(asset, buyer, 12 * USD, usdt), "AuctionEnded");
      await settle(asset);
      const fee = Math.floor((11 * USD * AUCTION_FEE_BPS) / 10_000);
      expect(await balance(usdt, seller.publicKey)).to.equal(sellerBefore + 11 * USD - fee);
      expect(await balance(usdt, treasury.publicKey)).to.equal(treasuryBefore + fee);
      expect((await ownerOf(asset)).toBase58()).to.equal(bidder2.publicKey.toBase58());
      expect(await connection.getAccountInfo(auctionPda(asset))).to.equal(null);
      expect(await connection.getAccountInfo(ata(usdt, auctionPda(asset)))).to.equal(null);
      expect(await connection.getAccountInfo(ata(usdc, auctionPda(asset)))).to.equal(null);
    });

    it("兩種幣混著出價：被超過時用原幣退回，結標時用得標那口的幣種付給賣家", async () => {
      const asset = await mintCard("IC-A0007");
      await createAuction(asset, 10 * USD, 0, 4);
      const buyerUsdt = await balance(usdt, buyer.publicKey);
      const bidderUsdc = await balance(usdc, bidder2.publicKey);
      const sellerUsdc = await balance(usdc, seller.publicKey).catch(() => 0);
      const sellerUsdt = await balance(usdt, seller.publicKey).catch(() => 0);

      await bid(asset, buyer, 10 * USD, usdt);
      await bid(asset, bidder2, 11 * USD, usdc);
      expect(await balance(usdt, buyer.publicKey)).to.equal(buyerUsdt);
      expect(await balance(usdt, auctionPda(asset))).to.equal(0);
      expect(await balance(usdc, auctionPda(asset))).to.equal(11 * USD);
      // 前一口是 USDC，退款帳戶要用 USDC 的
      await bid(asset, buyer, 12 * USD, usdt);
      expect(await balance(usdc, bidder2.publicKey)).to.equal(bidderUsdc);

      await sleep(5_000);
      await settle(asset);
      const fee = Math.floor((12 * USD * AUCTION_FEE_BPS) / 10_000);
      expect(await balance(usdt, buyer.publicKey)).to.equal(buyerUsdt - 12 * USD);
      expect(await balance(usdc, seller.publicKey).catch(() => 0)).to.equal(sellerUsdc);
      expect(await balance(usdt, seller.publicKey)).to.equal(sellerUsdt + 12 * USD - fee);
      expect((await ownerOf(asset)).toBase58()).to.equal(buyer.publicKey.toBase58());
      expect(await lamports(bidder2.publicKey)).to.equal(0);
    });

    it("沒達到保底價就流拍：資產退回賣家，最高出價全額退回", async () => {
      const asset = await mintCard("IC-A0002");
      await createAuction(asset, 10 * USD, 50 * USD, 3);
      const buyerBefore = await balance(usdc, buyer.publicKey);
      await bid(asset, buyer, 20 * USD, usdc);
      await sleep(4_000);
      await settle(asset);
      expect(await balance(usdc, buyer.publicKey)).to.equal(buyerBefore);
      expect((await ownerOf(asset)).toBase58()).to.equal(seller.publicKey.toBase58());
      expect(await connection.getAccountInfo(auctionPda(asset))).to.equal(null);
    });

    it("沒人出價時流拍或由賣家取消，資產退回賣家、租金退回平台；有人出價後不能取消", async () => {
      const unsold = await mintCard("IC-A0003");
      await createAuction(unsold, 10 * USD, 0, 2);
      await sleep(3_000);
      await settle(unsold);
      expect((await ownerOf(unsold)).toBase58()).to.equal(seller.publicKey.toBase58());

      const asset = await mintCard("IC-A0004");
      await createAuction(asset, 10 * USD, 0, 60);
      const rent = (await lamports(auctionPda(asset))) + (await lamports(ata(usdt, auctionPda(asset)))) + (await lamports(ata(usdc, auctionPda(asset))));
      const before = await lamports(platform.publicKey);
      await cancelAuction(asset);
      expect((await ownerOf(asset)).toBase58()).to.equal(seller.publicKey.toBase58());
      expect(await lamports(platform.publicKey)).to.be.greaterThan(before + rent - 20_000);

      await createAuction(asset, 10 * USD, 0, 60);
      await bid(asset, buyer, 10 * USD, usdt);
      await fails(cancelAuction(asset), "HasBids");
      await fails(bid(asset, seller, 12 * USD, usdt), "SellerCannotBid");
    });

    it("起標價、保底價和時長要在設定範圍內", async () => {
      const asset = await mintCard("IC-A0005");
      await fails(createAuction(asset, 5 * USD, 0, 60), "StartTooLow");
      await fails(createAuction(asset, 10 * USD, 5 * USD, 60), "InvalidReserve");
      await fails(createAuction(asset, 10 * USD, 0, 8 * 86_400), "InvalidDuration");
    });

    it("截止前的延長時間內出價，截止時間往後延", async () => {
      await program.methods.updateAuctionConfig(rules(3_600)).accountsPartial({ authority: platform.publicKey, config: configPda, auctionConfig: auctionConfigPda }).rpc();
      const asset = await mintCard("IC-A0006");
      await createAuction(asset, 10 * USD, 0, 60);
      const before = (await program.account.auction.fetch(auctionPda(asset))).endTs.toNumber();
      await bid(asset, buyer, 10 * USD, usdc);
      const after = (await program.account.auction.fetch(auctionPda(asset))).endTs.toNumber();
      expect(after).to.be.greaterThan(before + 3_000);
      // 開拍時記下的抽成不受之後改設定影響
      expect((await program.account.auction.fetch(auctionPda(asset))).feeBps).to.equal(AUCTION_FEE_BPS);
    });
  });
});
