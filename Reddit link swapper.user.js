// ==UserScript==
// @name         Reddit link swapper
// @namespace    https://github.com/Deses/userscripts
// @version      2.3
// @description  Hijack share button to copy an embed link directly, strip params
// @author       Deses
// @match        https://www.reddit.com/*
// @icon         https://www.redditstatic.com/shreddit/assets/favicon/192x192.png
// @license      BSD-3-Clause
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/Reddit%20link%20swapper.user.js
// @downloadURL  https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/Reddit%20link%20swapper.user.js
// ==/UserScript==

(function () {
    "use strict";

    // -- Config --------------------------------------------------------------

    const TARGET_DOMAIN = "fxreddit.seria.moe"; // e.g. "rxddit.com", "vxreddit.com", "fxreddit.seria.moe"

    // -- Toast ---------------------------------------------------------------

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
            background: #ff4500;
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

    // -- Helpers -------------------------------------------------------------

    function buildEmbedUrl(href) {
        try {
            const url = new URL(href, "https://www.reddit.com");
            url.hostname = TARGET_DOMAIN;
            url.search = "";
            url.hash = "";
            return url.origin + url.pathname;
        } catch {
            return href;
        }
    }

    function getPostUrl(composedPath) {
        const shareEl = composedPath.find(el => el instanceof Element && el.matches("shreddit-post-share-button"));
        if (shareEl) {
            const href = shareEl.getAttribute("share-href");
            if (href) return href;
        }

        const postEl = composedPath.find(el => el instanceof Element && el.matches("shreddit-post"));
        if (postEl) {
            const permalink = postEl.getAttribute("permalink");
            if (permalink) return permalink;
        }

        return window.location.href;
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

    // -- Share button interception -------------------------------------------
    // Capture phase so we fire before Reddit's own listener opens the menu

    window.addEventListener(
        "click",
        (event) => {
            const path = event.composedPath();
            const btn = path.find(
                el =>
                    el instanceof Element &&
                    el.tagName === "BUTTON" &&
                    (el.hasAttribute("aria-haspopup") || el.getAttribute("aria-label") === "Share")
            );
            const inShareHost = path.some(el => el instanceof Element && el.matches("shreddit-post-share-button"));
            // console.log("[reddit-swapper] path tags:", path.map(el => el.tagName || el).join(", "));
            // console.log("[reddit-swapper] btn:", btn, "inShareHost:", inShareHost);
            if (!btn || !inShareHost) return;

            const href = getPostUrl(path);
            // console.log("[reddit-swapper] href:", href, "-> embed:", buildEmbedUrl(href));
            if (!href) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            // console.log("[reddit-swapper] stopped propagation, copying");

            copyAndToast(buildEmbedUrl(href));
        },
        true
    );

    // -- Fallback: clipboard.writeText interception (old share menu / other paths) --

    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
        if (typeof text !== "string") {
            return originalWriteText(text);
        }
        try {
            const url = new URL(text);
            if (url.hostname === "www.reddit.com") {
                url.hostname = TARGET_DOMAIN;
                url.search = "";
                url.hash = "";
                return originalWriteText(url.origin + url.pathname);
            }
        } catch {}
        return originalWriteText(text);
    };

    // -- Init ----------------------------------------------------------------

    if (document.head) injectStyles();
    else document.addEventListener("DOMContentLoaded", injectStyles);
})();
