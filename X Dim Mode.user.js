// ==UserScript==
// @name         X Dim Mode
// @namespace    https://github.com/Deses/userscripts
// @version      2.0
// @description  Restores the Dim (dark blue) background option to X/Twitter display settings
// @author       flartiny (original), Deses
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://pro.x.com/*
// @icon         https://abs.twimg.com/favicons/twitter.2.ico
// @license      MIT
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/X%20Dim%20Mode.user.js
// @downloadURL  https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/X%20Dim%20Mode.user.js
// ==/UserScript==

// Based on "X Dim Mode" by flartiny (MIT), itself a port of juanbuis/x-dim-mode.

(function () {
  "use strict";

  // -- Config ----------------------------------------------------------------

  const STORAGE_KEY = "enabled";
  const STYLE_ID = "x-dim-base";
  const DIM_BTN_ID = "x-dim-option-btn";
  const DIM_CLASS = "x-dim-active";
  const DIMMED_CLASS = "xdm-dimmed";
  const ELEVATED_CLASS = "xdm-dimmed-elevated";
  const RESCAN_DELAYS_MS = [500, 1500, 3000, 5000];
  const NIGHT_MODE_LIGHTS_OUT = 2;
  const ACCENT = "rgb(29, 155, 240)";

  // -- CSS -------------------------------------------------------------------

  const BASE_CSS = `
    html.${DIM_CLASS} {
      --xdm-bg: rgb(21, 32, 43);
      --xdm-bg-hover: rgb(30, 39, 50);
      --xdm-bg-elevated: rgb(39, 51, 64);
      --xdm-backdrop: rgba(21, 32, 43, .85);
      --xdm-text: rgb(139, 152, 165);
      --xdm-border: rgb(56, 68, 77);
      scrollbar-color: var(--xdm-border) var(--xdm-bg);
    }

    html.${DIM_CLASS} body.LightsOut {
      --color: var(--xdm-text);
      --border: 206 16% 26%;
      --input: 206 16% 26%;
      --border-color: var(--xdm-border);
    }

    /* Chat / DM interface (Tailwind + shadcn/Radix) */
    html.${DIM_CLASS}[data-theme="dark"],
    html.${DIM_CLASS} [data-theme="dark"] {
      --background: 215 29% 13%;
      --border: 206 16% 26%;
      --input: 206 16% 26%;
      --muted-foreground: 206 16% 55%;
      --color-background: 215 29% 13%;
      --color-gray-0: 215 29% 13%;
      --color-gray-50: 206 16% 26%;
      --color-gray-100: 206 16% 26%;
      --color-gray-700: 206 16% 60%;
      --color-gray-800: 206 16% 50%;
    }

    html.${DIM_CLASS} body {
      background-color: var(--xdm-bg) !important;
    }

    /* Inline styles: body, divs, modals, dropdowns */
    html.${DIM_CLASS} [style*="background-color: rgb(0, 0, 0)"],
    html.${DIM_CLASS} [style*="background-color: rgba(0, 0, 0, 1)"] {
      background-color: var(--xdm-bg) !important;
    }
    html.${DIM_CLASS} [style*="background-color: rgb(24, 24, 27)"] {
      background-color: var(--xdm-bg-hover) !important;
    }
    html.${DIM_CLASS} [role="link"] > div > div:first-child div:has(> svg:only-child) {
      background-color: var(--xdm-bg-elevated) !important;
    }

    /* X atomic classes for black backgrounds */
    html.${DIM_CLASS} .r-kemksi,
    html.${DIM_CLASS} .r-1niwhzg,
    html.${DIM_CLASS} .r-yfoy6g,
    html.${DIM_CLASS} .r-14lw9ot {
      background-color: var(--xdm-bg) !important;
    }
    html.${DIM_CLASS} .r-1niwhzg.r-sdzlij {
      background-color: transparent !important;
    }
    html.${DIM_CLASS} .r-5zmot {
      background-color: var(--xdm-backdrop) !important;
    }
    html.${DIM_CLASS} .r-1shrkeu {
      background-color: var(--xdm-border) !important;
    }
    html.${DIM_CLASS} .r-1hdo0pc {
      background-color: var(--xdm-bg-hover) !important;
    }
    html.${DIM_CLASS} .r-g2wdr4 {
      background-color: var(--xdm-bg-hover) !important;
    }
    html.${DIM_CLASS} .r-g2wdr4 [role="link"]:hover {
      background-color: var(--xdm-bg-elevated) !important;
    }

    html.${DIM_CLASS} .r-1kqtdi0,
    html.${DIM_CLASS} .r-1roi411 {
      border-color: var(--xdm-border) !important;
    }
    html.${DIM_CLASS} .r-2sztyj {
      border-top-color: var(--xdm-border) !important;
    }
    html.${DIM_CLASS} .r-1igl3o0,
    html.${DIM_CLASS} .r-rull8r {
      border-bottom-color: var(--xdm-border) !important;
    }
    html.${DIM_CLASS} .r-gu4em3,
    html.${DIM_CLASS} .r-1bnu78o {
      background-color: var(--xdm-border) !important;
    }

    html.${DIM_CLASS} .r-1bwzh9t {
      color: var(--xdm-text) !important;
    }
    html.${DIM_CLASS} .draftjs-styles_0 .public-DraftEditorPlaceholder-root,
    html.${DIM_CLASS} .public-DraftEditorPlaceholder-inner {
      color: var(--xdm-text) !important;
    }
    html.${DIM_CLASS} [style*="color: rgb(113, 118, 123)"] {
      color: var(--xdm-text) !important;
    }
    html.${DIM_CLASS} ::placeholder {
      color: var(--xdm-text) !important;
    }

    html.${DIM_CLASS} .bg-gray-0 {
      background-color: var(--xdm-bg) !important;
    }
    html.${DIM_CLASS} .border-gray-50,
    html.${DIM_CLASS} .border-gray-100 {
      border-color: var(--xdm-border) !important;
    }

    html.${DIM_CLASS} [style*="border-color: rgb(47, 51, 54)"].r-1che71a {
      background-color: var(--xdm-bg-hover) !important;
    }

    /* Applied by the scanner to elements whose inline background is black */
    html.${DIM_CLASS} .${DIMMED_CLASS} {
      background-color: var(--xdm-bg) !important;
    }
    html.${DIM_CLASS} .${ELEVATED_CLASS} {
      background-color: var(--xdm-bg-hover) !important;
    }
    html.${DIM_CLASS} .jf-element:has(> span:only-child > svg:only-child) {
      background-color: var(--xdm-bg-elevated) !important;
    }
    html.${DIM_CLASS} .${ELEVATED_CLASS} .jf-element:empty {
      background-color: var(--xdm-border) !important;
      border-color: var(--xdm-border) !important;
    }
  `;

  const CHECKMARK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-jwli3a r-1hjwoze r-12ym1je"><g><path d="M9.64 18.952l-5.55-4.861 1.317-1.504 3.951 3.459 8.459-10.948L19.4 6.32 9.64 18.952z"></path></g></svg>`;

  // -- State -----------------------------------------------------------------

  const root = document.documentElement;
  let enabled = GM_getValue(STORAGE_KEY, true);
  let bodyObserver = null;
  let scanFrame = 0;
  let injectFrame = 0;
  let switchingToLightsOut = false;
  const pendingNodes = new Set();

  // -- Theme detection -------------------------------------------------------

  function readNightMode() {
    const match = document.cookie.match(/(?:^|;\s*)night_mode=(\d)/);
    return match ? Number(match[1]) : null;
  }

  function xHasRendered() {
    const reactRoot = document.getElementById("react-root");
    return Boolean(reactRoot && reactRoot.childElementCount);
  }

  function isLightsOut() {
    if (document.body && document.body.classList.contains("LightsOut")) {
      return true;
    }
    if (document.body && xHasRendered()) {
      return false;
    }
    const nightMode = readNightMode();
    if (nightMode !== null) {
      return nightMode === NIGHT_MODE_LIGHTS_OUT;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // -- Dim on/off ------------------------------------------------------------

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = BASE_CSS;
    (document.head || root).appendChild(style);
  }

  function refresh() {
    const shouldDim = enabled && isLightsOut();
    const isDim = root.classList.contains(DIM_CLASS);
    if (shouldDim && !isDim) {
      ensureStyle();
      root.classList.add(DIM_CLASS);
      queueScan([document.body]);
      for (const delay of RESCAN_DELAYS_MS) {
        setTimeout(() => queueScan([document.body]), delay);
      }
    } else if (!shouldDim && isDim) {
      root.classList.remove(DIM_CLASS);
      pendingNodes.clear();
      for (const el of document.querySelectorAll(`.${DIMMED_CLASS}, .${ELEVATED_CLASS}`)) {
        el.classList.remove(DIMMED_CLASS, ELEVATED_CLASS);
      }
    }
  }

  function setEnabled(value) {
    enabled = value;
    GM_setValue(STORAGE_KEY, value);
    refresh();
    syncSettingsButtons();
  }

  function startBodyObserver() {
    if (bodyObserver || !document.body) {
      return;
    }
    bodyObserver = new MutationObserver(() => {
      refresh();
      syncSettingsButtons();
    });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    refresh();
  }

  // -- Black background scanner ----------------------------------------------

  function queueScan(nodes) {
    for (const node of nodes) {
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        pendingNodes.add(node);
      }
    }
    if (pendingNodes.size && !scanFrame) {
      scanFrame = requestAnimationFrame(flushScan);
    }
  }

  function flushScan() {
    scanFrame = 0;
    const batch = [...pendingNodes];
    pendingNodes.clear();
    if (!root.classList.contains(DIM_CLASS)) {
      return;
    }
    for (const node of batch) {
      if (node.isConnected) {
        dimSubtree(node);
      }
    }
  }

  function dimSubtree(subtreeRoot) {
    dimElement(subtreeRoot);
    for (const el of subtreeRoot.querySelectorAll("div,main,aside,header,nav,section,article,footer,button")) {
      dimElement(el);
    }
  }

  function dimElement(el) {
    if (el.classList.contains(DIMMED_CLASS) || el.classList.contains(ELEVATED_CLASS)) {
      return;
    }
    const bg = el.classList.contains("jf-element") ? getComputedStyle(el).backgroundColor : el.style.backgroundColor;
    if (bg === "rgb(0, 0, 0)" || bg === "rgba(0, 0, 0, 1)") {
      el.classList.add(DIMMED_CLASS);
    } else if (bg === "rgb(24, 24, 27)") {
      el.classList.add(ELEVATED_CLASS);
    }
  }

  // -- Display settings page -------------------------------------------------

  function getRadioGroup() {
    const bgRadio = document.querySelector('input[name="background-picker"]');
    return bgRadio ? bgRadio.closest('[role="radiogroup"]') : null;
  }

  function setSelected(btn) {
    btn.style.borderColor = ACCENT;
    btn.style.borderWidth = "2px";
    const circle = btn.querySelector('[role="radio"] > div');
    if (circle) {
      circle.style.backgroundColor = ACCENT;
      circle.style.borderColor = ACCENT;
      circle.innerHTML = CHECKMARK_SVG;
    }
    const input = btn.querySelector('input[type="radio"]');
    if (input) {
      input.checked = true;
    }
  }

  function setUnselected(btn) {
    btn.style.borderColor = "rgb(51, 54, 57)";
    btn.style.borderWidth = "1px";
    const circle = btn.querySelector('[role="radio"] > div');
    if (circle) {
      circle.style.backgroundColor = "rgba(0, 0, 0, 0)";
      circle.style.borderColor = "rgb(185, 202, 211)";
      circle.innerHTML = "";
    }
    const input = btn.querySelector('input[type="radio"]');
    if (input) {
      input.checked = false;
    }
  }

  function syncSettingsButtons() {
    const dimBtn = document.getElementById(DIM_BTN_ID);
    const radiogroup = dimBtn && dimBtn.closest('[role="radiogroup"]');
    if (!radiogroup) {
      return;
    }
    const buttons = [...radiogroup.querySelectorAll(":scope > div")];
    const defaultBtn = buttons[0];
    const lightsOutBtn = buttons[buttons.length - 1];
    const dimShown = enabled && isLightsOut();

    for (const btn of buttons) {
      setUnselected(btn);
    }
    if (dimShown) {
      setSelected(dimBtn);
    } else {
      setSelected(isLightsOut() ? lightsOutBtn : defaultBtn);
    }
  }

  function activateLightsOut() {
    const dimBtn = document.getElementById(DIM_BTN_ID);
    const radiogroup = dimBtn && dimBtn.closest('[role="radiogroup"]');
    if (!radiogroup) {
      return;
    }
    const buttons = radiogroup.querySelectorAll(":scope > div");
    const lightsOutInput = buttons[buttons.length - 1].querySelector('input[type="radio"]');
    if (lightsOutInput && !lightsOutInput.checked) {
      switchingToLightsOut = true;
      lightsOutInput.click();
      setTimeout(() => {
        switchingToLightsOut = false;
      }, 300);
    }
  }

  function tryInjectDimOption() {
    injectFrame = 0;
    if (document.getElementById(DIM_BTN_ID) || !location.pathname.startsWith("/settings")) {
      return;
    }
    const radiogroup = getRadioGroup();
    if (!radiogroup) {
      return;
    }
    const buttons = radiogroup.querySelectorAll(":scope > div");
    if (buttons.length < 2) {
      return;
    }
    const defaultBtn = buttons[0];
    const lightsOutBtn = buttons[buttons.length - 1];

    const dimBtn = lightsOutBtn.cloneNode(true);
    dimBtn.id = DIM_BTN_ID;
    dimBtn.style.backgroundColor = "rgb(21, 32, 43)";
    const label = dimBtn.querySelector("span");
    if (label) {
      label.textContent = "Dim";
    }
    const input = dimBtn.querySelector('input[type="radio"]');
    if (input) {
      input.setAttribute("aria-label", "Dim");
      input.checked = false;
    }
    radiogroup.insertBefore(dimBtn, lightsOutBtn);

    dimBtn.addEventListener("click", () => {
      setEnabled(true);
      activateLightsOut();
    });
    for (const nativeBtn of [defaultBtn, lightsOutBtn]) {
      nativeBtn.addEventListener("click", () => {
        if (!switchingToLightsOut) {
          setEnabled(false);
        }
      });
    }

    syncSettingsButtons();
  }

  // -- Observers and init ----------------------------------------------------

  function onDomMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length && root.classList.contains(DIM_CLASS)) {
        queueScan(mutation.addedNodes);
      }
    }
    if (!injectFrame) {
      injectFrame = requestAnimationFrame(tryInjectDimOption);
    }
    if (!bodyObserver) {
      startBodyObserver();
    }
    refresh();
  }

  refresh();

  new MutationObserver(onDomMutations).observe(root, { childList: true, subtree: true });
  startBodyObserver();

  GM_addValueChangeListener(STORAGE_KEY, (key, oldValue, newValue, remote) => {
    if (remote) {
      enabled = Boolean(newValue);
      refresh();
      syncSettingsButtons();
    }
  });

  GM_registerMenuCommand("X Dim Mode: Enable", () => setEnabled(true));
  GM_registerMenuCommand("X Dim Mode: Disable", () => setEnabled(false));
})();
