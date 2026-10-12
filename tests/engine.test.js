// Run with: node tests/engine.test.js
const E = require('../engine.js');
const assert = require('assert');
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok  ' + name); };
const accOf = (dfa, s, w) => E.run({ ...dfa, start: s }, w).accepted;

E.PRESETS.forEach((p, i) => {
  if (p.kind === 'valid') {
    t('valid #' + i + ' ' + p.name, () => {
      const v = E.validate(p.model);
      assert.deepStrictEqual(v.errors, []);
      const R = E.minimize(v.dfa);
      assert.strictEqual(R.classes.length, p.expect, 'class count');
      assert.strictEqual(R.verify.equal, true, 'minimal DFA recognises the same language');
      assert.strictEqual(E.canon(R.classes), E.canon(E.moore(v.dfa)), 'agrees with Moore refinement');
      assert.strictEqual(E.minimize(R.minimal).classes.length, R.classes.length, 'minimal DFA is already minimal');
      for (let a = 1; a < R.st.length; a++) for (let b = 0; b < a; b++) {
        const m = R.marks[a][b];
        if (m) {
          assert.notStrictEqual(accOf(v.dfa, R.st[a], m.w), accOf(v.dfa, R.st[b], m.w), 'witness separates the pair');
          assert.strictEqual(m.w.length, m.round, 'round equals witness length');
        } else {
          // equivalent pairs must agree on every string up to length 6
          let level = [''];
          for (let len = 0; len <= 6; len++) {
            for (const w of level) assert.strictEqual(accOf(v.dfa, R.st[a], w), accOf(v.dfa, R.st[b], w));
            if (len < 6) level = level.flatMap((w) => v.dfa.alphabet.map((c) => w + c));
          }
        }
      }
    });
  } else {
    t('invalid #' + i + ' ' + p.name, () => {
      const v = E.validate(p.model);
      assert.ok(v.errors.length > 0 && !v.dfa);
    });
  }
});

t('textbook classes', () => {
  const R = E.minimize(E.validate(E.PRESETS[0].model).dfa);
  assert.deepStrictEqual(R.unreachable, ['D']);
  assert.deepStrictEqual(R.classes, [['A', 'E'], ['B', 'H'], ['C'], ['F'], ['G']]);
  assert.strictEqual(R.maxRound, 2);
});
t('ends with 01 collapses A2 and B2', () => {
  const R = E.minimize(E.validate(E.PRESETS[1].model).dfa);
  assert.deepStrictEqual(R.classes, [['A', 'A2'], ['B', 'B2'], ['C']]);
  assert.strictEqual(E.run(R.minimal, '1101').accepted, true);
  assert.strictEqual(E.run(R.minimal, '10').accepted, false);
});
t('error texts', () => {
  const msg = (i) => E.validate(E.PRESETS[i].model).errors.join(' | ');
  assert.match(msg(6), /Missing transitions: \u03b4\(B, 1\)/);
  assert.match(msg(7), /undefined states/);
  assert.match(msg(8), /Start state "X"/);
  assert.match(msg(9), /Accepting state "C"/);
  assert.match(msg(10), /Duplicate state names: A/);
  assert.match(msg(11), /single character/);
  assert.match(msg(12), /alphabet is empty/);
});
console.log('\n' + pass + ' checks passed');
