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
const money = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

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
    list.appendChild(make("p", "subtle", "טרם נוספו שחקנים"));
    return;
  }
  for (const player of players.slice(0, 40)) {
    const card = make("div", "player");
    const identification = make("div", "player-id");
    const name = safeString(player.name, 70) || "שחקן";
    identification.appendChild(make("div", "avatar", name.slice(0, 1)));
    identification.appendChild(make("div", "player-name", name));
    card.appendChild(identification);
    card.appendChild(make("div", "player-buys", int.format(player.buyInCount ?? 0) + " כניסות"));
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
  text("hand-player", safeString(hand.playerName, 80) || "שחקן");
  text("hand-category", safeString(hand.category, 100));
  const root = $("hand-cards");
  clearChildren(root);
  renderCardRow(root, hand.holeCards, "קלפי השחקן");
  renderCardRow(root, hand.boardCards, "קלפים משותפים");
}
function elapsed(startedAt) {
  const n = Date.parse(startedAt || "");
  if (!Number.isFinite(n)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - n) / 60000));
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function render(snapshot) {
  state.snapshot = snapshot;
  text("group-title", safeString(snapshot.groupName, 85) || "השולחן");
  text("group-desc", snapshot.status === "closed" ? "הערב הסתיים" : "עדכונים מהשולחן בזמן אמת");
  text("pot", amount(snapshot.potMinor));
  text("players-count", int.format(snapshot.playerCount ?? snapshot.players?.length ?? 0));
  text("buyins-count", int.format(snapshot.buyInsTotal ?? 0));
  text("duration", elapsed(snapshot.startedAt));
  text("players-label", (snapshot.players?.length ?? 0) + " משתתפים");
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
  status(finished ? "הערב הסתיים" : stale ? "עדכון מתעכב" : "LIVE", finished || stale ? "stale" : "live");
  text("updated-at", valid ? "עדכון אחרון: " + dateFmt.format(new Date(timestamp)) + (stale && !finished ? " · נתונים לא עדכניים" : "") : "שעת עדכון אינה זמינה");
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
      showNotice("הגישה לשולחן הסתיימה", "המנהל ביטל את הקישור או שתוקפו פג. בקשו קישור חדש.");
      status("הקישור אינו פעיל", "off");
      text("updated-at", "אין אפשרות לצפות בשולחן");
      $("share-button").hidden = true;
      return;
    }
    if (!state.snapshot) {
      showNotice("לא ניתן להציג את השולחן", "החיבור ל־CloudKit אינו זמין כרגע. אפשר לנסות שוב מאוחר יותר.");
      status("אין חיבור", "off");
      text("updated-at", "מנסה להתחבר מחדש");
    } else {
      status("בעיית חיבור", "stale");
      text("updated-at", "מציגים את הנתונים האחרונים שהתקבלו");
    }
  } finally {
    clearTimeout(timeout);
    if (state.request === controller) state.request = null;
  }
}
async function boot() {
  state.token = getToken();
  if (!state.token) {
    showNotice("קישור לשולחן נדרש", "פתחו את קישור ההזמנה שנשלח ממנהל הערב. לא נדרשת הרשמה או התקנה.");
    status("אין קישור", "waiting");
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
    showNotice("דף הצפייה בהכנה", "שירות CloudKit עדיין לא הוגדר. האפליקציה לא חושפת נתונים עד להשלמת החיבור.");
    status("השירות טרם הופעל", "waiting");
    return;
  }
  await fetchSnapshot();
  state.timer = setInterval(fetchSnapshot, 5000);
  setInterval(updateFreshness, 30000);
}
$("share-button").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    text("share-button", "הקישור הועתק");
    setTimeout(() => text("share-button", "העתקת קישור"), 1800);
  } catch {
    text("share-button", "לא ניתן להעתיק");
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.cloudKitEndpoint) fetchSnapshot();
});
window.addEventListener("hashchange", () => location.reload());
boot();
