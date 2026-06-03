// ==UserScript==
// @name         X.com link swapper
// @namespace    https://github.com/Deses/userscripts
// @version      1.6
// @description  Hijack share button to copy an embed link directly, strip params
// @author       ReeceDonovan & Deses
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @match        https://tweetdeck.twitter.com/*
// @match        https://x.com/*
// @match        https://pro.x.com/*
// @icon         https://abs.twimg.com/favicons/twitter.2.ico
// @license      BSD-3-Clause
// @updateURL    https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/X.com%20link%20swapper.js
// @downloadURL  https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/X.com%20link%20swapper.js
// ==/UserScript==
(function () {
  "use strict";

  // -- Config ----------------------------------------------------------------

  const TARGET_DOMAIN = "fixupx.com"; // e.g. "fixupx.com", "fxtwitter.com", "fixvx.com", "vxtwitter.com"
  const LANGUAGE = "en";              // 2-letter code appended as /en, or "" to skip

  // -- Toast -----------------------------------------------------------------

  let toastEl = null;
  let toastTimer = null;

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #ls-toast {
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%) translateY(12px);
        background: #1d9bf0;
        color: #fff;
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        line-height: 1;
        padding: 10px 16px;
        border-radius: 9999px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        pointer-events: none;
        opacity: 0;
        transition: opacity 180ms ease, transform 180ms ease;
        z-index: 999999;
        white-space: nowrap;
      }
      #ls-toast.ls-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(message, durationMs = 2200) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "ls-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.remove("ls-visible");
    void toastEl.offsetWidth;
    toastEl.classList.add("ls-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("ls-visible"), durationMs);
  }

  // -- Helpers ---------------------------------------------------------------

  // Identify the share button by its specific SVG upload-arrow path
  function isShareButton(btn) {
    return !!btn.querySelector('path[d^="M12 2.59l5.7 5.7"]');
  }

  function buildEmbedUrl(href) {
    let path;
    try {
      path = new URL(href, "https://x.com").pathname;
    } catch {
      path = href.split("?")[0].split("#")[0];
    }
    // Truncate anything after /status/<id> (/quotes, /retweets, /likes, etc.)
    const match = path.match(/^(\/[^/]+\/status\/\d+)/);
    path = match ? match[1] : path;
    const lang = LANGUAGE ? `/${LANGUAGE}` : "";
    return `https://${TARGET_DOMAIN}${path}${lang}`;
  }

  function copyAndToast(url) {
    navigator.clipboard
      .writeText(url)
      .then(() => showToast(`🔗 Copied as ${TARGET_DOMAIN}`))
      .catch((err) => {
        console.error("[LinkSwapper] Clipboard write failed:", err);
        showToast("⚠️ Copy failed");
      });
  }

  // -- Share button interception ---------------------------------------------
  // Use capture phase so we fire before X's own listeners open the menu

  document.addEventListener(
    "click",
    (event) => {
      const btn = event.target.closest('button[aria-haspopup="menu"]');
      if (!btn || !isShareButton(btn)) return;

      // Must be inside a tweet article
      const article = btn.closest('[data-testid="tweet"]') || btn.closest("article");
      if (!article) return;

      // Grab the status link from the article - pick the deepest /status/ href
      const statusAnchor = [...article.querySelectorAll('a[href*="/status/"]')].pop();
      if (!statusAnchor) return;

      event.preventDefault();
      event.stopPropagation();

      copyAndToast(buildEmbedUrl(statusAnchor.getAttribute("href")));
    },
    true // capture phase
  );

  // -- Fallback: manual copy of a twitter/x URL (v1.1 behaviour) -------------

  document.addEventListener("copy", (event) => {
    const text = (
      event.clipboardData?.getData("text") ||
      event.target?.innerText ||
      ""
    ).trim();
    if (!text || !/^https:\/\/(www\.)?(twitter|x)\.com\/.+\/status\/\d+/.test(text)) return;

    event.preventDefault();
    try {
      const parsed = new URL(text);
      parsed.search = "";
      parsed.hash = "";
      copyAndToast(buildEmbedUrl(parsed.pathname));
    } catch {
      copyAndToast(buildEmbedUrl(text));
    }
  });

  // -- Init ------------------------------------------------------------------

  if (document.head) injectStyles();
  else document.addEventListener("DOMContentLoaded", injectStyles);
})();
