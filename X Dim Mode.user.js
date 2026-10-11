// ==UserScript==
// @name         X Dim Mode
// @namespace    https://github.com/Deses/userscripts
// @version      2.1
// @description  Restores the Dim (dark blue) background option to X/Twitter display settings, with a light-to-black tone slider
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
  const LEVEL_KEY = "tone";
  const DIM_LEVEL = 50;
  const MAX_LEVEL = 100;
  const LIGHT_BG_LUMINANCE = 0.18;
  const STYLE_ID = "x-dim-base";
  const LEVEL_STYLE_ID = "x-dim-level";
  const SLIDER_ID = "x-dim-slider";
  const PICKER_ID = "x-dim-picker-group";
  const DIM_BTN_ID = "x-dim-option-btn";
  const DIM_CLASS = "x-dim-active";
  const DIMMED_CLASS = "xdm-dimmed";
  const ELEVATED_CLASS = "xdm-dimmed-elevated";
  const RESCAN_DELAYS_MS = [500, 1500, 3000, 5000];
  const ACCENT = "rgb(29, 155, 240)";

  // -- CSS -------------------------------------------------------------------

  const BASE_CSS = `
    html.${DIM_CLASS} {
      scrollbar-color: var(--xdm-border) var(--xdm-bg);
    }

    html.${DIM_CLASS} body.LightsOut {
      --color: var(--xdm-text);
      --border: var(--xdm-border-hsl);
      --input: var(--xdm-border-hsl);
      --border-color: var(--xdm-border);
    }

    /* Chat / DM interface (Tailwind + shadcn/Radix) */
    html.${DIM_CLASS}[data-theme="dark"],
    html.${DIM_CLASS} [data-theme="dark"] {
      --background: var(--xdm-bg-hsl);
      --border: var(--xdm-border-hsl);
      --input: var(--xdm-border-hsl);
      --muted-foreground: var(--xdm-text-hsl);
      --color-background: var(--xdm-bg-hsl);
      --color-gray-0: var(--xdm-bg-hsl);
      --color-gray-50: var(--xdm-border-hsl);
      --color-gray-100: var(--xdm-border-hsl);
      --color-gray-700: var(--xdm-text-hsl);
      --color-gray-800: var(--xdm-text-hsl);
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

  // -- Palette ---------------------------------------------------------------

  const STOPS = {
    bg: [[53, 66, 82], [21, 32, 43], [0, 0, 0]],
    hover: [[63, 77, 94], [30, 39, 50], [22, 24, 28]],
    elevated: [[75, 90, 108], [39, 51, 64], [32, 35, 39]],
    border: [[85, 100, 116], [56, 68, 77], [47, 51, 54]],
    backdrop: [[53, 66, 82, 0.85], [21, 32, 43, 0.85], [0, 0, 0, 0.65]],
  };
  const SOFT_TEXT = [165, 177, 190];
  const DIM_TEXT = [139, 152, 165];
  const LIGHTS_OUT_TEXT = [113, 118, 123];

  function mix(from, to, amount) {
    return [0, 1, 2, 3].map((i) => {
      const a = from[i] ?? 1;
      return a + ((to[i] ?? 1) - a) * amount;
    });
  }

  function colorAt(stops, level) {
    const [light, dim, black] = stops;
    if (level <= DIM_LEVEL) {
      return mix(light, dim, level / DIM_LEVEL);
    }
    return mix(dim, black, (level - DIM_LEVEL) / (MAX_LEVEL - DIM_LEVEL));
  }

  function toCss(color) {
    const [r, g, b, a] = color;
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(3))})`;
  }

  function toHsl([r, g, b]) {
    const [rn, gn, bn] = [r, g, b].map((v) => v / 255);
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const lightness = (max + min) / 2;
    const delta = max - min;
    if (delta === 0) {
      return `0 0% ${Math.round(lightness * 100)}%`;
    }
    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    let hue;
    if (max === rn) {
      hue = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      hue = (bn - rn) / delta + 2;
    } else {
      hue = (rn - gn) / delta + 4;
    }
    return `${Math.round((hue * 60 + 360) % 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
  }

  function luminance([r, g, b]) {
    const [rl, gl, bl] = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  }

  function secondaryTextAt(level) {
    return colorAt([SOFT_TEXT, DIM_TEXT, LIGHTS_OUT_TEXT], level);
  }

  function buildPaletteCss(level) {
    const bg = colorAt(STOPS.bg, level);
    const border = colorAt(STOPS.border, level);
    const text = secondaryTextAt(level);
    return `
      html.${DIM_CLASS} {
        --xdm-bg: ${toCss(bg)};
        --xdm-bg-hover: ${toCss(colorAt(STOPS.hover, level))};
        --xdm-bg-elevated: ${toCss(colorAt(STOPS.elevated, level))};
        --xdm-backdrop: ${toCss(colorAt(STOPS.backdrop, level))};
        --xdm-border: ${toCss(border)};
        --xdm-text: ${toCss(text)};
        --xdm-bg-hsl: ${toHsl(bg)};
        --xdm-border-hsl: ${toHsl(border)};
        --xdm-text-hsl: ${toHsl(text)};
      }
    `;
  }

  const CHECKMARK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-jwli3a r-1hjwoze r-12ym1je"><g><path d="M9.64 18.952l-5.55-4.861 1.317-1.504 3.951 3.459 8.459-10.948L19.4 6.32 9.64 18.952z"></path></g></svg>`;

  // -- State -----------------------------------------------------------------

  const root = document.documentElement;
  let enabled = GM_getValue(STORAGE_KEY, true);
  let level = GM_getValue(LEVEL_KEY, DIM_LEVEL);
  let scanFrame = 0;
  let injectFrame = 0;
  let bodyObserved = false;
  const pendingNodes = new Set();

  // -- Theme detection -------------------------------------------------------

  function readXBodyBackground() {
    const channels = document.body && document.body.style.backgroundColor.match(/\d+/g);
    return channels ? channels.slice(0, 3).map(Number) : null;
  }

  function isLightsOut() {
    const xBackground = readXBodyBackground();
    if (xBackground) {
      return luminance(xBackground) < LIGHT_BG_LUMINANCE;
    }
    const theme = root.getAttribute("data-x-theme");
    if (theme) {
      return theme === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // -- Dim on/off ------------------------------------------------------------

  function applyLevel() {
    document.getElementById(LEVEL_STYLE_ID).textContent = buildPaletteCss(level);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = BASE_CSS;
    const levelStyle = document.createElement("style");
    levelStyle.id = LEVEL_STYLE_ID;
    (document.head || root).append(style, levelStyle);
    applyLevel();
  }

  function setLevel(value, persist) {
    level = value;
    ensureStyle();
    applyLevel();
    if (persist) {
      GM_setValue(LEVEL_KEY, value);
    }
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

  function onThemeAttributeChange() {
    refresh();
    syncSettingsButtons();
  }

  function observeRootAttributes() {
    new MutationObserver(onThemeAttributeChange).observe(root, { attributes: true, attributeFilter: ["data-x-theme", "class"] });
  }

  function observeBodyStyle() {
    if (bodyObserved || !document.body) {
      return;
    }
    bodyObserved = true;
    new MutationObserver(onThemeAttributeChange).observe(document.body, { attributes: true, attributeFilter: ["style"] });
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
    const picker = dimBtn && dimBtn.closest('[role="radiogroup"]');
    if (!picker) {
      return;
    }
    const [lightBtn, , darkBtn] = picker.querySelectorAll(":scope > div");
    const xIsDark = isLightsOut();
    const dimShown = enabled && xIsDark;

    const slider = document.getElementById(SLIDER_ID);
    if (slider) {
      slider.style.opacity = dimShown ? "1" : "0.4";
      for (const control of slider.querySelectorAll("input, button")) {
        control.disabled = !dimShown;
      }
    }

    for (const btn of picker.querySelectorAll(":scope > div")) {
      setUnselected(btn);
    }
    if (!xIsDark) {
      setSelected(lightBtn);
    } else if (enabled) {
      setSelected(dimBtn);
    } else {
      setSelected(darkBtn);
    }
  }

  function disableSystemTheme() {
    const systemToggle = document.querySelector('input[type="checkbox"][role="switch"]');
    if (systemToggle && systemToggle.checked) {
      systemToggle.click();
    }
  }

  function hideSystemToggle() {
    const systemToggle = document.querySelector('input[type="checkbox"][role="switch"]');
    const radiogroup = getRadioGroup();
    if (!systemToggle || !radiogroup) {
      return;
    }
    let row = systemToggle;
    while (row.parentElement && !row.parentElement.contains(radiogroup)) {
      row = row.parentElement;
    }
    if (!row.contains(radiogroup)) {
      row.style.display = "none";
    }
  }

  function chooseMode(mode) {
    disableSystemTheme();
    const xCards = getRadioGroup().querySelectorAll(":scope > div");
    const xCard = mode === "light" ? xCards[0] : xCards[xCards.length - 1];
    const xInput = xCard.querySelector('input[type="radio"]');
    if (xInput && !xInput.checked) {
      xInput.click();
    }
    setEnabled(mode === "dim");
  }

  function injectSlider() {
    const dimBtn = document.getElementById(DIM_BTN_ID);
    if (!dimBtn || document.getElementById(SLIDER_ID)) {
      return;
    }
    const referenceText = getComputedStyle(dimBtn.querySelector("span"));
    const wrap = document.createElement("div");
    wrap.id = SLIDER_ID;
    wrap.style.cssText = `display: flex; align-items: center; gap: 12px; padding: 12px 16px; font-size: 15px; font-family: ${referenceText.fontFamily}; color: var(--xdm-text, rgb(113, 118, 123));`;

    const label = document.createElement("span");
    label.textContent = "Dim intensity";

    const range = document.createElement("input");
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.step = "1";
    range.value = String(level);
    range.style.cssText = `flex: 1; accent-color: ${ACCENT};`;

    const readout = document.createElement("span");
    readout.style.cssText = "min-width: 40px; text-align: right;";
    readout.textContent = `${level}%`;

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "Default";
    resetBtn.style.cssText = "padding: 4px 12px; border: 1px solid currentColor; border-radius: 9999px; background: transparent; color: inherit; font: inherit; cursor: pointer;";

    range.addEventListener("input", () => {
      readout.textContent = `${range.value}%`;
      setLevel(Number(range.value), false);
    });
    range.addEventListener("change", () => setLevel(Number(range.value), true));
    resetBtn.addEventListener("click", () => {
      range.value = String(DIM_LEVEL);
      readout.textContent = `${DIM_LEVEL}%`;
      setLevel(DIM_LEVEL, true);
    });

    wrap.append(label, range, readout, resetBtn);
    dimBtn.closest('[role="radiogroup"]').insertAdjacentElement("afterend", wrap);
    syncSettingsButtons();
  }

  function tryInjectDimOption() {
    injectFrame = 0;
    if (!location.pathname.startsWith("/settings")) {
      return;
    }
    injectPicker();
    injectSlider();
    hideSystemToggle();
  }

  function cloneCard(sourceCard) {
    const card = sourceCard.cloneNode(true);
    card.removeAttribute("id");
    for (const el of card.querySelectorAll("[id]")) {
      el.removeAttribute("id");
    }
    const input = card.querySelector('input[type="radio"]');
    if (input) {
      input.name = "x-dim-picker";
      input.checked = false;
    }
    return card;
  }

  function injectPicker() {
    if (document.getElementById(PICKER_ID)) {
      return;
    }
    const radiogroup = getRadioGroup();
    if (!radiogroup) {
      return;
    }
    const xCards = radiogroup.querySelectorAll(":scope > div");
    if (xCards.length < 2) {
      return;
    }

    const lightBtn = cloneCard(xCards[0]);
    const dimBtn = cloneCard(xCards[xCards.length - 1]);
    const darkBtn = cloneCard(xCards[xCards.length - 1]);

    dimBtn.id = DIM_BTN_ID;
    dimBtn.style.setProperty("background-color", "rgb(21, 32, 43)", "important");
    darkBtn.style.setProperty("background-color", "rgb(0, 0, 0)", "important");
    const lightLabel = lightBtn.querySelector("span");
    if (lightLabel) {
      lightLabel.textContent = "Light";
    }
    const dimLabel = dimBtn.querySelector("span");
    if (dimLabel) {
      dimLabel.textContent = "Dim";
    }
    const dimInput = dimBtn.querySelector('input[type="radio"]');
    if (dimInput) {
      dimInput.setAttribute("aria-label", "Dim");
    }

    const picker = radiogroup.cloneNode(false);
    picker.id = PICKER_ID;
    picker.append(lightBtn, dimBtn, darkBtn);
    lightBtn.addEventListener("click", () => chooseMode("light"));
    dimBtn.addEventListener("click", () => chooseMode("dim"));
    darkBtn.addEventListener("click", () => chooseMode("dark"));

    radiogroup.insertAdjacentElement("afterend", picker);
    radiogroup.style.display = "none";
    disableSystemTheme();
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
    observeBodyStyle();
    refresh();
  }

  refresh();
  observeBodyStyle();

  new MutationObserver(onDomMutations).observe(root, { childList: true, subtree: true });
  observeRootAttributes();

  GM_addValueChangeListener(STORAGE_KEY, (key, oldValue, newValue, remote) => {
    if (remote) {
      enabled = Boolean(newValue);
      refresh();
      syncSettingsButtons();
    }
  });

  GM_addValueChangeListener(LEVEL_KEY, (key, oldValue, newValue, remote) => {
    if (remote) {
      setLevel(Number(newValue), false);
      const range = document.querySelector(`#${SLIDER_ID} input`);
      if (range) {
        range.value = String(newValue);
        range.nextElementSibling.textContent = `${newValue}%`;
      }
    }
  });

  GM_registerMenuCommand("X Dim Mode: Enable", () => setEnabled(true));
  GM_registerMenuCommand("X Dim Mode: Disable", () => setEnabled(false));
})();
