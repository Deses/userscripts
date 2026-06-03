// ==UserScript==
// @name         Enable Copy-Paste on DisplaySpecifications
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Re-enables text selection and copy-paste on displayspecifications.com
// @author       You
// @match        *://www.displayspecifications.com/*
// @match        *://displayspecifications.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/Enable%20Copy-Paste%20on%20DisplaySpecifications.js
// @downloadURL  https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/Enable%20Copy-Paste%20on%20DisplaySpecifications.js
// ==/UserScript==

(function () {
    'use strict';

    // Remove event blockers as early as possible
    const eventsToUnblock = [
        'copy', 'cut', 'paste',
        'selectstart', 'contextmenu',
        'mousedown', 'mouseup', 'keydown', 'keyup'
    ];

    // Override addEventListener to suppress blocking handlers
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (eventsToUnblock.includes(type)) {
            // Wrap the listener to neutralize preventDefault/stopPropagation on copy-related events
            const wrappedListener = function (e) {
                const originalPreventDefault = e.preventDefault.bind(e);
                const originalStop = e.stopPropagation.bind(e);
                const originalStopImmediate = e.stopImmediatePropagation.bind(e);
                e.preventDefault = () => {};
                e.stopPropagation = () => {};
                e.stopImmediatePropagation = () => {};
                listener.call(this, e);
                // Restore (doesn't matter much but keeps things clean)
                e.preventDefault = originalPreventDefault;
                e.stopPropagation = originalStop;
                e.stopImmediatePropagation = originalStopImmediate;
            };
            return originalAddEventListener.call(this, type, wrappedListener, options);
        }
        return originalAddEventListener.call(this, type, listener, options);
    };

    // Force-enable selection and copy via CSS and attribute removal
    document.addEventListener('DOMContentLoaded', () => {
        // Inject CSS to allow text selection everywhere
        const style = document.createElement('style');
        style.textContent = `
            * {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }
        `;
        document.head.appendChild(style);

        // Remove inline oncopy/oncut/onpaste/onselectstart handlers
        document.querySelectorAll('*').forEach(el => {
            el.oncopy = null;
            el.oncut = null;
            el.onpaste = null;
            el.onselectstart = null;
            el.oncontextmenu = null;
            el.onmousedown = null;
        });

        // Watch for dynamically added elements
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        node.oncopy = null;
                        node.oncut = null;
                        node.onpaste = null;
                        node.onselectstart = null;
                        node.oncontextmenu = null;
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
