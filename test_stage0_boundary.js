'use strict';
// Focused architectural regressions; existing suites/assertions remain unchanged.
const assert = require('node:assert/strict');
const { createWorld, FIXED_DT } = require('./simulation.js');
const w = createWorld(); w.start(); w.drainEvents();
const order = ['обновитьИгрока','обновитьСпавн','обновитьВрагов','обновитьОружие',
  'обновитьГантели','обновитьСвиту','обновитьФинал','обновитьУвольнения',
  'обновитьРасписаниеИвентов','обновитьКлетку','обновитьОбъяву','обновитьУбегающих',
  'обновитьПризрака','обновитьПредметы','обновитьКольца','обновитьТелеграфы',
  'обновитьСнаряды','обновитьКуски','обновитьКристаллы','обновитьКамеру'];
const calls = [];
for (const name of order) w.legacy[name] = dt => {
  assert.equal(dt, FIXED_DT); calls.push(name);
  if (name === order[0]) w.state.экран = 'левелап';
};
w.step([{ x: 1, y: 0 }]);
assert.deepEqual(calls, order, 'A phase change mid-tick must not truncate the original update order');
assert.equal(w.drainEvents().filter(e => e.type === 'effects-step').length, 1);
calls.length = 0; w.step([]); assert.equal(calls.length, 0);
assert.equal(w.state.время, FIXED_DT, 'Phase gate is checked at tick entry');

const deferred = createWorld(); deferred.start();
deferred.state.взлетающийНик = { жизнь: 0.03, x: 0, y: 0 };
deferred.legacy.открытьЛевелап();
assert.equal(deferred.state.экран, 'бой');
for (let n = 0; n < 80; n++) { deferred.step([]); deferred.drainEvents(); }
assert.equal(deferred.state.взлетающийНик, null);
assert.equal(deferred.state.экран, 'левелап', 'Card gate expires without a renderer');

// The browser harness is used ONLY here to check rendering, never by the Node runner.
const { поднять } = require('./test_env.js');
const e = поднять(), s = e.S; s.начатьЗабег();
for (const [type, template] of Object.entries(s.ВРАГИ)) s.создатьВрага(type, template, { x: 30, y: 30 });
s.вызватьБосса('ТОЛПА');
s.ИГРА.игрок.апгрейды.tarakany = 1; s.пересобратьТараканов();
s.ИГРА.игрок.апгрейды.schenki = 1; s.пересобратьЩенков();
for (const key of Object.keys(s.СОЮЗНИКИ).slice(0, 3)) s.добавитьСоюзника(key);
s.запуститьИвент('galiopola'); s.шагЛогики(FIXED_DT);
s.ИГРА.игрок.видитСквозьТолпу = true;
const coreState = e.vm.runInContext('симуляция.state', e.песочница);
const seen = new Set();
function freeze(value) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value); for (const item of Object.values(value)) freeze(item); Object.freeze(value);
}
const browserWorld = e.vm.runInContext('симуляция', e.песочница);
// Queue a real event without passing through an adapter mutation boundary.
browserWorld.legacy.бросокГантели();
const boundaryCalls = { setInputs: 0, setViewport: 0, drainEvents: 0 };
const originalMethods = {};
for (const name of Object.keys(boundaryCalls)) {
  originalMethods[name] = browserWorld[name];
  browserWorld[name] = (...args) => {
    boundaryCalls[name]++;
    return originalMethods[name](...args);
  };
}
freeze(coreState);
freeze(browserWorld.viewport);
const rngBeforeRender = browserWorld.rngState();
s.нарисоватьМир(); s.нарисоватьИнтерфейс();
assert.deepEqual(boundaryCalls, { setInputs: 0, setViewport: 0, drainEvents: 0 },
  'Rendering must not synchronize input/viewport or drain queued events');
assert.equal(browserWorld.rngState(), rngBeforeRender, 'Rendering must not advance gameplay RNG');

// All read-query adapters use the same side-effect-free boundary, not just culling.
const enemy = coreState.враги[0];
const queryArgs = {
  описаниеАпгрейда: [s.АПГРЕЙДЫ[0], 1], собратьБилд: [], наЭкране: [0, 0],
  текущаяВолна: [], радиусСпавна: [], найтиЖертву: [], естьМестоПодСпавн: [],
  hpВрага: [enemy.шаблон, false], точкаУКраяЭкрана: [0, 100],
  ценаВыпуска: [Object.keys(s.ВРАГИ)[0]], попалВТыл: [enemy, 0, 0],
  боевойМножитель: [coreState.игрок], ближайшийВраг: [0, 0], времяПолёта: [100, 200],
  уголПерехвата: [0, 0, enemy, 200], точкаВЗоне: [{ вид: 'круг', x: 0, y: 0, радиус: 10 }, 0, 0],
  интервалАтакиБосса: [{ шаблон: { атака: { интервал: 1 } } }], выводокНаПоле: [],
  уровеньСвиты: ['tarakany'], ближайшийВрагК: [0, 0, 1000],
  свободнаяЦельДляТаракана: [0, 0, new Set()], цельВрага: [enemy],
  свободныеДонатеры: [], доступныеАпгрейды: []
};
for (const [name, args] of Object.entries(queryArgs)) e.песочница[name](...args);
assert.deepEqual(boundaryCalls, { setInputs: 0, setViewport: 0, drainEvents: 0 },
  'Read-query adapters must not cross a mutating boundary');
assert.equal(browserWorld.rngState(), rngBeforeRender);
const pending = originalMethods.drainEvents();
assert.ok(pending.some(event => event.type === 'sound' && event.data[0] === 'бросок'),
  'Rendering and queries must leave pending events for the next mutation boundary');
for (const template of Object.values(s.ВРАГИ)) {
  assert.ok(!('_база' in template) && !('_белые' in template) && !('_оттенок' in template));
}
// Resize synchronizes viewport immediately, even while paused and without a tick.
const resized = поднять(); resized.S.начатьЗабег();
const resizedWorld = resized.vm.runInContext('симуляция', resized.песочница);
const resizeCalls = { setInputs: 0, setViewport: 0, drainEvents: 0 };
for (const name of Object.keys(resizeCalls)) {
  const original = resizedWorld[name];
  resizedWorld[name] = (...args) => { resizeCalls[name]++; return original(...args); };
}
resizedWorld.state.экран = 'пауза';
resized.окно.innerWidth = 390; resized.окно.innerHeight = 844;
resized.окно._событие('resize', {});
assert.equal(resizedWorld.viewport.ш, 390);
assert.equal(resizedWorld.viewport.в, 844);
assert.equal(resizedWorld.viewport.зум, resized.S.ЭКР.зум);
assert.equal(resizedWorld.viewport.диагональ, Math.hypot(390, 844));
assert.equal(resizedWorld.legacy.радиусСпавна(), resized.песочница.радиусСпавна());
assert.deepEqual(resizeCalls, { setInputs: 0, setViewport: 1, drainEvents: 0 },
  'Actual resize syncs viewport only; queries do not perform the resize');
// Direct legacy ЭКР edits are still synchronized by command and tick boundaries.
resized.S.ЭКР.ш = 800;
resized.S.начатьЗабег();
assert.equal(resizedWorld.viewport.ш, 800);
assert.deepEqual(resizeCalls, { setInputs: 1, setViewport: 2, drainEvents: 1 });
resized.S.ЭКР.в = 450;
resized.S.шагЛогики(FIXED_DT);
assert.equal(resizedWorld.viewport.в, 450);
assert.deepEqual(resizeCalls, { setInputs: 2, setViewport: 3, drainEvents: 2 });
console.log('PASS: fixed tick order/entry gate, deferred decisions without rendering, read-only world/HUD, separate sprite caches');
console.log('PASS: 24 read-query adapters, frozen viewport, preserved event queue/RNG, resize-only sync, command/tick sync');
