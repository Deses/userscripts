// ==UserScript==
// @name         X.com link swapper
// @namespace    https://github.com/Deses/userscripts
// @version      1.7
// @description  Hijack share button to copy an embed link directly, strip params; add twitterwebviewer.com download button
// @author       ReeceDonovan & Deses
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @match        https://tweetdeck.twitter.com/*
// @match        https://x.com/*
// @match        https://pro.x.com/*
// @icon         https://abs.twimg.com/favicons/twitter.2.ico
// @license      BSD-3-Clause
// @updateURL    https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/X.com%20link%20swapper.user.js
// @downloadURL  https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/X.com%20link%20swapper.user.js
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
      /* X's native hover pill is sized/driven by internal React state, not
         plain inherited CSS, so cloneNode() can't reliably bring it along -
         force our own fixed, correctly-sized circle instead of guessing which
         cloned ancestor (if any) happens to already be the right size. */
      .ls-dl-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34.75px;
        height: 34.75px;
        border-radius: 9999px;
        transition: background-color 0.2s ease, color 0.2s ease;
      }
      .ls-dl-btn:hover,
      .ls-dl-btn:focus-visible {
        background-color: rgba(29, 155, 240, 0.1);
        color: rgb(29, 155, 240);
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

  // -- Download button (twitterwebviewer.com, video tweets only) -------------
  // Filled "download" icon (single path, matches X's own icon style), inlined
  // so nothing is hotlinked.
  const DOWNLOAD_ICON_PATH =
    '<path d="M12 15.5a1 1 0 0 1-.71-.29l-4-4a1 1 0 1 1 1.42-1.42L11 12.09V4a1 1 0 1 1 2 0v8.09' +
    'l2.29-2.3a1 1 0 1 1 1.42 1.42l-4 4a1 1 0 0 1-.71.29zM5 18a1 1 0 0 0 0 2h14a1 1 0 1 0 0-2z"/>';

  function getStatusId(article) {
    const statusAnchor = [...article.querySelectorAll('a[href*="/status/"]')].pop();
    if (!statusAnchor) return null;
    const match = statusAnchor.getAttribute("href").match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  function buildDownloaderUrl(tweetId) {
    return `https://twitterwebviewer.com/twitter-video-downloader?tweet=${tweetId}`;
  }

  // Images aren't supported by twitterwebviewer.com, so only offer the button
  // on tweets that actually embed a video player (GIFs render as <video> too
  // and are fine to include).
  function hasVideo(article) {
    return !!article.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]');
  }

  function makeDownloadButton(article, wrapperEl) {
    // Clone the bookmark button's OWN wrapper div (not just the <button>), so
    // the download button gets its own flex item exactly like reply/retweet/
    // like/bookmark/share each have, instead of being stuffed inside bookmark's.
    const wrapperClone = wrapperEl.cloneNode(true);
    const btn = wrapperClone.querySelector("button") || wrapperClone;
    btn.removeAttribute("data-testid");
    btn.removeAttribute("aria-pressed");
    btn.setAttribute("aria-label", "Download video");
    btn.title = "Download video (twitterwebviewer.com)";

    // On a single-tweet page (not the timeline) X shows the bookmark count as
    // a <span> next to the icon; strip it so it doesn't get cloned onto our
    // download button as a fake "download count".
    wrapperClone.querySelectorAll("span").forEach((span) => span.remove());

    const svg = wrapperClone.querySelector("svg");
    if (svg) {
      // Force the coordinate grid our path was authored for and X's usual
      // icon size, instead of trusting whatever the cloned bookmark svg had -
      // otherwise a mismatched viewBox stretches/shrinks our glyph unevenly.
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "18.75");
      svg.setAttribute("height", "18.75");
      svg.innerHTML = DOWNLOAD_ICON_PATH;
    }

    // Give the icon's immediate wrapper a fixed, correctly-sized circle
    // ourselves (see the .ls-dl-btn comment above) rather than relying on
    // whichever cloned ancestor might already happen to be the right size.
    const hoverTarget = (svg && svg.parentElement) || btn;
    hoverTarget.classList.add("ls-dl-btn");

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const statusId = getStatusId(article);
      if (!statusId) {
        showToast("⚠️ Could not resolve tweet id");
        return;
      }
      window.open(buildDownloaderUrl(statusId), "_blank", "noopener");
    });
    return wrapperClone;
  }

  function insertDownloadButtons(root = document) {
    const bookmarkBtns = root.querySelectorAll('[data-testid="bookmark"]:not([data-ls-download])');
    bookmarkBtns.forEach((bookmarkBtn) => {
      const article = bookmarkBtn.closest('[data-testid="tweet"]') || bookmarkBtn.closest("article");
      // No article yet, or no video (yet): leave unmarked so a later mutation
      // pass (e.g. media finishing its lazy load) can pick it back up.
      if (!article || !hasVideo(article)) return;

      bookmarkBtn.setAttribute("data-ls-download", "1");
      // Insert as a new sibling div AFTER bookmark's own wrapper, not inside it.
      const wrapperEl = bookmarkBtn.parentElement || bookmarkBtn;
      wrapperEl.insertAdjacentElement("afterend", makeDownloadButton(article, wrapperEl));
    });
  }

  function observeForDownloadButtons() {
    insertDownloadButtons();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          insertDownloadButtons(document);
          break;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

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

  if (document.body) observeForDownloadButtons();
  else document.addEventListener("DOMContentLoaded", observeForDownloadButtons);
})();
