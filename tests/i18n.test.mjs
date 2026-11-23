import assert from "node:assert/strict";
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "en-US" }
});
const l10n = await import("../assets/i18n.js");
assert.equal(l10n.getLanguage(), "en");
assert.equal(l10n.tr("pot"), "Current Pot");
l10n.setLanguage("ar");
assert.equal(l10n.tr("pot"), "المجموع الحالي");
assert.equal(l10n.localizeHand("פול האוס"), "فول هاوس");
assert.equal(l10n.localizeHand("Full House"), "فول هاوس");
const staticEl = {
  textContent: "",
  getAttribute(name) { return name === "data-i18n" ? "needLink" : null; }
};
const picker = { value: "" };
globalThis.document = {
  documentElement: { dir: "", lang: "" }, title: "",
  getElementById(name) { return name === "language-picker" ? picker : null; },
  querySelectorAll(selector) { return selector === "[data-i18n]" ? [staticEl] : []; }
};
l10n.applyLanguage();
assert.equal(globalThis.document.documentElement.dir, "rtl");
assert.equal(globalThis.document.documentElement.lang, "ar");
assert.equal(staticEl.textContent, "رابط الطاولة مطلوب");
assert.equal(picker.value, "ar");
l10n.setLanguage("he");
assert.equal(l10n.tr("pot"), "הקופה הנוכחית");
l10n.setLanguage("en");
l10n.applyLanguage();
assert.equal(globalThis.document.documentElement.dir, "ltr");
assert.equal(globalThis.document.documentElement.lang, "en");
assert.equal(staticEl.textContent, "Table link required");
console.log("All three spectator locales and RTL/LTR switches passed");
