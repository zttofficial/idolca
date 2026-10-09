import * as anchor from "@anchor-lang/core";
import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createSignerFromKeypair, generateSigner, keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair, toWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { create, createCollection, fetchAsset, fetchCollection, freezeAsset, mplCore } from "@metaplex-foundation/mpl-core";
import type { IdolcaMarket } from "../target/types/idolca_market";

const MPL_CORE_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const FEE_BPS = 250;
const USDT = 1_000_000; // 6 位小數

describe("idolca-market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.IdolcaMarket as anchor.Program<IdolcaMarket>;
  const connection = provider.connection;
  const platform = (provider.wallet as anchor.Wallet).payer;

  const umi = createUmi(connection.rpcEndpoint).use(mplCore()).use(keypairIdentity(fromWeb3JsKeypair(platform)));

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
});
