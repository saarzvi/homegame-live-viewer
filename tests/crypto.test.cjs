const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const {webcrypto} = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8");
const start = source.indexOf("function getToken()");
const end = source.indexOf("function renderPlayers(", start);
assert.ok(start >= 0 && end > start);
const sandbox = {
  location: { hash: "" },
  crypto: webcrypto,
  atob: globalThis.atob,
  TextDecoder,
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);

async function run() {
  const record = "lt_" + "a".repeat(32);
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const encodedKey = Buffer.from(rawKey).toString("base64url");
  sandbox.location.hash = "#v=" + record + "." + encodedKey;
  assert.equal(sandbox.getToken().recordName, record);
  sandbox.location.hash = "#v=invalid";
  assert.equal(sandbox.getToken(), null);

  const original = {
    version: 1,
    groupName: "חבורת יום חמישי",
    potMinor: 641000,
    expiresAt: new Date(Date.now() + 1000 * 3600).toISOString(),
  };
  const key = await webcrypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await webcrypto.subtle.encrypt(
    {name: "AES-GCM", iv: nonce},
    key,
    new TextEncoder().encode(JSON.stringify(original))
  ));
  const combined = Buffer.concat([Buffer.from(nonce), Buffer.from(cipher)]).toString("base64");
  const decrypted = await sandbox.decryptSnapshot(combined, encodedKey);
  assert.equal(decrypted.groupName, original.groupName);
  assert.equal(decrypted.potMinor, 641000);
  await assert.rejects(sandbox.decryptSnapshot(combined, Buffer.alloc(32, 1).toString("base64url")));

  const expired = { ...original, expiresAt: new Date(Date.now() - 1000).toISOString() };
  const sealed = new Uint8Array(await webcrypto.subtle.encrypt(
    {name: "AES-GCM", iv: nonce}, key, new TextEncoder().encode(JSON.stringify(expired))
  ));
  const expiredCombined = Buffer.concat([Buffer.from(nonce), Buffer.from(sealed)]).toString("base64");
  await assert.rejects(sandbox.decryptSnapshot(expiredCombined, encodedKey), /expired/);
  process.stdout.write("CloudKit viewer crypto and token tests passed\n");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
