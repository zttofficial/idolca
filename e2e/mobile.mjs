// 手機版面檢查：在無頭 Chrome 裡模擬 390×844 的手機，逐頁截整頁圖，並列出超出螢幕寬度、會造成橫向捲動的元素。
// 只讀頁面、不登入，可以對線上站跑：npm run test:e2e:mobile -- https://idolca.trade
// 截圖存到 E2E_OUT（預設 .data/e2e-shots/mobile）。CHROME_PATH 指定 Chrome 位置
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, check, finish, sleep } from "./lib.mjs";

const OUT = process.env.E2E_OUT ?? ".data/e2e-shots/mobile";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const W = 390;
const H = 844;
const PAGES = (process.env.E2E_PAGES ?? "/,/market,/market?tab=items,/packs,/catalog,/binder,/charts,/vault,/grading,/terms").split(",");
mkdirSync(OUT, { recursive: true });

const PORT = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${resolve(OUT, `profile-${Date.now()}`)}`, "--hide-scrollbars", "about:blank"]);
let targets;
for (let i = 0; i < 50; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.some((t) => t.type === "page")) break;
  } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
// 視窗本身有最小寬度，要用裝置模擬才是真正的手機版面
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });

// 超出螢幕右緣的元素：只報最外層的那個，略過本來就該橫向捲動的容器裡的子元素
const OVERFLOW = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= vw + 1) continue;
    let p = el.parentElement, clipped = false;
    while (p && p !== document.body) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clipped = true; break; }
      p = p.parentElement;
    }
    if (clipped) continue;
    if (out.some((o) => o.el.contains(el))) continue;
    out.push({ el, desc: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 4).join('.') : '') + ' right=' + Math.round(r.right) });
  }
  return { scroll: document.documentElement.scrollWidth, vw, items: out.slice(0, 8).map((o) => o.desc) };
})()`;

for (const path of PAGES) {
  await send("Page.navigate", { url: BASE + path });
  await sleep(6000);
  const name = path.replace(/[/?=]+/g, "_").replace(/^_|_$/g, "") || "home";
  const height = Math.min(await evaluate("document.documentElement.scrollHeight"), 8000);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height, scale: 1 } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.result.data, "base64"));
  const o = await evaluate(OVERFLOW);
  check(`${path} 無橫向捲動 (${o.scroll}/${o.vw})`, o.scroll <= o.vw && o.items.length === 0);
  for (const d of o.items) console.log("    " + d);
  // 導航入口在手機上要看得到
  check(`${path} 導航入口可見`, await evaluate(`!!document.querySelector('header [aria-controls="mobile-nav"]')?.getClientRects().length`));
}

// 打開選單：面板裡有搜尋框和各頁入口，點入口會跳頁並收起選單
await send("Page.navigate", { url: BASE + "/" });
await sleep(6000);
await evaluate(`document.querySelector('header [aria-controls="mobile-nav"]').click()`);
await sleep(500);
check("選單展開", await evaluate(`document.querySelectorAll('#mobile-nav a').length >= 5 && !!document.querySelector('#mobile-nav input[name=q]')`));
writeFileSync(`${OUT}/menu-open.png`, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
await evaluate(`document.querySelector('#mobile-nav a[href$="/market"]').click()`);
await sleep(4000);
check("點入口跳頁並收起", await evaluate(`location.pathname.endsWith('/market') && !document.querySelector('#mobile-nav')`));

ws.close();
chrome.kill();
finish();
