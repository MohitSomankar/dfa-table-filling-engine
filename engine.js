/* Table-filling (Myhill-Nerode) engine for DFA minimization. No DOM access, runs in browser and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_STATES = 15, MAX_SYMBOLS = 5;
  const tokens = (s) => String(s || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  const dups = (arr) => [...new Set(arr.filter((x, i) => arr.indexOf(x) !== i))];

  /* model = { alphabet: [..], rows: [{name, t: [target per symbol]}], start: 'A', accepting: 'C,D' } */
  function validate(m) {
    const errors = [];
    const rows = m.rows.map((r) => ({ name: String(r.name).trim(), t: r.t.map((x) => String(x).trim()) }));
    const S = rows.map((r) => r.name);
    const A = m.alphabet.map((a) => String(a).trim());
    const start = String(m.start || '').trim();
    const acc = tokens(m.accepting);

    if (!S.length) errors.push('No states were entered. Add at least one state.');
    if (S.some((s) => !s)) errors.push('State names cannot be blank.');
    const dS = dups(S.filter(Boolean));
    if (dS.length) errors.push('Duplicate state names: ' + dS.join(', ') + '. Each state must appear once.');
    if (S.length > MAX_STATES) errors.push('At most ' + MAX_STATES + ' states are supported.');
    if (!A.length) errors.push('The alphabet is empty. Enter at least one symbol.');
    if (A.some((a) => !a)) errors.push('Alphabet symbols cannot be blank.');
    A.filter((a) => a && [...a].length !== 1).forEach((a) => errors.push('Symbol "' + a + '" must be a single character.'));
    const dA = dups(A.filter(Boolean));
    if (dA.length) errors.push('Duplicate alphabet symbols: ' + dA.join(', ') + '.');
    if (A.length > MAX_SYMBOLS) errors.push('At most ' + MAX_SYMBOLS + ' alphabet symbols are supported.');
    if (S.length) {
      if (!start) errors.push('No start state was given.');
      else if (!S.includes(start)) errors.push('Start state "' + start + '" is not in the state set.');
    }
    acc.filter((x) => !S.includes(x)).forEach((x) => errors.push('Accepting state "' + x + '" is not in the state set.'));
    const missing = [], undef = [];
    rows.forEach((r) => A.forEach((a, k) => {
      const t = r.t[k];
      if (!t) missing.push('\u03b4(' + r.name + ', ' + a + ')');
      else if (!S.includes(t)) undef.push('\u03b4(' + r.name + ', ' + a + ') = ' + t);
    }));
    if (missing.length) errors.push('Missing transitions: ' + missing.join(', ') + '. A DFA needs exactly one transition per state and symbol.');
    if (undef.length) errors.push('Transitions to undefined states: ' + undef.join('; ') + '.');
    if (errors.length) return { errors };

    const delta = Object.create(null);
    rows.forEach((r) => {
      delta[r.name] = Object.create(null);
      A.forEach((a, k) => { delta[r.name][a] = r.t[k]; });
    });
    return { errors: [], dfa: { states: S, alphabet: A, start, accepting: [...new Set(acc)], delta } };
  }

  /* BFS from the start state in alphabet order: shortlex-smallest access string per reachable state. */
  function reach(d) {
    const access = Object.create(null);
    access[d.start] = '';
    const order = [d.start];
    for (let h = 0; h < order.length; h++) {
      const s = order[h];
      for (const a of d.alphabet) {
        const t = d.delta[s][a];
        if (!(t in access)) { access[t] = access[s] + a; order.push(t); }
      }
    }
    return { order, access };
  }

  function run(d, w) {
    const path = [];
    let s = d.start;
    for (const ch of w) {
      if (!d.alphabet.includes(ch)) return { error: 'Symbol "' + ch + '" is not in the alphabet.' };
      const t = d.delta[s][ch];
      path.push({ from: s, sym: ch, to: t });
      s = t;
    }
    return { path, final: s, accepted: d.accepting.includes(s) };
  }

  function equivalent(d1, d2) {
    const key = (a, b) => a + '\u0000' + b;
    const seen = new Set([key(d1.start, d2.start)]);
    const q = [[d1.start, d2.start, '']];
    const a1 = new Set(d1.accepting), a2 = new Set(d2.accepting);
    for (let h = 0; h < q.length; h++) {
      const [s, t, w] = q[h];
      if (a1.has(s) !== a2.has(t)) return { equal: false, counter: w, explored: seen.size };
      for (const a of d1.alphabet) {
        const ns = d1.delta[s][a], nt = d2.delta[t][a], k = key(ns, nt);
        if (!seen.has(k)) { seen.add(k); q.push([ns, nt, w + a]); }
      }
    }
    return { equal: true, explored: seen.size };
  }

  /* Table-filling algorithm. marks[i][j] (i > j) is null for equivalent pairs. */
  function minimize(d) {
    const { order, access } = reach(d);
    const reachSet = new Set(order);
    const st = d.states.filter((s) => reachSet.has(s));
    const unreachable = d.states.filter((s) => !reachSet.has(s));
    const n = st.length;
    const ix = new Map(st.map((s, i) => [s, i]));
    const acc = new Set(d.accepting);
    const M = Array.from({ length: n }, () => new Array(n).fill(null));
    const get = (p, q) => (p > q ? M[p][q] : M[q][p]);

    const rounds = [[]];
    for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) {
      if (acc.has(st[i]) !== acc.has(st[j])) { M[i][j] = { round: 0, a: null, succ: null, w: '' }; rounds[0].push([i, j]); }
    }
    for (let round = 1; ; round++) {
      const fresh = [];
      for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) {
        if (M[i][j]) continue;
        for (const a of d.alphabet) {
          const p = ix.get(d.delta[st[i]][a]), q = ix.get(d.delta[st[j]][a]);
          if (p !== q && get(p, q)) { fresh.push({ i, j, a, p, q }); break; }
        }
      }
      if (!fresh.length) break;
      for (const f of fresh) M[f.i][f.j] = { round, a: f.a, succ: [f.p, f.q], w: f.a + get(f.p, f.q).w };
      rounds.push(fresh.map((f) => [f.i, f.j]));
    }

    const par = st.map((_, i) => i);
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) if (!M[i][j]) par[find(i)] = find(j);
    const groups = new Map();
    st.forEach((s, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(s); });
    const classes = [...groups.values()].sort((a, b) => ix.get(a[0]) - ix.get(b[0]));
    const names = classes.map((c) => (c.length > 1 ? '{' + c.join(',') + '}' : c[0]));
    const clsOf = new Map();
    classes.forEach((c, k) => c.forEach((s) => clsOf.set(s, k)));

    const delta = Object.create(null);
    classes.forEach((c, k) => {
      delta[names[k]] = Object.create(null);
      for (const a of d.alphabet) delta[names[k]][a] = names[clsOf.get(d.delta[c[0]][a])];
    });
    const minimal = {
      states: names, alphabet: d.alphabet.slice(), start: names[clsOf.get(d.start)],
      accepting: classes.filter((c) => acc.has(c[0])).map((c) => names[clsOf.get(c[0])]), delta,
    };

    const bfsIdx = new Map(order.map((s, i) => [s, i]));
    const info = classes.map((c, k) => {
      const rep = c.slice().sort((x, y) => bfsIdx.get(x) - bfsIdx.get(y))[0];
      return { name: names[k], members: c, access: access[rep], accepting: acc.has(c[0]), samples: [] };
    });
    let level = [''];
    for (let len = 0; len <= 5; len++) {
      for (const w of level) {
        let s = d.start;
        for (const ch of w) s = d.delta[s][ch];
        const k = clsOf.get(s);
        if (info[k].samples.length < 6) info[k].samples.push(w);
      }
      if (len < 5) { const nx = []; for (const w of level) for (const a of d.alphabet) nx.push(w + a); level = nx; }
    }
    const sep = classes.map((a, x) => classes.map((b, y) => (x === y ? null : get(ix.get(a[0]), ix.get(b[0])).w)));

    return {
      dfa: d, st, unreachable, marks: M, rounds, classes, info, sep, minimal,
      maxRound: rounds.length - 1, verify: equivalent(d, minimal),
    };
  }

  /* Independent check: Moore partition refinement on the reachable states. */
  function moore(d) {
    const { order } = reach(d);
    const rs = new Set(order);
    const st = d.states.filter((s) => rs.has(s));
    const acc = new Set(d.accepting);
    let cls = new Map(st.map((s) => [s, acc.has(s) ? 1 : 0]));
    for (;;) {
      const sig = new Map(), nxt = new Map();
      for (const s of st) {
        const key = cls.get(s) + '|' + d.alphabet.map((a) => cls.get(d.delta[s][a])).join('|');
        if (!sig.has(key)) sig.set(key, sig.size);
        nxt.set(s, sig.get(key));
      }
      const before = new Set(cls.values()).size;
      cls = nxt;
      if (sig.size === before) break;
    }
    const g = new Map();
    st.forEach((s) => { const k = cls.get(s); if (!g.has(k)) g.set(k, []); g.get(k).push(s); });
    return [...g.values()];
  }
  const canon = (cs) => JSON.stringify(cs.map((c) => c.slice().sort()).sort((a, b) => (a[0] < b[0] ? -1 : 1)));

  /* ---------- built-in examples ---------- */
  function P(name, kind, alphabet, start, accepting, lines, expect) {
    const rows = lines.map((l) => { const p = l.split(' '); return { name: p[0], t: p.slice(1).map((x) => (x === '-' ? '' : x)) }; });
    return { name, kind, expect, model: { alphabet, rows, start, accepting } };
  }
  const PRESETS = [
    P('Textbook DFA, 8 states, one unreachable', 'valid', ['0', '1'], 'A', 'C',
      ['A B F', 'B G C', 'C A C', 'D C G', 'E H F', 'F C G', 'G G E', 'H G C'], 5),
    P('Ends with 01, with redundant states', 'valid', ['0', '1'], 'A', 'C',
      ['A B A2', 'A2 B2 A', 'B B2 C', 'B2 B C', 'C B A2'], 3),
    P('Even number of a, with redundant states', 'valid', ['a', 'b'], 'q0', 'q0,q2',
      ['q0 q1 q0', 'q1 q2 q1', 'q2 q3 q2', 'q3 q0 q3'], 2),
    P('Counter modulo 3, already minimal', 'valid', ['a', 'b'], 's0', 's0',
      ['s0 s1 s0', 's1 s2 s1', 's2 s0 s2'], 3),
    P('All states accepting', 'valid', ['a'], 'p', 'p,q,r', ['p q', 'q r', 'r p'], 1),
    P('Single state, empty language', 'valid', ['0', '1'], 'z', '', ['z z z'], 1),
    P('Missing transition', 'invalid', ['0', '1'], 'A', 'B', ['A B A', 'B A -']),
    P('Transition to an undefined state', 'invalid', ['0', '1'], 'A', 'B', ['A B Z', 'B A B']),
    P('Start state not in the state set', 'invalid', ['0', '1'], 'X', 'B', ['A B A', 'B A B']),
    P('Accepting state not in the state set', 'invalid', ['0', '1'], 'A', 'C', ['A B A', 'B A B']),
    P('Duplicate state names', 'invalid', ['0', '1'], 'A', 'B', ['A B A', 'B A B', 'A B B']),
    P('Multi-character alphabet symbol', 'invalid', ['0', 'ab'], 'A', 'B', ['A B A', 'B A B']),
    P('Empty alphabet', 'invalid', [], 'A', 'A', ['A']),
  ];

  return { MAX_STATES, MAX_SYMBOLS, tokens, validate, reach, run, equivalent, minimize, moore, canon, PRESETS };
});
