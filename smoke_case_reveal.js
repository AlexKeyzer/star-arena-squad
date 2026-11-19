/**
 * Smoke test: Star Capsule reveal must be crystal clear about WHAT dropped.
 * Deterministic: Math.random is stubbed per scenario to force each drop
 * category, then 5 taps are simulated and the reward panel is asserted.
 *
 * Scenarios:
 *  1. Coins     → banner «ВАМ ВЫПАЛО МОНЕТЫ!» + giant +N
 *  2. Power     → banner «ВАМ ВЫПАЛО ЭНЕРГИЯ!» + giant +N
 *  3. New skin  → banner «НОВЫЙ СКИН!» + skin name
 *  4. Pity hero → banner «НОВЫЙ ГЕРОЙ!» + hero bust + name + pity note
 *  5. Duplicate → banner «УЖЕ ЕСТЬ!» + conversion row (+coins +pp)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/node_modules/jsdom');

const ROOT = path.resolve(__dirname, '..');

const dom = new JSDOM('<!DOCTYPE html><html lang="ru"><body></body></html>', {
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
global.window = window;
global.document = window.document;

for (const f of ['src/i18n.js', 'src/save.js', 'src/ui/icons.js', 'src/ui/chest_modal.js']) {
  window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
}

const gameData = {
  balance: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/balance.json'), 'utf8')),
  heroes: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/heroes.json'), 'utf8')),
  maps: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/maps.json'), 'utf8')),
  meta: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/meta.json'), 'utf8'))
};
gameData.skins = gameData.heroes.skins || [];
gameData.heroes = gameData.heroes.heroes || gameData.heroes;

const SA = window.SA;
SA.i18n.setLang('ru');
SA.RenderHeroBustSvg = (hero) => `<svg viewBox="0 0 88 80" class="sa-portrait-svg"><circle cx="44" cy="40" r="30" fill="${(hero.palette && hero.palette.primary) || '#f00'}"/></svg>`;

const platform = { getSceneState: () => 'lobby', setSceneState: () => {}, isPaused: () => true };

let failures = 0;

function runScenario(name, { randValue, prepare, expect }) {
  const save = SA.Save.createDefaultSave(gameData);
  save.cases = 1;
  if (prepare) prepare(save);

  const realRandom = window.Math.random;
  window.Math.random = () => randValue;

  SA.ChestModal.openCaseModal({ save, gameData, platform, audio: null, onComplete: () => {} });
  const modal = window.document.getElementById('saCaseModal');

  if (!modal) {
    window.Math.random = realRandom;
    console.log(`[FAIL] ${name} — modal did not open`);
    failures++;
    return;
  }

  const stage = modal.querySelector('#saCapsuleStage');
  // Keep the stub active: the roll happens on the 5th tap (revealReward)
  for (let i = 0; i < 5; i++) stage.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  window.Math.random = realRandom;

  const panel = modal.querySelector('#saCaseRewardPanel');
  const errors = [];
  if (!panel || panel.className.includes('hidden')) errors.push('reward panel hidden');
  else {
    for (const [desc, fn] of expect) {
      const r = fn(panel, panel.innerHTML);
      if (r !== true) errors.push(desc + ': ' + r);
    }
  }

  console.log(`[${errors.length ? 'FAIL' : 'PASS'}] ${name}` + (errors.length ? ' — ' + errors.join('; ') : ''));
  failures += errors.length ? 1 : 0;

  const doneBtn = modal.querySelector('#saCaseDoneBtn');
  if (doneBtn) doneBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  if (window.document.getElementById('saCaseModal')) modal.remove();
}

const txt = (sel) => (panel) => {
  const el = panel.querySelector(sel);
  return el ? true : `missing ${sel}`;
};
const rx = (re, sel) => (panel) => {
  const scope = sel ? panel.querySelector(sel) : panel;
  return scope && re.test(scope.innerHTML) ? true : `pattern ${re} not found in ${sel || 'panel'}`;
};

// 1. Coins: r=0.2 → coins (55%)
runScenario('Coins drop: «ВАМ ВЫПАЛО МОНЕТЫ!» + giant +N', {
  randValue: 0.2,
  expect: [
    ['banner text', rx(/МОНЕТЫ/, '.sa-got-banner')],
    ['you-got label', rx(/ВАМ ВЫПАЛО/, '.sa-got-banner')],
    ['giant amount', (p) => {
      const el = p.querySelector('.sa-got-name.amount');
      return el && /^\+\d+$/.test(el.textContent.trim()) ? true : 'no +N in .sa-got-name.amount';
    }],
    ['coin art', txt('.sa-got-art.big')],
    ['currency caption', rx(/Монеты/, '.sa-got-sub')]
  ]
});

// 2. Power points: r=0.7 → pp (55..80)
runScenario('Power drop: «ЭНЕРГИЯ!» + giant +N', {
  randValue: 0.7,
  expect: [
    ['banner text', rx(/ЭНЕРГИЯ/, '.sa-got-banner')],
    ['giant amount', (p) => {
      const el = p.querySelector('.sa-got-name.amount');
      return el && /^\+\d+$/.test(el.textContent.trim()) ? true : 'no +N';
    }],
    ['bolt art', txt('.sa-got-art.big')]
  ]
});

// 3. New skin: r=0.85 → skin (80..92), pool pick uses same rng
runScenario('New skin drop: «НОВЫЙ СКИН!» + skin name', {
  randValue: 0.85,
  expect: [
    ['banner text', rx(/НОВЫЙ СКИН/, '.sa-got-banner')],
    ['skin name', txt('.sa-got-name')],
    ['skin art', txt('.sa-got-art')]
  ]
});

// 4. Pity hero: 11th case guarantee
runScenario('Pity hero drop: «НОВЫЙ ГЕРОЙ!» + bust + name + pity note', {
  randValue: 0.3,
  prepare: (save) => { save.casesWithoutHero = 10; },
  expect: [
    ['banner text', rx(/НОВЫЙ ГЕРОЙ/, '.sa-got-banner')],
    ['hero bust', (p) => p.querySelector('.sa-got-art.bust svg.sa-portrait-svg') ? true : 'no bust svg'],
    ['hero name', txt('.sa-got-name')],
    ['pity note', rx(/ГАРАНТ 11\/11/, '.sa-got-note')]
  ]
});

// 5. Duplicate hero (all unlocked): clear «УЖЕ ЕСТЬ!» + conversion row
runScenario('Duplicate hero: «УЖЕ ЕСТЬ!» + conversion +N монет +M энергии', {
  randValue: 0.95, // hero category (92..99)
  prepare: (save) => {
    for (const h of gameData.heroes) save.heroes[h.id] = { unlocked: true, level: 1, trophies: 0, skinId: null };
    save.casesWithoutHero = 0;
  },
  expect: [
    ['banner text', rx(/УЖЕ ЕСТЬ/, '.sa-got-banner')],
    ['converted label', rx(/Заменено на/, '.sa-got-name')],
    ['coins chip', (p) => {
      const chips = p.querySelectorAll('.sa-got-conv');
      return chips.length >= 1 ? true : 'no .sa-got-conv chips';
    }],
    ['plus amounts', (p) => {
      const chips = [...p.querySelectorAll('.sa-got-conv b')].map(b => b.textContent.trim());
      return chips.length >= 1 && chips.every(c => /^\+\d+$/.test(c)) ? true : 'bad conversion amounts: ' + chips.join(',');
    }]
  ]
});

console.log(failures === 0 ? 'SMOKE OK — reveal is crystal clear for all 5 drop types' : `SMOKE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
