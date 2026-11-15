import test from "node:test";
import assert from "node:assert/strict";

process.env.AYLA_TEST_MODE = "1";
process.env.OPENAI_API_KEY = "sk-test-" + "x".repeat(40);
process.env.AYLA_PRIVATE_TOKEN = "a".repeat(48);
const { createAylaServer } = await import("./index.mjs");

async function onServer(handler) {
  let requestMade;
  const upstream = async (url, options) => {
    requestMade = { url, options };
    return {
      ok: true,
      json: async () => ({ output: [{ content: [{ type: "output_text", text: "Olá do servidor!" }] }] })
    };
  };
  const server = createAylaServer({ requestModel: upstream });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  try { await handler(url, () => requestMade); }
  finally { await new Promise((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve())
  ); }
}

test("health: server is configured and does not expose credentials", async () => {
  await onServer(async base => {
    const response = await fetch(base + "/health");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ready: true });
  });
});

test("private chat rejects missing or incorrect authorization", async () => {
  await onServer(async (base, upstream) => {
    const body = JSON.stringify({ messages: [{ role: "user", content: "Oi" }] });
    for (const auth of [undefined, "Bearer " + "b".repeat(48)]) {
      const headers = { "Content-Type": "application/json" };
      if (auth) headers.Authorization = auth;
      const response = await fetch(base + "/chat", { method: "POST", headers, body });
      assert.equal(response.status, 401);
    }
    assert.equal(upstream(), undefined);
  });
});

test("malformed financial summary is rejected without calling OpenAI", async () => {
  await onServer(async (base, upstream) => {
    const response = await fetch(base + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + "a".repeat(48) },
      body: JSON.stringify({ messages: [{ role: "user", content: "Oi" }], financialSummary: { balance: -2 } })
    });
    assert.equal(response.status, 400);
    assert.equal(upstream(), undefined);
  });
});

test("authorized requests call model and never return server secrets", async () => {
  await onServer(async (base, upstream) => {
    const response = await fetch(base + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + "a".repeat(48) },
      body: JSON.stringify({ messages: [{ role: "user", content: "Oi, Ayla!" }] })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: "Olá do servidor!" });
    assert.equal(upstream().url, "https://api.openai.com/v1/responses");
    assert.equal(JSON.parse(upstream().options.body).store, false);
  });
});
