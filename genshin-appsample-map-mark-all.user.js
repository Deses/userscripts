// ==UserScript==
// @name         Genshin Appsample Map - Mark All Found
// @namespace    https://github.com/Deses/userscripts
// @version      4.3
// @description  Bulk-mark markers as Found by fetching the master data file directly and calling the site's own _markAsFound API. Skips clicking entirely.
// @author       Deses
// @match        https://genshin-impact-map.appsample.com/*
// @icon         https://genshin-impact-map.appsample.com/favicon.ico
// @license      BSD-3-Clause
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/genshin-mark-all.user.js
// @downloadURL  https://raw.githubusercontent.com/Deses/userscripts/refs/heads/main/genshin-mark-all.user.js
// ==/UserScript==

(function () {
  'use strict';

  // -- constants --------------------------------------------------------------
  const MARKER_URL    = 'https://game-data.lemonapi.com/gim/markers_all.v5.json';
  const STORAGE_DATA  = 'gim_am_markers_v5';
  const STORAGE_DONE  = 'gim_am_done_ids';
  const STORAGE_OPTS  = 'gim_am_opts';
  const STORAGE_NAMES = 'gim_am_cat_names_en';

  // -- debug ------------------------------------------------------------------
  let DEBUG = true;       // toggle via the panel checkbox
  let storeUnsub = null;  // redux store subscription handle (active during runs)
  let lastSeenMsg = null; // last value of state.ui.msg, to detect changes
  const msgHistory = [];  // recent messages dispatched by the site (rolling)

  function dlog(...args) {
    if (!DEBUG) return;
    console.log('[AutoMark DBG]', ...args);
    const el = document.getElementById('am-log');
    if (!el) return;
    // pretty-print arg[0] as a string, JSON-serialize the rest
    const line = document.createElement('div');
    const head = String(args[0] ?? '');
    const tail = args.slice(1).map(a => {
      try { return typeof a === 'string' ? a : JSON.stringify(a); }
      catch (e) { return '<unserializable>'; }
    }).join(' ');
    line.textContent = `${new Date().toLocaleTimeString()} DBG ${head}${tail ? ' ' + tail : ''}`;
    line.style.color = '#7f849c';
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
    while (el.children.length > 600) el.removeChild(el.firstChild);
  }

  // -- state ------------------------------------------------------------------
  let markers   = [];              // [{id, type, mid}]
  let typeIndex = {};              // type -> count
  let midIndex  = {};              // mid  -> count
  let catNames  = {};              // "o17" -> "Common Chest"
  let midNames  = {};              // 2 -> "Teyvat"
  let groupOf   = {};              // "o17" -> "chest", "o29" -> "local", ...
  let done      = new Set();       // ids already attempted/marked
  let running   = false;
  let pauseFlag = false;
  let stopFlag  = false;
  let totalDone = 0;
  let totalGoal = 0;

  // -- helpers ----------------------------------------------------------------
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function log(msg, level = 'info') {
    const tag = '[AutoMark]';
    if (level === 'error') console.error(tag, msg);
    else console.log(tag, msg);
    const el = document.getElementById('am-log');
    if (!el) return;
    const line = document.createElement('div');
    line.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
    if (level === 'error') line.style.color = '#f38ba8';
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
    while (el.children.length > 400) el.removeChild(el.firstChild);
  }

  function loadOpts() {
    try { return JSON.parse(localStorage.getItem(STORAGE_OPTS) || '{}'); }
    catch (e) { return {}; }
  }

  function saveOpts(opts) {
    localStorage.setItem(STORAGE_OPTS, JSON.stringify(opts));
  }

  function loadDone() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_DONE) || '[]');
      done = new Set(arr);
    } catch (e) { done = new Set(); }
  }

  function saveDone() {
    localStorage.setItem(STORAGE_DONE, JSON.stringify([...done]));
  }

  function getUid() {
    try { return window._store?.getState?.()?.user?.user?.uid ?? null; }
    catch (e) { return null; }
  }

  function isReady() {
    return typeof window._markAsFound === 'function' && !!window._store;
  }

  async function waitReady(timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (isReady()) return true;
      await sleep(150);
    }
    return false;
  }

  // -- data load --------------------------------------------------------------
  async function loadMarkers(force = false) {
    dlog('loadMarkers called', { force });
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(STORAGE_DATA) || 'null');
        if (cached?.length) {
          markers = cached;
          rebuildIndexes();
          log(`Loaded ${markers.length} markers from cache.`);
          dlog('cache hit', { count: markers.length, firstRow: markers[0], lastRow: markers[markers.length-1] });
          return;
        } else {
          dlog('cache miss or empty');
        }
      } catch (e) {
        dlog('cache parse error', e.message);
      }
    }
    log('Fetching master markers file (~3MB)...');
    dlog('fetch GET', MARKER_URL);
    const res  = await fetch(MARKER_URL, { credentials: 'omit' });
    dlog('fetch response', { status: res.status, ok: res.ok, type: res.headers.get('content-type') });
    const json = await res.json();
    dlog('parsed JSON', { keys: Object.keys(json), headers: json?.headers, dataLen: json?.data?.length });
    if (!json?.data || !json?.headers) {
      throw new Error('Unexpected payload shape from markers_all.v5.json');
    }
    const idIdx   = json.headers.indexOf('id');
    const typeIdx = json.headers.indexOf('type');
    const midIdx  = json.headers.indexOf('mid');
    dlog('column indexes', { idIdx, typeIdx, midIdx });
    markers = json.data.map(row => ({
      id:   row[idIdx],
      type: row[typeIdx],
      mid:  row[midIdx],
    }));
    rebuildIndexes();
    try {
      localStorage.setItem(STORAGE_DATA, JSON.stringify(markers));
      dlog('cache written', { bytes: localStorage.getItem(STORAGE_DATA).length });
    }
    catch (e) { log(`Cache write failed (probably quota): ${e.message}`, 'error'); }
    log(`Fetched ${markers.length} markers across ${Object.keys(typeIndex).length} types.`);
  }

  // Extract human-readable category and map names from the loaded site bundle.
  // The bundle hash changes on each release, so we discover the URL from the DOM.
  async function loadCategoryNames(force = false) {
    dlog('loadCategoryNames called', { force });
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(STORAGE_NAMES) || 'null');
        if (cached?.cat && cached?.mid && cached?.groupOf) {
          catNames = cached.cat;
          midNames = cached.mid;
          groupOf  = cached.groupOf;
          dlog('names cache hit', { cat: Object.keys(catNames).length, mid: Object.keys(midNames).length, groups: Object.keys(groupOf).length });
          return;
        } else {
          dlog('names cache missing or incomplete', { has: cached ? Object.keys(cached) : null });
        }
      } catch (e) { dlog('names cache parse error', e.message); }
    }
    const scripts = [...document.querySelectorAll('script[src]')];
    const scriptEl = scripts.find(
      s => /\/_next\/static\/chunks\/pages\/_app-[a-f0-9]+\.js/.test(s.src)
    );
    dlog('script search', { totalScripts: scripts.length, matchedSrc: scriptEl?.src });
    if (!scriptEl) { log('Could not find _app bundle to read names from.', 'error'); return; }
    log('Fetching site bundle for category names...');
    dlog('fetch GET bundle', scriptEl.src);
    const res  = await fetch(scriptEl.src);
    const code = await res.text();
    dlog('bundle fetched', { status: res.status, bytes: code.length });

    // English-only marker name block: '"en":{"o2":"Statue of The Seven",...}'
    // Walk brace-balanced from the opening '{' so we don't bleed into the next language.
    const anchorKey = code.indexOf('"en":{"o2":');
    dlog('English names anchor', { anchorKey });
    if (anchorKey < 0) { log('Could not locate English names block.', 'error'); return; }
    const openIdx = anchorKey + '"en":'.length;
    const region  = sliceBraceBalanced(code, openIdx);
    dlog('English region sliced', { regionBytes: region.length });
    catNames = parseOidObject(region);
    dlog('catNames parsed', { count: Object.keys(catNames).length, samples: { o17: catNames.o17, o5: catNames.o5, o44: catNames.o44 } });

    // Map names: the English i18n only stores OVERRIDES for renamed regions,
    // so most mids (Teyvat, Enkanomiya, etc.) are not in there. Start from a
    // hardcoded baseline and let the i18n block overwrite any of those.
    const mid = { ...KNOWN_MID_NAMES };
    const enLangIdx = code.indexOf('en:{lang:"English"');
    if (enLangIdx > 0) {
      const enBlock = sliceBraceBalanced(code, enLangIdx + 'en:'.length);
      const mapAnchor = enBlock.indexOf('map:{');
      if (mapAnchor >= 0) {
        const mapBlock = sliceBraceBalanced(enBlock, mapAnchor + 'map:'.length);
        const mre = /(?:^|[{,])(\d+):"((?:\\.|[^"\\])*)"/g;
        let mm;
        while ((mm = mre.exec(mapBlock)) !== null) {
          mid[mm[1]] = decodeJsString(mm[2]);
        }
      }
    }
    midNames = mid;

    // Marker-group table: `JSON.parse('{"2":{"o2":1,...},"7":{...},...}')`.
    // Same bundle, separate call. Anchor on the very specific opening literal.
    const gAnchor = `JSON.parse('{"2":{"o2":1,"o3":1,`;
    const gStart  = code.indexOf(gAnchor);
    dlog('group table anchor', { gStart });
    const gFresh = {};
    if (gStart >= 0) {
      const literalStart = gStart + "JSON.parse('".length;
      let gEnd = -1;
      for (let i = literalStart; i < code.length; i++) {
        const ch = code[i];
        if (ch === '\\') { i++; continue; }
        if (ch === "'") { gEnd = i; break; }
      }
      if (gEnd > 0) {
        try {
          // Decode JS string escapes (\" -> ", \\ -> \) before JSON.parse.
          const jsonStr = code.slice(literalStart, gEnd)
            .replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
          const eh = JSON.parse(jsonStr);
          dlog('eh parsed', { mids: Object.keys(eh), entriesInMid2: Object.keys(eh['2'] || {}).length });
          const unknownCodes = new Set();
          for (const mm of Object.keys(eh)) {
            for (const [o, codeNum] of Object.entries(eh[mm])) {
              const name = GROUP_CODE_TO_NAME[codeNum];
              if (name) { if (!gFresh[o]) gFresh[o] = name; }
              else unknownCodes.add(codeNum);
            }
          }
          if (unknownCodes.size) dlog('unknown group codes encountered', [...unknownCodes]);
        } catch (e) {
          log(`Could not parse group table: ${e.message}`, 'error');
          dlog('group parse stack', e.stack);
        }
      }
    }
    groupOf = gFresh;

    try {
      localStorage.setItem(STORAGE_NAMES, JSON.stringify({ cat: catNames, mid, groupOf }));
    } catch (e) {}
    log(`Loaded ${Object.keys(catNames).length} category names, ${Object.keys(mid).length} map names, ${Object.keys(groupOf).length} group memberships.`);
  }

  // Walk forward from `openIdx` (which points at an opening `{`) tracking brace
  // depth, while ignoring braces that appear inside string literals. Returns
  // the matched `{...}` substring.
  function sliceBraceBalanced(src, openIdx) {
    if (src[openIdx] !== '{') return '';
    let depth = 0;
    let inStr = false;
    for (let i = openIdx; i < src.length; i++) {
      const ch = src[i];
      if (inStr) {
        if (ch === '\\') { i++; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
    }
    return src.slice(openIdx);
  }

  function parseOidObject(region) {
    const re = /"(o\d+)":"((?:\\.|[^"\\])*)"/g;
    const out = {};
    let m;
    while ((m = re.exec(region)) !== null) {
      const decoded = decodeJsString(m[2]);
      // A handful of entries in the bundle have malformed escapes that even the
      // site fails to JS-parse cleanly. Drop anything that looks like garbage
      // (empty, only backslashes/quotes) so the dropdown falls back to "oNNN".
      if (decoded && !/^[\\"\s]*$/.test(decoded)) {
        out[m[1]] = decoded;
      }
    }
    return out;
  }

  // Map from the bundle's numeric "group code" to a human label. Codes come
  // from the `eh` table inside the bundle (a JSON.parse'd dict, mid -> {oNNN: code}).
  // The categorization formulas live in the `ew` array of the same bundle.
  const GROUP_CODE_TO_NAME = {
    13:  'chest',         // Common/Exquisite/Precious/Luxurious/Remarkable + Mondstadt/Liyue statue chests
    186: 'hiddenchest',   // Puzzle Chest (huge bucket: time trials, seelies, mechanisms, etc.)
    4:   'collection',    // Oculi, Spincrystals, agates, lumenspar, etc.
    1:   'featured',      // Statues, Teleport Waypoints, Domains, Cities
    11:  'mineral',
    10:  'local',         // Local Specialties (Calla Lily, Cor Lapis, ...)
    50:  'monster',
    51:  'guide',         // sub-guides
    426: 'guide',         // main guides (Tree of Dreams etc.)
    60:  'material',
    173: 'wood',
    232: 'fish',
    273: 'animal',
  };

  const GROUP_LABELS = {
    chest:       'Chest',
    hiddenchest: 'Puzzle Chest',
    collection:  'Collection',
    featured:    'Featured (statues / waypoints / domains)',
    mineral:     'Mineral',
    local:       'Local Specialties',
    monster:     'Monster',
    guide:       'Guide',
    material:    'Material',
    wood:        'Wood',
    fish:        'Fish',
    animal:      'Animal',
  };

  // Groups that respawn / aren't worth pre-marking as "found".
  const DEFAULT_EXCLUDE_GROUPS = ['mineral', 'local', 'monster', 'guide', 'material', 'wood', 'fish', 'animal'];

  // Well-known map ids that don't always appear in the English i18n overrides.
  // Stays in sync with the site's `eS` definitions table; safe defaults.
  const KNOWN_MID_NAMES = {
    2:  'Teyvat',
    5:  'Golden Apple Archipelago',
    7:  'Enkanomiya',
    9:  'The Chasm',
    12: 'Golden Apple Archipelago (2.x)',
    33: 'Sumeru (sub-map)',
    34: 'Sea of Bygone Eras',
    36: 'Ancient Sacred Mountain',
    37: 'Temple of Space',
  };

  // Decode the JS-source escape sequences inside the regex-captured value.
  function decodeJsString(s) {
    return s
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      // collapse non-breaking spaces to regular spaces for tidier dropdowns
      .replace(/ /g, ' ');
  }

  function rebuildIndexes() {
    typeIndex = {};
    midIndex  = {};
    for (const m of markers) {
      typeIndex[m.type] = (typeIndex[m.type] || 0) + 1;
      midIndex[m.mid]   = (midIndex[m.mid]  || 0) + 1;
    }
  }

  // -- core loop --------------------------------------------------------------
  async function runMarking(opts) {
    dlog('runMarking called', {
      type: opts.type, mid: opts.mid, delay: opts.delay, conc: opts.conc,
      skipDone: opts.skipDone, excludeGroups: [...(opts.excludeGroups || [])],
    });
    if (!isReady()) {
      log('Site not ready yet. Try again in a few seconds.', 'error');
      dlog('isReady=false', { hasMarkAsFound: typeof window._markAsFound, hasStore: !!window._store });
      return;
    }
    const uid = getUid();
    dlog('signed-in check', { uid });
    if (!uid) {
      log('You are NOT signed in. _markAsFound will silently fail. Sign in via the map UI first.', 'error');
      return;
    }
    if (running) { log('Already running.'); return; }

    subscribeToStoreMessages();

    let pool = markers.slice();
    if (opts.type && opts.type !== '__all__') {
      pool = pool.filter(m => m.type === opts.type);
    }
    if (opts.mid && opts.mid !== '__all__') {
      const wantMid = Number(opts.mid);
      pool = pool.filter(m => m.mid === wantMid);
    }
    if (opts.excludeGroups && opts.excludeGroups.size > 0) {
      const before = pool.length;
      pool = pool.filter(m => !opts.excludeGroups.has(groupOf[m.type]));
      log(`Excluded ${before - pool.length} markers by group filter.`);
    }
    if (opts.skipDone) {
      pool = pool.filter(m => !done.has(m.id));
    }

    totalGoal = pool.length;
    totalDone = 0;
    if (totalGoal === 0) { log('Filter matches nothing to mark.'); unsubscribeFromStoreMessages(); return; }

    // Pool breakdown for diagnosis.
    const groupBreakdown = {};
    for (const m of pool) {
      const g = groupOf[m.type] || '<no-group>';
      groupBreakdown[g] = (groupBreakdown[g] || 0) + 1;
    }
    dlog('pool group breakdown', groupBreakdown);
    dlog('pool first 3 markers', pool.slice(0, 3));
    dlog('pool last 3 markers', pool.slice(-3));

    log(`Marking ${totalGoal} markers (delay=${opts.delay}ms, conc=${opts.conc}).`);
    running = true; pauseFlag = false; stopFlag = false;
    updateProgress();

    const queue = pool.slice();
    let saveCounter = 0;
    let callCounter = 0;
    let errCounter  = 0;

    async function worker(idx) {
      dlog(`worker ${idx} start`, { queueRemaining: queue.length });
      while (queue.length > 0) {
        while (pauseFlag && !stopFlag) await sleep(200);
        if (stopFlag) { dlog(`worker ${idx} stopping`); return; }
        const m = queue.shift();
        if (!m) return;
        try {
          callCounter++;
          if (callCounter <= 5 || callCounter % 50 === 0) {
            dlog('call _markAsFound', { worker: idx, n: callCounter, id: m.id, type: m.type, group: groupOf[m.type] });
          }
          const before = performance.now();
          const ret = window._markAsFound(m.id, m.type);
          const elapsed = (performance.now() - before).toFixed(2);
          if (callCounter <= 5) {
            dlog('call returned', { id: m.id, returnedType: typeof ret, returned: ret, syncMs: elapsed });
          }
          done.add(m.id);
          totalDone++;
          saveCounter++;
          if (saveCounter >= 100) {
            saveCounter = 0;
            saveDone();
            updateProgress();
          }
        } catch (e) {
          errCounter++;
          log(`Failed id=${m.id}: ${e.message}`, 'error');
          dlog('mark exception', { id: m.id, type: m.type, stack: e.stack });
        }
        if (opts.delay > 0) await sleep(opts.delay);
      }
      dlog(`worker ${idx} done`);
    }

    const workers = [];
    for (let w = 0; w < Math.max(1, opts.conc); w++) {
      workers.push(worker(w));
    }
    await Promise.all(workers);

    saveDone();
    updateProgress();
    running = false;
    dlog('run summary', { totalDone, errCounter, callCounter, msgsObserved: msgHistory.length });
    dlog('last 5 store messages observed', msgHistory.slice(-5));
    unsubscribeFromStoreMessages();
    if (stopFlag) log(`Stopped at ${totalDone}/${totalGoal}.`);
    else log(`Done. Marked ${totalDone}/${totalGoal}. Firestore writes may still be in flight; give it 30s before closing the tab.`);
  }

  // Subscribe to the site's Redux store and log when `state.ui.msg` (the
  // toast-message slot) changes. _markAsFound dispatches into this on success
  // ('msg.markAsFound') and on failure (style:'error'). This is the only way
  // to observe the real per-call outcome, since _markAsFound itself returns
  // undefined synchronously.
  function subscribeToStoreMessages() {
    if (storeUnsub) return;
    if (!window._store?.subscribe) { dlog('cannot subscribe: no _store.subscribe'); return; }
    lastSeenMsg = window._store.getState()?.ui?.msg;
    msgHistory.length = 0;
    storeUnsub = window._store.subscribe(() => {
      const msg = window._store.getState()?.ui?.msg;
      if (msg && msg !== lastSeenMsg) {
        lastSeenMsg = msg;
        msgHistory.push(msg);
        const isError = msg?.style === 'error' ||
                        (msg?.body && /error|wrong|fail/i.test(String(msg.body)));
        dlog(isError ? 'STORE ERROR msg' : 'store msg', msg);
      }
    });
    dlog('subscribed to store');
  }

  function unsubscribeFromStoreMessages() {
    if (storeUnsub) { storeUnsub(); storeUnsub = null; dlog('unsubscribed from store'); }
  }

  // Mark a single id as a smoke-test: full diagnostics, no batching.
  async function testMarkOne() {
    dlog('testMarkOne invoked');
    if (!isReady()) { log('Site not ready.', 'error'); return; }
    const uid = getUid();
    dlog('uid for test', uid);
    if (!uid) { log('Not signed in - test aborted.', 'error'); return; }

    const opts = currentOpts();
    let pool = markers.slice();
    if (opts.type && opts.type !== '__all__') pool = pool.filter(m => m.type === opts.type);
    if (opts.mid && opts.mid !== '__all__')   pool = pool.filter(m => m.mid === Number(opts.mid));
    if (opts.excludeGroups?.size) pool = pool.filter(m => !opts.excludeGroups.has(groupOf[m.type]));
    if (!pool.length) { log('No marker matches current filter for test.', 'error'); return; }

    const m = pool[0];
    log(`Test: marking single id=${m.id} (type=${m.type}, group=${groupOf[m.type] || 'none'})`);
    subscribeToStoreMessages();
    try {
      const ret = window._markAsFound(m.id, m.type);
      dlog('test call returned', { ret, retType: typeof ret });
    } catch (e) {
      log(`Test threw: ${e.message}`, 'error');
      dlog('test stack', e.stack);
    }
    // Wait briefly for Firestore round-trip + store dispatch.
    log('Waiting 4s for Firestore round-trip...');
    await sleep(4000);
    dlog('post-test msg history', msgHistory);
    if (msgHistory.length === 0) {
      log('No store messages dispatched. Either Firestore is hanging or the success/error path is suppressed.', 'error');
    }
    unsubscribeFromStoreMessages();
  }

  // -- mark NOT found (undo) --------------------------------------------------
  async function runUnmarking(opts) {
    if (!isReady() || !getUid()) {
      log('Need to be signed in.', 'error'); return;
    }
    if (typeof window._markAsNotFound !== 'function') {
      log('_markAsNotFound is not exposed.', 'error'); return;
    }
    if (running) { log('Already running.'); return; }

    let pool = markers.slice();
    if (opts.type && opts.type !== '__all__') {
      pool = pool.filter(m => m.type === opts.type);
    }
    if (opts.mid && opts.mid !== '__all__') {
      pool = pool.filter(m => m.mid === Number(opts.mid));
    }
    // only unmark ids we know we marked
    pool = pool.filter(m => done.has(m.id));

    totalGoal = pool.length;
    totalDone = 0;
    if (totalGoal === 0) { log('Nothing locally tracked to unmark.'); return; }

    log(`Unmarking ${totalGoal} markers.`);
    running = true; pauseFlag = false; stopFlag = false;
    updateProgress();

    for (const m of pool) {
      while (pauseFlag && !stopFlag) await sleep(200);
      if (stopFlag) break;
      try {
        window._markAsNotFound(m.id);
        done.delete(m.id);
        totalDone++;
        if (totalDone % 100 === 0) { saveDone(); updateProgress(); }
      } catch (e) {
        log(`Unmark failed id=${m.id}: ${e.message}`, 'error');
      }
      if (opts.delay > 0) await sleep(opts.delay);
    }
    saveDone();
    updateProgress();
    running = false;
    log(`Unmark done: ${totalDone}/${totalGoal}.`);
  }

  // -- UI ---------------------------------------------------------------------
  function buildUI() {
    if (document.getElementById('am-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'am-panel';
    Object.assign(panel.style, {
      position:     'fixed',
      bottom:       '100px',
      right:        '10px',
      zIndex:       '2147483647',
      background:   '#1e1e2e',
      color:        '#cdd6f4',
      fontFamily:   'monospace',
      fontSize:     '12px',
      width:        '340px',
      borderRadius: '8px',
      boxShadow:    '0 4px 20px rgba(0,0,0,0.7)',
      overflow:     'hidden',
      border:       '1px solid #45475a',
    });

    panel.innerHTML = `
      <div id="am-header"
        style="background:#313244;padding:8px 12px;cursor:move;
               display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:bold;color:#cba6f7">Auto-Mark v4</span>
        <span>
          <span id="am-min" style="cursor:pointer;font-size:16px;margin-right:6px">v</span>
          <span id="am-close" style="cursor:pointer;font-size:14px;color:#f38ba8">x</span>
        </span>
      </div>
      <div id="am-body" style="padding:10px">

        <div id="am-status"
             style="background:#181825;border-radius:5px;padding:7px;margin-bottom:8px;
                    font-size:11px;color:#a6adc8;line-height:1.5">
          Loading...
        </div>

        <div style="display:flex;gap:5px;margin-bottom:8px">
          <button id="am-fetch"
            style="flex:1;background:#89dceb;color:#1e1e2e;border:none;border-radius:5px;
                   padding:5px;cursor:pointer;font-weight:bold;font-size:11px">
            Reload Markers
          </button>
          <button id="am-clear-done"
            style="flex:1;background:#f9e2af;color:#1e1e2e;border:none;border-radius:5px;
                   padding:5px;cursor:pointer;font-weight:bold;font-size:11px">
            Reset Progress
          </button>
        </div>

        <label style="font-size:11px;color:#a6adc8">Category:</label>
        <select id="am-type" style="width:100%;background:#313244;border:1px solid #45475a;
                color:#cdd6f4;border-radius:4px;padding:3px;margin:2px 0 6px"></select>

        <label style="font-size:11px;color:#a6adc8">Map (mid):</label>
        <select id="am-mid" style="width:100%;background:#313244;border:1px solid #45475a;
                color:#cdd6f4;border-radius:4px;padding:3px;margin:2px 0 6px"></select>

        <div style="display:flex;gap:6px;margin-bottom:6px">
          <div style="flex:1">
            <label style="font-size:11px;color:#a6adc8">Delay ms</label>
            <input id="am-delay" type="number" min="0" max="5000" value="80"
              style="width:100%;background:#313244;border:1px solid #45475a;color:#cdd6f4;
                     border-radius:4px;padding:2px 6px;box-sizing:border-box"/>
          </div>
          <div style="flex:1">
            <label style="font-size:11px;color:#a6adc8">Concurrency</label>
            <input id="am-conc" type="number" min="1" max="20" value="3"
              style="width:100%;background:#313244;border:1px solid #45475a;color:#cdd6f4;
                     border-radius:4px;padding:2px 6px;box-sizing:border-box"/>
          </div>
        </div>

        <div style="font-size:11px;color:#a6adc8;margin-bottom:4px">
          Exclude groups (respawning stuff is on by default):
        </div>
        <div id="am-groups"
          style="background:#181825;border-radius:4px;padding:5px 7px;margin-bottom:8px;
                 max-height:120px;overflow-y:auto;font-size:11px;color:#bac2de"></div>

        <label style="font-size:11px;color:#a6adc8;display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <input id="am-skip-done" type="checkbox" checked/>
          Skip ids already marked in this session
        </label>

        <div style="display:flex;gap:6px;margin-bottom:6px">
          <button id="am-start"
            style="flex:2;background:#a6e3a1;color:#1e1e2e;border:none;border-radius:5px;
                   padding:6px;cursor:pointer;font-weight:bold">
            Start
          </button>
          <button id="am-pause"
            style="flex:1;background:#f9e2af;color:#1e1e2e;border:none;border-radius:5px;
                   padding:6px;cursor:pointer;font-weight:bold">
            Pause
          </button>
          <button id="am-stop"
            style="flex:1;background:#f38ba8;color:#1e1e2e;border:none;border-radius:5px;
                   padding:6px;cursor:pointer;font-weight:bold">
            Stop
          </button>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center">
          <button id="am-test"
            style="flex:1;background:#74c7ec;color:#1e1e2e;border:none;border-radius:5px;
                   padding:5px;cursor:pointer;font-weight:bold;font-size:11px">
            Test Mark 1 (verbose)
          </button>
          <label style="font-size:11px;color:#a6adc8;display:flex;align-items:center;gap:4px">
            <input id="am-debug" type="checkbox" checked/>Verbose
          </label>
          <button id="am-dump"
            style="background:#6c7086;color:#cdd6f4;border:none;border-radius:5px;
                   padding:5px 8px;cursor:pointer;font-size:11px" title="Dump diagnostics to console">
            Dump
          </button>
        </div>

        <button id="am-unmark"
          style="width:100%;background:#cba6f7;color:#1e1e2e;border:none;border-radius:5px;
                 padding:5px;cursor:pointer;font-weight:bold;font-size:11px;margin-bottom:8px">
          Undo (Mark Not-Found, current filter)
        </button>

        <div style="background:#313244;border-radius:4px;height:8px;margin-bottom:3px">
          <div id="am-bar"
            style="height:8px;width:0%;background:#cba6f7;border-radius:4px;transition:width .15s">
          </div>
        </div>
        <div id="am-bar-lbl"
          style="font-size:10px;color:#6c7086;text-align:right;margin-bottom:5px">
        </div>

        <div id="am-log"
          style="background:#181825;border-radius:4px;height:130px;overflow-y:auto;
                 padding:5px 7px;font-size:10px;color:#bac2de;line-height:1.5"></div>
      </div>`;

    document.body.appendChild(panel);
    makeDraggable(panel, panel.querySelector('#am-header'));

    // controls
    let mini = false;
    panel.querySelector('#am-min').onclick = () => {
      mini = !mini;
      panel.querySelector('#am-body').style.display = mini ? 'none' : 'block';
      panel.querySelector('#am-min').textContent = mini ? '>' : 'v';
    };
    panel.querySelector('#am-close').onclick = () => panel.remove();

    panel.querySelector('#am-fetch').onclick = async () => {
      try {
        await Promise.all([loadMarkers(true), loadCategoryNames(true)]);
        refreshDropdowns();
        updateStatus();
      }
      catch (e) { log(`Fetch failed: ${e.message}`, 'error'); }
    };

    panel.querySelector('#am-clear-done').onclick = () => {
      done = new Set();
      saveDone();
      updateStatus();
      log('Local progress reset.');
    };

    panel.querySelector('#am-start').onclick = () => {
      const opts = currentOpts();
      saveOpts(opts);
      runMarking(opts);
    };

    panel.querySelector('#am-pause').onclick = () => {
      pauseFlag = !pauseFlag;
      panel.querySelector('#am-pause').textContent = pauseFlag ? 'Resume' : 'Pause';
      log(pauseFlag ? 'Paused.' : 'Resumed.');
    };

    panel.querySelector('#am-stop').onclick = () => {
      stopFlag = true;
      log('Stop requested.');
    };

    panel.querySelector('#am-unmark').onclick = () => {
      if (!confirm('Mark all currently-filtered markers as NOT found?')) return;
      const opts = currentOpts();
      runUnmarking(opts);
    };

    panel.querySelector('#am-test').onclick = () => testMarkOne();

    panel.querySelector('#am-debug').onchange = (e) => {
      DEBUG = e.target.checked;
      log(`Verbose logging ${DEBUG ? 'ON' : 'OFF'}.`);
    };

    panel.querySelector('#am-dump').onclick = () => dumpDiagnostics();

    // restore previous options
    const saved = loadOpts();
    if (saved.delay != null) panel.querySelector('#am-delay').value = saved.delay;
    if (saved.conc  != null) panel.querySelector('#am-conc').value  = saved.conc;
    if (saved.skipDone === false) panel.querySelector('#am-skip-done').checked = false;
  }

  function currentOpts() {
    const root = document.getElementById('am-panel');
    const excludeGroups = new Set();
    root.querySelectorAll('input[data-group]').forEach(cb => {
      if (cb.checked) excludeGroups.add(cb.dataset.group);
    });
    return {
      type:     root.querySelector('#am-type').value,
      mid:      root.querySelector('#am-mid').value,
      delay:    Math.max(0, parseInt(root.querySelector('#am-delay').value, 10) || 0),
      conc:     Math.max(1, parseInt(root.querySelector('#am-conc').value,  10) || 1),
      skipDone: root.querySelector('#am-skip-done').checked,
      excludeGroups,
    };
  }

  function refreshDropdowns() {
    const tSel = document.getElementById('am-type');
    const mSel = document.getElementById('am-mid');
    if (!tSel || !mSel) return;

    const prevT = tSel.value;
    const prevM = mSel.value;

    tSel.innerHTML = `<option value="__all__">All categories (${markers.length})</option>`;
    // Sort alphabetically by name if we have names, else by count.
    const typesSorted = Object.entries(typeIndex).sort((a, b) => {
      const na = catNames[a[0]];
      const nb = catNames[b[0]];
      if (na && nb) return na.localeCompare(nb);
      if (na) return -1;
      if (nb) return  1;
      return b[1] - a[1];
    });
    for (const [t, c] of typesSorted) {
      const o = document.createElement('option');
      o.value = t;
      const name = catNames[t];
      o.textContent = name ? `${name}  (${c})  [${t}]` : `${t}  (${c})`;
      tSel.appendChild(o);
    }
    tSel.value = prevT && tSel.querySelector(`option[value="${prevT}"]`) ? prevT : '__all__';

    mSel.innerHTML = `<option value="__all__">All maps</option>`;
    const midsSorted = Object.entries(midIndex).sort((a, b) => Number(a[0]) - Number(b[0]));
    for (const [mid, c] of midsSorted) {
      const o = document.createElement('option');
      o.value = mid;
      const name = midNames[mid];
      o.textContent = name ? `${name}  (${c})  [mid ${mid}]` : `mid ${mid}  (${c})`;
      mSel.appendChild(o);
    }
    mSel.value = prevM && mSel.querySelector(`option[value="${prevM}"]`) ? prevM : '__all__';

    refreshGroupChecklist();
  }

  function refreshGroupChecklist() {
    const host = document.getElementById('am-groups');
    if (!host) return;

    // Count markers per group from the live data + indexes.
    const countByGroup = {};
    let uncategorized = 0;
    for (const m of markers) {
      const g = groupOf[m.type];
      if (g) countByGroup[g] = (countByGroup[g] || 0) + 1;
      else uncategorized++;
    }

    const presentGroups = Object.keys(GROUP_LABELS).filter(g => countByGroup[g]);

    // Preserve previously checked state if we're rebuilding.
    const prev = {};
    host.querySelectorAll('input[data-group]').forEach(cb => { prev[cb.dataset.group] = cb.checked; });

    host.innerHTML = '';
    for (const g of presentGroups) {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;align-items:center;gap:6px;line-height:1.7';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.group = g;
      // restore prior state if present, else default
      cb.checked = (g in prev) ? prev[g] : DEFAULT_EXCLUDE_GROUPS.includes(g);
      const label = document.createElement('span');
      label.textContent = `${GROUP_LABELS[g]}  (${countByGroup[g]})`;
      wrap.appendChild(cb);
      wrap.appendChild(label);
      host.appendChild(wrap);
    }
    if (uncategorized > 0) {
      const note = document.createElement('div');
      note.style.cssText = 'color:#6c7086;margin-top:4px;font-style:italic';
      note.textContent = `${uncategorized} markers have no known group (kept regardless).`;
      host.appendChild(note);
    }
  }

  function updateStatus() {
    const el = document.getElementById('am-status');
    if (!el) return;
    const ready = isReady();
    const uid = getUid();
    el.innerHTML =
      `<div><b style="color:#f9e2af">Markers loaded:</b> ${markers.length}</div>` +
      `<div><b style="color:#f9e2af">Locally tracked:</b> ${done.size}</div>` +
      `<div><b style="color:#f9e2af">App ready:</b> ${ready ? 'yes' : 'no'}</div>` +
      `<div><b style="color:#f9e2af">Signed in:</b> ${uid ? 'yes (' + String(uid).slice(0, 6) + '...)' : '<span style="color:#f38ba8">NO -- sign in first</span>'}</div>`;
  }

  function updateProgress() {
    const bar = document.getElementById('am-bar');
    const lbl = document.getElementById('am-bar-lbl');
    if (!bar || !lbl) return;
    const pct = totalGoal > 0 ? Math.round(totalDone / totalGoal * 100) : 0;
    bar.style.width = `${pct}%`;
    lbl.textContent = totalGoal > 0 ? `${totalDone} / ${totalGoal}  (${pct}%)` : '';
  }

  function makeDraggable(el, handle) {
    let ox, oy, dragging = false;
    handle.addEventListener('mousedown', e => {
      if (e.target.id === 'am-min' || e.target.id === 'am-close') return;
      e.preventDefault();
      dragging = true;
      ox = e.clientX - el.offsetLeft;
      oy = e.clientY - el.offsetTop;
      const move = e2 => {
        if (!dragging) return;
        el.style.left   = (e2.clientX - ox) + 'px';
        el.style.top    = (e2.clientY - oy) + 'px';
        el.style.right  = 'auto';
        el.style.bottom = 'auto';
      };
      const up = () => {
        dragging = false;
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  // -- diagnostics ------------------------------------------------------------
  function dumpDiagnostics() {
    const state = window._store?.getState?.();
    const dump = {
      version:           '4.3',
      timestamp:         new Date().toISOString(),
      url:               location.href,
      readyState:        document.readyState,
      hasMarkAsFound:    typeof window._markAsFound,
      hasMarkAsNotFound: typeof window._markAsNotFound,
      hasStore:          !!window._store,
      uid:               getUid(),
      userStateKeys:     state?.user ? Object.keys(state.user) : null,
      uiMsg:             state?.ui?.msg ?? null,
      foundStatusByType: state?.user?.foundStatusByType
                         ? Object.keys(state.user.foundStatusByType).length + ' entries'
                         : null,
      markersLoaded:     markers.length,
      typeCount:         Object.keys(typeIndex).length,
      midCount:          Object.keys(midIndex).length,
      catNamesLoaded:    Object.keys(catNames).length,
      midNamesLoaded:    Object.keys(midNames).length,
      groupOfLoaded:     Object.keys(groupOf).length,
      doneLocalCount:    done.size,
      running, pauseFlag, stopFlag,
      totalDone, totalGoal,
      lastMsgs:          msgHistory.slice(-5),
      sampleMarkers:     markers.slice(0, 3),
      browser:           navigator.userAgent.slice(0, 80),
    };
    console.log('[AutoMark DIAGNOSTICS]', dump);
    log('Diagnostics dumped to browser console (press F12 -> Console).');
    return dump;
  }

  // -- boot -------------------------------------------------------------------
  async function init() {
    console.log('[AutoMark] init starting, version 4.3');
    loadDone();
    dlog('localStorage progress loaded', { doneCount: done.size });
    await new Promise(r => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', r, { once: true });
      } else { r(); }
    });
    dlog('DOM ready', { readyState: document.readyState });
    buildUI();
    dlog('UI built');
    updateStatus();
    try {
      await Promise.all([loadMarkers(false), loadCategoryNames(false)]);
      refreshDropdowns();
      dlog('initial load complete');
    } catch (e) {
      log(`Initial fetch failed: ${e.message}`, 'error');
      dlog('initial load exception', e.stack);
    }
    const ok = await waitReady(60000);
    if (!ok) {
      log('Site bundle did not expose _markAsFound within 60s. Reload the page.', 'error');
      dlog('not ready', { hasMarkAsFound: typeof window._markAsFound, hasStore: !!window._store });
    } else {
      dlog('site ready', { hasMarkAsFound: typeof window._markAsFound, hasStore: !!window._store, uid: getUid() });
    }
    updateStatus();
    setInterval(updateStatus, 3000);
  }

  init();
})();
