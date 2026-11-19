/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Star Capsule Opening Modal — BIG CLEAR REVEAL (v2.0)
 * - Instant-readable result: giant rarity banner «ВАМ ВЫПАЛО: НОВЫЙ ГЕРОЙ!»
 * - Huge item card with rarity glow + hero bust / skin plate / coin stack art
 * - Duplicates: crystal-clear «УЖЕ ЕСТЬ! → Заменено на +N монет +M энергии»
 * - Discloses exact drop odds (55% / 25% / 12% / 7% / 1%)
 * - Shows 11th-case Pity progress
 * - Strictly ZERO real-money purchase paths
 * - Locks PlatformAdapter scene to 'case_anim' so NO ads can fire during opening!
 */
(function (root) {
  'use strict';

  let caseModalActive = false;

  const RARITY_STYLE = {
    hero:        { grad: ['#ffe033', '#ff9100'], ink: '#7a3b00', cls: 'rar-hero' },
    mythic_skin: { grad: ['#ff5ce1', '#9d2bff'], ink: '#3d0a63', cls: 'rar-mythic' },
    skin:        { grad: ['#63d7ff', '#2f7bff'], ink: '#062e6e', cls: 'rar-skin' },
    power_points:{ grad: ['#b388ff', '#6d3bff'], ink: '#2c0a6e', cls: 'rar-pp' },
    coins:       { grad: ['#ffd54f', '#ff8f00'], ink: '#6e3200', cls: 'rar-coins' }
  };

  function openCaseModal({ save, gameData, platform, audio, onComplete }) {
    const i18n = root.SA.i18n;
    if (caseModalActive || save.cases <= 0) return;
    if (typeof document !== 'undefined' && document.getElementById('saCaseModal')) return;
    caseModalActive = true;

    const prevScene = platform.getSceneState();
    platform.setSceneState('case_anim');

    const MAX_TAPS = 5;
    let taps = 0;
    let revealed = false;

    const pityCount = Math.min(11, (save.casesWithoutHero || 0) + 1);

    const modal = document.createElement('div');
    modal.className = 'sa-case-overlay';
    modal.id = 'saCaseModal';
    modal.innerHTML = `
      <div class="sa-case-card">
        <div class="sa-case-header">
          <h2>${i18n.t('case_modal_title')}</h2>
          <span class="sa-pity-pill">${i18n.t('case_pity_status', { count: pityCount })}</span>
        </div>

        <div class="sa-capsule-stage" id="saCapsuleStage">
          <div class="sa-capsule-rays"></div>
          <div class="sa-capsule-box" id="saCapsuleBox">
            <div class="sa-capsule-lid">★</div>
            <div class="sa-capsule-body">
              <div class="sa-capsule-gem"></div>
            </div>
          </div>
          <div class="sa-capsule-burst" id="saCapsuleBurst"></div>
        </div>

        <p class="sa-case-prompt" id="saCasePrompt">
          ${i18n.t('case_tap_prompt', { taps: 0, max: MAX_TAPS })}
        </p>

        <div class="sa-case-reward-panel hidden" id="saCaseRewardPanel"></div>

        <div class="sa-case-odds-box">
          <div class="sa-odds-title">${i18n.t('case_odds_title')}</div>
          <div class="sa-odds-vals">${i18n.t('case_odds_line')}</div>
          <div class="sa-no-iap-note">${i18n.t('no_iap_notice')}</div>
        </div>

        <button class="sa-btn sa-btn-primary hidden" id="saCaseDoneBtn">${i18n.t('btn_continue')}</button>
      </div>
    `;
    document.body.appendChild(modal);

    const stageEl = modal.querySelector('#saCapsuleStage');
    const boxEl = modal.querySelector('#saCapsuleBox');
    const burstEl = modal.querySelector('#saCapsuleBurst');
    const promptEl = modal.querySelector('#saCasePrompt');
    const rewardPanel = modal.querySelector('#saCaseRewardPanel');
    const doneBtn = modal.querySelector('#saCaseDoneBtn');
    const oddsBox = modal.querySelector('.sa-case-odds-box');

    // Auto-hasten gentle timer if player watches instead of tapping, while tapping speeds it up!
    const autoTimer = setInterval(() => {
      if (!revealed && !(platform && platform.isPaused && platform.isPaused())) {
        handleTap();
      }
    }, 1150);

    function spawnUiStars() {
      if (!burstEl) return;
      for (let i = 0; i < 8; i++) {
        const s = document.createElement('span');
        s.className = 'sa-ui-star';
        s.textContent = '★';
        const ang = (i / 8) * Math.PI * 2;
        s.style.setProperty('--tx', `${Math.cos(ang) * 95}px`);
        s.style.setProperty('--ty', `${Math.sin(ang) * 95}px`);
        burstEl.appendChild(s);
        setTimeout(() => s.remove(), 650);
      }
    }

    function spawnRevealConfetti(colorA, colorB) {
      const host = modal.querySelector('.sa-case-card');
      if (!host) return;
      const colors = [colorA, colorB, '#ffffff', '#ffe033'];
      for (let i = 0; i < 26; i++) {
        const c = document.createElement('span');
        c.className = 'sa-reveal-confetti';
        c.style.left = (8 + Math.random() * 84) + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDelay = (Math.random() * 0.35) + 's';
        c.style.animationDuration = (0.8 + Math.random() * 0.8) + 's';
        host.appendChild(c);
        setTimeout(() => c.remove(), 1900);
      }
    }

    function handleTap() {
      if (revealed) return;
      taps += 1;
      if (audio) audio.playChestTap(taps, MAX_TAPS);
      if (boxEl) {
        boxEl.classList.remove('shake');
        void boxEl.offsetWidth;
        boxEl.classList.add('shake');
        boxEl.style.setProperty('--charge', String(taps / MAX_TAPS));
      }
      spawnUiStars();

      if (taps < MAX_TAPS) {
        if (promptEl) promptEl.textContent = i18n.t('case_tap_prompt', { taps, max: MAX_TAPS });
      } else {
        revealReward();
      }
    }

    function heroArt(hero) {
      if (root.SA && typeof root.SA.RenderHeroBustSvg === 'function') {
        try { return root.SA.RenderHeroBustSvg(hero); } catch (e) { /* fall through */ }
      }
      return '★';
    }

    function revealReward() {
      if (revealed) return;
      revealed = true;
      clearInterval(autoTimer);

      const drop = root.SA.Save.rollStarCase(save, gameData);
      if (!drop || !drop.ok) {
        caseModalActive = false;
        modal.remove();
        platform.setSceneState(prevScene === 'case_anim' ? 'lobby' : prevScene);
        return;
      }
      const isBig = drop.category === 'hero' || drop.category === 'mythic_skin' || drop.category === 'skin';
      if (audio) audio.playChestReveal(isBig);

      if (boxEl) boxEl.classList.add('opened');
      if (stageEl) stageEl.classList.add('reveal-flash');
      if (promptEl) promptEl.classList.add('hidden');
      if (oddsBox) oddsBox.classList.add('compact');

      const ico = root.SA && root.SA.Icons ? root.SA.Icons.svg : () => '★';
      const isNewHero = drop.category === 'hero' && drop.hero;
      const isNewSkin = (drop.category === 'skin' || drop.category === 'mythic_skin') && drop.skin;
      const isDup = drop.duplicateConverted || ((drop.category === 'hero' || drop.category === 'skin' || drop.category === 'mythic_skin') && !drop.hero && !drop.skin);

      // ── What exactly did the player get? Big & obvious ──
      let bannerText;   // giant rarity banner
      let artHtml;      // huge visual of the item
      let nameHtml;     // item name in giant letters
      let noteHtml = '';
      let rKey = drop.category in RARITY_STYLE ? drop.category : 'coins';

      if (isNewHero) {
        bannerText = i18n.t('case_got_new_hero');
        artHtml = `<div class="sa-got-art bust">${heroArt(drop.hero)}</div>`;
        nameHtml = `<div class="sa-got-name">${i18n.pick(drop.hero, 'name')}</div>
                    <div class="sa-got-sub">${i18n.pick(drop.hero, 'subtitle')} · ${i18n.t('hero_rarity_' + (drop.hero.rarity || 'common'))}</div>`;
        if (drop.pityTriggered) noteHtml = `<div class="sa-got-note pity">⚡ ${i18n.t('case_pity_triggered')}</div>`;
        rKey = 'hero';
      } else if (isNewSkin) {
        bannerText = drop.category === 'mythic_skin' ? i18n.t('case_got_new_mythic') : i18n.t('case_got_new_skin');
        const skinHero = gameData.heroes.find(h => h.id === drop.skin.heroId);
        artHtml = `<div class="sa-got-art bust">${skinHero ? heroArt(skinHero) : ico('star')}</div>`;
        nameHtml = `<div class="sa-got-name">${i18n.pick(drop.skin, 'name')}</div>
                    <div class="sa-got-sub">${skinHero ? i18n.pick(skinHero, 'name') : ''} · ${i18n.t('hero_rarity_' + (drop.skin.rarity || 'epic'))}</div>`;
        rKey = drop.category === 'mythic_skin' ? 'mythic_skin' : 'skin';
      } else if (isDup) {
        // Duplicate → crystal clear conversion panel
        bannerText = i18n.t('case_already_owned');
        const parts = [];
        if (drop.amount) parts.push(`<span class="sa-got-conv"><b>+${drop.amount}</b>${ico('coin')}</span>`);
        if (drop.bonusPp) parts.push(`<span class="sa-got-conv"><b>+${drop.bonusPp}</b>${ico('bolt')}</span>`);
        artHtml = `<div class="sa-got-art dup">${ico('case')}</div>`;
        nameHtml = `<div class="sa-got-name small">${i18n.t('case_converted_into')}</div>
                    <div class="sa-got-conv-row">${parts.join('<span class="sa-got-plus">+</span>')}</div>`;
        rKey = 'coins';
      } else if (drop.category === 'power_points') {
        bannerText = i18n.t('case_got_pp');
        artHtml = `<div class="sa-got-art big">${ico('bolt')}</div>`;
        nameHtml = `<div class="sa-got-name amount">+${drop.amount}</div>
                    <div class="sa-got-sub">${i18n.t('currency_pp')}</div>`;
        rKey = 'power_points';
      } else {
        bannerText = i18n.t('case_got_coins');
        artHtml = `<div class="sa-got-art big">${ico('coin')}</div>`;
        nameHtml = `<div class="sa-got-name amount">+${drop.amount}</div>
                    <div class="sa-got-sub">${i18n.t('currency_coins')}</div>`;
        rKey = 'coins';
      }

      const rs = RARITY_STYLE[rKey] || RARITY_STYLE.coins;

      if (rewardPanel) {
        rewardPanel.className = `sa-case-reward-panel ${rs.cls}`;
        rewardPanel.innerHTML = `
          <div class="sa-got-banner" style="--band-a:${rs.grad[0]};--band-b:${rs.grad[1]};--band-ink:${rs.ink};">
            ${i18n.t('case_you_got')}
            <b>${bannerText}</b>
          </div>
          ${artHtml}
          ${nameHtml}
          ${noteHtml}
        `;
        spawnRevealConfetti(rs.grad[0], rs.grad[1]);
      }
      if (doneBtn) {
        doneBtn.classList.remove('hidden');
        doneBtn.innerHTML = `${i18n.t('btn_continue')} ▶`;
      }
      spawnUiStars();
      if (isBig && typeof root.SA.AppUIConfetti === 'function') root.SA.AppUIConfetti();
    }

    if (stageEl) stageEl.addEventListener('pointerdown', handleTap);
    // Whole card taps also hasten before reveal (juicier)
    modal.querySelector('.sa-case-card').addEventListener('pointerdown', (e) => {
      if (!revealed && !e.target.closest('button')) handleTap();
    });
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        clearInterval(autoTimer);
        caseModalActive = false;
        modal.remove();
        platform.setSceneState(prevScene === 'case_anim' ? 'lobby' : prevScene);
        if (typeof onComplete === 'function') onComplete();
      });
    }
  }

  const api = { openCaseModal };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.ChestModal = api;
})(typeof window !== 'undefined' ? window : globalThis);
