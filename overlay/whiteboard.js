// Whiteboard overlay: draw, arrow, and comment on any page, and let an agent
// read the marks back as data. Include with <script src="whiteboard.js"></script>.
//
// Agent API (window.whiteboard):
//   getMarks()        -> array of marks, each with what it points at (`anchor`)
//   describe()        -> short plain-text summary of all marks
//   addMark(mark)     -> add a mark (e.g. from the agent); returns its id.
//                        Pass target: 'label' (a data-wb value) instead of
//                        coordinates to box/point at/note that region.
//   removeMark(id), clear(author?), undo()
//   connect()         -> call when you open the tab; hides the "not connected"
//                        banner (any API call above also counts)
//
// Stateful pages can set whiteboard.pageState = () => ({ step: 3 }) so each
// mark records the page state it was made in.
//
// Pages can label regions with data-wb="step 3: tokenize" so marks anchor to
// meaningful names instead of raw tags.
(function () {
  if (window.whiteboard) return;
  const SCRIPT = document.currentScript;

  const COLORS = { red: '#e5484d', blue: '#3e63dd', green: '#30a46c', orange: '#f76b15' };
  const STORE_KEY = 'whiteboard:' + location.pathname;
  let marks = [];
  let mode = 'off'; // off | pen | arrow | comment
  let color = 'red';
  let current = null;
  let nextId = 1;
  const history = []; // snapshots of marks, for undo
  function snapshot() {
    history.push(JSON.stringify(marks));
    if (history.length > 100) history.shift();
  }

  // --- persistence (best effort) ---
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(marks)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) marks = JSON.parse(raw);
      nextId = marks.reduce((m, k) => Math.max(m, k.id), 0) + 1;
    } catch (e) { marks = []; }
  }

  // --- DOM ---
  const style = document.createElement('style');
  style.textContent = `
    .wb-canvas { position:absolute; left:0; top:0; z-index:2147483000; pointer-events:none; }
    .wb-canvas.wb-active { pointer-events:auto; cursor:crosshair; }
    .wb-bar { position:fixed; right:16px; bottom:16px; z-index:2147483002; display:flex; gap:4px;
      align-items:center; padding:6px; border-radius:10px; background:#1c1c1f; color:#eee;
      font:13px system-ui, sans-serif; box-shadow:0 4px 16px rgba(0,0,0,.3); }
    .wb-bar button { border:0; background:transparent; color:inherit; padding:5px 8px;
      border-radius:6px; cursor:pointer; font:inherit; }
    .wb-bar button:hover { background:#333; }
    .wb-bar button.wb-on { background:#444; }
    .wb-swatch { width:18px; height:18px; padding:0 !important; border-radius:50% !important;
      border:2px solid transparent !important; }
    .wb-swatch.wb-on { border-color:#fff !important; }
    .wb-sep { width:1px; height:18px; background:#444; margin:0 2px; }
    .wb-note { position:absolute; z-index:2147483001; max-width:220px; padding:6px 8px;
      border-radius:6px; font:13px system-ui, sans-serif; color:#111; background:#fff;
      border-left:4px solid; box-shadow:0 2px 8px rgba(0,0,0,.25); white-space:pre-wrap; }
    .wb-note textarea { width:200px; min-height:50px; font:inherit; border:0; outline:0; resize:vertical; }
    .wb-note .wb-who { font-size:11px; opacity:.6; }
    .wb-note { padding-right:24px; }
    .wb-note .wb-x { position:absolute; top:2px; right:2px; z-index:1; width:20px; height:20px;
      line-height:20px; text-align:center; cursor:pointer; opacity:.5; border-radius:4px; }
    .wb-note .wb-x:hover { opacity:1; background:#eee; }
    .wb-banner { position:fixed; left:0; right:0; top:0; z-index:2147483003; padding:10px 16px;
      background:#e5484d; color:#fff; font:600 14px system-ui, sans-serif; text-align:center;
      box-shadow:0 2px 8px rgba(0,0,0,.25); }
    .wb-banner span { font-weight:400; opacity:.9; }
    .wb-selbtn { position:absolute; z-index:2147483002; border:0; border-radius:6px; padding:4px 8px;
      background:#1c1c1f; color:#eee; font:13px system-ui, sans-serif; cursor:pointer;
      box-shadow:0 2px 8px rgba(0,0,0,.3); }
    .wb-note .wb-quote { font-style:italic; opacity:.7; margin-bottom:2px; }
    .wb-note.wb-pin { padding:0; width:22px; height:22px; border-left:0; border-radius:50% 50% 50% 0;
      display:flex; align-items:center; justify-content:center; font-size:11px; color:#fff;
      cursor:default; box-shadow:0 1px 4px rgba(0,0,0,.35); }
    .wb-note.wb-pin > :not(.wb-pinlabel) { display:none; }
    .wb-note.wb-pin:hover { width:auto; height:auto; padding:6px 24px 6px 8px; border-radius:6px;
      border-left:4px solid; color:#111; background:#fff !important; display:block; z-index:2147483002; }
    .wb-note.wb-pin:hover > * { display:block; }
    .wb-note.wb-pin:hover > .wb-pinlabel { display:none; }
    .wb-note.wb-pin:hover > .wb-x { display:block; }
    .wb-banner.wb-ok { background:#30a46c; padding:4px 16px; font-size:12px; }
  `;
  document.head.appendChild(style);

  const canvas = document.createElement('canvas');
  canvas.className = 'wb-canvas';
  canvas.setAttribute('data-wb-ui', '');
  const ctx = canvas.getContext('2d');
  const notes = document.createElement('div');
  notes.setAttribute('data-wb-ui', '');

  const bar = document.createElement('div');
  bar.className = 'wb-bar';
  bar.setAttribute('data-wb-ui', '');
  const tools = [['off', '🖱 Use page'], ['pen', '✏️ Draw'], ['arrow', '↗ Arrow'], ['comment', '💬 Note']];
  const toolBtns = {};
  for (const [m, label] of tools) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = m === 'off' ? 'Interact with the page (Esc)' : label;
    b.onclick = () => setMode(m);
    toolBtns[m] = b;
    bar.appendChild(b);
  }
  bar.appendChild(Object.assign(document.createElement('div'), { className: 'wb-sep' }));
  const swatches = {};
  for (const name of Object.keys(COLORS)) {
    const s = document.createElement('button');
    s.className = 'wb-swatch';
    s.style.background = COLORS[name];
    s.title = name;
    s.onclick = () => { color = name; refreshBar(); };
    swatches[name] = s;
    bar.appendChild(s);
  }
  bar.appendChild(Object.assign(document.createElement('div'), { className: 'wb-sep' }));
  const undoBtn = document.createElement('button');
  undoBtn.textContent = '↶ Undo';
  undoBtn.title = 'Undo (Cmd/Ctrl+Z)';
  undoBtn.onclick = () => api.undo();
  bar.appendChild(undoBtn);
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.onclick = () => api.clear();
  bar.appendChild(clearBtn);

  // "Connected" means Claude has touched this tab through the API. Kept per tab
  // (sessionStorage), so a reload in Claude's tab stays connected but the same
  // URL opened in another browser or tab shows the warning.
  const CONN_KEY = 'whiteboard:connected';
  const banner = document.createElement('div');
  banner.className = 'wb-banner';
  banner.setAttribute('data-wb-ui', '');
  // Which browser Claude drives; pages can override with
  // <script src="whiteboard.js" data-browser="Chromium (Playwright)">.
  const BROWSER = (SCRIPT && SCRIPT.dataset.browser) || 'Chrome';
  function showBanner(connected) {
    banner.classList.toggle('wb-ok', connected);
    banner.innerHTML = connected ? '✓ Claude can see this page'
      : "⚠ Claude can't see this tab. " +
        `<span>Marks made here won't reach Claude. Use the tab Claude opened for you in ${BROWSER}.</span>`;
    if (!banner.isConnected && document.body) document.body.append(banner);
  }
  function isConnected() {
    try { return sessionStorage.getItem(CONN_KEY) === '1'; } catch (e) { return false; }
  }
  function markConnected() {
    try { sessionStorage.setItem(CONN_KEY, '1'); } catch (e) {}
    showBanner(true);
  }

  function refreshBar() {
    for (const m in toolBtns) toolBtns[m].classList.toggle('wb-on', m === mode);
    for (const c in swatches) swatches[c].classList.toggle('wb-on', c === color);
  }
  function setMode(m) {
    mode = m;
    canvas.classList.toggle('wb-active', m !== 'off');
    refreshBar();
  }

  // --- geometry ---
  function docSize() {
    const d = document.documentElement;
    return [Math.max(d.scrollWidth, d.clientWidth), Math.max(d.scrollHeight, d.clientHeight)];
  }
  function resize() {
    const [w, h] = docSize();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  function pagePoint(e) { return { x: Math.round(e.pageX), y: Math.round(e.pageY) }; }

  // What is under a page point (ignoring our own UI)?
  function noteAt(x, y) {
    for (const n of notes.querySelectorAll('.wb-note')) {
      const r = n.getBoundingClientRect();
      const px = x - scrollX, py = y - scrollY;
      if (px >= r.left - 6 && px <= r.right + 6 && py >= r.top - 6 && py <= r.bottom + 6) return Number(n.dataset.markId);
    }
    return null;
  }
  function anchorAt(x, y) {
    const onNote = noteAt(x, y);
    if (onNote) return { label: null, element: null, text: null, note: onNote };
    const hidden = [canvas, notes, bar];
    const prev = hidden.map(el => el.style.visibility);
    hidden.forEach(el => (el.style.visibility = 'hidden'));
    const el = document.elementFromPoint(x - scrollX, y - scrollY);
    hidden.forEach((el, i) => (el.style.visibility = prev[i]));
    // A container of labeled parts (like <main>) is "between things", not a target.
    const empty = !el || el === document.documentElement || el === document.body ||
      (!el.closest('[data-wb]') && el.querySelector('[data-wb]'));
    if (empty) {
      const near = nearestLabel(x, y);
      return near ? { label: null, element: null, text: null, near } : null;
    }
    const labeled = el.closest('[data-wb]');
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    return {
      label: labeled ? labeled.getAttribute('data-wb') : null,
      element: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
        (el.classList.length ? '.' + [...el.classList].join('.') : ''),
      text: text || null,
    };
  }
  function labelRect(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }
  function nearestLabel(x, y) {
    let best = null, bestD = 250;
    for (const el of document.querySelectorAll('[data-wb]')) {
      const r = labelRect(el);
      const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
      const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = el.getAttribute('data-wb'); }
    }
    return best;
  }
  function bbox(points) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const b = { x: Math.min(...xs), y: Math.min(...ys) };
    b.w = Math.max(...xs) - b.x;
    b.h = Math.max(...ys) - b.y;
    return b;
  }
  // A closed-ish loop reads as "circled", otherwise "underline/stroke".
  function strokeShape(points) {
    const b = bbox(points);
    const a = points[0], z = points[points.length - 1];
    const gap = Math.hypot(a.x - z.x, a.y - z.y);
    if (gap < 0.35 * Math.max(b.w, b.h) && b.w > 20 && b.h > 20) return 'circle';
    if (b.h < 0.25 * b.w) return 'underline';
    return 'scribble';
  }

  // --- drawing ---
  function drawArrow(from, to, col) {
    const ang = Math.atan2(to.y - from.y, to.x - from.x), head = 14;
    ctx.strokeStyle = ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(ang - 0.4), to.y - head * Math.sin(ang - 0.4));
    ctx.lineTo(to.x - head * Math.cos(ang + 0.4), to.y - head * Math.sin(ang + 0.4));
    ctx.closePath(); ctx.fill();
  }
  function drawMark(m) {
    const col = COLORS[m.color] || m.color;
    ctx.lineWidth = 3; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.setLineDash(m.author === 'claude' ? [8, 6] : []);
    if (m.type === 'stroke') {
      ctx.strokeStyle = col;
      ctx.beginPath();
      m.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    } else if (m.type === 'arrow') {
      drawArrow(m.from, m.to, col);
    } else if (m.type === 'highlight') {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = col;
      m.rects.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));
      ctx.globalAlpha = 1;
    } else if (m.type === 'box') {
      ctx.strokeStyle = col;
      ctx.strokeRect(m.x, m.y, m.w, m.h);
    }
    ctx.setLineDash([]);
  }
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    marks.forEach(drawMark);
    if (current) drawMark(current);
    renderNotes();
  }
  function renderNotes() {
    notes.innerHTML = '';
    for (const m of marks.filter(m => m.type === 'comment' || (m.type === 'highlight' && m.text))) {
      const n = document.createElement('div');
      n.className = 'wb-note wb-pin';
      n.dataset.markId = m.id;
      n.style.left = m.x + 'px';
      n.style.top = m.y + 'px';
      n.style.borderColor = n.style.background = COLORS[m.color] || m.color;
      n.title = '';
      n.append(Object.assign(document.createElement('span'), {
        className: 'wb-pinlabel', textContent: m.author === 'claude' ? 'C' : '💬' }));
      const x = Object.assign(document.createElement('span'), { className: 'wb-x', textContent: '✕' });
      x.onclick = () => api.removeMark(m.id);
      const who = Object.assign(document.createElement('div'), { className: 'wb-who', textContent: m.author });
      n.append(x, who);
      if (m.type === 'highlight') {
        const q = m.quote.length > 40 ? m.quote.slice(0, 40) + '…' : m.quote;
        n.append(Object.assign(document.createElement('div'), { className: 'wb-quote', textContent: '“' + q + '”' }));
      }
      n.append(Object.assign(document.createElement('div'), { textContent: m.text }));
      notes.appendChild(n);
    }
  }

  let lastStroke = null;
  function commit(m) {
    snapshot();
    if (m.target) {
      const el = [...document.querySelectorAll('[data-wb]')].find(e => e.getAttribute('data-wb') === m.target);
      if (!el) throw new Error('No element with data-wb="' + m.target + '"');
      const r = labelRect(el), pad = 6;
      if (m.type === 'box') Object.assign(m, { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad });
      else if (m.type === 'arrow') {
        m.to = { x: r.x + r.w, y: r.y + r.h / 2 };
        m.from = { x: m.to.x + 80, y: m.to.y + 50 };
      } else if (m.type === 'comment') Object.assign(m, { x: r.x + r.w + 12, y: r.y });
      m.anchor = { label: m.target, element: null, text: null };
      delete m.target;
    }
    if (typeof api.pageState === 'function') {
      try { m.state = api.pageState(); } catch (e) {}
    }
    m.id = nextId++;
    m.author = m.author || 'human';
    m.color = m.color || color;
    m.at = new Date().toISOString();
    if (!m.anchor) {
      const p = m.type === 'stroke' ? (b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }))(bbox(m.points))
        : m.type === 'arrow' ? m.to
        : m.type === 'box' ? { x: m.x + m.w / 2, y: m.y + m.h / 2 }
        : { x: m.x, y: m.y };
      m.anchor = anchorAt(p.x, p.y);
    }
    if (m.type === 'stroke' && !m.shape) m.shape = strokeShape(m.points);
    // Strokes drawn in quick succession close together form one drawing (e.g. a word).
    if (m.type === 'stroke') {
      const b = bbox(m.points), now = Date.now();
      const prev = lastStroke && marks.find(k => k.id === lastStroke.id);
      if (prev && now - lastStroke.t < 1500 && prev.color === m.color) {
        const pb = bbox(prev.points);
        const gap = Math.max(b.x - (pb.x + pb.w), pb.x - (b.x + b.w), b.y - (pb.y + pb.h), pb.y - (b.y + b.h));
        if (gap < 60) m.group = prev.group || prev.id;
      }
      lastStroke = { id: m.id, t: now };
    }
    marks.push(m);
    save();
    redraw();
    return m.id;
  }

  function editComment(p, onSave) {
    const n = document.createElement('div');
    n.className = 'wb-note';
    n.setAttribute('data-wb-ui', '');
    n.style.left = p.x + 'px';
    n.style.top = p.y + 'px';
    n.style.borderColor = COLORS[color];
    const ta = document.createElement('textarea');
    ta.placeholder = 'Note… (Enter to save, Esc to cancel)';
    n.appendChild(ta);
    document.body.appendChild(n);
    setTimeout(() => ta.focus());
    let done = ok => {
      const text = ta.value.trim();
      n.remove();
      if (onSave) { if (ok) onSave(text); }
      else if (ok && text) commit({ type: 'comment', x: p.x, y: p.y, text });
    };
    ta.onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(true); }
      if (e.key === 'Escape') done(false);
      e.stopPropagation();
    };
    let closed = false;
    const once = done;
    done = ok => { if (!closed) { closed = true; once(ok); } };
    ta.onblur = () => done(true);
  }

  // Select text while using the page, then click "Comment" to highlight it and
  // optionally leave a note on it.
  const selBtn = document.createElement('button');
  selBtn.className = 'wb-selbtn';
  selBtn.setAttribute('data-wb-ui', '');
  selBtn.textContent = '💬 Comment';
  function selectionRange() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const host = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!host || host.closest('[data-wb-ui]') || !sel.toString().trim()) return null;
    return range;
  }
  document.addEventListener('mouseup', () => setTimeout(() => {
    const range = mode === 'off' && selectionRange();
    if (!range) { selBtn.remove(); return; }
    const rects = range.getClientRects(), last = rects[rects.length - 1];
    selBtn.style.left = (last.right + scrollX + 4) + 'px';
    selBtn.style.top = (last.bottom + scrollY + 4) + 'px';
    document.body.appendChild(selBtn);
  }));
  selBtn.addEventListener('mousedown', e => e.preventDefault()); // keep the selection
  selBtn.addEventListener('click', () => {
    const range = selectionRange();
    selBtn.remove();
    if (!range) return;
    const rects = [...range.getClientRects()].filter(r => r.width > 1)
      .map(r => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }));
    const quote = getSelection().toString().trim().replace(/\s+/g, ' ');
    const host = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const labeled = host.closest('[data-wb]');
    const anchor = { label: labeled ? labeled.getAttribute('data-wb') : null,
      element: labeled ? null : host.tagName.toLowerCase(), text: null };
    const last = rects[rects.length - 1];
    const at = { x: Math.round(last.x), y: Math.round(last.y + last.h + 6) }; // below, not over the text
    getSelection().removeAllRanges();
    editComment(at, text => commit({ type: 'highlight', rects, quote, text, x: at.x, y: at.y, anchor }));
  });

  canvas.addEventListener('pointerdown', e => {
    const p = pagePoint(e);
    if (mode === 'pen') current = { type: 'stroke', points: [p], color };
    else if (mode === 'arrow') current = { type: 'arrow', from: p, to: p, color };
    else if (mode === 'comment') { e.preventDefault(); editComment(p); return; }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!current) return;
    const p = pagePoint(e);
    if (current.type === 'stroke') current.points.push(p);
    else current.to = p;
    redraw();
  });
  canvas.addEventListener('pointerup', () => {
    if (!current) return;
    const m = current;
    current = null;
    const tiny = m.type === 'arrow' && Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y) < 5;
    if (!tiny && !(m.type === 'stroke' && m.points.length < 2)) commit(m);
    else redraw();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setMode('off');
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !typing) { e.preventDefault(); api.undo(); }
  });

  // --- agent API ---
  const api = {
    connect() { markConnected(); return 'connected'; },
    getMarks() {
      markConnected();
      // Strokes are summarized (bbox + shape) rather than dumping every point;
      // grouped strokes come back as one "drawing".
      const out = [], groups = {};
      for (const m of marks) {
        if (m.type !== 'stroke') { out.push({ ...m }); continue; }
        const g = m.group || m.id;
        if (groups[g]) {
          const d = groups[g];
          d.strokes++;
          d.shape = 'drawing';
          d.bbox = bbox([{ x: d.bbox.x, y: d.bbox.y }, { x: d.bbox.x + d.bbox.w, y: d.bbox.y + d.bbox.h },
            ...m.points]);
          continue;
        }
        groups[g] = { id: m.id, type: 'stroke', shape: m.shape, strokes: 1, color: m.color,
          author: m.author, bbox: bbox(m.points), anchor: m.anchor, state: m.state, at: m.at };
        out.push(groups[g]);
      }
      for (const d of Object.values(groups)) {
        if (d.strokes > 1) d.anchor = anchorAt(d.bbox.x + d.bbox.w / 2, d.bbox.y + d.bbox.h / 2);
      }
      return out;
    },
    describe() {
      markConnected();
      if (!marks.length) return 'No marks.';
      return api.getMarks().map(m => {
        const a = m.anchor;
        const where = !a ? 'empty area'
          : a.note ? `note #${a.note}`
          : a.near ? `empty area near "${a.near}"`
          : (a.label ? `"${a.label}"` : a.element) + (a.text ? ` (text: "${a.text}")` : '');
        const what = m.type === 'stroke' ? (m.strokes > 1 ? `drawing (${m.strokes} strokes)` : m.shape)
          : m.type === 'comment' ? `note "${m.text}"`
          : m.type === 'highlight' ? `highlight "${m.quote}"` + (m.text ? ` with note "${m.text}"` : '')
          : m.type;
        const st = m.state ? ' [state ' + JSON.stringify(m.state) + ']' : '';
        return `#${m.id} ${m.author} ${m.color} ${what} on ${where}${st}`;
      }).join('\n');
    },
    addMark(m) { markConnected(); return commit({ author: 'claude', ...m }); },
    removeMark(id) { snapshot(); marks = marks.filter(m => m.id !== id && m.group !== id); save(); redraw(); },
    clear(author) { snapshot(); marks = author ? marks.filter(m => m.author !== author) : []; save(); redraw(); },
    undo() {
      if (!history.length) return false;
      marks = JSON.parse(history.pop());
      save(); redraw();
      return true;
    },
  };
  window.whiteboard = api;

  function mount() {
    document.body.append(canvas, notes, bar);
    showBanner(isConnected());
    // Keep the serving whiteboard server alive while this page is open.
    if (SCRIPT && SCRIPT.src && new URL(SCRIPT.src).origin === location.origin) {
      const ping = () => fetch('/__ping', { cache: 'no-store' }).catch(() => {});
      ping();
      setInterval(ping, 30000);
    }
    load();
    refreshBar();
    resize();
    new ResizeObserver(resize).observe(document.body);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
