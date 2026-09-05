'use strict';
/* Direct Node acceptance runner. No test_env, vm, DOM or browser mocks.
 * The immortal bot is a late-combat exerciser, NOT a claim about survival skill.
 * Run: node test_simulation.js
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createWorld, viewport, FIXED_DT } = require('./simulation.js');

// Walk mutable gameplay, including Maps/Sets and cycles/target references.
// Template records are static config (infinite repeatable-card caps are intentional).
const staticLinks = new Set(['шаблон', 'конфиг', 'апгрейд', 'донатер']);
// Audited against core reads: rotation/spin only animate sprites; numeric phase
// only animates steps/bobbing. Keep deterministic flash/facing in the replay too.
// String dumbbell phase is gameplay (outbound/return motion and return damage).
const visualKeys = new Set(['фаза', 'поворот', 'вращение']);
function snapshot(value) {
  const seen = new Map();
  function visit(v, key) {
    if (staticLinks.has(key) || typeof v === 'function') return undefined;
    if (visualKeys.has(key) && typeof v === 'number') {
      assert.ok(Number.isFinite(v), `Non-finite visual ${key}: ${v}`);
      return undefined;
    }
    if (typeof v === 'number') { assert.ok(Number.isFinite(v), `Non-finite runtime ${key}: ${v}`); return v; }
    if (!v || typeof v !== 'object') return v;
    if (seen.has(v)) return { ref: seen.get(v) };
    seen.set(v, seen.size);
    if (v instanceof Map) return { map: [...v].map(([k, x]) => [visit(k), visit(x)]) };
    if (v instanceof Set) return { set: [...v].map(x => visit(x)) };
    if (Array.isArray(v)) return v.map(x => visit(x));
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const x = visit(v[k], k);
      if (x !== undefined) out[k] = x;
    }
    return out;
  }
  return JSON.stringify(visit(value));
}
// A real dumbbell fixture catches broad cosmetic-key exclusions before replay.
const phaseFixture = createWorld({ seed: 17 }); phaseFixture.start();
phaseFixture.legacy.бросокГантели();
const dumbbell = phaseFixture.state.гантели[0];
assert.equal(dumbbell.фаза, 'вперёд');
const outboundSnapshot = snapshot(phaseFixture.state);
dumbbell.фаза = 'назад';
assert.notEqual(snapshot(phaseFixture.state), outboundSnapshot,
  'Dumbbell return phase changes movement/damage and must participate in replay');
const returnSnapshot = snapshot(phaseFixture.state);
phaseFixture.state.игрок.фаза += 0.5; dumbbell.поворот += 0.5;
assert.equal(snapshot(phaseFixture.state), returnSnapshot, 'Numeric animation phase/rotation stay cosmetic');
for (const key of ['вспышка', 'сторона']) {
  assert.notEqual(snapshot({ [key]: 1 }), snapshot({ [key]: 2 }), `${key} remains covered by replay`);
}
for (const key of visualKeys) {
  assert.notEqual(snapshot({ [key]: 'a' }), snapshot({ [key]: 'b' }), `Only numeric ${key} is cosmetic`);
  assert.throws(() => snapshot({ [key]: NaN }), /Non-finite visual/);
}

function digest(world) {
  return crypto.createHash('sha256').update(snapshot(world.state)).update(String(world.rngState())).digest('hex');
}
function decide(world, counts) {
  let guard = 0;
  while (world.state.экран !== 'бой') {
    assert.ok(++guard < 100, 'Decision queue did not settle');
    const phase = world.state.экран;
    if (phase === 'левелап') { world.command('card', 0); counts.cards++; }
    else if (phase === 'замена') { world.command('replace', 0); counts.replacements++; }
    else if (phase === 'победа') { world.command('continue'); counts.continues++; }
    else assert.fail(`Unexpected phase: ${phase}`);
  }
}
function immortalTick(world, input, counts) {
  decide(world, counts);
  world.state.игрок.hp = world.state.игрок.максHp;
  world.state.игрок.неуязвим = 999; // Explicit test-only immortality, same convention as legacy soak.
  world.step([input]);
  const events = world.drainEvents();
  for (const event of events) {
    assert.ok(event.id > counts.lastEvent, 'Events must be ordered and consumed once');
    counts.lastEvent = event.id;
    if (event.type === 'reward-spin') counts.rewards++;
  }
  assert.equal(world.drainEvents().length, 0);
}
const stats = () => ({ cards: 0, replacements: 0, continues: 0, rewards: 0, lastEvent: 0 });
const a = createWorld({ seed: 123, visualSeed: 1 });
const b = createWorld({ seed: 123, visualSeed: 987654 });
const other = createWorld({ seed: 456, mobile: true, viewport: viewport(390, 844) });
for (const w of [a, b, other]) w.start();
assert.notEqual(a.state, b.state);
assert.notEqual(a.config.ВРАГИ, b.config.ВРАГИ);
assert.notEqual(a.content.АПГРЕЙДЫ, b.content.АПГРЕЙДЫ);
assert.equal(new Set(a.content.АПГРЕЙДЫ.map(c => c.ид)).size, a.content.АПГРЕЙДЫ.length);
const sa = stats(), sb = stats(), sc = stats();
const ticks = Math.ceil(600 / FIXED_DT) + 1; // Original accumulated clock crosses 600 one tick after rounding.
const oldRandom = Math.random;
Math.random = () => { throw new Error('Simulation must not consume ambient RNG'); };
try {
  for (let tick = 0; tick < ticks; tick++) {
    const input = { x: Math.cos(tick * 0.02), y: Math.sin(tick * 0.02), dash: tick % 150 < 8 };
    immortalTick(a, input, sa);
    immortalTick(b, input, sb);
    if (tick % 60 === 0) {
      assert.equal(digest(a), digest(b), `Seed/input replay or cosmetic RNG leak at tick ${tick}`);
      const before = digest(a);
      immortalTick(other, { x: -1, y: 0.2, dash: false }, sc);
      assert.equal(digest(a), before, 'Another world mutated this world');
    }
  }
} finally { Math.random = oldRandom; }
assert.equal(a.state.время, 600);
assert.ok(sa.cards >= 10 && a.state.убито > 500, 'Bot must actually exercise combat and cards');
assert.ok(a.state.вызванныеБоссы.size >= 4, 'Late boss scheduling must be reached');
assert.equal(digest(a), digest(b));

// Targeted decision/event fixtures: real world-bound callbacks, no duplicate rules.
const d = createWorld({ seed: 99 }); d.start(); d.drainEvents();
for (const key of Object.keys(d.content.СОЮЗНИКИ).slice(0, 4)) {
  const card = d.content.АПГРЕЙДЫ.find(c => c.ид === 'ally_' + key);
  d.state.карточки = [{ апгрейд: card, новыйУровень: 1 }];
  d.state.экран = 'левелап'; d.command('card', 0);
}
assert.equal(d.state.экран, 'замена');
d.command('replace', 0); assert.equal(d.state.союзники.length, 3);
const isolated = digest(a);
d.content.ДОНАТЕРЫ.Aartll.применить(d.state.игрок);
assert.ok(d.state.щенки.length > 0); assert.equal(digest(a), isolated);
d.legacy.предложитьПродолжение(); d.command('continue'); assert.equal(d.state.бесконечка, true);
d.legacy.завершитьЗабег(true); d.legacy.завершитьЗабег(true);
const resultEvents = d.drainEvents().filter(e => e.type === 'result');
assert.equal(resultEvents.length, 1);
assert.ok(!('дата' in resultEvents[0].data) && !('ник' in resultEvents[0].data) && !('версия' in resultEvents[0].data));
assert.equal(d.drainEvents().length, 0);
console.log(JSON.stringify({ ok: true, combatSeconds: ticks * FIXED_DT, clock: a.state.время,
  kills: a.state.убито, level: a.state.уровень, decisions: sa, gameplayHash: digest(a),
  replay: 'same seed/input, different visual seeds', isolation: 'three independent factories', immortalBot: true }, null, 2));
