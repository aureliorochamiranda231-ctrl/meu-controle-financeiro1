import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const PORT = 39027;
const password = "TEST-only-strong-passphrase-do-not-use-in-production";
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms));

test("Railway Ayla gateway: health, authorization and missing AI key", async () => {
  const child = spawn("bun", ["run", "server/ayla/railway.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      AYLA_PASSWORD_SHA256: createHash("sha256").update(password).digest("hex"),
      AYLA_SESSION_SECRET: "CI-TEST-SESSION-SECRET-NOT-FOR-PRODUCTION-" + "x".repeat(56),
      OPENAI_API_KEY: "",
      AYLA_WEB_ORIGIN: "",
      AYLA_WEB_SEARCH: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let diagnostics = "";
  child.stderr.on("data", chunk => { diagnostics += chunk.toString().slice(0, 4000); });
  child.stdout.on("data", chunk => { diagnostics += chunk.toString().slice(0, 4000); });
  const base = "http://127.0.0.1:" + PORT;
  const post = async (path, value, headers = {}) => fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value)
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      if (child.exitCode !== null) break;
      try {
        const res = await fetch(base + "/health", { signal: AbortSignal.timeout(1000) });
        if (res.ok) { ready = true; break; }
      } catch {}
      await timeout(200);
    }
    assert.ok(ready, "Backend did not start: " + diagnostics.slice(-1000));
    const health = await fetch(base + "/health");
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.apiReady, false);

    const content = { messages: [{ role: "user", content: "Olá" }] };
    assert.equal((await post("/chat", content)).status, 401, "Anonymous chat must be blocked");
    assert.equal((await post("/auth", { password: "invalid" })).status, 401, "Bad password must be blocked");

    const auth = await post("/auth", { password });
    assert.equal(auth.status, 200, "Valid private password should work");
    const { token, expiresIn } = await auth.json();
    assert.equal(typeof token, "string");
    assert.ok(token.length > 64);
    assert.equal(expiresIn, 43200);

    const authorized = await post("/chat", content, { Authorization: "Bearer " + token });
    assert.equal(authorized.status, 503, "Should not call a paid model without configured API key");
    assert.equal((await authorized.json()).error, "ai_key_missing");

    const method = await fetch(base + "/auth", { method: "GET" });
    assert.equal(method.status, 405);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("exit", resolve)), timeout(2500)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});
