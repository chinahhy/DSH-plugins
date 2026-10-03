window.__ModuleLoader__.load({id:"dsh-sidebar-quota",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react3 = require("react");

// src/shared/types.ts
var ROUTE = "/dsh-sidebar-quota/state";
function quotaLevel(value) {
  return value >= 70 ? "good" : value >= 40 ? "warning" : value >= 20 ? "low" : "critical";
}

// src/client/store.ts
function createStore() {
  let snapshot = { state: null, error: null };
  const listeners = /* @__PURE__ */ new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (value) => {
      snapshot = value;
      for (const listener of listeners) listener();
    }
  };
}
function valid(value) {
  const numeric = (n) => n === null || typeof n === "number" && Number.isFinite(n);
  return value && typeof value.updatedAt === "string" && value.deepseek?.pricing && value.codex && value.moonshot && ["deepseek", "moonshot"].every((id) => numeric(value[id].balance) && numeric(value[id].todaySpend)) && numeric(value.codex.fiveHourRemaining) && numeric(value.codex.weeklyRemaining);
}
function startPolling(store) {
  const lifetime = new AbortController();
  let pending = false;
  const load = async () => {
    if (pending || lifetime.signal.aborted) return;
    pending = true;
    try {
      const response = await fetch(ROUTE, { cache: "no-store", signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15e3)]) });
      if (!response.ok) throw new Error("state unavailable");
      const state = await response.json();
      if (!valid(state)) throw new Error("incompatible state");
      if (!lifetime.signal.aborted) store.set({ state, error: null });
    } catch {
      if (lifetime.signal.aborted) return;
      const previous = store.getSnapshot().state;
      const state = previous ? { ...previous, deepseek: { ...previous.deepseek, stale: true }, moonshot: { ...previous.moonshot, stale: true }, codex: { ...previous.codex, fiveHourRemaining: null, weeklyRemaining: null, stale: true } } : null;
      store.set({ state, error: "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u989D\u5EA6\u72B6\u6001" });
    } finally {
      pending = false;
    }
  };
  const visible = () => {
    if (!document.hidden) void load();
  };
  const timer = setInterval(visible, 5e3);
  document.addEventListener("visibilitychange", visible);
  void load();
  return () => {
    lifetime.abort();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", visible);
  };
}

// src/client/SidebarQuota.tsx
var import_react2 = require("react");

// src/client/ProviderSection.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function ProviderSection({ name, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dshsq-provider", "aria-label": name, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: name }),
    children
  ] });
}
function ValueRow({ label, value, title, stale = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `dshsq-row${stale ? " dshsq-stale" : ""}`, title, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshsq-value", children: value })
  ] });
}
var money = (amount) => amount == null ? "--" : `\xA5${amount.toFixed(2)}`;
var ESTIMATE = "\u672C\u673A DSH \u4ECA\u65E5\u4F30\u7B97\u6D88\u8D39\uFF0C\u4E0D\u5305\u542B\u5176\u4ED6\u8BBE\u5907\u548C\u5BA2\u6237\u7AEF";
function lastUpdated(at) {
  return at ? `\u4E0A\u6B21\u6210\u529F\u66F4\u65B0\uFF1A${new Date(at).toLocaleString()}` : "\u5C1A\u672A\u6210\u529F\u66F4\u65B0";
}

// src/client/DeepSeekSection.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function DeepSeekSection({ state, now }) {
  const pricing = state?.pricing;
  const period = pricing?.period ?? "unknown";
  const peak = period === "peak";
  const discount = pricing?.discount == null ? "\u6298\u6263\u672A\u77E5" : `${Number((pricing.discount * 10).toFixed(2))}\u6298`;
  const status = period === "unknown" ? "\u5CF0\u8C37\u89C4\u5219\u5F85\u786E\u8BA4" : peak ? "\u{1F7E7} \u5F53\u524D\u5CF0\u65F6 \xB7 \u539F\u4EF7" : `\u{1F7E6} \u5F53\u524D\u8C37\u65F6 \xB7 ${discount}`;
  const next = pricing?.nextChangeAt ? Math.max(0, Math.ceil((Date.parse(pricing.nextChangeAt) - now) / 6e4)) : null;
  const countdown = next === null ? "--" : `${Math.floor(next / 60)}h ${next % 60}m`;
  const priceTip = [pricing?.error, pricing?.stale ? "\u5F53\u524D\u4F7F\u7528\u7F13\u5B58\u6216\u5185\u7F6E\u89C4\u5219" : "", pricing?.calendarUnknown ? "\u8BE5\u5E74\u4EFD\u8282\u5047\u65E5\u65E5\u5386\u5C1A\u672A\u6838\u5B9E" : "", lastUpdated(pricing?.updatedAt)].filter(Boolean).join("\uFF1B");
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(ProviderSection, { name: "DeepSeek", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ValueRow, { label: "\u4ECA\u65E5\u6D88\u8D39", value: money(state?.todaySpend) + (state?.incompletePricing ? " *" : ""), title: [ESTIMATE, state?.usageWarning].filter(Boolean).join("\uFF1B"), stale: !!state?.usageWarning }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ValueRow, { label: "\u4F59\u989D", value: money(state?.balance), title: [state?.error, lastUpdated(state?.updatedAt)].filter(Boolean).join("\uFF1B"), stale: state?.stale }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `dshsq-period${pricing?.stale ? " dshsq-stale" : ""}`, title: priceTip, children: status }),
    period === "holiday" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshsq-note", children: "\u8282\u5047\u65E5\u5168\u5929\u8C37\u4EF7" }) : period === "weekend" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshsq-note", children: "\u5468\u672B\u5168\u5929\u8C37\u4EF7" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ValueRow, { label: pricing?.nextChangeType === "offpeak" ? "\u8DDD\u8C37\u65F6" : "\u8DDD\u5CF0\u65F6", value: countdown, title: priceTip })
  ] });
}

// src/client/QuotaBar.tsx
var import_react = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function QuotaBar({ label, value, resetAt, error }) {
  const previous = (0, import_react.useRef)(null);
  const [pulse, setPulse] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    if (value !== null && previous.current !== null && previous.current > 10 && value <= 10) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 1e3);
      previous.current = value;
      return () => clearTimeout(timer);
    }
    previous.current = value;
  }, [value]);
  const level = value === null ? "unknown" : quotaLevel(value);
  const title = error || `${label} \u5269\u4F59\u989D\u5EA6${resetAt ? `\uFF0C\u91CD\u7F6E\u4E8E ${new Date(resetAt).toLocaleString()}` : ""}`;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: `dshsq-quota${pulse ? " dshsq-pulse" : ""}`, title, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dshsq-track", role: "progressbar", "aria-label": `${label} \u5269\u4F59\u989D\u5EA6`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": value ?? void 0, "aria-valuetext": value === null ? "\u989D\u5EA6\u672A\u77E5" : `${Math.round(value)}%`, children: value !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: `dshsq-fill dshsq-${level}`, style: { width: `${value}%` } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `dshsq-percent${value !== null && value <= 20 ? ` dshsq-text-${level}` : ""}`, children: value === null ? "--" : `${Math.round(value)}%` })
  ] });
}

// src/client/CodexSection.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function CodexSection({ state }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(ProviderSection, { name: "ChatGPT / Codex", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(QuotaBar, { label: "5h", value: state?.fiveHourRemaining ?? null, resetAt: state?.fiveHourResetAt, error: state?.error }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(QuotaBar, { label: "Weekly", value: state?.weeklyRemaining ?? null, resetAt: state?.weeklyResetAt, error: state?.error })
  ] });
}

// src/client/MoonShotSection.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function MoonShotSection({ state }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(ProviderSection, { name: "MoonShot", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ValueRow, { label: "\u4ECA\u65E5\u6D88\u8D39", value: money(state?.todaySpend) + (state?.incompletePricing ? " *" : ""), title: [ESTIMATE, state?.usageWarning].filter(Boolean).join("\uFF1B"), stale: !!state?.usageWarning }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ValueRow, { label: "\u4F59\u989D", value: money(state?.balance), title: [state?.error, lastUpdated(state?.updatedAt)].filter(Boolean).join("\uFF1B"), stale: state?.stale })
  ] });
}

// src/client/SidebarQuota.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function SidebarQuota({ store, wide = true }) {
  const { state, error } = (0, import_react2.useSyncExternalStore)(store.subscribe, store.getSnapshot);
  const [now, setNow] = (0, import_react2.useState)(Date.now());
  (0, import_react2.useEffect)(() => {
    const timer = setInterval(() => setNow(Date.now()), 3e4);
    return () => clearInterval(timer);
  }, []);
  if (!wide) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dshsq dshsq-rail", "aria-label": "\u6A21\u578B\u989D\u5EA6", title: "\u5C55\u5F00\u4FA7\u680F\u67E5\u770B\u6A21\u578B\u989D\u5EA6", children: "\u989D\u5EA6" });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dshsq", "aria-label": "\u6A21\u578B\u989D\u5EA6", title: error ?? void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dshsq-heading", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u6A21\u578B\u989D\u5EA6" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(DeepSeekSection, { state: state?.deepseek, now }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(CodexSection, { state: state?.codex }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(MoonShotSection, { state: state?.moonshot })
  ] });
}

// src/client/styles.css
var styles_default = '.dshsq{box-sizing:border-box;flex:1 1 100%;width:100%;min-width:0;padding:8px 6px 10px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary);overflow-x:hidden;overflow-y:auto;max-height:50vh;font-variant-numeric:tabular-nums}\ndiv:has(> .dshsq){flex-wrap:wrap}\n.dshsq-heading{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);margin-bottom:9px;font-size:11px}\n.dshsq-heading:before,.dshsq-heading:after{content:"";height:1px;flex:1;background:var(--dsw-alias-border-l3)}\n.dshsq-provider{margin:0 0 10px;min-width:0}.dshsq-provider:last-child{margin-bottom:0}\n.dshsq-provider h3{font-size:12px;line-height:20px;font-weight:600;margin:0 0 3px;color:var(--dsw-alias-label-primary)}\n.dshsq-row{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:6px;color:var(--dsw-alias-label-secondary)}\n.dshsq-row>span:first-child{overflow-wrap:anywhere}.dshsq-value{text-align:right;white-space:nowrap;color:var(--dsw-alias-label-primary)}\n.dshsq-period{margin-top:2px;overflow-wrap:anywhere}.dshsq-note{color:var(--dsw-alias-label-tertiary)}\n.dshsq-stale{opacity:.65}.dshsq-quota{display:grid;grid-template-columns:42px minmax(5px,1fr) 36px;gap:7px;align-items:center;color:var(--dsw-alias-label-secondary);margin:3px 0}\n.dshsq-track{height:5px;width:100%;overflow:hidden;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover)}\n.dshsq-fill{height:100%;border-radius:4px;transition:width .3s}.dshsq-percent{text-align:right;white-space:nowrap;color:var(--dsw-alias-label-primary)}\n.dshsq-good{background:#32a66a}.dshsq-warning{background:#c99b28}.dshsq-low{background:#e18132}.dshsq-critical{background:#df5757}\n.dshsq-text-low{color:#d57627}.dshsq-text-critical{color:#df5757}.dshsq-text-warning{color:#b58b22}\n.dshsq-rail{width:36px;padding:5px 0;text-align:center;font-size:11px}\n.dshsq-pulse{animation:dshsq-quota-nudge .8s ease-out 1}@keyframes dshsq-quota-nudge{50%{opacity:.55}}\n@media(prefers-reduced-motion:reduce){.dshsq-fill{transition:none}.dshsq-pulse{animation:none}}\n@container(max-width:135px){.dshsq-quota{grid-template-columns:35px minmax(5px,1fr) 33px;gap:3px}}\n';

// src/client/index.tsx
var inject = ["slots"];
function apply(ctx) {
  const store = createStore();
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.pluginCss = "dsh-sidebar-quota";
    style.textContent = styles_default;
    document.head.appendChild(style);
    return () => style.remove();
  }, "sidebar quota: scoped styles");
  ctx.effect(() => startPolling(store), "sidebar quota: global store");
  const slots = ctx.get("slots");
  slots.inject("sidebar.footer.action", () => slots.register({ name: "sidebar.footer.action", id: "dsh-sidebar-quota", order: 50 }, (props) => (0, import_react3.createElement)(SidebarQuota, { store, wide: props.wide })));
}

return module.exports;}});
