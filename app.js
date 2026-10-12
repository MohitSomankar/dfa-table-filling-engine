(function () {
  'use strict';
  const E = window.Engine;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eps = (w) => (w === '' ? '\u03b5' : w);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const TABS = [['fill', 'Table filling'], ['classes', 'Classes'], ['min', 'Minimal DFA'], ['test', 'Test a string'], ['suite', 'Test suite'], ['theory', 'Theory']];

  let presetIdx = 0, model = clone(E.PRESETS[0].model), R = null, errors = [];
  let tab = 'fill', frame = 0, sel = null, diag = 'min', testStr = '', playTimer = null, typeTimer = null, suiteRows = null;

  /* ---------- editor ---------- */
  function renderEditor() {
    const opts = (kind) => E.PRESETS.map((p, i) => [p, i]).filter(([p]) => p.kind === kind)
      .map(([p, i]) => '<option value="' + i + '">' + esc(p.name) + '</option>').join('');
    $('#editor').innerHTML =
      '<h2>DFA input</h2>' +
      '<label for="preset">Load an example</label>' +
      '<select id="preset"><optgroup label="Valid DFAs">' + opts('valid') + '</optgroup><optgroup label="Invalid inputs">' + opts('invalid') + '</optgroup></select>' +
      '<div class="field"><label for="alpha">Alphabet</label><input id="alpha" data-f="alpha" value="' + esc(model.alphabet.join(', ')) + '" autocomplete="off" spellcheck="false"><div class="hint">Single characters, comma separated</div></div>' +
      '<div class="two"><div class="field"><label for="start">Start state</label><input id="start" data-f="start" value="' + esc(model.start) + '" autocomplete="off" spellcheck="false"></div>' +
      '<div class="field"><label for="acc">Accepting states</label><input id="acc" data-f="acc" value="' + esc(model.accepting) + '" autocomplete="off" spellcheck="false"></div></div>' +
      '<h3>Transition table</h3><div class="scroll" id="tbl"></div><datalist id="sl"></datalist>' +
      '<p class="hint">Row label: \u2192 start state, * accepting state. Type the target state in each cell.</p>' +
      '<div class="row"><button id="addState" class="sec" type="button">Add state</button><button id="clearAll" class="sec" type="button">Clear</button></div>';
    $('#preset').value = String(presetIdx);
    renderTable();
  }
  function renderTable() {
    const start = model.start.trim(), acc = E.tokens(model.accepting);
    const head = '<tr><th>State</th>' + model.alphabet.map((a) => '<th>' + esc(a) + '</th>').join('') + '<th></th></tr>';
    const body = model.rows.map((r, i) => {
      const n = r.name.trim();
      return '<tr><td><div class="lab"><span class="mk" aria-hidden="true">' + (n === start ? '\u2192' : '') + (acc.includes(n) ? '*' : '') + '</span>' +
        '<input class="nm" data-f="name" data-i="' + i + '" value="' + esc(r.name) + '" aria-label="State name" autocomplete="off" spellcheck="false"></div></td>' +
        model.alphabet.map((a, k) => '<td><input data-f="t" data-i="' + i + '" data-k="' + k + '" list="sl" value="' + esc(r.t[k] || '') + '" aria-label="Transition of ' + esc(r.name) + ' on ' + esc(a) + '" autocomplete="off" spellcheck="false"></td>').join('') +
        '<td><button class="x" type="button" data-rm="' + i + '" aria-label="Remove state ' + esc(r.name) + '">Remove</button></td></tr>';
    }).join('');
    $('#tbl').innerHTML = '<table class="tt"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    updateList();
  }
  function updateList() {
    $('#sl').innerHTML = model.rows.map((r) => r.name.trim()).filter(Boolean).map((n) => '<option value="' + esc(n) + '">').join('');
  }
  function nextName() {
    const used = new Set(model.rows.map((r) => r.name.trim()));
    for (let c = 65; c <= 90; c++) if (!used.has(String.fromCharCode(c))) return String.fromCharCode(c);
    let n = 1; while (used.has('S' + n)) n++; return 'S' + n;
  }
  function schedule() { clearTimeout(typeTimer); typeTimer = setTimeout(compute, 250); }

  $('#editor').addEventListener('input', (e) => {
    const el = e.target, f = el.dataset.f;
    if (!f) return;
    if (f === 'alpha') {
      model.alphabet = E.tokens(el.value);
      model.rows.forEach((r) => { r.t = model.alphabet.map((_, k) => r.t[k] || ''); });
      renderTable();
    } else if (f === 'start') { model.start = el.value; renderTable(); }
    else if (f === 'acc') { model.accepting = el.value; renderTable(); }
    else if (f === 'name') { model.rows[+el.dataset.i].name = el.value; updateList(); }
    else if (f === 't') { model.rows[+el.dataset.i].t[+el.dataset.k] = el.value; }
    schedule();
  });
  $('#editor').addEventListener('focusin', (e) => { if (e.target.dataset.f === 'name') e.target.dataset.old = e.target.value; });
  $('#editor').addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'preset') { loadPreset(+el.value, false); return; }
    if (el.dataset.f !== 'name') return;
    const o = (el.dataset.old || '').trim(), n = el.value.trim();
    if (o && n && o !== n) {   // keep every reference consistent when a state is renamed
      model.rows.forEach((r) => { r.t = r.t.map((x) => (x.trim() === o ? n : x)); });
      if (model.start.trim() === o) model.start = n;
      model.accepting = E.tokens(model.accepting).map((x) => (x === o ? n : x)).join(', ');
      $('#start').value = model.start; $('#acc').value = model.accepting;
    }
    renderTable(); compute();
  });
  $('#editor').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rm !== undefined) { model.rows.splice(+b.dataset.rm, 1); renderTable(); compute(); }
    else if (b.id === 'addState') { model.rows.push({ name: nextName(), t: model.alphabet.map(() => '') }); renderTable(); compute(); }
    else if (b.id === 'clearAll') { model = { alphabet: ['0', '1'], rows: [], start: '', accepting: '' }; presetIdx = 0; renderEditor(); compute(); }
  });

  function loadPreset(i, jump) {
    presetIdx = i; model = clone(E.PRESETS[i].model);
    renderEditor();
    if (jump) tab = 'fill';
    compute();
  }

  /* ---------- compute and frames ---------- */
  function frames() {
    const f = [{ upto: -1, kind: 'start' }];
    R.rounds.forEach((pairs, r) => f.push({ upto: r, kind: 'round', pairs }));
    f.push({ upto: R.maxRound, kind: 'final' });
    return f;
  }
  function stopPlay() { clearInterval(playTimer); playTimer = null; }
  function compute() {
    stopPlay();
    const v = E.validate(model);
    errors = v.errors;
    R = v.dfa ? E.minimize(v.dfa) : null;
    frame = R ? frames().length - 1 : 0;
    sel = null;
    renderResults();
  }

  /* ---------- results shell ---------- */
  function renderResults() {
    $('#summary').innerHTML = R
      ? [[R.dfa.states.length, 'States entered'], [R.st.length, 'Reachable states'], [R.classes.length, 'Equivalence classes'], [R.minimal.states.length, 'States in minimal DFA']]
        .map(([n, l]) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>').join('')
      : '';
    $('#tabs').innerHTML = TABS.map(([id, l]) => '<button class="tab" role="tab" type="button" data-tab="' + id + '" aria-selected="' + (tab === id) + '">' + l + '</button>').join('');
    renderPanel();
  }
  function renderPanel() {
    const needs = ['fill', 'classes', 'min', 'test'].includes(tab);
    let html;
    if (needs && !R) html = errorBox();
    else html = { fill: viewFill, classes: viewClasses, min: viewMin, test: viewTest, suite: viewSuite, theory: viewTheory }[tab]();
    $('#panel').innerHTML = html;
  }
  function errorBox() {
    return '<div class="err"><strong>This is not a valid DFA.</strong> Fix the following and the result updates automatically.<ul>' +
      errors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
  }

  /* ---------- tab 1: table filling ---------- */
  function trace(startState, r) {
    if (r.error) return '<div class="trace no">' + esc(r.error) + '</div>';
    let s = '<code>' + esc(startState) + '</code>';
    r.path.forEach((p) => { s += ' -' + esc(p.sym) + '-&gt; <code>' + esc(p.to) + '</code>'; });
    return '<div class="trace">' + s + ' &nbsp;<span class="' + (r.accepted ? 'ok' : 'no') + '">' + (r.accepted ? 'ends in an accepting state' : 'ends in a rejecting state') + '</span></div>';
  }
  function detail() {
    if (!sel) return '<p class="note">Select a cell of the table to see why that pair was marked, or why it never is.</p>';
    const [i, j] = sel, p = R.st[j], q = R.st[i], m = R.marks[i][j];
    const pair = '(' + esc(p) + ', ' + esc(q) + ')';
    if (!m) {
      return '<h3>' + pair + ' are equivalent</h3><p>The pair is never marked. For every string w, \u03b4*(' + esc(p) + ', w) and \u03b4*(' + esc(q) +
        ', w) are both accepting or both rejecting, so the two states have the same future and belong to one Myhill-Nerode class.</p>';
    }
    const rp = E.run({ ...R.dfa, start: p }, m.w), rq = E.run({ ...R.dfa, start: q }, m.w);
    let why;
    if (m.round === 0) {
      const ap = R.dfa.accepting.includes(p);
      why = '<p>Round 0: ' + esc(ap ? p : q) + ' is accepting and ' + esc(ap ? q : p) + ' is not, so the empty string \u03b5 separates them.</p>';
    } else {
      const sp = R.st[m.succ[0]], sq = R.st[m.succ[1]];
      const hi = Math.max(...m.succ), lo = Math.min(...m.succ);
      why = '<p>Round ' + m.round + ': on <code>' + esc(m.a) + '</code> the pair moves to (' + esc(sp) + ', ' + esc(sq) + '), which was marked in round ' + R.marks[hi][lo].round + '.</p>';
    }
    return '<h3>' + pair + ' marked in round ' + m.round + '</h3>' + why +
      '<p>Shortest distinguishing string: <code>' + esc(eps(m.w)) + '</code></p>' + trace(p, rp) + trace(q, rq);
  }
  function triangle(f, final) {
    const st = R.st, n = st.length;
    if (n < 2) return '<p class="note">Only one reachable state, so there are no pairs to compare.</p>';
    let h = '<div class="scroll"><table class="tri"><thead><tr><th></th>' + st.slice(0, n - 1).map((s) => '<th>' + esc(s) + '</th>').join('') + '</tr></thead><tbody>';
    for (let i = 1; i < n; i++) {
      h += '<tr><th>' + esc(st[i]) + '</th>';
      for (let j = 0; j < n - 1; j++) {
        if (j >= i) { h += '<td class="x"></td>'; continue; }
        const m = R.marks[i][j];
        const isSel = sel && sel[0] === i && sel[1] === j ? ' sel' : '';
        const attrs = ' data-act="cell" data-i="' + i + '" data-j="' + j + '" aria-label="Pair ' + esc(st[j]) + ' and ' + esc(st[i]) + '"';
        if (m && m.round <= f.upto) h += '<td><button class="c d' + (m.round === f.upto && !final ? ' new' : '') + isSel + '" type="button"' + attrs + '>' + m.round + '</button></td>';
        else if (final) h += '<td><button class="c e' + isSel + '" type="button"' + attrs + '>\u2261</button></td>';
        else h += '<td><button class="c' + isSel + '" type="button"' + attrs + '>&nbsp;</button></td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  }
  function viewFill() {
    const fr = frames(), f = fr[frame], final = f.kind === 'final';
    const desc = f.kind === 'start'
      ? 'All pairs start unmarked. Every pair of reachable states asks one question: does some string tell these two states apart?'
      : final ? 'No new pair can be marked. Every unmarked pair is equivalent (\u2261), so the states split into ' + R.classes.length + ' classes.'
        : f.upto === 0 ? 'Round 0: mark every pair in which exactly one state is accepting. The empty string \u03b5 tells these apart.'
          : 'Round ' + f.upto + ': mark an unmarked pair (p, q) if for some symbol a the pair (\u03b4(p, a), \u03b4(q, a)) was marked in an earlier round.';
    let list = '';
    if (f.kind === 'round') {
      list = '<ul class="plain">' + f.pairs.map(([i, j]) => {
        const m = R.marks[i][j], p = esc(R.st[j]), q = esc(R.st[i]);
        return m.round === 0
          ? '<li>(' + p + ', ' + q + '): exactly one is accepting</li>'
          : '<li>(' + p + ', ' + q + '): on <code>' + esc(m.a) + '</code> they reach (' + esc(R.st[m.succ[0]]) + ', ' + esc(R.st[m.succ[1]]) + '), already marked. String: <code>' + esc(m.w) + '</code></li>';
      }).join('') + '</ul>';
    } else if (final && R.unreachable.length) {
      list = '<p class="note">Unreachable from the start state and removed before filling the table: ' + R.unreachable.map(esc).join(', ') + '.</p>';
    }
    return '<div class="ctrl"><button class="sec" type="button" data-act="prev"' + (frame === 0 ? ' disabled' : '') + '>Previous</button>' +
      '<button class="pri" type="button" data-act="next"' + (frame === fr.length - 1 ? ' disabled' : '') + '>Next step</button>' +
      '<button class="sec" type="button" data-act="play">' + (playTimer ? 'Pause' : 'Play') + '</button>' +
      '<button class="sec" type="button" data-act="all">Show final</button>' +
      '<span class="idx">Step ' + (frame + 1) + ' of ' + fr.length + '</span></div>' +
      '<p class="frame">' + esc(f.kind === 'start' ? 'Start' : final ? 'Result' : 'Round ' + f.upto) + '</p><p>' + desc + '</p>' +
      '<div class="cols"><div>' + triangle(f, final) + '<p class="note" style="margin-top:8px">A number is the round in which the pair was marked, which is also the length of its shortest distinguishing string. \u2261 means never marked.</p></div>' +
      '<div><div class="box">' + detail() + '</div>' + list + '</div></div>';
  }

  /* ---------- tab 2: classes and Myhill-Nerode ---------- */
  function viewClasses() {
    const k = R.classes.length;
    const rows = R.info.map((c, x) => '<tr><td><code>' + esc('[' + x + ']') + '</code></td><td><code>' + esc('{' + c.members.join(', ') + '}') + '</code></td>' +
      '<td><code>' + esc(eps(c.access)) + '</code></td><td>' + c.samples.map((w) => '<code>' + esc(eps(w)) + '</code>').join(' ') + '</td><td>' + (c.accepting ? 'accepting' : 'rejecting') + '</td></tr>').join('');
    let sep = '';
    if (k > 1) {
      sep = '<h3>Why the classes are different</h3><p class="note">Each cell is a shortest string z that one class accepts and the other rejects. This is the witness required by the Myhill-Nerode theorem: for strings x and y from different classes, xz and yz are not both in the language.</p>' +
        '<div class="scroll"><table class="dt"><thead><tr><th></th>' + R.info.map((_, x) => '<th>[' + x + ']</th>').join('') + '</tr></thead><tbody>' +
        R.sep.map((row, x) => '<tr><th>[' + x + ']</th>' + row.map((z) => '<td>' + (z === null ? '' : '<code>' + esc(eps(z)) + '</code>') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    }
    return '<h2>' + k + (k === 1 ? ' equivalence class' : ' equivalence classes') + '</h2>' +
      '<div class="chips">' + R.classes.map((c) => '<span class="chip">{' + c.map(esc).join(', ') + '}</span>').join('') + '</div>' +
      '<h3>Myhill-Nerode classes of the language</h3>' +
      '<p>Each class of equivalent states stands for one Myhill-Nerode class of strings: all strings that lead the DFA into that class. The table shows the shortest such string and the first few others (up to length 5).</p>' +
      '<div class="scroll"><table class="dt"><thead><tr><th>Class</th><th>States</th><th>Shortest string</th><th>Strings reaching it</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="box" style="margin-top:12px"><strong>' + k + ' classes.</strong> By the Myhill-Nerode theorem the language has exactly ' + k + ' classes of indistinguishable strings, so no DFA for it can have fewer than ' + k + ' states, and the minimal DFA has exactly ' + k + '.</div>' + sep;
  }

  /* ---------- tab 3: minimal DFA ---------- */
  function diagram(d) {
    const n = d.states.length, idx = new Map(d.states.map((s, i) => [s, i]));
    const maxLen = Math.max(...d.states.map((s) => s.length));
    const r = Math.min(34, Math.max(21, 9 + 4.2 * maxLen));
    const W = 640, H = n <= 2 ? 260 : 460, cx = W / 2, cy = H / 2;
    const rx = Math.min(250, 80 + n * 22), ry = Math.min(H / 2 - 60, rx * 0.85);
    const P = d.states.map((_, i) => {
      if (n === 1) return { x: cx, y: cy, ux: 0, uy: -1 };
      if (n === 2) { const ang = i === 0 ? Math.PI : 0; return { x: cx + 130 * Math.cos(ang), y: cy, ux: Math.cos(ang), uy: -0.0001 }; }
      const ang = -Math.PI / 2 + 2 * Math.PI * i / n;
      const ux = Math.cos(ang), uy = Math.sin(ang), l = Math.hypot(ux * ry, uy * rx) || 1;
      return { x: cx + rx * ux, y: cy + ry * uy, ux, uy };
    });
    const edges = new Map();
    d.states.forEach((s, i) => d.alphabet.forEach((a) => {
      const j = idx.get(d.delta[s][a]), key = i + '>' + j;
      if (!edges.has(key)) edges.set(key, { i, j, l: [] });
      edges.get(key).l.push(a);
    }));
    let out = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ah"/></marker></defs>';
    const selfLoops = new Set();
    edges.forEach((e) => {
      const a = P[e.i], b = P[e.j], label = esc(e.l.join(','));
      if (e.i === e.j) {
        selfLoops.add(e.i);
        const th = Math.atan2(a.uy, a.ux);
        const pt = (ang, rad) => (a.x + rad * Math.cos(ang)).toFixed(1) + ' ' + (a.y + rad * Math.sin(ang)).toFixed(1);
        out += '<path class="ed" marker-end="url(#ah)" d="M' + pt(th - 0.5, r) + ' C' + pt(th - 0.45, r + 46) + ' ' + pt(th + 0.45, r + 46) + ' ' + pt(th + 0.5, r) + '"/>';
        out += '<text class="lb" x="' + (a.x + (r + 40) * Math.cos(th)).toFixed(1) + '" y="' + (a.y + (r + 40) * Math.sin(th)).toFixed(1) + '">' + label + '</text>';
        return;
      }
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len, rev = edges.has(e.j + '>' + e.i), bow = rev ? 34 : 0;
      const qx = (a.x + b.x) / 2 + px * bow, qy = (a.y + b.y) / 2 + py * bow;
      const un = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
      const [ax, ay] = un(qx - a.x, qy - a.y), [bx, by] = un(qx - b.x, qy - b.y);
      const x0 = a.x + r * ax, y0 = a.y + r * ay, x1 = b.x + r * bx, y1 = b.y + r * by;
      out += '<path class="ed" marker-end="url(#ah)" d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' Q' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + '"/>';
      const mx = 0.25 * x0 + 0.5 * qx + 0.25 * x1 + px * 11, my = 0.25 * y0 + 0.5 * qy + 0.25 * y1 + py * 11;
      out += '<text class="lb" x="' + mx.toFixed(1) + '" y="' + my.toFixed(1) + '">' + label + '</text>';
    });
    const si = idx.get(d.start), sp = P[si];
    const sa = Math.atan2(sp.uy, sp.ux) + (selfLoops.has(si) ? 1.3 : 0) + (n === 1 ? Math.PI / 2 : 0);
    out += '<path class="ed" marker-end="url(#ah)" d="M' + (sp.x + (r + 38) * Math.cos(sa)).toFixed(1) + ' ' + (sp.y + (r + 38) * Math.sin(sa)).toFixed(1) +
      ' L' + (sp.x + (r + 1) * Math.cos(sa)).toFixed(1) + ' ' + (sp.y + (r + 1) * Math.sin(sa)).toFixed(1) + '"/>';
    d.states.forEach((s, i) => {
      const p = P[i], acc = d.accepting.includes(s);
      out += '<circle class="nd' + (i === si ? ' st' : '') + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '"/>';
      if (acc) out += '<circle class="in" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (r - 5) + '"/>';
      out += '<text x="' + p.x.toFixed(1) + '" y="' + p.y.toFixed(1) + '"' + (maxLen > 6 ? ' style="font-size:11px"' : '') + '>' + esc(s) + '</text>';
    });
    return '<svg class="dia" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="State diagram with ' + n + ' states">' + out + '</svg>';
  }
  function dfaTable(d) {
    return '<div class="scroll"><table class="dt"><thead><tr><th>State</th>' + d.alphabet.map((a) => '<th>' + esc(a) + '</th>').join('') + '</tr></thead><tbody>' +
      d.states.map((s) => '<tr><th>' + (s === d.start ? '\u2192 ' : '') + (d.accepting.includes(s) ? '* ' : '') + esc(s) + '</th>' + d.alphabet.map((a) => '<td>' + esc(d.delta[s][a]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  function viewMin() {
    const d = diag === 'min' ? R.minimal : R.dfa;
    const moore = E.canon(E.moore(R.dfa)) === E.canon(R.classes), again = E.minimize(R.minimal).classes.length === R.minimal.states.length;
    const v = R.verify;
    const checks = [
      v.equal ? '<li class="ok">Same language: a search over the product of both DFAs explored ' + v.explored + ' state pairs and found no string that one accepts and the other rejects.</li>'
        : '<li class="no">The DFAs differ on the string <code>' + esc(eps(v.counter)) + '</code>.</li>',
      moore ? '<li class="ok">Independent check: Moore partition refinement gives the same ' + R.classes.length + ' classes.</li>' : '<li class="no">Moore partition refinement disagrees with the table.</li>',
      again ? '<li class="ok">Already minimal: running the table-filling algorithm on the minimal DFA marks every pair.</li>' : '<li class="no">The minimal DFA still has equivalent states.</li>',
    ].join('');
    return '<div class="ctrl"><div class="seg" role="group" aria-label="Which DFA to draw"><button type="button" data-act="diag" data-v="min" aria-pressed="' + (diag === 'min') + '">Minimal DFA</button>' +
      '<button type="button" data-act="diag" data-v="orig" aria-pressed="' + (diag === 'orig') + '">Original DFA</button></div></div>' +
      diagram(d) + '<p class="note" style="margin-top:6px">Double circle: accepting state. Arrow from nowhere: start state. Original DFA shown with all ' + R.dfa.states.length + ' states' + (R.unreachable.length ? ', including the unreachable ' + R.unreachable.map(esc).join(', ') : '') + '.</p>' +
      '<div class="cols"><div><h3>Minimal DFA transition table</h3>' + dfaTable(R.minimal) + '</div><div><h3>Correctness checks</h3><ul class="plain">' + checks + '</ul></div></div>';
  }

  /* ---------- tab 4: test a string ---------- */
  function testOut() {
    const a = E.run(R.dfa, testStr), b = E.run(R.minimal, testStr);
    if (a.error) return '<p class="no">' + esc(a.error) + '</p>';
    const side = (t, d, r) => '<div class="box"><h3 style="margin-top:0">' + t + '</h3>' + trace(d.start, r) + '<p class="' + (r.accepted ? 'ok' : 'no') + '">' + (r.accepted ? 'Accepted' : 'Rejected') + '</p></div>';
    return '<div class="cmp">' + side('Original DFA', R.dfa, a) + side('Minimal DFA', R.minimal, b) + '</div>' +
      '<p style="margin-top:8px">' + (a.accepted === b.accepted ? 'Both DFAs give the same answer, as equivalence guarantees.' : '<span class="no">The two DFAs disagree.</span>') + '</p>';
  }
  function viewTest() {
    return '<div class="field"><label for="tstr">Input string</label><input id="tstr" value="' + esc(testStr) + '" autocomplete="off" spellcheck="false">' +
      '<div class="hint">Leave empty to test the empty string \u03b5. Symbols must come from the alphabet.</div></div>' +
      '<p class="note">Try the shortest string of each class:</p><div class="chips">' +
      R.info.map((c) => '<button class="chip" type="button" data-act="try" data-w="' + esc(c.access) + '">' + esc(eps(c.access)) + '</button>').join('') + '</div>' +
      '<div id="testOut">' + testOut() + '</div>';
  }

  /* ---------- tab 5: test suite ---------- */
  function buildSuite() {
    return E.PRESETS.map((p, i) => {
      const v = E.validate(p.model);
      if (!v.dfa) return { i, p, outcome: v.errors[0] + (v.errors.length > 1 ? ' (+' + (v.errors.length - 1) + ' more)' : ''), checks: [['Rejected as invalid input', p.kind === 'invalid']] };
      const m = E.minimize(v.dfa);
      return {
        i, p, outcome: v.dfa.states.length + ' states to ' + m.classes.length + ' classes: ' + m.classes.map((c) => '{' + c.join(',') + '}').join(' '),
        checks: [
          ['Expected ' + p.expect + ' classes', p.kind === 'valid' && m.classes.length === p.expect],
          ['Same language as the minimal DFA', m.verify.equal],
          ['Moore refinement agrees', E.canon(E.moore(v.dfa)) === E.canon(m.classes)],
          ['Minimal DFA is already minimal', E.minimize(m.minimal).classes.length === m.minimal.states.length],
        ],
      };
    });
  }
  function viewSuite() {
    suiteRows = suiteRows || buildSuite();
    const total = suiteRows.reduce((n, r) => n + r.checks.length, 0), ok = suiteRows.reduce((n, r) => n + r.checks.filter((c) => c[1]).length, 0);
    return '<h2>Valid and invalid inputs</h2><p>Each built-in example is run through the validator and the algorithm. Valid DFAs are checked four ways; invalid ones must be rejected with a clear message.</p>' +
      '<p class="' + (ok === total ? 'ok' : 'no') + '">' + ok + ' of ' + total + ' checks pass.</p>' +
      '<div class="scroll"><table class="dt"><thead><tr><th>Example</th><th>Type</th><th>Result</th><th>Checks</th><th></th></tr></thead><tbody>' +
      suiteRows.map((r) => '<tr><td>' + esc(r.p.name) + '</td><td>' + (r.p.kind === 'valid' ? 'Valid' : 'Invalid') + '</td><td>' + esc(r.outcome) + '</td><td>' +
        r.checks.map((c) => '<div class="' + (c[1] ? 'ok' : 'no') + '">' + (c[1] ? 'pass' : 'fail') + ': ' + esc(c[0]) + '</div>').join('') +
        '</td><td><button class="sec" type="button" data-act="load" data-p="' + r.i + '">Load</button></td></tr>').join('') + '</tbody></table></div>';
  }

  /* ---------- tab 6: theory ---------- */
  function viewTheory() {
    return '<div class="theory"><h2>Theory behind the engine</h2>' +
      '<h3>Myhill-Nerode theorem</h3><p>For a language L over an alphabet \u03a3, two strings x and y are equivalent, written x ~ y, if for every string z, xz is in L exactly when yz is in L. The theorem says L is regular if and only if ~ has finitely many equivalence classes, and that number is the number of states of the smallest complete DFA for L.</p>' +
      '<h3>From strings to states</h3><p>Two states p and q of a DFA are equivalent if for every string w, \u03b4*(p, w) and \u03b4*(q, w) are both accepting or both rejecting. When every state is reachable, state p stands for the strings that lead to it, and p and q are equivalent exactly when those strings are ~ equivalent. So the classes of equivalent states are the Myhill-Nerode classes, and each class becomes one state of the minimal DFA.</p>' +
      '<h3>Table-filling algorithm</h3><ul><li>Remove states unreachable from the start state.</li><li>Round 0: mark every pair (p, q) where exactly one of p, q is accepting.</li><li>Round r: mark an unmarked pair (p, q) if for some symbol a, the pair (\u03b4(p, a), \u03b4(q, a)) is already marked.</li><li>Stop when a round marks nothing. Unmarked pairs are equivalent.</li><li>Merge equivalent states, then redirect every transition to the merged states.</li></ul>' +
      '<h3>Why it is correct</h3><p>Sound: a pair marked in round r has a distinguishing string of length r (by induction, prepend the symbol a to the string of the successor pair). Complete: if some string separates p and q, take the shortest one, w = aw\u2032. Then \u03b4(p, a) and \u03b4(q, a) are separated by w\u2032, which is shorter, so that pair is marked earlier and (p, q) gets marked in round |w|. Equivalence is transitive, so the unmarked pairs form disjoint classes.</p>' +
      '<h3>Cost</h3><p>With n reachable states the table has n(n-1)/2 pairs. A shortest distinguishing string is never longer than n-2, so there are at most n-1 rounds, giving O(n\u00b3 |\u03a3|) time for this round-based version. Hopcroft\u2019s partition refinement is faster, O(n |\u03a3| log n), but the table makes the reason for every merge visible.</p>' +
      '<h3>Limits of this app</h3><p>The DFA must be complete: one transition per state and symbol. Up to ' + E.MAX_STATES + ' states and ' + E.MAX_SYMBOLS + ' single-character symbols are accepted. The minimal DFA is checked against the original with a product-automaton search, which is an exact language-equivalence test.</p></div>';
  }

  /* ---------- events ---------- */
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    stopPlay(); tab = b.dataset.tab; renderResults();
  });
  $('#panel').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'cell') { sel = [+b.dataset.i, +b.dataset.j]; renderPanel(); }
    else if (act === 'next') { if (frame < frames().length - 1) frame++; renderPanel(); }
    else if (act === 'prev') { stopPlay(); if (frame > 0) frame--; renderPanel(); }
    else if (act === 'all') { stopPlay(); frame = frames().length - 1; renderPanel(); }
    else if (act === 'play') {
      if (playTimer) stopPlay();
      else {
        if (frame >= frames().length - 1) frame = 0;
        playTimer = setInterval(() => { if (frame < frames().length - 1) frame++; else stopPlay(); renderPanel(); }, 1200);
      }
      renderPanel();
    }
    else if (act === 'diag') { diag = b.dataset.v; renderPanel(); }
    else if (act === 'try') { testStr = b.dataset.w; renderPanel(); }
    else if (act === 'load') loadPreset(+b.dataset.p, true);
  });
  $('#panel').addEventListener('input', (e) => {
    if (e.target.id !== 'tstr') return;
    testStr = e.target.value;
    $('#testOut').innerHTML = testOut();
  });

  /* ---------- install, theme, offline ---------- */
  const installBtn = $('#installBtn');
  let deferred = null;
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (standalone()) installBtn.hidden = true;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; installBtn.hidden = false; });
  window.addEventListener('appinstalled', () => { deferred = null; installBtn.hidden = true; });
  installBtn.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (err) { /* ignored */ } deferred = null; }
    else $('#installHelp').showModal();
  });

  const root = document.documentElement, themeBtn = $('#themeBtn');
  try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch (err) { /* storage unavailable */ }
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const syncTheme = () => { themeBtn.textContent = isDark() ? 'Light theme' : 'Dark theme'; };
  themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (err) { /* storage unavailable */ }
    syncTheme();
  });
  syncTheme();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  renderEditor();
  compute();
})();
