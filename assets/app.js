const state = {
  token: null,
  apiBaseUrl: "",
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
  const fragment = decodeURIComponent(location.hash.slice(1)).replace(/^v=/i, "").trim();
  return /^[A-Za-z0-9_-]{43}$/.test(fragment) ? fragment : null;
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
  if (state.blocked || !state.token || !state.apiBaseUrl || document.hidden) return;
  state.request?.abort();
  const controller = new AbortController();
  state.request = controller;
  const timeout = setTimeout(() => controller.abort(), 9500);
  try {
    const response = await fetch(state.apiBaseUrl + "/view", {
      method: "POST",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token }),
      signal: controller.signal,
    });
    if ([403, 404, 410].includes(response.status)) {
      state.blocked = true;
      state.snapshot = null;
      showNotice("הגישה לשולחן הסתיימה", "ייתכן שהמנהל ביטל את הקישור או שתוקף ההזמנה פג.");
      status("הקישור אינו פעיל", "off");
      text("updated-at", "אין אפשרות לצפות בשולחן");
      $("share-button").hidden = true;
      return;
    }
    if (!response.ok) throw Error("service error: " + response.status);
    const result = await response.json();
    if (!result || !result.snapshot || result.snapshot.version !== 1) throw Error("invalid snapshot");
    state.lastReceivedAt = Date.now();
    render(result.snapshot);
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (!state.snapshot) {
      showNotice("לא ניתן להציג את השולחן", "החיבור לשירות העדכונים אינו זמין כרגע. נסו שוב בעוד רגע.");
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
    const config = await response.json();
    const base = String(config.apiBaseUrl || "").replace(/\/+$/, "");
    if (!/^https:\/\/[a-z\d.-]+(?:\/[-a-z\d_/]*)?$/i.test(base)) throw Error("API_NOT_CONFIGURED");
    state.apiBaseUrl = base;
  } catch {
    showNotice("דף הצפייה בהכנה", "הקישור תקין, אבל שירות העדכונים עדיין לא הופעל. לא נחשפו נתונים.");
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
  if (!document.hidden && state.apiBaseUrl) fetchSnapshot();
});
window.addEventListener("hashchange", () => location.reload());
boot();
