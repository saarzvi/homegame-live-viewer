import { tr, setLanguage, localeCode, applyLanguage, localizeHand } from "./i18n.js";

const state = {
  token: null,
  cloudKitEndpoint: "",
  apiToken: "",
  blocked: false,
  snapshot: null,
  lastReceivedAt: null,
  timer: null,
  request: null,
};
const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat(localeCode(), { style: "currency", currency: "ILS", maximumFractionDigits: 2, numberingSystem: "latn" });
const int = new Intl.NumberFormat(localeCode(), { maximumFractionDigits: 0, numberingSystem: "latn" });
const dateFmt = new Intl.DateTimeFormat(localeCode(), { dateStyle: "short", timeStyle: "short" });

function amount(minor) {
  return money.format(Number(minor || 0) / 100);
}
function safeString(value, max = 100) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function text(id, value) {
  $(id).textContent = String(value);
}
function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
function make(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = String(value);
  return el;
}
function showNotice(title, message) {
  $("dashboard").hidden = true;
  $("notice").hidden = false;
  text("notice-title", title);
  text("notice-message", message);
}
function showDashboard() {
  $("notice").hidden = true;
  $("dashboard").hidden = false;
}
function status(label, cls) {
  $("live-indicator").className = "status " + cls;
  text("live-text", label);
}
function getToken() {
  const fragment = location.hash.startsWith("#v=") ? location.hash.slice(3) : "";
  const match = /^(lt_[a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/.exec(fragment);
  return match ? { recordName: match[1], key: match[2] } : null;
}
function decodeBase64(base64) {
  const bytes = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, ch => ch.charCodeAt(0));
}
async function decryptSnapshot(ciphertext, secret) {
  const keyBytes = decodeBase64(secret);
  if (keyBytes.length !== 32) throw new Error("invalid key");
  const raw = decodeBase64(ciphertext);
  if (raw.length < 28) throw new Error("invalid ciphertext");
  // CryptoKit AES.GCM.SealedBox.combined format: nonce[12] | ciphertext | tag[16].
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.subarray(0, 12), tagLength: 128 },
    key, raw.subarray(12)
  );
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (parsed.version !== 1) throw new Error("invalid version");
  if (!Number.isFinite(Date.parse(parsed.expiresAt)) || Date.now() >= Date.parse(parsed.expiresAt)) {
    throw new Error("expired");
  }
  return parsed;
}
function renderPlayers(players) {
  const list = $("players");
  clearChildren(list);
  if (!Array.isArray(players) || !players.length) {
    list.appendChild(make("p", "subtle", tr("noPlayers")));
    return;
  }
  for (const player of players.slice(0, 40)) {
    const card = make("div", "player");
    const identification = make("div", "player-id");
    const name = safeString(player.name, 70) || tr("player");
    identification.appendChild(make("div", "avatar", name.slice(0, 1)));
    identification.appendChild(make("div", "player-name", name));
    card.appendChild(identification);
    card.appendChild(make("div", "player-buys", int.format(player.buyInCount ?? 0) + " " + tr("buyIns")));
    card.appendChild(make("div", "player-total", amount(player.totalInMinor)));
    list.appendChild(card);
  }
}
const suitLookup = { s: "♠", h: "♥", d: "♦", c: "♣" };
function renderCardRow(parent, cards, caption) {
  if (!Array.isArray(cards) || !cards.length) return;
  parent.appendChild(make("div", "hand-label", caption));
  const row = make("div", "cards");
  for (const code of cards.slice(0, 7)) {
    if (typeof code !== "string" || !/^(?:[2-9TJQKA])[shdc]$/.test(code)) continue;
    const suit = suitLookup[code[1]];
    const card = make("div", "card" + ("hd".includes(code[1]) ? " red" : ""),
      (code[0] === "T" ? "10" : code[0]) + suit);
    card.setAttribute("aria-label", code);
    row.appendChild(card);
  }
  parent.appendChild(row);
}
function renderHand(hand) {
  const section = $("hand-section");
  if (!hand || typeof hand !== "object") {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  text("hand-player", safeString(hand.playerName, 80) || tr("player"));
  text("hand-category", localizeHand(safeString(hand.category, 100)));
  const root = $("hand-cards");
  clearChildren(root);
  renderCardRow(root, hand.holeCards, tr("holeCards"));
  renderCardRow(root, hand.boardCards, tr("communityCards"));
}
function elapsed(startedAt) {
  const n = Date.parse(startedAt || "");
  if (!Number.isFinite(n)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - n) / 60000));
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function render(snapshot) {
  state.snapshot = snapshot;
  text("group-title", safeString(snapshot.groupName, 85) || tr("table"));
  text("group-desc", snapshot.status === "closed" ? tr("closed") : tr("updates"));
  text("pot", amount(snapshot.potMinor));
  text("players-count", int.format(snapshot.playerCount ?? snapshot.players?.length ?? 0));
  text("buyins-count", int.format(snapshot.buyInsTotal ?? 0));
  text("duration", elapsed(snapshot.startedAt));
  text("players-label", (snapshot.players?.length ?? 0) + " " + tr("participants"));
  renderPlayers(snapshot.players);
  renderHand(snapshot.bestHand);
  $("share-button").hidden = false;
  showDashboard();
  updateFreshness();
}
function updateFreshness() {
  if (!state.snapshot) return;
  text("duration", elapsed(state.snapshot.startedAt));
  const timestamp = Date.parse(state.snapshot.updatedAt || "");
  const valid = Number.isFinite(timestamp);
  const stale = !valid || Date.now() - timestamp > 90000;
  const finished = state.snapshot.status === "closed";
  status(finished ? tr("closed") : stale ? tr("delayed") : "LIVE", finished || stale ? "stale" : "live");
  text("updated-at", valid ? tr("lastUpdated") + dateFmt.format(new Date(timestamp)) + (stale && !finished ? tr("stale") : "") : tr("timeUnavailable"));
  $("poll-dot").className = "spinner" + (!stale && !finished ? " connected" : "");
}
async function fetchSnapshot() {
  if (state.blocked || !state.token || !state.cloudKitEndpoint || document.hidden) return;
  state.request?.abort();
  const controller = new AbortController();
  state.request = controller;
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    // The secret never leaves this browser. Only the random CKRecord name goes to Apple.
    const response = await fetch(
      state.cloudKitEndpoint + "?ckAPIToken=" + encodeURIComponent(state.apiToken),
      {
        method: "POST",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          records: [{ recordName: state.token.recordName }],
          desiredKeys: ["ciphertext", "expiry"]
        }),
        signal: controller.signal,
      }
    );
    if ([404, 410].includes(response.status)) throw new Error("revoked");
    if (!response.ok) throw new Error("cloudkit service error " + response.status);
    const result = await response.json();
    const item = result && result.records && result.records.find(r => r.recordName === state.token.recordName);
    if (!item || item.serverErrorCode || typeof item.fields?.ciphertext?.value !== "string") {
      throw new Error("revoked");
    }
    const snapshot = await decryptSnapshot(item.fields.ciphertext.value, state.token.key);
    state.lastReceivedAt = Date.now();
    render(snapshot);
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (["revoked", "expired", "invalid key", "invalid ciphertext"].includes(error?.message)
        || error?.name === "OperationError") {
      state.blocked = true;
      state.snapshot = null;
      showNotice(tr("accessExpired"), tr("revokedInfo"));
      status(tr("linkInactive"), "off");
      text("updated-at", tr("cannotView"));
      $("share-button").hidden = true;
      return;
    }
    if (!state.snapshot) {
      showNotice(tr("cannotConnect"), tr("cloudUnavailable"));
      status(tr("noConnection"), "off");
      text("updated-at", tr("reconnecting"));
    } else {
      status(tr("connectionProblem"), "stale");
      text("updated-at", tr("lastKnownData"));
    }
  } finally {
    clearTimeout(timeout);
    if (state.request === controller) state.request = null;
  }
}
async function boot() {
  state.token = getToken();
  if (!state.token) {
    showNotice(tr("needLink"), tr("inviteInfo"));
    status(tr("noLink"), "waiting");
    return;
  }
  try {
    const response = await fetch("./config.json", { cache: "no-store" });
    if (!response.ok) throw new Error("config");
    const config = await response.json();
    if (!/^iCloud\.[A-Za-z0-9.-]{8,160}$/.test(config.cloudKitContainer || "")
        || !/^[A-Za-z0-9_-]{12,200}$/.test(config.apiToken || "")
        || config.environment !== "production") {
      throw new Error("CLOUDKIT_NOT_CONFIGURED");
    }
    state.apiToken = config.apiToken;
    state.cloudKitEndpoint = "https://api.apple-cloudkit.com/database/1/"
      + encodeURIComponent(config.cloudKitContainer)
      + "/production/public/records/lookup";
  } catch {
    showNotice(tr("preparing"), tr("setupMissing"));
    status(tr("notActivated"), "waiting");
    return;
  }
  await fetchSnapshot();
  state.timer = setInterval(fetchSnapshot, 5000);
  setInterval(updateFreshness, 30000);
}
$("share-button").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    text("share-button", tr("copied"));
    setTimeout(() => text("share-button", tr("copy")), 1800);
  } catch {
    text("share-button", tr("cannotCopy"));
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.cloudKitEndpoint) fetchSnapshot();
});
window.addEventListener("hashchange", () => location.reload());
$("language-picker").addEventListener("change", event => {
  setLanguage(event.target.value);
  location.reload();
});
applyLanguage();
boot();
