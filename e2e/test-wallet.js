// 注入頁面的測試錢包：實作 Wallet Standard（connect、signMessage、signAndSendTransaction），
// 用 WebCrypto 的 Ed25519 和真實私鑰簽名，交易真的送到 devnet。__SEED__、__ADDRESS__、__PUBKEY__ 由驅動腳本替換
(() => {
  const SEED = Uint8Array.from(__SEED__);
  const PUBKEY = Uint8Array.from(__PUBKEY__);
  const ADDRESS = "__ADDRESS__";
  const RPC = "https://api.devnet.solana.com";
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const b58 = (bytes) => {
    let n = 0n;
    for (const b of bytes) n = n * 256n + BigInt(b);
    let out = "";
    while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
    for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
    return out;
  };
  const pkcs8 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20, ...SEED]);
  const keyPromise = crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  const sign = async (bytes) => new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, await keyPromise, bytes));

  const sigStart = (tx) => {
    let i = 0;
    while (tx[i++] & 0x80);
    return i;
  };
  // 舊版交易格式：[簽名數 (compact-u16)][64 位元組簽名 × n][訊息]。訊息的帳戶表裡找到自己的位置，填進對應的簽名格
  const signTx = async (tx) => {
    let count = 0, shift = 0, i = 0;
    for (;;) { const b = tx[i++]; count |= (b & 0x7f) << shift; if (!(b & 0x80)) break; shift += 7; }
    const sigStart = i;
    const message = tx.slice(sigStart + 64 * count);
    // 跳過訊息標頭（3 位元組）和帳戶數（compact-u16），帳戶表從 j 開始，前 count 個是簽名人
    let j = 3;
    while (message[j++] & 0x80);
    let index = -1;
    for (let k = 0; k < count; k++) {
      const key = message.slice(j + 32 * k, j + 32 * k + 32);
      if (key.every((v, x) => v === PUBKEY[x])) index = k;
    }
    if (index < 0) throw new Error("signer not found");
    const sig = await sign(message);
    const out = tx.slice();
    out.set(sig, sigStart + 64 * index);
    return { out, sig };
  };

  const account = { address: ADDRESS, publicKey: PUBKEY, chains: ["solana:devnet"], features: ["solana:signMessage", "solana:signAndSendTransaction"], label: "Test" };
  const wallet = {
    version: "1.0.0",
    name: "Idolca Test Wallet",
    icon: "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#e8285a"/></svg>'),
    chains: ["solana:devnet"],
    get accounts() { return [account]; },
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
      "standard:events": { version: "1.0.0", on: () => () => {} },
      "solana:signMessage": { version: "1.0.0", signMessage: async ({ message }) => [{ signedMessage: message, signature: await sign(message) }] },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy"],
        signAndSendTransaction: async ({ transaction }) => {
          const { out } = await signTx(transaction);
          let b = "";
          out.forEach((x) => (b += String.fromCharCode(x)));
          const res = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [btoa(b), { encoding: "base64" }] }) })).json();
          if (res.error) throw new Error(res.error.message);
          window.__lastTx = res.result;
          // 回傳交易編號（第一個簽名）；手續費由平台付時，第一個簽名是平台的，不是錢包自己的
          return [{ signature: out.slice(sigStart(out), sigStart(out) + 64) }];
        },
      },
    },
  };
  const register = ({ register }) => register(wallet);
  window.addEventListener("wallet-standard:app-ready", (e) => register(e.detail));
  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
  window.__testWallet = ADDRESS;
  window.__b58 = b58;
})();
