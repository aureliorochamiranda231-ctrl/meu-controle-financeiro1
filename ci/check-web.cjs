// Smoke-test the exported KYVON web UI using a headless Chrome instance.
// Requests are served from dist/ at the same origin used by Android WebView.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const puppeteer = require("puppeteer-core");

function browserPath() {
  for (const candidate of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return execFileSync("which", ["google-chrome"], { encoding: "utf-8" }).trim();
}
async function main() {
  const root = path.resolve("dist");
  const browser = await puppeteer.launch({
    executablePath: browserPath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  let failures = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", error => { failures.push(error.message); console.error("PAGE ERROR:", error.stack || error.message); });
    page.on("console", message => console.log("BROWSER", message.type(), message.text().slice(0, 600)));
    page.on("requestfailed", request => console.error("REQUEST FAILED", request.url(), request.failure()?.errorText));
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.hostname !== "appassets.androidplatform.net") {
        console.log("EXTERNAL URL:", request.url());
        return request.abort();
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
        console.error("ASSET MISSING", relative);
        return request.respond({ status: 404, body: "Not found" });
      }
      const extension = path.extname(filename);
      const contentType = ({".html": "text/html; charset=UTF-8", ".js": "text/javascript; charset=UTF-8", ".css": "text/css; charset=UTF-8", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml"})[extension] || "application/octet-stream";
      return request.respond({ status: 200, contentType, body: fs.readFileSync(filename) });
    });
    await page.goto("https://appassets.androidplatform.net/index.html", { waitUntil: "load", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 4000));
    const result = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: document.body?.innerText?.slice(0, 1600) || "",
      rootHTML: document.getElementById("root")?.innerHTML?.slice(0, 500) || "",
      scripts: Array.from(document.scripts).map(node => node.src || "inline").slice(0, 10)
    }));
    console.log("SMOKE TEST RESULT", JSON.stringify(result));
    if (!result.bodyText.includes("Gastos") || !result.bodyText.includes("Reserva")) {
      throw new Error("KYVON did not display the expected application controls in Chrome");
    }
    if (failures.length > 0) throw new Error("Browser JavaScript errors: " + failures.join("; "));
    console.log("SMOKE TEST PASS");
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error("SMOKE TEST FAIL:", error.stack || error); process.exitCode = 1; });
