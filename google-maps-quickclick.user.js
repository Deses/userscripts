// ==UserScript==
// @name         Google Maps QuickClick
// @namespace    https://github.com/Deses/userscripts
// @version      1.0
// @description  Re-enable the click on the local-results map thumbnail (disabled by Google in the EU) so it opens Google Maps again
// @author       Deses
// @match        https://www.google.com/search*
// @match        https://www.google.*/search*
// @icon         https://www.google.com/s2/favicons?domain=maps.google.com
// @license      BSD-3-Clause
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    function getQuery() {
        return new URLSearchParams(window.location.search).get("q") || "";
    }

    function wrapMap() {
        const mapNode = document.getElementById("lu_map");
        if (!mapNode || mapNode.closest("a.gmqc-link")) return; // not present or already wrapped

        const query = getQuery();
        if (!query) return;

        const link = document.createElement("a");
        link.className = "gmqc-link";
        link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        mapNode.parentNode.insertBefore(link, mapNode);
        link.appendChild(mapNode);
    }

    // The local pack often loads after the initial render, so keep watching.
    wrapMap();
    const observer = new MutationObserver(wrapMap);
    observer.observe(document.body, { childList: true, subtree: true });
})();