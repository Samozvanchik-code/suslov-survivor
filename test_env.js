/* Общая заглушка браузера для тестов: канвас, DOM, хранилище.
   Грузит боевые файлы игры как есть и отдаёт ссылки на внутренности. */

const fs = require('fs');
const vm = require('vm');

function контекст() {
  return {
    canvas: { width: 800, height: 450 },
    save(){}, restore(){}, beginPath(){}, closePath(){}, moveTo(){}, lineTo(){},
    bezierCurveTo(){}, quadraticCurveTo(){}, arc(){}, arcTo(){}, ellipse(){},
    rect(){}, roundRect(){}, setLineDash(){}, getLineDash(){ return []; },
    fill(){}, stroke(){}, clip(){}, fillRect(){}, strokeRect(){}, clearRect(){},
    translate(){}, rotate(){}, scale(){}, setTransform(){}, resetTransform(){},
    drawImage(){}, fillText(){}, strokeText(){},
    createLinearGradient(){ return { addColorStop(){} }; },
    createRadialGradient(){ return { addColorStop(){} }; },
    createPattern(){ return null; },
    getImageData(){ return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
    putImageData(){}, measureText(){ return { width: 40 }; },
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    font: '', textAlign: '', textBaseline: '', imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high', shadowBlur: 0, shadowColor: ''
  };
}

function элемент(тег) {
  return {
    tagName: тег, style: {}, dataset: {}, width: 800, height: 450,
    value: '', textContent: '',
    getContext: () => контекст(),
    addEventListener(){}, removeEventListener(){}, appendChild(){},
    focus(){}, blur(){}, setAttribute(){}, getAttribute(){ return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    classList: { add(){}, remove(){}, toggle(){} }
  };
}

function поднять(опции) {
  опции = опции || {};
  const окно = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener(){}, addListener(){} }),
    addEventListener(){}, removeEventListener(){},
    requestAnimationFrame: () => 0,
    location: { search: '', href: 'http://localhost/' },
    navigator: { userAgent: 'node', sendBeacon: () => true },
    performance: { now: () => Date.now() },
    AudioContext: undefined, ym: undefined
  };
  const хранилище = {
    _д: {},
    getItem(k){ return this._д[k] === undefined ? null : this._д[k]; },
    setItem(k, v){ this._д[k] = String(v); },
    removeItem(k){ delete this._д[k]; }
  };
  окно.localStorage = хранилище;

  const документ = {
    readyState: 'loading', scripts: [],
    getElementById: () => элемент('canvas'),
    createElement: (t) => элемент(t),
    getElementsByTagName: () => [ элемент('script') ],
    addEventListener(){}, removeEventListener(){},
    body: элемент('body'), documentElement: элемент('html')
  };

  const песочница = {
    window: окно, document: документ,
    navigator: окно.navigator, location: окно.location,
    localStorage: хранилище, performance: окно.performance,
    requestAnimationFrame: () => 0,
    console, Math, Date, JSON, Object, Array, String, Number, Boolean,
    Image: function(){ this.onload = null; this.onerror = null; this.src = ''; },
    Uint8ClampedArray, Set, Map, isNaN, parseInt, parseFloat,
    Infinity, NaN, setTimeout, clearTimeout,
    fetch: опции.fetch || (() => Promise.resolve({ ok: true })),
    Promise, Blob: function(){}, navigator: окно.navigator
  };
  песочница.globalThis = песочница;
  vm.createContext(песочница);

  const файлы = ['config.js','changelog.js','text.js','content.js','sprites.js','engine.js','entities.js','ui.js'];
  for (const ф of файлы) {
    let текст = fs.readFileSync(__dirname + '/' + ф, 'utf8');
    /* Адрес рейтинга объявлен через const, из теста его не переписать.
       Подменяем прямо в исходнике перед загрузкой — так проверяется тот же
       код, что поедет в продакшн, а не его копия. */
    if (ф === 'config.js' && опции.адресРейтинга !== undefined) {
      текст = текст.replace(/const АДРЕС_РЕЙТИНГА = '[^']*';/,
                            "const АДРЕС_РЕЙТИНГА = '" + опции.адресРейтинга + "';");
    }
    vm.runInContext(текст, песочница, { filename: ф });
  }

  /* Картинки в node не грузятся, а рендер без готовых спрайтов идёт по ветке
     заглушки и не проверяет реальный код. Подсовываем фальшивые картинки
     и печём позы — тогда отрисовка проходит те же ветки, что в браузере. */
  vm.runInContext(`
    for (const ключ in МАНИФЕСТ) {
      СПРАЙТ[ключ] = СПРАЙТ[ключ] || {};
      СПРАЙТ[ключ].ш = МАНИФЕСТ[ключ].ш;
      СПРАЙТ[ключ].в = МАНИФЕСТ[ключ].в;
      СПРАЙТ[ключ].картинка = { width: МАНИФЕСТ[ключ].ш, height: МАНИФЕСТ[ключ].в };
      СПРАЙТ[ключ].готов = true;
    }
    прогретьПозы();
  `, песочница, { filename: 'спрайты-заглушки.js' });

  /* const и let не попадают в глобальный объект, но живут в общей
     лексической области контекста — вытаскиваем ссылки отдельным скриптом. */
  vm.runInContext(`globalThis.__ = {
    ИГРА, ЛУТ, БЕЛУГА, ЧЕРЕП, ГЕРОЙ, ОХОТНИК, СОЮЗНИКИ, АПГРЕЙДЫ, ВРАГИ, БОССЫ, БРОСОК, МАСКА, ЗУМ, ЭКР, клавиши,
    ВЕРСИЯ, ИЗМЕНЕНИЯ, мышь, кнопки: () => кнопки,
    экранИзменений, экранИтогов, экранСтарта, нарисоватьВерсию,
    открытьИзменения, закрытьИзменения, прокрутитьИзменения, нажатие,
    обработатьКлик, отправитьРезультат, текущийНик,
    начатьЗабег, шагЛогики, нарисоватьМир, нарисоватьИнтерфейс,
    отправитьНаСервер, загрузитьМировойТоп, обновитьИгрока, обновитьОружие, обновитьСвиту, ближайшийВрагК, обновитьПредметы, создатьВрага,
    взятьКарточку, заменитьСоюзника, добавитьСоюзника, переразнестиУглы,
    подобратьБелугу, включитьРежимШварца, попробоватьДропБелуги,
    уронитьПредмет, выложитьЛут, точкаДляЛута,
    пересчитатьМаксHp, ранитьИгрока, боевойМножитель, уронВрагу, попалВТыл,
    пересчитатьЗум, пересчитатьРазмер, убитьВрага, обзорВокругИгрока,
    сломатьЩит, создатьВрага2: создатьВрага
  };`, песочница, { filename: 'экспорт.js' });

  return { песочница, S: песочница.__, ИГРА: песочница.__.ИГРА, vm };
}

module.exports = { поднять };
