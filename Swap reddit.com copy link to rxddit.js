// ==UserScript==
// @name         Swap reddit.com copy link to rxddit
// @namespace    https://github.com/Deses/RedditLinkSwapper
// @version      1.0
// @description  Replace `reddit` to `rxddit` when clicking Share and then 'Copy link'
// @author       Deses
// @match        https://www.reddit.com/*
// @icon         https://www.redditstatic.com/shreddit/assets/favicon/192x192.png
// @license      BSD-3-Clause
// ==/UserScript==

(function () {
    "use strict";

    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);

    navigator.clipboard.writeText = function(text) {
        if (typeof text !== "string") {
            return originalWriteText(text);
        }

        try {
            const url = new URL(text);

            if (url.hostname === "www.reddit.com") {
                url.hostname = "rxddit.com";
            }

            url.search = "";

            return originalWriteText(url.origin + url.pathname);
        } catch {
            return originalWriteText(text);
        }
    };
})();
