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
var import_react4 = require("react");

// src/shared/types.ts
var ROUTE = "/dsh-sidebar-quota/state";
var REFRESH_ROUTE = "/dsh-sidebar-quota/refresh";
var REFRESH_HEADER = "dsh-sidebar-refresh";
var PROVIDERS = ["deepseek", "codex", "moonshot"];
function quotaLevel(value) {
  return value >= 70 ? "good" : value >= 40 ? "warning" : value >= 20 ? "low" : "critical";
}

// src/client/store.ts
var COLLAPSE_KEY = "dsh-sidebar-quota:collapsed:v1";
var flags = () => ({ deepseek: false, codex: false, moonshot: false });
function savedCollapse() {
  try {
    const value = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "{}");
    return Object.fromEntries(PROVIDERS.map((id) => [id, value?.[id] === true]));
  } catch {
    return flags();
  }
}
function createStore() {
  let snapshot = { state: null, error: null, collapsed: savedCollapse(), refreshing: flags(), refreshErrors: {} };
  const listeners = /* @__PURE__ */ new Set(), lifetime = new AbortController();
  const set = (value) => {
    snapshot = { ...snapshot, ...value };
    for (const listener of listeners) listener();
  };
  const accept = (state) => {
    if (!snapshot.state || Date.parse(state.updatedAt) >= Date.parse(snapshot.state.updatedAt)) set({ state, error: null });
  };
  const signal = (timeout = 15e3) => AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeout)]);
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set,
    accept,
    signal,
    stop: () => lifetime.abort(),
    toggle: (id) => {
      const collapsed = { ...snapshot.collapsed, [id]: !snapshot.collapsed[id] };
      set({ collapsed });
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
      } catch {
      }
    },
    refresh: async (id) => {
      if (snapshot.refreshing[id] || lifetime.signal.aborted) return;
      set({ refreshing: { ...snapshot.refreshing, [id]: true }, refreshErrors: { ...snapshot.refreshErrors, [id]: void 0 } });
      try {
        const response = await fetch(`${REFRESH_ROUTE}?provider=${id}`, { method: "POST", headers: { [REFRESH_HEADER]: "1" }, cache: "no-store", signal: signal(3e4) });
        if (response.status === 429) {
          set({ refreshErrors: { ...snapshot.refreshErrors, [id]: "\u8BF7\u7A0D\u5019 3 \u79D2\u518D\u5237\u65B0" } });
          return;
        }
        if (!response.ok) throw new Error("refresh unavailable");
        const state = await response.json();
        if (!valid(state)) throw new Error("incompatible state");
        if (lifetime.signal.aborted) return;
        accept(state);
        set({ refreshErrors: { ...snapshot.refreshErrors, [id]: state[id].error } });
      } catch {
        if (lifetime.signal.aborted) return;
        const state = snapshot.state ? { ...snapshot.state, [id]: staleProvider(snapshot.state[id], id) } : null;
        set({ state, refreshErrors: { ...snapshot.refreshErrors, [id]: "\u5237\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" } });
      } finally {
        if (!lifetime.signal.aborted) set({ refreshing: { ...snapshot.refreshing, [id]: false } });
      }
    }
  };
}
function staleProvider(value, id) {
  return id === "codex" ? { ...value, fiveHourRemaining: null, weeklyRemaining: null, stale: true } : { ...value, stale: true };
}
function valid(value) {
  const numeric = (n) => n === null || typeof n === "number" && Number.isFinite(n);
  return value && typeof value.updatedAt === "string" && value.deepseek?.pricing && value.codex && value.moonshot && ["deepseek", "moonshot"].every((id) => numeric(value[id].balance) && numeric(value[id].todaySpend)) && numeric(value.codex.fiveHourRemaining) && numeric(value.codex.weeklyRemaining);
}
function startPolling(store) {
  let stopped = false, pending = false;
  const load = async () => {
    if (pending || stopped) return;
    pending = true;
    try {
      const response = await fetch(ROUTE, { cache: "no-store", signal: store.signal() });
      if (!response.ok) throw new Error("state unavailable");
      const state = await response.json();
      if (!valid(state)) throw new Error("incompatible state");
      if (!stopped) store.accept(state);
    } catch {
      if (stopped) return;
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
    stopped = true;
    store.stop();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", visible);
  };
}

// src/client/SidebarQuota.tsx
var import_react3 = require("react");

// src/client/ProviderSection.tsx
var import_react = require("react");

// src/client/ControlIcons.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function RefreshIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M19 12a7 7 0 1 1-5-6.7M20 4l1.2 2.8L24 8l-2.8 1.2L20 12l-1.2-2.8L16 8l2.8-1.2zM13 2v4h-4" }) });
}
function ChevronIcon({ collapsed }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: collapsed ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6" }) });
}

// src/client/ProviderSection.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function ProviderSection({ name, children, controls, updatedAt }) {
  const contentId = (0, import_react.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: `dshsq-provider${controls.collapsed ? " dshsq-collapsed" : ""}`, "aria-label": name, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshsq-provider-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: name }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: `dshsq-control dshsq-refresh${controls.refreshError ? " dshsq-refresh-error" : ""}`, disabled: controls.refreshing, "aria-busy": controls.refreshing, "aria-label": `\u5237\u65B0 ${name}`, title: controls.refreshing ? "\u6B63\u5728\u67E5\u8BE2\u6700\u65B0\u6570\u636E\u2026" : controls.refreshError ?? `\u5237\u65B0 ${name}\uFF1B${lastUpdated(updatedAt)}`, onClick: controls.onRefresh, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RefreshIcon, {}) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dshsq-control", "aria-label": `${controls.collapsed ? "\u5C55\u5F00" : "\u6298\u53E0"} ${name}`, "aria-expanded": !controls.collapsed, "aria-controls": contentId, title: controls.collapsed ? "\u5C55\u5F00\u8BE6\u60C5" : "\u6298\u53E0\u8BE6\u60C5", onClick: controls.onToggle, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ChevronIcon, { collapsed: controls.collapsed }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshsq-sr-only", role: "status", children: controls.refreshing ? "\u6B63\u5728\u5237\u65B0" : controls.refreshError ?? "" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { id: contentId, hidden: controls.collapsed, children })
  ] });
}
function ValueRow({ label, value, title, stale = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `dshsq-row${stale ? " dshsq-stale" : ""}`, title, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshsq-value", children: value })
  ] });
}
var money = (amount) => amount == null ? "--" : `\xA5${amount.toFixed(2)}`;
var ESTIMATE = "\u672C\u673A DSH \u4ECA\u65E5\u4F30\u7B97\u6D88\u8D39\uFF0C\u4E0D\u5305\u542B\u5176\u4ED6\u8BBE\u5907\u548C\u5BA2\u6237\u7AEF";
function lastUpdated(at) {
  return at ? `\u4E0A\u6B21\u6210\u529F\u66F4\u65B0\uFF1A${new Date(at).toLocaleString()}` : "\u5C1A\u672A\u6210\u529F\u66F4\u65B0";
}

// src/client/DeepSeekSection.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function DeepSeekSection({ state, now, controls }) {
  const pricing = state?.pricing;
  const period = pricing?.period ?? "unknown";
  const peak = period === "peak";
  const discount = pricing?.discount == null ? "\u6298\u6263\u672A\u77E5" : `${Number((pricing.discount * 10).toFixed(2))}\u6298`;
  const status = period === "unknown" ? "\u5CF0\u8C37\u89C4\u5219\u5F85\u786E\u8BA4" : peak ? "\u{1F7E7} \u5F53\u524D\u5CF0\u65F6 \xB7 \u539F\u4EF7" : `\u{1F7E6} \u5F53\u524D\u8C37\u65F6 \xB7 ${discount}`;
  const next = pricing?.nextChangeAt ? Math.max(0, Math.ceil((Date.parse(pricing.nextChangeAt) - now) / 6e4)) : null;
  const countdown = next === null ? "--" : `${Math.floor(next / 60)}h ${next % 60}m`;
  const priceTip = [pricing?.error, pricing?.stale ? "\u5F53\u524D\u4F7F\u7528\u7F13\u5B58\u6216\u5185\u7F6E\u89C4\u5219" : "", pricing?.calendarUnknown ? "\u8BE5\u5E74\u4EFD\u8282\u5047\u65E5\u65E5\u5386\u5C1A\u672A\u6838\u5B9E" : "", lastUpdated(pricing?.updatedAt)].filter(Boolean).join("\uFF1B");
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(ProviderSection, { name: "DeepSeek", controls, updatedAt: state?.updatedAt, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ValueRow, { label: "\u4ECA\u65E5\u6D88\u8D39", value: money(state?.todaySpend) + (state?.incompletePricing ? " *" : ""), title: [ESTIMATE, state?.usageWarning].filter(Boolean).join("\uFF1B"), stale: !!state?.usageWarning }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ValueRow, { label: "\u4F59\u989D", value: money(state?.balance), title: [state?.error, lastUpdated(state?.updatedAt)].filter(Boolean).join("\uFF1B"), stale: state?.stale }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: `dshsq-period${pricing?.stale ? " dshsq-stale" : ""}`, title: priceTip, children: status }),
    period === "holiday" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dshsq-note", children: "\u8282\u5047\u65E5\u5168\u5929\u8C37\u4EF7" }) : period === "weekend" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dshsq-note", children: "\u5468\u672B\u5168\u5929\u8C37\u4EF7" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ValueRow, { label: pricing?.nextChangeType === "offpeak" ? "\u8DDD\u8C37\u65F6" : "\u8DDD\u5CF0\u65F6", value: countdown, title: priceTip })
  ] });
}

// src/client/QuotaBar.tsx
var import_react2 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function QuotaBar({ label, value, resetAt, error }) {
  const previous = (0, import_react2.useRef)(null);
  const [pulse, setPulse] = (0, import_react2.useState)(false);
  (0, import_react2.useEffect)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: `dshsq-quota${pulse ? " dshsq-pulse" : ""}`, title, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dshsq-track", role: "progressbar", "aria-label": `${label} \u5269\u4F59\u989D\u5EA6`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": value ?? void 0, "aria-valuetext": value === null ? "\u989D\u5EA6\u672A\u77E5" : `${Math.round(value)}%`, children: value !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: `dshsq-fill dshsq-${level}`, style: { width: `${value}%` } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: `dshsq-percent${value !== null && value <= 20 ? ` dshsq-text-${level}` : ""}`, children: value === null ? "--" : `${Math.round(value)}%` })
  ] });
}

// src/client/CodexSection.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function CodexSection({ state, controls }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(ProviderSection, { name: "ChatGPT / Codex", controls, updatedAt: state?.updatedAt, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(QuotaBar, { label: "5h", value: state?.fiveHourRemaining ?? null, resetAt: state?.fiveHourResetAt, error: state?.error }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(QuotaBar, { label: "Weekly", value: state?.weeklyRemaining ?? null, resetAt: state?.weeklyResetAt, error: state?.error })
  ] });
}

// src/client/MoonShotSection.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function MoonShotSection({ state, controls }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(ProviderSection, { name: "MoonShot", controls, updatedAt: state?.updatedAt, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ValueRow, { label: "\u4ECA\u65E5\u6D88\u8D39", value: money(state?.todaySpend) + (state?.incompletePricing ? " *" : ""), title: [ESTIMATE, state?.usageWarning].filter(Boolean).join("\uFF1B"), stale: !!state?.usageWarning }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ValueRow, { label: "\u4F59\u989D", value: money(state?.balance), title: [state?.error, lastUpdated(state?.updatedAt)].filter(Boolean).join("\uFF1B"), stale: state?.stale })
  ] });
}

// src/client/SidebarQuota.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function SidebarQuota({ store, wide = true }) {
  const { state, error, collapsed, refreshing, refreshErrors } = (0, import_react3.useSyncExternalStore)(store.subscribe, store.getSnapshot);
  const controls = (id) => ({ collapsed: collapsed[id], refreshing: refreshing[id], refreshError: refreshErrors[id], onToggle: () => store.toggle(id), onRefresh: () => {
    void store.refresh(id);
  } });
  const [now, setNow] = (0, import_react3.useState)(Date.now());
  (0, import_react3.useEffect)(() => {
    const timer = setInterval(() => setNow(Date.now()), 3e4);
    return () => clearInterval(timer);
  }, []);
  if (!wide) return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dshsq dshsq-rail", "aria-label": "\u6A21\u578B\u989D\u5EA6", title: "\u5C55\u5F00\u4FA7\u680F\u67E5\u770B\u6A21\u578B\u989D\u5EA6", children: "\u989D\u5EA6" });
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dshsq", "aria-label": "\u6A21\u578B\u989D\u5EA6", title: error ?? void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dshsq-heading", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u6A21\u578B\u989D\u5EA6" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(DeepSeekSection, { state: state?.deepseek, now, controls: controls("deepseek") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(CodexSection, { state: state?.codex, controls: controls("codex") }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(MoonShotSection, { state: state?.moonshot, controls: controls("moonshot") })
  ] });
}

// src/client/styles.css
var styles_default = '.dshsq{box-sizing:border-box;flex:1 1 100%;width:100%;min-width:0;padding:8px 6px 10px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary);overflow-x:hidden;overflow-y:auto;max-height:50vh;font-variant-numeric:tabular-nums}\ndiv:has(> .dshsq){flex-wrap:wrap}\n.dshsq-heading{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);margin-bottom:9px;font-size:11px}\n.dshsq-heading:before,.dshsq-heading:after{content:"";height:1px;flex:1;background:var(--dsw-alias-border-l3)}\n.dshsq-provider{margin:0 0 10px;min-width:0}.dshsq-provider:last-child{margin-bottom:0}\n.dshsq-provider-heading{display:flex;align-items:center;gap:2px;margin-bottom:3px;min-height:24px}\n.dshsq-provider h3{font-size:12px;line-height:20px;font-weight:600;margin:0;flex:1;min-width:0;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary)}\n.dshsq-control{display:grid;place-items:center;flex:0 0 24px;width:24px;height:24px;padding:4px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}\n.dshsq-control svg{width:16px;height:16px;display:block}.dshsq-control:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n.dshsq-control:focus-visible{outline:2px solid currentColor;outline-offset:1px}.dshsq-control:disabled{cursor:wait;opacity:.6}\n.dshsq-refresh[aria-busy=true] svg{animation:dshsq-refresh-spin 1s linear infinite}.dshsq-refresh-error{color:#df5757}\n.dshsq-collapsed{margin-bottom:3px}.dshsq-collapsed .dshsq-provider-heading{margin-bottom:0}\n.dshsq [hidden]{display:none}.dshsq-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}\n@keyframes dshsq-refresh-spin{to{transform:rotate(360deg)}}\n.dshsq-row{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:6px;color:var(--dsw-alias-label-secondary)}\n.dshsq-row>span:first-child{overflow-wrap:anywhere}.dshsq-value{text-align:right;white-space:nowrap;color:var(--dsw-alias-label-primary)}\n.dshsq-period{margin-top:2px;overflow-wrap:anywhere}.dshsq-note{color:var(--dsw-alias-label-tertiary)}\n.dshsq-stale{opacity:.65}.dshsq-quota{display:grid;grid-template-columns:42px minmax(5px,1fr) 36px;gap:7px;align-items:center;color:var(--dsw-alias-label-secondary);margin:3px 0}\n.dshsq-track{height:5px;width:100%;overflow:hidden;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover)}\n.dshsq-fill{height:100%;border-radius:4px;transition:width .3s}.dshsq-percent{text-align:right;white-space:nowrap;color:var(--dsw-alias-label-primary)}\n.dshsq-good{background:#32a66a}.dshsq-warning{background:#c99b28}.dshsq-low{background:#e18132}.dshsq-critical{background:#df5757}\n.dshsq-text-low{color:#d57627}.dshsq-text-critical{color:#df5757}.dshsq-text-warning{color:#b58b22}\n.dshsq-rail{width:36px;padding:5px 0;text-align:center;font-size:11px}\n.dshsq-pulse{animation:dshsq-quota-nudge .8s ease-out 1}@keyframes dshsq-quota-nudge{50%{opacity:.55}}\n@media(prefers-reduced-motion:reduce){.dshsq-fill{transition:none}.dshsq-pulse,.dshsq-refresh[aria-busy=true] svg{animation:none}}\n@container(max-width:135px){.dshsq-quota{grid-template-columns:35px minmax(5px,1fr) 33px;gap:3px}}\n';

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
  slots.inject("sidebar.footer.action", () => slots.register({ name: "sidebar.footer.action", id: "dsh-sidebar-quota", order: 50 }, (props) => (0, import_react4.createElement)(SidebarQuota, { store, wide: props.wide })));
}

return module.exports;}});
