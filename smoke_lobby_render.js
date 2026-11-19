/**
 * Smoke test: full lobby render in jsdom.
 * Verifies topbar / bottom nav / play stage / heroes / road / quests / social
 * views all render without exceptions after the arcade redesign.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/node_modules/jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
global.window = window;
global.document = window.document;

for (const f of [
  'src/i18n.js', 'src/save.js', 'src/ui/icons.js',
  'src/sim/rng.js', 'src/sim/match_sim.js',
  'src/ui/chest_modal.js', 'src/ui/app_ui.js'
]) {
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
// Stub the 3D turntable (no WebGL in jsdom)
SA.Renderer3D = { createHeroTurntable: () => null };
SA.RenderHeroBustSvg = () => '<svg class="sa-portrait-svg"></svg>';

const save = SA.Save.createDefaultSave(gameData);
const platform = {
  getSceneState: () => 'lobby', setSceneState: () => {}, isPaused: () => false,
  showRewardedAd: async () => ({ rewarded: false, shown: false }),
  showInterstitial: async () => ({ shown: false })
};

const ui = SA.AppUI.createAppUI({
  save, gameData, platform, audio: null,
  onStartMatch: () => {}, onSaveChanged: () => {}, onQualityChanged: () => {},
  onTriggerEmote: () => {}, onChargePracticeSuper: () => {}
});

let failures = 0;
function check(name, fn) {
  try {
    const r = fn();
    if (r === true) console.log(`[PASS] ${name}`);
    else { console.log(`[FAIL] ${name} — ${r}`); failures++; }
  } catch (e) {
    console.log(`[FAIL] ${name} — threw: ${e.message}`);
    failures++;
  }
}

ui.renderAll();
ui.showLobby(true);

check('Play stage renders', () => {
  const el = document.getElementById('saViewContent');
  if (!document.querySelector('.sa-stage-screen')) return 'no .sa-stage-screen';
  if (!document.getElementById('saBattleBtn')) return 'no PLAY button';
  if (!document.getElementById('saEventSlotBtn')) return 'no event slot';
  if (!document.getElementById('saTurntableCanvas')) return 'no turntable canvas';
  if (el.innerHTML.includes('dq_')) return 'raw dq_ id leaked into play view';
  return true;
});

check('Topbar: profile + currencies + road bar', () => {
  if (!document.getElementById('saProfileCardBtn')) return 'no profile pill';
  if (!document.getElementById('saTopCaseBtn')) return 'no case currency pill';
  if (!document.getElementById('saRoadShortcutBtn')) return 'no road mini bar';
  return true;
});

check('Bottom nav visible in lobby (tab bar)', () => {
  const nav = document.getElementById('saNavBar');
  if (!nav) return 'no navbar';
  if (nav.children.length < 5) return 'nav has ' + nav.children.length + ' tabs';
  if (nav.innerHTML.includes('dq_')) return 'raw dq_ id leaked into nav';
  return true;
});

for (const tab of ['heroes', 'road', 'season', 'quests', 'social']) {
  check(`Tab "${tab}" renders`, () => {
    ui.setTab(tab);
    const vc = document.getElementById('saViewContent');
    if (!vc || vc.innerHTML.trim().length < 40) return 'empty view';
    if (vc.innerHTML.includes('dq_')) return 'raw dq_ id leaked';
    return true;
  });
}

check('Back to play tab re-renders stage', () => {
  ui.setTab('play');
  return document.getElementById('saBattleBtn') ? true : 'no PLAY button after setTab(play)';
});

console.log(failures === 0 ? 'LOBBY SMOKE OK' : `LOBBY FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
