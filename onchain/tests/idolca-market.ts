import * as anchor from "@anchor-lang/core";
import { expect } from "chai";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
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
const USDT = 1_000_000; // 6 位小數

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
  const listingPda = (asset: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("listing"), asset.toBuffer()], program.programId)[0];

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

  async function list(asset: PublicKey, price: number, paymentMint = usdt) {
    await program.methods
      .list(new anchor.BN(price))
      .accountsPartial({ seller: seller.publicKey, listing: listingPda(asset), asset, paymentMint, ...coreAccounts() })
      .signers([seller])
      .rpc();
  }

  function buyAccounts(asset: PublicKey) {
    return {
      buyer: buyer.publicKey,
      seller: seller.publicKey,
      listing: listingPda(asset),
      asset,
      paymentMint: usdt,
      buyerToken: getAssociatedTokenAddressSync(usdt, buyer.publicKey),
      sellerToken: getAssociatedTokenAddressSync(usdt, seller.publicKey),
      treasury: treasury.publicKey,
      treasuryToken: getAssociatedTokenAddressSync(usdt, treasury.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
      ...coreAccounts(),
    };
  }

  before(async () => {
    for (const kp of [seller, buyer]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    }

    usdt = await createMint(connection, platform, platform.publicKey, null, 6);
    usdc = await createMint(connection, platform, platform.publicKey, null, 6);
    const buyerUsdt = await getOrCreateAssociatedTokenAccount(connection, platform, usdt, buyer.publicKey);
    await mintTo(connection, platform, usdt, buyerUsdt.address, platform, 10_000 * USDT);
    await getOrCreateAssociatedTokenAccount(connection, platform, usdt, treasury.publicKey);

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

  it("掛單把資產轉進 Listing PDA，取消後退回賣家", async () => {
    const asset = await mintCard("IC-T0001");
    await list(asset, 100 * USDT);
    expect((await ownerOf(asset)).toBase58()).to.equal(listingPda(asset).toBase58());

    await program.methods
      .cancel()
      .accountsPartial({ seller: seller.publicKey, listing: listingPda(asset), asset, ...coreAccounts() })
      .signers([seller])
      .rpc();
    expect((await ownerOf(asset)).toBase58()).to.equal(seller.publicKey.toBase58());
    expect(await connection.getAccountInfo(listingPda(asset))).to.equal(null);
  });

  it("成交時貨款、抽成和資產原子交換", async () => {
    const asset = await mintCard("IC-T0002");
    const price = 1_280 * USDT;
    await list(asset, price);

    await program.methods
      .buy(new anchor.BN(price))
      .accountsPartial(buyAccounts(asset))
      .signers([buyer])
      .rpc();

    const fee = Math.floor((price * FEE_BPS) / 10_000);
    const sellerBalance = await getAccount(connection, getAssociatedTokenAddressSync(usdt, seller.publicKey));
    const treasuryBalance = await getAccount(connection, getAssociatedTokenAddressSync(usdt, treasury.publicKey));
    expect(Number(sellerBalance.amount)).to.equal(price - fee);
    expect(Number(treasuryBalance.amount)).to.equal(fee);
    expect((await ownerOf(asset)).toBase58()).to.equal(buyer.publicKey.toBase58());
    expect(await connection.getAccountInfo(listingPda(asset))).to.equal(null);
  });

  it("價格和預期不符時拒絕成交", async () => {
    const asset = await mintCard("IC-T0003");
    await list(asset, 50 * USDT);
    try {
      await program.methods
        .buy(new anchor.BN(40 * USDT))
        .accountsPartial(buyAccounts(asset))
        .signers([buyer])
        .rpc();
      expect.fail("應該失敗");
    } catch (e) {
      expect(String(e)).to.include("PriceMismatch");
    }
  });

  it("不接受 USDT、USDC 以外的結算代幣", async () => {
    const asset = await mintCard("IC-T0004");
    const other = await createMint(connection, platform, platform.publicKey, null, 6);
    try {
      await list(asset, 10 * USDT, other);
      expect.fail("應該失敗");
    } catch (e) {
      expect(String(e)).to.include("UnsupportedPaymentMint");
    }
  });

  it("提貨申請中（已凍結）的資產不能掛單", async () => {
    const asset = await mintCard("IC-T0005");
    await freezeAsset(umi, {
      asset: await fetchAsset(umi, publicKey(asset)),
      collection: await fetchCollection(umi, publicKey(collection)),
      delegate: umi.identity.publicKey,
      authority: sellerUmi,
    }).sendAndConfirm(umi);
    const listed = await list(asset, 10 * USDT).then(
      () => true,
      () => false,
    );
    expect(listed).to.equal(false);
    expect((await ownerOf(asset)).toBase58()).to.equal(seller.publicKey.toBase58());
  });

  describe("拍賣", () => {
    const AUCTION_FEE_BPS = 400;
    const bidder2 = Keypair.generate();
    const [auctionConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("auction_config")], program.programId);
    const auctionPda = (asset: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("auction"), asset.toBuffer()], program.programId)[0];
    const escrowOf = (asset: PublicKey) => getAssociatedTokenAddressSync(usdt, auctionPda(asset), true);
    const balance = async (owner: PublicKey) => Number((await getAccount(connection, getAssociatedTokenAddressSync(usdt, owner))).amount);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // 測試用的設定：最短 2 秒，方便等到截止
    const rules = (extendSecs: number) => ({ feeBps: AUCTION_FEE_BPS, minStart: new anchor.BN(10 * USDT), minDuration: new anchor.BN(2), maxDuration: new anchor.BN(7 * 86_400), extendSecs: new anchor.BN(extendSecs) });

    async function createAuction(asset: PublicKey, start: number, reserve: number, duration: number) {
      await program.methods
        .createAuction(new anchor.BN(start), new anchor.BN(reserve), new anchor.BN(duration))
        .accountsPartial({ seller: seller.publicKey, config: configPda, auctionConfig: auctionConfigPda, auction: auctionPda(asset), escrow: escrowOf(asset), asset, collection, paymentMint: usdt, mplCoreProgram: MPL_CORE_ID, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([seller])
        .rpc();
    }

    async function bid(asset: PublicKey, who: Keypair, amount: number) {
      const a = await program.account.auction.fetch(auctionPda(asset));
      const prev = a.bidCount > 0 ? a.highBidder : who.publicKey;
      await program.methods
        .bid(new anchor.BN(amount))
        .accountsPartial({
          bidder: who.publicKey,
          auctionConfig: auctionConfigPda,
          auction: auctionPda(asset),
          paymentMint: usdt,
          bidderToken: getAssociatedTokenAddressSync(usdt, who.publicKey),
          escrow: escrowOf(asset),
          prevBidder: prev,
          prevBidderToken: getAssociatedTokenAddressSync(usdt, prev),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([who])
        .rpc();
    }

    async function settle(asset: PublicKey) {
      const a = await program.account.auction.fetch(auctionPda(asset));
      const high = a.bidCount > 0 ? a.highBidder : seller.publicKey;
      await program.methods
        .settleAuction()
        .accountsPartial({
          cranker: platform.publicKey,
          seller: seller.publicKey,
          highBidder: high,
          config: configPda,
          auction: auctionPda(asset),
          escrow: escrowOf(asset),
          asset,
          collection,
          paymentMint: usdt,
          sellerToken: getAssociatedTokenAddressSync(usdt, seller.publicKey),
          highBidderToken: getAssociatedTokenAddressSync(usdt, high),
          treasury: treasury.publicKey,
          treasuryToken: getAssociatedTokenAddressSync(usdt, treasury.publicKey),
          mplCoreProgram: MPL_CORE_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    }

    const fails = async (go: Promise<unknown>, code: string) => {
      try {
        await go;
        expect.fail("應該失敗");
      } catch (e) {
        expect(String(e)).to.include(code);
      }
    };

    before(async () => {
      const sig = await connection.requestAirdrop(bidder2.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
      const ata = await getOrCreateAssociatedTokenAccount(connection, platform, usdt, bidder2.publicKey);
      await mintTo(connection, platform, usdt, ata.address, platform, 10_000 * USDT);
      await program.methods.initAuctionConfig(rules(0)).accountsPartial({ authority: platform.publicKey, config: configPda, auctionConfig: auctionConfigPda }).rpc();
    });

    it("出價鎖款，被超過時退回前一位；結標時貨款扣抽成給賣家、資產給得標者", async () => {
      const asset = await mintCard("IC-A0001");
      await createAuction(asset, 10 * USDT, 0, 4);
      expect((await ownerOf(asset)).toBase58()).to.equal(auctionPda(asset).toBase58());

      const buyerBefore = await balance(buyer.publicKey);
      const sellerBefore = await balance(seller.publicKey);
      const treasuryBefore = await balance(treasury.publicKey);
      await bid(asset, buyer, 10 * USDT);
      expect(await balance(buyer.publicKey)).to.equal(buyerBefore - 10 * USDT);

      await fails(bid(asset, bidder2, 10.5 * USDT), "BidTooLow");
      await bid(asset, bidder2, 11 * USDT);
      // 前一位的出價在同一個指令裡全額退回
      expect(await balance(buyer.publicKey)).to.equal(buyerBefore);
      expect(Number((await getAccount(connection, escrowOf(asset))).amount)).to.equal(11 * USDT);
      await fails(bid(asset, bidder2, 12 * USDT), "AlreadyLeading");
      await fails(bid(asset, seller, 12 * USDT), "SellerCannotBid");
      await fails(settle(asset), "AuctionNotEnded");

      await sleep(5_000);
      await fails(bid(asset, buyer, 12 * USDT), "AuctionEnded");
      await settle(asset);
      const fee = Math.floor((11 * USDT * AUCTION_FEE_BPS) / 10_000);
      expect(await balance(seller.publicKey)).to.equal(sellerBefore + 11 * USDT - fee);
      expect(await balance(treasury.publicKey)).to.equal(treasuryBefore + fee);
      expect((await ownerOf(asset)).toBase58()).to.equal(bidder2.publicKey.toBase58());
      expect(await connection.getAccountInfo(auctionPda(asset))).to.equal(null);
      expect(await connection.getAccountInfo(escrowOf(asset))).to.equal(null);
    });

    it("沒達到保底價就流拍：資產退回賣家，最高出價全額退回", async () => {
      const asset = await mintCard("IC-A0002");
      await createAuction(asset, 10 * USDT, 50 * USDT, 3);
      const buyerBefore = await balance(buyer.publicKey);
      await bid(asset, buyer, 20 * USDT);
      await sleep(4_000);
      await settle(asset);
      expect(await balance(buyer.publicKey)).to.equal(buyerBefore);
      expect((await ownerOf(asset)).toBase58()).to.equal(seller.publicKey.toBase58());
      expect(await connection.getAccountInfo(auctionPda(asset))).to.equal(null);
    });

    it("沒人出價時流拍或由賣家取消，資產退回賣家；有人出價後不能取消", async () => {
      const unsold = await mintCard("IC-A0003");
      await createAuction(unsold, 10 * USDT, 0, 2);
      await sleep(3_000);
      await settle(unsold);
      expect((await ownerOf(unsold)).toBase58()).to.equal(seller.publicKey.toBase58());

      const asset = await mintCard("IC-A0004");
      await createAuction(asset, 10 * USDT, 0, 60);
      const cancel = () =>
        program.methods
          .cancelAuction()
          .accountsPartial({ seller: seller.publicKey, config: configPda, auction: auctionPda(asset), escrow: escrowOf(asset), asset, collection, paymentMint: usdt, mplCoreProgram: MPL_CORE_ID, tokenProgram: TOKEN_PROGRAM_ID })
          .signers([seller])
          .rpc();
      await cancel();
      expect((await ownerOf(asset)).toBase58()).to.equal(seller.publicKey.toBase58());

      await createAuction(asset, 10 * USDT, 0, 60);
      await bid(asset, buyer, 10 * USDT);
      await fails(cancel(), "HasBids");
    });

    it("起標價、保底價和時長要在設定範圍內", async () => {
      const asset = await mintCard("IC-A0005");
      await fails(createAuction(asset, 5 * USDT, 0, 60), "StartTooLow");
      await fails(createAuction(asset, 10 * USDT, 5 * USDT, 60), "InvalidReserve");
      await fails(createAuction(asset, 10 * USDT, 0, 8 * 86_400), "InvalidDuration");
    });

    it("截止前的延長時間內出價，截止時間往後延", async () => {
      await program.methods.updateAuctionConfig(rules(3_600)).accountsPartial({ authority: platform.publicKey, config: configPda, auctionConfig: auctionConfigPda }).rpc();
      const asset = await mintCard("IC-A0006");
      await createAuction(asset, 10 * USDT, 0, 60);
      const before = (await program.account.auction.fetch(auctionPda(asset))).endTs.toNumber();
      await bid(asset, buyer, 10 * USDT);
      const after = (await program.account.auction.fetch(auctionPda(asset))).endTs.toNumber();
      expect(after).to.be.greaterThan(before + 3_000);
      // 開拍時記下的抽成不受之後改設定影響
      expect((await program.account.auction.fetch(auctionPda(asset))).feeBps).to.equal(AUCTION_FEE_BPS);
    });
  });
});
