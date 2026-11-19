/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * AAA Hero-Arena Lobby, Fighter 3D Showcase, Event Slot Picker, HUD & MVP Results Controller
 */
(function (root) {
  'use strict';

  const MODE_THEMES = {
    crystal_rush: { color: '#9c27b0', icon: 'crystal' },
    star_hunt: { color: '#00acc1', icon: 'star' },
    last_hero: { color: '#43a047', icon: 'crown' },
    hot_zone: { color: '#ff3d7f', icon: 'zone' },
    vault_breach: { color: '#fb8c00', icon: 'shield' },
    star_ball: { color: '#1e88e5', icon: 'ball' },
    boss_siege: { color: '#ff1744', icon: 'boss' }
  };

  const AVATAR_OPTIONS = ['crown', 'star', 'bolt', 'crystal', 'pin_fire', 'pin_cool'];
  const PIN_OPTIONS = ['fire', 'cool', 'bolt', 'heart', 'crown', 'star', 'gg', 'thanks'];

  function computeHeroRank(trophies) {
    return Math.min(20, 1 + Math.floor((trophies || 0) / 25));
  }

  function createAppUI({
    save,
    gameData,
    platform,
    audio,
    onStartMatch,
    onSaveChanged,
    onQualityChanged,
    onTriggerEmote,
    onChargePracticeSuper
  }) {
    const i18n = root.SA.i18n;
    const SaveMod = root.SA.Save;
    const ico = root.SA.Icons ? root.SA.Icons.svg : () => '★';

    let activeTab = 'play';
    let heroSubView = 'roster'; // 'roster' | 'detail'
    let heroSortBy = 'trophies'; // 'trophies' | 'power' | 'rarity'
    let selectedLoadoutSlot = 'overdrive'; // 'gadget' | 'talent7' | 'super9' | 'overdrive'
    let previewSkinHeroId = null;
    let previewSkinId = undefined;
    let heroFilterArch = 'all';
    let heroFilterElem = 'all';
    let inspectedHeroId = save.selectedHeroId;
    let turntable = null;
    let podiumTurntable = null;
    let partyChannel = null;
    let adBusy = false;
    let pinTrayOpen = false;
    let lastKillFeedKey = '';

    const lobbyRoot = document.getElementById('saLobbyRoot');
    const matchHud = document.getElementById('saMatchHud');
    const vsOverlay = document.getElementById('saVsOverlay');
    const resultsOverlay = document.getElementById('saResultsOverlay');
    const pauseOverlay = document.getElementById('saPauseOverlay');
    const toastContainer = document.getElementById('saToastContainer');

    // Bind HUD Emote Pin Picker once
    const pinBtnEl = document.getElementById('saPinBtn');
    const pinTrayEl = document.getElementById('saPinTray');
    if (pinBtnEl && pinTrayEl) {
      pinBtnEl.innerHTML = ico('emote_smile');
      pinTrayEl.innerHTML = PIN_OPTIONS.map(p => `
        <button type="button" class="sa-pin-pick-btn" data-pin-id="${p}">${ico('pin_' + p)}</button>
      `).join('');
      pinBtnEl.onclick = (e) => {
        e.stopPropagation();
        uiClickSfx();
        pinTrayOpen = !pinTrayOpen;
        pinTrayEl.classList.toggle('hidden', !pinTrayOpen);
      };
      pinTrayEl.querySelectorAll('[data-pin-id]').forEach(b => {
        b.onclick = (e) => {
          e.stopPropagation();
          uiClickSfx();
          const pid = b.getAttribute('data-pin-id');
          pinTrayOpen = false;
          pinTrayEl.classList.add('hidden');
          if (typeof onTriggerEmote === 'function') onTriggerEmote(pid);
        };
      });
    }

    // ── BATTLE JUICE OVERLAYS (inject once) ──
    let battleOverlaysReady = false;
    let lastHudCombo = 0;
    let lastHudKillCount = 0;
    let lowHpHeartTimer = 0;
    let questLiveBarEl = null;
    function ensureBattleOverlays() {
      if (battleOverlaysReady) return;
      const hud = document.getElementById('saMatchHud');
      if (!hud) return;
      const mk = (cls, id) => { const d=document.createElement('div'); d.className=cls; if(id) d.id=id; hud.appendChild(d); return d; };
      mk('sa-battle-vignette', 'saBattleVignette');
      const hf = mk('sa-hit-flash', 'saHitFlash');
      const heart = mk('sa-lowhp-heart', 'saLowHpHeart'); heart.textContent='♥';
      mk('sa-combo-banner', 'saComboBanner');
      mk('sa-streak-toast', 'saStreakToast');
      const frenzy = mk('sa-frenzy-border', 'saFrenzyBorder');
      const qbar = mk('sa-quest-livebar', 'saQuestLiveBar');
      qbar.innerHTML = '<span id="saQuestLiveText"></span><div class="sa-quest-live-fill"><div id="saQuestLiveFill" style="width:0%"></div></div>';
      questLiveBarEl = qbar;
      battleOverlaysReady = true;
    }
    function triggerBattleHitFlash(isCrit) {
      const el = document.getElementById('saHitFlash');
      if (!el) return;
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
    function showBattleCombo(count) {
      const el = document.getElementById('saComboBanner');
      if (!el) return;
      el.innerHTML = `<div class="sa-combo-count">x${count} КОМБО!</div><div class="sa-combo-label">${count>=3 ? 'РАМПАГА!' : 'ОТЛИЧНО!'}</div>`;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      setTimeout(()=> el.classList.remove('show'), 1600);
    }
    function showStreakToast(text) {
      const el = document.getElementById('saStreakToast');
      if (!el) return;
      el.textContent = text;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      setTimeout(()=> el.classList.remove('show'), 1800);
    }

    const practiceChargeBtn = document.getElementById('saPracticeChargeBtn');
    if (practiceChargeBtn) {
      practiceChargeBtn.onclick = (e) => {
        e.stopPropagation();
        uiClickSfx();
        if (typeof onChargePracticeSuper === 'function') onChargePracticeSuper();
      };
    }

    function disposeTurntable() {
      if (turntable && typeof turntable.dispose === 'function') {
        turntable.dispose();
      }
      turntable = null;
    }

    function disposePodiumTurntable() {
      if (podiumTurntable && typeof podiumTurntable.dispose === 'function') {
        podiumTurntable.dispose();
      }
      podiumTurntable = null;
    }

    function generateRoomCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let out = '';
      for (let i = 0; i < 6; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
      return out;
    }

    function broadcastPartyPresence() {
      if (!partyChannel || !save.party || !save.party.code) return;
      const h = getHeroById(save.selectedHeroId);
      const hSt = save.heroes[h.id] || { level: 1, skinId: null };
      try {
        partyChannel.postMessage({
          type: 'presence',
          senderName: save.playerName,
          heroId: h.id,
          skinId: hSt.skinId || null,
          level: hSt.level || 1
        });
      } catch (_) {}
    }

    function connectPartyRoom(rawCode, silent = false) {
      const clean = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (!clean) return false;
      save.party = save.party || { code: '', slots: [null, null] };
      save.party.code = clean;
      if (partyChannel) {
        try { partyChannel.close(); } catch (_) {}
        partyChannel = null;
      }
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          partyChannel = new BroadcastChannel('sa_party_' + clean);
          partyChannel.onmessage = (ev) => {
            const msg = ev && ev.data;
            if (!msg || msg.senderName === save.playerName) return;
            if (msg.type === 'presence' || msg.type === 'hello') {
              save.party.slots[0] = {
                name: msg.senderName,
                nameRu: msg.senderName,
                nameEn: msg.senderName,
                heroId: msg.heroId,
                skinId: msg.skinId || null,
                level: msg.level || 1,
                personality: 'aggressor',
                isLivePeer: true
              };
              onSaveChanged();
              if (msg.type === 'hello') broadcastPartyPresence();
              if (activeTab === 'play') renderAll();
            }
          };
          partyChannel.postMessage({
            type: 'hello',
            senderName: save.playerName,
            heroId: save.selectedHeroId,
            skinId: (save.heroes[save.selectedHeroId] && save.heroes[save.selectedHeroId].skinId) || null,
            level: (save.heroes[save.selectedHeroId] && save.heroes[save.selectedHeroId].level) || 1
          });
        } catch (_) {}
      }
      onSaveChanged();
      if (!silent) showToast(i18n.t('party_joined_toast', { code: clean }));
      return true;
    }

    function joinPartyFromUrlIfPresent() {
      try {
        const hashMatch = (window.location.hash || '').match(/party=([A-Za-z0-9_-]+)/);
        const searchParams = new URLSearchParams(window.location.search || '');
        const code = (hashMatch && hashMatch[1]) || searchParams.get('party');
        if (code) {
          connectPartyRoom(code, false);
        } else if (save.party && save.party.code) {
          connectPartyRoom(save.party.code, true);
        }
      } catch (_) {}
    }

    function getEquippedTitleText() {
      if (!save.equippedTitleArchId) return '';
      if (save.equippedTitleArchId === 'titan_slayer') {
        return i18n.getLang() === 'ru' ? 'Гроза Титана' : 'Titan Slayer';
      }
      const arch = gameData.balance.archetypes.find(a => a.id === save.equippedTitleArchId);
      if (!arch) return '';
      return i18n.getLang() === 'ru' ? (arch.titleRu || '') : (arch.titleEn || '');
    }

    function uiClickSfx() {
      if (audio && typeof audio.playUiClick === 'function') {
        audio.playUiClick();
      }
    }

    function showToast(msg) {
      if (!toastContainer) return;
      const el = document.createElement('div');
      el.className = 'sa-toast';
      el.textContent = msg;
      toastContainer.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    }

    function getHeroById(id) {
      return gameData.heroes.find(h => h.id === id) || gameData.heroes[0];
    }

    function getArchById(id) {
      return gameData.balance.archetypes.find(a => a.id === id) || gameData.balance.archetypes[0];
    }

    function getElemById(id) {
      return gameData.balance.elements.find(e => e.id === id) || gameData.balance.elements[0];
    }

    function isHeroUpgradeable(hId) {
      const st = save.heroes[hId];
      if (!st || !st.unlocked || st.level >= 9) return false;
      const nextCurve = gameData.balance.levelCurve.find(c => c.level === st.level + 1);
      if (!nextCurve) return false;
      return save.coins >= nextCurve.coins && save.pp >= nextCurve.powerPoints;
    }

    function countUpgradeableHeroes() {
      let c = 0;
      for (const h of gameData.heroes) {
        if (isHeroUpgradeable(h.id)) c += 1;
      }
      return c;
    }

    function getAchievementProgress(ach) {
      if (ach.metric === 'heroesUnlocked') return SaveMod.getUnlockedHeroCount(save);
      if (ach.metric === 'maxHeroLevel') return SaveMod.getMaxHeroLevel(save);
      if (ach.metric === 'totalTrophies') return SaveMod.getTotalTrophies(save);
      return save.stats[ach.metric] || 0;
    }

    function hasClaimableRoad() {
      const total = SaveMod.getTotalTrophies(save);
      return gameData.meta.trophyRoad.some(n => total >= n.trophies && !save.claimedRoad.includes(n.trophies));
    }

    function hasClaimableSeason() {
      return gameData.meta.season.tiers.some(n => save.seasonTokens >= n.tokensRequired && !save.claimedSeason.includes(n.tier));
    }

    function countClaimableQuests() {
      let n = 0;
      if (!save.daily.streakClaimed) n += 1;
      for (const q of save.daily.quests) {
        if (q.progress >= q.target && !q.claimed) n += 1;
      }
      if (save.daily.quests.every(q => q.claimed) && !save.daily.chainBonusClaimed) n += 1;
      for (const a of gameData.meta.achievements) {
        if (getAchievementProgress(a) >= a.target && !save.claimedAchievements.includes(a.id)) n += 1;
      }
      return n;
    }

    function hasClaimableQuests() {
      return countClaimableQuests() > 0;
    }

    function formatQuestLiveText(activeQuest) {
      if (!activeQuest) return null;
      const pool = (gameData && gameData.meta && gameData.meta.dailyQuestTemplates) || [];
      const tpl = pool.find(t => t.id === activeQuest.id);
      const isRu = i18n.getLang() === 'ru';

      // Beautiful concise arcade labels tailored for in-battle HUD pill
      // Arcade Toy quest labels — never show raw IDs like dq_supers_3
      const QUEST_ICONS = {
        dq_supers_3: '★', dq_takedowns_6: '⚔', dq_crystals_8: '♦', dq_wins_2: '🏆', dq_matches_3: '▶'
      };
      const SHORT_LABELS = {
        dq_supers_3: { ru: 'Супер-приёмы', en: 'Super Moves' },
        dq_takedowns_6: { ru: 'Победы над врагами', en: 'Defeat Foes' },
        dq_crystals_8: { ru: 'Кристаллы', en: 'Crystals' },
        dq_wins_2: { ru: 'Победы', en: 'Victories' },
        dq_matches_3: { ru: 'Бои на арене', en: 'Arena Battles' }
      };
      let title = (SHORT_LABELS[activeQuest.id] && SHORT_LABELS[activeQuest.id][isRu ? 'ru' : 'en']) || null;
      let icon = QUEST_ICONS[activeQuest.id] || '◈';
      if (!title && tpl) {
        // Clean fallback: strip technical prefixes, humanize
        const rawName = i18n.pick(tpl, 'name') || '';
        title = rawName.replace(/^dq_\w+:\s*/i,'').replace(/_/g,' ').trim() || (isRu ? 'Задание' : 'Quest');
        // Ensure no raw id leaks
        if (/^dq_/i.test(title)) title = isRu ? 'Задание' : 'Quest';
      }
      if (!title) title = isRu ? 'Задание' : 'Quest';
      const prog = Math.min(activeQuest.progress || 0, activeQuest.target || 1);
      const target = activeQuest.target || 1;
      const isComplete = prog >= target;
      if (isComplete) {
        return {
          title,
          text: `${icon} ${title} — ${isRu ? 'ГОТОВО!' : 'DONE!'}`,
          pct: 100,
          isComplete: true
        };
      }
      return {
        title,
        text: `${icon} ${title} ${prog}/${target}`,
        pct: Math.round((prog / target) * 100),
        isComplete: false
      };
    }

    function renderTopBar() {
      const topBar = document.getElementById('saTopBar');
      if (!topBar) return;
      const totalTrophies = SaveMod.getTotalTrophies(save);
      const lang = i18n.getLang();
      const nextRoadNode = gameData.meta.trophyRoad.find(n => n.trophies > totalTrophies) || gameData.meta.trophyRoad[gameData.meta.trophyRoad.length - 1];
      const nextTarget = nextRoadNode ? nextRoadNode.trophies : 1500;
      const roadPct = Math.min(100, Math.round((totalTrophies / Math.max(1, nextTarget)) * 100));
      const roadReady = hasClaimableRoad();
      const avatarIco = ico(save.avatarId || 'crown') || ico('crown');
      const eqTitle = getEquippedTitleText();

      topBar.innerHTML = `
        <div class="sa-top-left-cluster">
          ${activeTab !== 'play' ? `
            <button class="sa-back-btn" id="saBackToLobbyBtn">◀ ${i18n.t('btn_back')}</button>
          ` : ''}
          <button type="button" class="sa-profile-pill" id="saProfileCardBtn">
            <div class="sa-profile-avatar">${avatarIco}</div>
            <div class="sa-profile-info">
              <div class="sa-profile-name">${save.playerName}</div>
              <div class="sa-muted" style="font-size:10px;color:${eqTitle ? '#ffe033' : ''};">★ ${eqTitle || i18n.t('profile_modal_title')}</div>
            </div>
          </button>
          <button type="button" class="sa-road-mini-bar" id="saRoadShortcutBtn" data-tab="road" title="${i18n.t('nav_road')}">
            <div class="sa-road-mini-fill" style="width:${roadPct}%"></div>
            <span>${ico('trophy')} ${totalTrophies} / ${nextTarget} ${roadReady ? '●' : ''}</span>
          </button>
        </div>

        <div class="sa-currencies">
          <div class="sa-curr-pill pp" title="${i18n.t('currency_pp')}"><span>${ico('bolt')} <b>${save.pp}</b></span></div>
          <div class="sa-curr-pill coins" title="${i18n.t('currency_coins')}"><span>${ico('coin')} <b>${save.coins}</b></span></div>
          <div class="sa-curr-pill cases" id="saTopCaseBtn" title="${i18n.t('currency_cases')}"><span>${ico('case')} <b>${save.cases}</b></span></div>
        </div>

        <div class="sa-top-actions">
          <button class="sa-chip-btn" id="saLangToggleBtn">${lang.toUpperCase()}</button>
          <button class="sa-chip-btn" id="saSettingsBtn">⚙</button>
        </div>
      `;

      const backBtn = document.getElementById('saBackToLobbyBtn');
      if (backBtn) {
        backBtn.onclick = () => {
          uiClickSfx();
          if (activeTab === 'heroes' && heroSubView === 'detail') {
            heroSubView = 'roster';
          } else {
            activeTab = 'play';
          }
          renderAll();
        };
      }

      const roadShort = document.getElementById('saRoadShortcutBtn');
      if (roadShort) {
        roadShort.onclick = (e) => {
          e.stopPropagation();
          uiClickSfx();
          activeTab = 'road';
          renderAll();
        };
      }

      const profBtn = document.getElementById('saProfileCardBtn');
      if (profBtn) {
        profBtn.onclick = () => {
          uiClickSfx();
          openProfileModal();
        };
      }

      const langBtn = document.getElementById('saLangToggleBtn');
      if (langBtn) {
        langBtn.onclick = () => {
          uiClickSfx();
          const nextLang = i18n.getLang() === 'ru' ? 'en' : 'ru';
          i18n.setLang(nextLang);
          save.settings.lang = nextLang;
          if (typeof document !== 'undefined') {
            document.documentElement.lang = nextLang;
            document.title = i18n.t('game_title');
          }
          onSaveChanged();
          renderAll();
        };
      }

      const topCaseBtn = document.getElementById('saTopCaseBtn');
      if (topCaseBtn) {
        topCaseBtn.onclick = () => {
          uiClickSfx();
          if (save.cases > 0) {
            triggerOpenCase();
          } else {
            openGiftsModal();
          }
        };
      }

      const settingsBtn = document.getElementById('saSettingsBtn');
      if (settingsBtn) {
        settingsBtn.onclick = () => {
          uiClickSfx();
          openSettingsModal();
        };
      }
    }

    function renderNavTabs() {
      const nav = document.getElementById('saNavBar');
      if (!nav) return;
      nav.classList.toggle('lobby-mode', activeTab === 'play' || (activeTab === 'heroes' && heroSubView === 'detail'));
      const tabs = [
        { id: 'play', icon: '⚔', label: i18n.t('nav_play'), dot: save.cases > 0 },
        { id: 'heroes', icon: '★', label: `${i18n.t('btn_fighters')} (${SaveMod.getUnlockedHeroCount(save)}/72)`, dot: countUpgradeableHeroes() > 0 },
        { id: 'road', icon: ico('trophy'), label: i18n.t('nav_road'), dot: hasClaimableRoad() },
        { id: 'season', icon: ico('star'), label: i18n.t('nav_season'), dot: hasClaimableSeason() },
        { id: 'quests', icon: '◈', label: i18n.t('nav_quests'), dot: hasClaimableQuests() },
        { id: 'social', icon: ico('ghost'), label: i18n.t('btn_club'), dot: false }
      ];
      nav.innerHTML = tabs.map(tb => `
        <button class="sa-nav-btn ${activeTab === tb.id ? 'active' : ''}" data-tab="${tb.id}">
          <span class="sa-nav-ico">${tb.icon}</span>
          <span class="sa-nav-lbl">${tb.label}</span>
          ${tb.dot ? '<span class="sa-nav-dot"></span>' : ''}
        </button>
      `).join('');

      nav.querySelectorAll('.sa-nav-btn').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          const nextTab = btn.getAttribute('data-tab');
          if (nextTab === 'heroes') heroSubView = 'roster';
          activeTab = nextTab;
          renderAll();
        };
      });
    }

    function triggerOpenCase() {
      if (save.cases <= 0) return;
      root.SA.ChestModal.openCaseModal({
        save,
        gameData,
        platform,
        audio,
        onComplete: () => {
          onSaveChanged();
          renderAll();
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    // NEW RETENTION HELPERS — Wheel, Shop, Streak, Gift, Club, Effects
    // ─────────────────────────────────────────────────────────────
    function spawnTokenFly(amount) {
      if (typeof document === 'undefined') return;
      const el = document.createElement('div');
      el.className = 'sa-token-fly';
      el.textContent = i18n.t('token_earned_anim', { n: amount });
      el.style.left = '50%';
      el.style.top = '48%';
      el.style.transform = 'translate(-50%, -50%)';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 950);
    }

    function triggerScreenShake(intensity = 1) {
      const root = document.getElementById('saLobbyRoot');
      if (!root) return;
      root.classList.remove('sa-shake');
      void root.offsetWidth;
      root.classList.add('sa-shake');
      setTimeout(() => root.classList.remove('sa-shake'), 320);
      if (audio && audio.playPopHit && intensity > 1.2) audio.playPopHit();
    }

    function spawnConfetti(durationMs = 2200) {
      if (typeof document === 'undefined') return;
      const wrap = document.createElement('div');
      wrap.className = 'sa-confetti';
      document.body.appendChild(wrap);
      const colors = ['#ffe033','#ff9100','#00e5ff','#00e676','#e040fb','#ff1744','#38bdf8'];
      const count = 38;
      for (let i=0; i<count; i++) {
        const d = document.createElement('div');
        d.className = 'sa-confetti-piece';
        d.style.left = Math.random()*100 + 'vw';
        d.style.background = colors[Math.floor(Math.random()*colors.length)];
        d.style.transform = 'rotate('+(Math.random()*360)+'deg)';
        d.style.animationDuration = (0.9 + Math.random()*1.0) + 's';
        d.style.animationDelay = (Math.random()*0.4) + 's';
        d.style.opacity = '0.95';
        wrap.appendChild(d);
      }
      setTimeout(() => wrap.remove(), durationMs);
    }

    function openStreakModal() {
      if (document.getElementById('saStreakModal')) return;
      const cal = SaveMod.getStreakCalendar ? SaveMod.getStreakCalendar(save) : [];
      const modal = document.createElement('div');
      modal.className = 'sa-case-overlay';
      modal.id = 'saStreakModal';
      modal.innerHTML = `
        <div class="sa-case-card" style="max-width:560px;">
          <h3>${ico('star')} ${i18n.t('streak_calendar_title')} — ${i18n.t('quests_streak', {days: save.daily.streak})}</h3>
          <p class="sa-muted">${i18n.t('streak_jackpot_hint')}</p>
          <div class="sa-streak-calendar">
            ${cal.map(c => `
              <div class="sa-streak-day ${c.isToday ? 'today' : ''} ${c.claimed ? 'claimed' : ''} ${c.reward.jackpot ? 'jackpot' : ''}">
                <div class="sa-day-num">${i18n.t('streak_day_label', {n: c.day})}</div>
                <div class="sa-day-reward">${c.reward.labelRu ? (i18n.getLang()==='ru'?c.reward.labelRu:c.reward.labelEn) : c.reward.coins+'c'}</div>
                <div class="sa-muted" style="font-size:10px;">${c.reward.coins}${ico('coin')} +${c.reward.pp}⚡ ${c.reward.caseReward ? '+'+c.reward.caseReward+ico('case') : ''}</div>
                ${c.canClaim ? `<button class="sa-btn sa-btn-gold sa-btn-xs" data-claim-day="${c.day}">${i18n.t('streak_claim_today')}</button>` : (c.claimed ? `<span style="color:#00e676;font-size:10px;">${i18n.t('streak_claimed')}</span>` : '<span class="sa-muted">—</span>')}
              </div>
            `).join('')}
          </div>
          <button class="sa-btn sa-btn-secondary sa-btn-sm" id="saCloseStreakBtn">${i18n.t('btn_close')}</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-claim-day]').forEach(b=>{
        b.onclick=()=>{
          uiClickSfx();
          const res = SaveMod.claimStreakDay(save, gameData);
          if(res && res.ok){
            if(audio) audio.playPickup();
            onSaveChanged();
            showToast(i18n.t('toast_streak_claimed', {day: res.reward.day}));
            spawnTokenFly(res.reward.coins);
            modal.remove();
            renderAll();
          }
        };
      });
      const closeBtn = modal.querySelector('#saCloseStreakBtn');
      if(closeBtn) closeBtn.onclick=()=>{ uiClickSfx(); modal.remove(); };
    }

    function openWheelModal() {
      if (document.getElementById('saWheelModal')) return;
      const canSpin = (save.daily.wheelSpinsToday || 0) < 1;
      const modal = document.createElement('div');
      modal.className = 'sa-case-overlay';
      modal.id = 'saWheelModal';
      modal.innerHTML = `
        <div class="sa-case-card" style="max-width:420px;">
          <h3>${ico('star')} ${i18n.t('wheel_title')}</h3>
          <p class="sa-muted">${i18n.t('wheel_desc')}</p>
          <div class="sa-wheel-container" id="saWheelEl">
            <div class="sa-wheel-pointer"></div>
            <div class="sa-wheel-center">★</div>
          </div>
          <div style="margin:8px 0;">
            ${canSpin ? `<button class="sa-btn sa-btn-gold" id="saSpinWheelBtn">${i18n.t('wheel_spin_btn')}</button>` : `<span class="sa-muted">${i18n.t('wheel_daily_limit')}</span>`}
          </div>
          <div class="sa-muted" style="font-size:11px;">${SaveMod.WHEEL_REWARDS ? SaveMod.WHEEL_REWARDS.map(r=>`<span style="color:${r.color}">● ${i18n.getLang()==='ru'?r.labelRu:r.labelEn}</span>`).join(' · ') : ''}</div>
          <button class="sa-btn sa-btn-secondary sa-btn-sm" id="saCloseWheelBtn" style="margin-top:10px;">${i18n.t('btn_close')}</button>
        </div>
      `;
      document.body.appendChild(modal);
      const spinBtn = modal.querySelector('#saSpinWheelBtn');
      if(spinBtn){
        spinBtn.onclick = async ()=>{
          if(adBusy) return;
          uiClickSfx();
          adBusy=true; spinBtn.disabled=true; spinBtn.textContent=i18n.t('wheel_spinning');
          try{
            const res = await platform.showRewardedAd('wheel_spin');
            if(res && res.rewarded){
              const wheelEl = document.getElementById('saWheelEl');
              if(wheelEl) wheelEl.classList.add('sa-wheel-spinning');
              setTimeout(()=>{
                const spinRes = SaveMod.spinWheel(save, gameData, Math.random);
                onSaveChanged();
                showToast(i18n.t('toast_wheel_won', {name: i18n.getLang()==='ru'?spinRes.reward.labelRu:spinRes.reward.labelEn}));
                if(spinRes.reward.type==='coins') spawnTokenFly(spinRes.reward.amount);
                if(audio) audio.playChestReveal(true);
                triggerScreenShake(1.1);
                modal.remove();
                renderAll();
                adBusy=false;
              }, 3200);
            } else { adBusy=false; spinBtn.disabled=false; spinBtn.textContent=i18n.t('wheel_spin_btn'); }
          } catch(e){ adBusy=false; spinBtn.disabled=false; }
        };
      }
      const closeBtn = modal.querySelector('#saCloseWheelBtn');
      if(closeBtn) closeBtn.onclick=()=>{ uiClickSfx(); modal.remove(); };
    }

    function openShopModal() {
      if (document.getElementById('saShopModal')) return;
      const offers = SaveMod.getDailyShopOffers ? SaveMod.getDailyShopOffers(save, gameData) : [];
      const used = save.daily.shopFreeClaimsToday || 0;
      const allClaimed = used >= 3;
      const modal = document.createElement('div');
      modal.className = 'sa-case-overlay';
      modal.id = 'saShopModal';
      modal.innerHTML = `
        <div class="sa-case-card" style="max-width:560px;">
          <h3>${ico('bolt')} ${i18n.t('shop_title')}</h3>
          <p class="sa-muted">${i18n.t('shop_desc')} — ${used}/3</p>
          <div class="sa-shop-grid">
            ${offers.map((o,idx)=>`
              <div class="sa-shop-slot ${used>idx ? 'claimed' : ''}">
                <div class="sa-shop-icon">${ico(o.icon)}</div>
                <div class="sa-shop-lbl">${i18n.getLang()==='ru'?o.labelRu:o.labelEn}</div>
                <div class="sa-muted">${o.type==='coins'?ico('coin'):o.type==='pp'?ico('bolt'):o.type==='tokens'?ico('star'):ico('case')} ${o.amount}</div>
                ${used>idx ? `<span class="sa-muted">${i18n.t('shop_slot_claimed')}</span>` : (allClaimed?`<span class="sa-muted">${i18n.t('shop_daily_limit')}</span>`:`<button class="sa-btn sa-btn-gold sa-btn-xs" data-shop-pick="${idx}">${i18n.t('shop_slot_pick')} ▶</button>`)}
              </div>
            `).join('')}
          </div>
          <button class="sa-btn sa-btn-secondary sa-btn-sm" id="saCloseShopBtn">${i18n.t('btn_close')}</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-shop-pick]').forEach(btn=>{
        btn.onclick=async()=>{
          if(adBusy) return;
          const idx = parseInt(btn.getAttribute('data-shop-pick'),10);
          uiClickSfx();
          adBusy=true; btn.disabled=true;
          try{
            const res = await platform.showRewardedAd('daily_shop_'+idx);
            if(res && res.rewarded){
              const claim = SaveMod.claimShopSlot(save, idx);
              if(claim && claim.ok){
                onSaveChanged();
                showToast(i18n.t('toast_shop_claimed'));
                if(audio) audio.playPickup();
                spawnTokenFly(claim.offer.amount);
                modal.remove();
                renderAll();
              }
            } else { btn.disabled=false; }
          } finally { adBusy=false; }
        };
      });
      const closeBtn = modal.querySelector('#saCloseShopBtn');
      if(closeBtn) closeBtn.onclick=()=>{ uiClickSfx(); modal.remove(); };
    }

    function openClubModal() {
      if (document.getElementById('saClubModal')) return;
      const clubs = SaveMod.CLUB_PRESETS || [];
      const joinedId = save.club && save.club.id;
      const modal = document.createElement('div');
      modal.className = 'sa-case-overlay';
      modal.id = 'saClubModal';
      modal.innerHTML = `
        <div class="sa-case-card" style="max-width:620px;">
          <h3>${ico('party')} ${i18n.t('club_title')}</h3>
          <p class="sa-muted">${i18n.t('club_desc')}</p>
          <div class="sa-club-grid">
            ${clubs.map(c=>`
              <div class="sa-club-card ${joinedId===c.id?'joined':''}" data-club-id="${c.id}">
                <div class="sa-club-emblem" style="background:${c.color}">${ico(c.emblem)}</div>
                <div style="font-weight:900;">${i18n.getLang()==='ru'?c.nameRu:c.nameEn}</div>
                <div class="sa-muted">${i18n.t('club_members', {n: Math.floor(Math.random()*18+12)})}</div>
                <div class="sa-muted">${i18n.t('club_contrib', {n: (save.club.contrib||0)+Math.floor(Math.random()*1200)})}</div>
                ${joinedId===c.id ? `<span class="sa-badge release">${i18n.t('club_joined')}</span>` : `<button class="sa-btn sa-btn-gold sa-btn-xs" data-join-club="${c.id}">${i18n.t('club_join')}</button>`}
              </div>
            `).join('')}
          </div>
          ${joinedId ? `<button class="sa-btn sa-btn-secondary sa-btn-sm" id="saLeaveClubBtn">${i18n.t('club_leave')}</button>` : ''}
          <button class="sa-btn sa-btn-primary sa-btn-sm" id="saCloseClubBtn" style="margin-left:6px;">${i18n.t('btn_close')}</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-join-club]').forEach(btn=>{
        btn.onclick=()=>{
          uiClickSfx();
          const cid = btn.getAttribute('data-join-club');
          const club = clubs.find(c=>c.id===cid);
          if(club){
            save.club.id = club.id;
            save.club.name = i18n.getLang()==='ru'?club.nameRu:club.nameEn;
            save.club.joinedAt = Date.now();
            if(!save.club.contrib) save.club.contrib=0;
            onSaveChanged();
            showToast(i18n.t('toast_club_joined', {club: save.club.name}));
            modal.remove();
            renderAll();
          }
        };
      });
      const leaveBtn = modal.querySelector('#saLeaveClubBtn');
      if(leaveBtn) leaveBtn.onclick=()=>{
        uiClickSfx();
        save.club.id=''; save.club.name=''; save.club.joinedAt=0;
        onSaveChanged();
        modal.remove();
        renderAll();
      };
      const closeBtn = modal.querySelector('#saCloseClubBtn');
      if(closeBtn) closeBtn.onclick=()=>{ uiClickSfx(); modal.remove(); };
    }

    async function handleTimedGift(btnEl) {
      if(adBusy) return;
      if(!SaveMod.canClaimTimedGift(save, Date.now())) return;
      uiClickSfx();
      adBusy=true;
      if(btnEl) btnEl.disabled=true;
      try{
        const res = await platform.showRewardedAd('timed_gift');
        if(res && res.rewarded){
          const claim = SaveMod.claimTimedGift(save, Date.now());
          if(claim && claim.ok){
            onSaveChanged();
            showToast(i18n.t('toast_gift_claimed', {coins: claim.coins}));
            if(audio) audio.playPickup();
            spawnTokenFly(claim.coins);
            triggerScreenShake(0.9);
            renderAll();
          }
        } else if(btnEl) btnEl.disabled=false;
      } finally { adBusy=false; }
    }



    // ─────────────────────────────────────────────────────────────
    // ICONIC HERO-ARENA MAIN LOBBY STAGE
    // ─────────────────────────────────────────────────────────────
    function renderPlayView(container) {
      disposeTurntable();
      const hero = getHeroById(save.selectedHeroId);
      const hState = save.heroes[hero.id] || { level: 1, trophies: 0, skinId: null };
      const arch = getArchById(hero.archetypeId);
      const elem = getElemById(hero.elementId);
      const skin = hState.skinId ? gameData.skins.find(s => s.id === hState.skinId) : null;
      const mode = gameData.balance.modes.find(m => m.id === save.selectedModeId) || gameData.balance.modes[0];
      const mTheme = MODE_THEMES[mode.id] || MODE_THEMES.crystal_rush;
      const activeMaps = root.SA.MatchSim.getActiveMapsForMode(mode.id, gameData);
      const currentMap = activeMaps[0] || gameData.maps.maps[0];
      const rank = computeHeroRank(hState.trophies);

      const maxDailyAds = 3;
      const usedDailyAds = save.daily.rewardedCasesCount !== undefined
        ? save.daily.rewardedCasesCount
        : (save.daily.rewardedCaseClaimed ? maxDailyAds : 0);
      const leftDailyAds = Math.max(0, maxDailyAds - usedDailyAds);

      const unlockedCount = SaveMod.getUnlockedHeroCount(save);
      const upgCount = countUpgradeableHeroes();
      const questReadyCount = countClaimableQuests();
      const winsMod = (save.stats.wins || 0) % 5;
      const winStreak = save.stats.consecutiveWins || 0;
      const streakBonus = SaveMod.computeWinStreakBonus ? SaveMod.computeWinStreakBonus(winStreak) : 0;

      // Resolve 2 Squad Flanking Slots (Party Room slots + Legacy Friend Ghost compatibility)
      const pSlots = (save.party && Array.isArray(save.party.slots)) ? save.party.slots : [null, null];
      const effSlot0 = pSlots[0] || save.activeFriendGhost || null;
      const effSlot1 = pSlots[1] || null;
      const squadResolved = [effSlot0, effSlot1].map(sl => {
        if (!sl || !sl.heroId) return null;
        const sh = getHeroById(sl.heroId);
        const sSkin = sl.skinId ? gameData.skins.find(s => s.id === sl.skinId) : null;
        const sName = sl.name || (i18n.getLang() === 'ru' ? sl.nameRu : sl.nameEn) || i18n.pick(sh, 'name');
        return { hero: sh, skin: sSkin, name: sName, level: sl.level || 1, raw: sl };
      });

      const activeMod = (gameData.balance.modifiers || []).find(m => m.id === save.selectedModifierId);
      const modTag = (activeMod && activeMod.id !== 'none') ? `${i18n.pick(activeMod, 'name')} · ` : '';
      const bossTag = mode.id === 'boss_siege' ? `${i18n.t('boss_tier_label', { tier: save.bossTier || 1 })} · ` : '';

      // Season Pass current progress
      const season = gameData.meta.season;
      const nextTierNode = season.tiers.find(t => save.seasonTokens < t.tokensRequired) || season.tiers[season.tiers.length - 1];
      const curTierNum = Math.max(1, nextTierNode.tier);
      const prevTokens = curTierNum > 1 ? (curTierNum - 1) * 40 : 0;
      const tierSpan = Math.max(1, nextTierNode.tokensRequired - prevTokens);
      const tierPct = Math.min(100, Math.round(((save.seasonTokens - prevTokens) / tierSpan) * 100));

      const wheelReady = (save.daily.wheelSpinsToday || 0) < 1;
      const shopUsed = save.daily.shopFreeClaimsToday || 0;
      const shopReady = shopUsed < 3;
      const giftReady = SaveMod.canClaimTimedGift ? SaveMod.canClaimTimedGift(save, Date.now()) : false;
      const giftMs = SaveMod.getGiftCountdownMs ? SaveMod.getGiftCountdownMs(save, Date.now()) : 0;
      const giftH = Math.floor(giftMs/3600000);
      const giftM = Math.floor((giftMs%3600000)/60000);
      const rotInfo = SaveMod.getMapRotationInfo ? SaveMod.getMapRotationInfo(Date.now()) : {rotDays:0, rotHours:0, rotMins:0};
      const weekendInfo = SaveMod.getWeekendEventInfo ? SaveMod.getWeekendEventInfo(Date.now()) : {isWeekend:false, event:null};
      const masteryForHero = SaveMod.getMasteryState ? SaveMod.getMasteryState(save, hero.id) : {pts:0, nextPts:80, pct:0};
      const streakCal = SaveMod.getStreakCalendar ? SaveMod.getStreakCalendar(save) : [];
      const streakToday = streakCal.find(c=>c.isToday);
      const streakReady = streakToday && streakToday.canClaim;


      container.innerHTML = `
        <div class="sa-stage-screen">
          ${weekendInfo.isWeekend && weekendInfo.event ? `<div class="sa-weekend-banner">★ ${i18n.t('weekend_event_title')} · ${i18n.t('weekend_event_active', {name: i18n.getLang()==='ru'?weekendInfo.event.nameRu:weekendInfo.event.nameEn})}</div>` : ''}
          <div class="sa-rotation-banner"><span>${ico('star')} ${i18n.t('map_rotation_title')}</span><span>${i18n.t('map_rotation_time', {days: rotInfo.rotDays, hours: rotInfo.rotHours, mins: rotInfo.rotMins})}</span></div>
          <div class="sa-daily-badges-row">
            <button class="sa-daily-badge ${streakReady ? 'ready' : ''}" id="saStreakBadgeBtn">${ico('star')} ${i18n.t('streak_calendar_title')} ${streakReady ? '●' : ''}</button>
            <button class="sa-daily-badge ${wheelReady ? 'ready' : ''}" id="saWheelBadgeBtn">${ico('star')} ${i18n.t('wheel_title')} ${wheelReady ? '●' : ''}</button>
            <button class="sa-daily-badge ${shopReady ? 'ready' : ''}" id="saShopBadgeBtn">${ico('bolt')} ${i18n.t('shop_title')} ${shopReady ? ` ${shopUsed}/3` : ' ✓'}</button>
            <button class="sa-daily-badge ${giftReady ? 'ready' : ''}" id="saGiftBadgeBtn">${ico('gift')} ${i18n.t('gift_title')} ${giftReady ? '●' : `${giftH}ч ${giftM}м`}</button>
            <span class="sa-mastery-inline">${ico('mastery')} ${i18n.t('mastery_progress', {cur: masteryForHero.pts, next: masteryForHero.nextPts})} · ${masteryForHero.pct}%</span>
          </div>
          ${save.club && save.club.id ? `<div class="sa-club-mini-bar" style="margin:6px 0;display:flex;align-items:center;gap:8px;background:rgba(6,10,23,0.85);border:1.5px solid #060a17;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:900;"><span>${ico('party')} ${save.club.name || i18n.t('club_title')} · ${i18n.t('club_contrib',{n: save.club.contrib||0})}</span><div style="flex:1;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${Math.min(100, Math.round(((save.club.contrib||0)%500)/5))}%;background:linear-gradient(90deg,#38bdf8,#00e676);"></div></div><span class="sa-muted">${Math.floor((save.club.contrib||0)/500)}/5 lvl</span></div>` : ''}
          <div class="sa-stage-middle">
            <!-- Left Vertical Arcade Action Dock -->
            <div class="sa-left-dock">
              <button class="sa-dock-btn fighters" data-tab="heroes" id="saDockHeroesBtn">
                <span class="sa-dock-ico">${ico('sword')}</span>
                <div>
                  <div>${i18n.t('btn_fighters')}</div>
                  <span class="sa-dock-sub">${unlockedCount} / 72</span>
                </div>
                ${upgCount > 0 ? `<span class="sa-dock-badge">▲ ${upgCount}</span>` : ''}
              </button>

              <button class="sa-dock-btn gifts" id="saGiftsDockBtn">
                <span class="sa-dock-ico">${ico('gift')}</span>
                <div>
                  <div>${i18n.t('btn_gifts')}</div>
                  <span class="sa-dock-sub">${save.cases > 0 ? `${save.cases} ★` : `${leftDailyAds}/${maxDailyAds} ▶`}</span>
                </div>
                ${(save.cases > 0 || !save.daily.streakClaimed) ? `<span class="sa-dock-badge">!</span>` : ''}
              </button>

              <button class="sa-dock-btn quests" data-tab="quests" id="saDockQuestsBtn">
                <span class="sa-dock-ico">${ico('target')}</span>
                <div>
                  <div>${i18n.t('nav_quests')}</div>
                  <span class="sa-dock-sub">${i18n.t('quests_streak', { days: save.daily.streak })}</span>
                </div>
                ${questReadyCount > 0 ? `<span class="sa-dock-badge">${questReadyCount}</span>` : ''}
              </button>

              <button class="sa-dock-btn club" id="saPartyDockBtn">
                <span class="sa-dock-ico">${ico('party')}</span>
                <div>
                  <div>${i18n.t('btn_party')}</div>
                  <span class="sa-dock-sub">${(save.party && save.party.code) ? ('#' + save.party.code) : i18n.t('party_add_ally')}</span>
                </div>
                ${(squadResolved[0] || squadResolved[1]) ? `<span class="sa-dock-badge">${(squadResolved[0] ? 1 : 0) + (squadResolved[1] ? 1 : 0) + 1}/3</span>` : ''}
              </button>
            </div>

            <!-- Center Interactive 3-Pedestal Squad Stage -->
            <div class="sa-center-stage">
              <div class="sa-hero-overhead">
                <span class="sa-rank-crest">${ico('trophy')} ${i18n.t('hero_rank_badge', { rank })} · ${hState.trophies}</span>
                <span class="sa-power-pill">⚡ ${i18n.t('hero_power_badge', { lv: hState.level })}</span>
                <span class="sa-rarity-tag ${hero.rarity}">${i18n.t('hero_rarity_' + hero.rarity)}</span>
                ${streakBonus > 0 ? `<span class="sa-streak-pill">${ico('flame')} ${i18n.t('streak_badge', { count: winStreak, bonus: streakBonus })}</span>` : ''}
              </div>

              <div class="sa-turntable-wrap sa-squad-stage-wrap">
                <button type="button" class="sa-pedestal-slot left ${squadResolved[0] ? 'filled' : ''}" id="saSquadSlotLeftBtn">
                  ${squadResolved[0] ? `★ ${squadResolved[0].name}` : i18n.t('party_add_ally')}
                </button>
                <canvas id="saTurntableCanvas" width="420" height="250"></canvas>
                <button type="button" class="sa-pedestal-slot right ${squadResolved[1] ? 'filled' : ''}" id="saSquadSlotRightBtn">
                  ${squadResolved[1] ? `★ ${squadResolved[1].name}` : i18n.t('party_add_ally')}
                </button>
              </div>

              <h2 class="sa-stage-hero-name">${i18n.pick(hero, 'name')}</h2>
              <div class="sa-stage-hero-sub">${i18n.pick(arch, 'name')} · ${i18n.pick(elem, 'name')} · ${ico('overdrive')} ${i18n.pick(arch, 'overdriveName')}</div>

              <div class="sa-stage-quick-btns">
                <button class="sa-btn ${isHeroUpgradeable(hero.id) ? 'sa-btn-green' : 'sa-btn-primary'} sa-btn-sm" id="saInspectActiveHeroBtn">
                  ${isHeroUpgradeable(hero.id) ? '▲ ' + i18n.t('upgrade_ready_tag') : '★ ' + i18n.t('btn_upgrade')}
                </button>
                <button class="sa-btn sa-btn-accent sa-btn-sm" id="saTryHeroLobbyBtn">◎ ${i18n.t('btn_try_hero')}</button>
                <button class="sa-btn sa-btn-secondary sa-btn-sm" id="saTutorialBtn">▶ ${i18n.t('btn_tutorial')}</button>
              </div>
            </div>

            <!-- Right Quick Capsule Pod -->
            <div class="sa-right-pod">
              <div class="sa-capsule-pod">
                <div class="sa-pod-title">${ico('case')} ${i18n.t('case_modal_title')}</div>
                <button class="sa-btn sa-btn-gold sa-btn-sm" id="saOpenCaseLobbyBtn" ${save.cases <= 0 ? 'disabled' : ''}>
                  ${ico('case')} ${i18n.t('btn_open_case')} (${save.cases})
                </button>
                <button class="sa-btn sa-btn-accent sa-btn-sm" id="saDailyRewardedBtn" ${leftDailyAds <= 0 ? 'disabled' : ''}>
                  ▶ ${leftDailyAds <= 0 ? i18n.t('btn_daily_claimed') : i18n.t('btn_free_daily_case_n', { left: leftDailyAds, max: maxDailyAds })}
                </button>
                <div class="sa-wins-track" title="${i18n.t('wins_case_progress', { cur: winsMod })}">
                  <div class="sa-wins-fill" style="width:${(winsMod / 5) * 100}%"></div>
                  <span class="sa-wins-lbl">${i18n.t('wins_case_progress', { cur: winsMod })}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Signature Hero-Arena Bottom Row: Star Pass Left + Event Slot & Giant PLAY Right -->
          <div class="sa-stage-bottom">
            <button class="sa-pass-banner" data-tab="season" id="saSeasonPassBtn">
              <div class="sa-pass-emblem">${ico('star')}</div>
              <div class="sa-pass-body">
                <div class="sa-pass-title">${i18n.t('btn_pass_title')} · ${i18n.t('season_tier_label', { tier: curTierNum, tokens: nextTierNode.tokensRequired })}</div>
                <div class="sa-pass-bar">
                  <div class="sa-pass-fill" style="width:${tierPct}%"></div>
                  <span>★ ${save.seasonTokens} / ${nextTierNode.tokensRequired}</span>
                </div>
              </div>
              ${hasClaimableSeason() ? `<span class="sa-dock-badge">!</span>` : ''}
            </button>

            <div class="sa-play-cluster">
              <button class="sa-event-slot-btn" id="saEventSlotBtn" style="--mode-col:${mTheme.color}">
                <div class="sa-event-slot-ico">${ico(mTheme.icon)}</div>
                <div class="sa-event-slot-meta">
                  <div class="sa-event-slot-lbl">${save.hardcoreEnabled ? '⚡ ' + i18n.t('hardcore_label') + ' · ' : ''}${bossTag}${modTag}${i18n.t('event_slot_change')} ▾</div>
                  <div class="sa-event-slot-name">${i18n.pick(mode, 'name')}</div>
                  <div class="sa-event-slot-desc">${i18n.pick(mode, 'desc')}</div>
                  <div class="sa-event-slot-map">📍 ${i18n.pick(currentMap, 'name')}</div>
                </div>
              </button>

              <button class="sa-btn sa-btn-battle" id="saBattleBtn">⚔ ${i18n.t('btn_play_big')}</button>
            </div>
          </div>
        </div>
      `;

      const ttCanvas = document.getElementById('saTurntableCanvas');
      if (ttCanvas && root.SA.Renderer3D) {
        turntable = root.SA.Renderer3D.createHeroTurntable(ttCanvas);
        if (turntable) {
          if (typeof turntable.setSquad === 'function') {
            turntable.setSquad(hero, skin, squadResolved);
          } else {
            turntable.setHero(hero, skin);
          }
        }
      }

      broadcastPartyPresence();

      const openPartyHandler = (slotIdx) => {
        uiClickSfx();
        openPartyModal(slotIdx);
      };
      const partyDockBtn = document.getElementById('saPartyDockBtn');
      if (partyDockBtn) partyDockBtn.onclick = () => openPartyHandler(0);
      const slotL = document.getElementById('saSquadSlotLeftBtn');
      if (slotL) slotL.onclick = () => openPartyHandler(0);
      const slotR = document.getElementById('saSquadSlotRightBtn');
      if (slotR) slotR.onclick = () => openPartyHandler(1);

      container.querySelectorAll('[data-tab]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          const nextTab = btn.getAttribute('data-tab');
          if (nextTab === 'heroes') heroSubView = 'roster';
          activeTab = nextTab;
          renderAll();
        };
      });

      const giftsBtn = document.getElementById('saGiftsDockBtn');
      if (giftsBtn) {
        giftsBtn.onclick = () => {
          uiClickSfx();
          openGiftsModal();
        };
      }

      const inspectHeroBtn = document.getElementById('saInspectActiveHeroBtn');
      if (inspectHeroBtn) {
        inspectHeroBtn.onclick = () => {
          uiClickSfx();
          inspectedHeroId = hero.id;
          previewSkinHeroId = hero.id;
          previewSkinId = undefined;
          heroSubView = 'detail';
          activeTab = 'heroes';
          renderAll();
        };
      }
      const heroTitleEl = container.querySelector('.sa-stage-hero-name');
      if (heroTitleEl) {
        heroTitleEl.style.cursor = 'pointer';
        heroTitleEl.onclick = () => {
          uiClickSfx();
          inspectedHeroId = hero.id;
          previewSkinHeroId = hero.id;
          previewSkinId = undefined;
          heroSubView = 'detail';
          activeTab = 'heroes';
          renderAll();
        };
      }

      const tryLobbyBtn = document.getElementById('saTryHeroLobbyBtn');
      if (tryLobbyBtn) {
        tryLobbyBtn.onclick = () => {
          uiClickSfx();
          onStartMatch('practice', null, hero.id, hState.skinId, hState.level);
        };
      }

      const tutBtn = document.getElementById('saTutorialBtn');
      if (tutBtn) {
        tutBtn.onclick = () => {
          uiClickSfx();
          onStartMatch('tutorial', null);
        };
      }

      const openCaseBtn = document.getElementById('saOpenCaseLobbyBtn');
      if (openCaseBtn) openCaseBtn.onclick = () => { uiClickSfx(); triggerOpenCase(); };

      const dailyBtn = document.getElementById('saDailyRewardedBtn');
      if (dailyBtn) {
        dailyBtn.onclick = () => handleDailyRewardedCase(dailyBtn);
      }

      const eventSlotBtn = document.getElementById('saEventSlotBtn');
      if (eventSlotBtn) {
        eventSlotBtn.onclick = () => {
          uiClickSfx();
          openEventPickerModal();
        };
      }

      const battleBtn = document.getElementById('saBattleBtn');
      if (battleBtn) {
        battleBtn.onclick = () => {
          uiClickSfx();
          onStartMatch(mode.id, currentMap.id);
        };
      }
      const streakBadgeBtn = document.getElementById('saStreakBadgeBtn');
      if (streakBadgeBtn) streakBadgeBtn.onclick = () => { uiClickSfx(); openStreakModal(); };
      const wheelBadgeBtn = document.getElementById('saWheelBadgeBtn');
      if (wheelBadgeBtn) wheelBadgeBtn.onclick = () => { uiClickSfx(); openWheelModal(); };
      const shopBadgeBtn = document.getElementById('saShopBadgeBtn');
      if (shopBadgeBtn) shopBadgeBtn.onclick = () => { uiClickSfx(); openShopModal(); };
      const giftBadgeBtn = document.getElementById('saGiftBadgeBtn');
      if (giftBadgeBtn) giftBadgeBtn.onclick = () => { if (SaveMod.canClaimTimedGift(save, Date.now())) handleTimedGift(giftBadgeBtn); else showToast(i18n.t('gift_wait', {h: giftH, m: giftM})); };
    }

    async function handleDailyRewardedCase(btnEl) {
      const curUsed = save.daily.rewardedCasesCount || 0;
      if (adBusy || curUsed >= 3 || save.daily.rewardedCaseClaimed) return;
      uiClickSfx();
      adBusy = true;
      if (btnEl) btnEl.disabled = true;
      try {
        const res = await platform.showRewardedAd('daily_free_case');
        if (res && res.rewarded) {
          save.daily.rewardedCasesCount = curUsed + 1;
          save.daily.rewardedCaseClaimed = save.daily.rewardedCasesCount >= 3;
          SaveMod.addCurrency(save, 'cases', 1, 'Daily Rewarded Ad Case');
          onSaveChanged();
          const gModal = document.getElementById('saGiftsModal');
          if (gModal) gModal.remove();
          renderAll();
          triggerOpenCase();
        } else if (btnEl) {
          btnEl.disabled = false;
        }
      } finally {
        adBusy = false;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PARTY ROOM BY CODE/LINK + HYBRID SQUAD BUILDER MODAL
    // ─────────────────────────────────────────────────────────────
    function openPartyModal(targetSlot = 0) {
      const existing = document.getElementById('saPartyModal');
      if (existing) existing.remove();

      save.party = save.party || { code: '', slots: [null, null] };
      if (!save.party.code) {
        connectPartyRoom(generateRoomCode(), true);
      }

      const code = save.party.code;
      const shareUrl = `${window.location.origin}${window.location.pathname}#party=${code}`;
      const slots = save.party.slots;
      const presets = (gameData.meta && gameData.meta.presetFriendGhosts) || [];

      const renderSlotCard = (idx) => {
        const sl = slots[idx] || (idx === 0 ? save.activeFriendGhost : null);
        if (!sl || !sl.heroId) {
          return `
            <div class="sa-party-slot-card empty">
              <div style="font-weight:900;color:#7dd3fc;">#${idx + 2} · ${i18n.t('party_slot_empty')}</div>
              <button class="sa-btn sa-btn-accent sa-btn-sm" data-fill-slot="${idx}">+ ${i18n.t('party_add_ally')}</button>
            </div>
          `;
        }
        const h = getHeroById(sl.heroId);
        const nm = sl.name || (i18n.getLang() === 'ru' ? sl.nameRu : sl.nameEn) || i18n.pick(h, 'name');
        return `
          <div class="sa-party-slot-card filled">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="sa-mini-crest" style="background:${h.palette.primary};padding:0;overflow:hidden;">${renderHeroBustSvg(h)}</span>
              <div style="text-align:left;">
                <div style="font-weight:900;">${nm} ${sl.isLivePeer ? '<span class="sa-badge release">LIVE</span>' : ''}</div>
                <div class="sa-muted">${i18n.pick(h, 'name')} · ${i18n.t('hero_power_badge', { lv: sl.level || 5 })}</div>
              </div>
            </div>
            <button class="sa-btn sa-btn-secondary sa-btn-sm" data-clear-slot="${idx}">${i18n.t('party_clear_slot')}</button>
          </div>
        `;
      };

      const modal = document.createElement('div');
      modal.className = 'sa-case-overlay';
      modal.id = 'saPartyModal';
      modal.innerHTML = `
        <div class="sa-events-modal-card" style="max-width:600px;">
          <h2 style="margin:0;">${ico('party')} ${i18n.t('party_modal_title')}</h2>
          <p class="sa-muted" style="margin:0;">${i18n.t('party_modal_desc')}</p>

          <div class="sa-party-code-row">
            <div>
              <div class="sa-muted" style="font-size:11px;">${i18n.t('party_code_label')}</div>
              <div class="sa-party-code-val">#${code}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="sa-btn sa-btn-gold sa-btn-sm" id="saCopyPartyLinkBtn">${i18n.t('party_copy_link')}</button>
              <button class="sa-btn sa-btn-secondary sa-btn-sm" id="saNewPartyCodeBtn">↻</button>
            </div>
          </div>

          <div style="display:flex;gap:6px;align-items:center;">
            <input type="text" id="saJoinPartyInput" class="sa-input" style="flex:1;" maxlength="10" placeholder="${i18n.t('party_join_placeholder')}" />
            <button class="sa-btn sa-btn-primary sa-btn-sm" id="saJoinPartyBtn">${i18n.t('party_join_btn')}</button>
          </div>

          <div class="sa-party-slots-grid">
            ${renderSlotCard(0)}
            ${renderSlotCard(1)}
          </div>

          <div style="text-align:left;">
            <div class="sa-muted" style="margin-bottom:6px;">★ Быстрый призыв союзника в слот #${targetSlot + 2}:</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${presets.map((pr, idx) => {
                const dec = SaveMod.decodeFriendGhost(pr.code, gameData);
                const lbl = dec ? (i18n.getLang() === 'ru' ? dec.nameRu : dec.nameEn) : `Ally ${idx + 1}`;
                return `<button class="sa-chip-btn" data-pick-preset="${pr.code}">+ ${lbl}</button>`;
              }).join('')}
            </div>
          </div>

          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button class="sa-btn sa-btn-secondary sa-btn-sm" id="saLeavePartyBtn">${i18n.t('party_leave')}</button>
            <button class="sa-btn sa-btn-primary" id="saClosePartyBtn">${i18n.t('btn_close')}</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#saCopyPartyLinkBtn').onclick = () => {
        uiClickSfx();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).catch(() => {});
        }
        try { window.location.hash = `party=${code}`; } catch (_) {}
        showToast(i18n.t('toast_copied'));
      };

      modal.querySelector('#saNewPartyCodeBtn').onclick = () => {
        uiClickSfx();
        connectPartyRoom(generateRoomCode(), false);
        openPartyModal(targetSlot);
      };

      modal.querySelector('#saJoinPartyBtn').onclick = () => {
        uiClickSfx();
        const val = modal.querySelector('#saJoinPartyInput').value;
        if (connectPartyRoom(val, false)) {
          try { window.location.hash = `party=${save.party.code}`; } catch (_) {}
          openPartyModal(targetSlot);
          renderAll();
        }
      };

      modal.querySelectorAll('[data-fill-slot]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          const idx = parseInt(btn.getAttribute('data-fill-slot'), 10) || 0;
          const pr = presets[idx % Math.max(1, presets.length)];
          const dec = pr ? SaveMod.decodeFriendGhost(pr.code, gameData) : null;
          if (dec) {
            save.party.slots[idx] = dec;
            onSaveChanged();
            openPartyModal(idx);
            renderAll();
          }
        };
      });

      modal.querySelectorAll('[data-clear-slot]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          const idx = parseInt(btn.getAttribute('data-clear-slot'), 10) || 0;
          save.party.slots[idx] = null;
          if (idx === 0) save.activeFriendGhost = null;
          onSaveChanged();
          openPartyModal(idx);
          renderAll();
        };
      });

      modal.querySelectorAll('[data-pick-preset]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          const dec = SaveMod.decodeFriendGhost(btn.getAttribute('data-pick-preset'), gameData);
          if (dec) {
            const slotToUse = !save.party.slots[0] ? 0 : (!save.party.slots[1] ? 1 : targetSlot);
            save.party.slots[slotToUse] = dec;
            onSaveChanged();
            openPartyModal(slotToUse);
            renderAll();
          }
        };
      });

      modal.querySelector('#saLeavePartyBtn').onclick = () => {
        uiClickSfx();
        if (partyChannel) {
          try { partyChannel.close(); } catch (_) {}
          partyChannel = null;
        }
        save.party = { code: '', slots: [null, null] };
        save.activeFriendGhost = null;
        try { if ((window.location.hash || '').includes('party=')) window.location.hash = ''; } catch (_) {}
        onSaveChanged();
        modal.remove();
        renderAll();
      };

      modal.querySelector('#saClosePartyBtn').onclick = () => {
        uiClickSfx();
        modal.remove();
      };
    }

    // ─────────────────────────────────────────────────────────────
    // EVENT PICKER MODAL (7 Game Modes + Arena Modifiers + Boss Tiers + Hardcore x2)
    // ─────────────────────────────────────────────────────────────
    function openEventPickerModal() {
      if (document.getElementById('saEventModal')) return;
      const totalTrophies = SaveMod.getTotalTrophies(save);
      const msInWeek = 7 * 24 * 3600 * 1000;
      const remMs = msInWeek - (Date.now() % msInWeek);
      const rotDays = Math.floor(remMs / 86400000);
      const rotHours = Math.floor((remMs % 86400000) / 3600000);
      const modifiers = gameData.balance.modifiers || [];
      const bossTiers = gameData.balance.bossTiers || [];
      const maxUnlockedBossTier = Math.min(4, (save.bossMaxCleared || 0) + 1);

      const modal = document.createElement('div');
      modal.className = 'sa-case-overlay';
      modal.id = 'saEventModal';
      modal.innerHTML = `
        <div class="sa-events-modal-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <h2 style="margin:0;">⚔ ${i18n.t('event_select_header')}</h2>
            <span class="sa-muted">${i18n.t('map_rotation_note', { days: rotDays, hours: rotHours })}</span>
          </div>

          <div class="sa-events-grid">
            ${gameData.balance.modes.map(m => {
              const gated = totalTrophies < m.unlockTrophies && m.status === 'release';
              const th = MODE_THEMES[m.id] || MODE_THEMES.crystal_rush;
              const mapsForM = root.SA.MatchSim.getActiveMapsForMode(m.id, gameData);
              const map0 = mapsForM[0] || gameData.maps.maps[0];
              const badgeTxt = gated
                ? `${ico('trophy')}${m.unlockTrophies}`
                : (m.id === 'boss_siege' ? 'КООП 3×1' : (m.teamSize === 1 ? 'СОЛО' : '3v3'));
              return `
                <button class="sa-event-card ${m.id === save.selectedModeId ? 'selected' : ''} ${gated ? 'locked' : ''}" data-pick-mode="${m.id}" style="--mode-col:${th.color}">
                  <div class="sa-event-card-head">
                    <span>${ico(th.icon)} ${i18n.pick(m, 'name')}</span>
                    <span class="sa-badge ${m.status === 'release' ? 'release' : 'liveops'}">${badgeTxt}</span>
                  </div>
                  <div class="sa-event-card-body">
                    <div style="font-weight:900;color:#ffe033;margin-bottom:4px;">◈ ${i18n.pick(map0, 'name')}</div>
                    <div class="sa-muted">${i18n.pick(m, 'desc')}</div>
                  </div>
                </button>
              `;
            }).join('')}
          </div>

          ${bossTiers.length ? `
            <div class="sa-mod-box">
              <div style="font-weight:900;font-size:12px;color:#ff8a80;margin-bottom:6px;">${ico('boss')} ${i18n.t('boss_name')} — Сложность Осады:</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${bossTiers.map(bt => {
                  const locked = bt.tier > maxUnlockedBossTier;
                  return `<button type="button" class="sa-chip-btn ${(save.bossTier || 1) === bt.tier ? 'active' : ''}" data-boss-tier="${bt.tier}" ${locked ? 'disabled' : ''}>
                    ${locked ? ico('lock') : '★'} ${i18n.pick(bt, 'name')} (HP ${bt.hp})
                  </button>`;
                }).join('')}
              </div>
            </div>
          ` : ''}

          ${modifiers.length ? `
            <div class="sa-mod-box">
              <div style="font-weight:900;font-size:12px;color:#7dd3fc;margin-bottom:6px;">${ico('meteor')} ${i18n.t('modifier_section_title')}:</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${modifiers.map(md => `
                  <button type="button" class="sa-chip-btn ${(save.selectedModifierId || 'none') === md.id ? 'active' : ''}" data-pick-mod="${md.id}" title="${i18n.pick(md, 'desc')}">
                    ${i18n.pick(md, 'name')}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <label class="sa-hardcore-row" style="margin-bottom:4px;">
            <input type="checkbox" id="saHardcoreChk" ${save.hardcoreEnabled ? 'checked' : ''} />
            <div style="text-align:left;">
              <strong>⚡ ${i18n.t('hardcore_label')}</strong>
              <div class="sa-muted">${i18n.t('hardcore_desc')}</div>
            </div>
          </label>

          <button class="sa-btn sa-btn-primary" id="saCloseEventsBtn">${i18n.t('btn_close')}</button>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelectorAll('[data-pick-mode]').forEach(card => {
        card.onclick = () => {
          uiClickSfx();
          const mId = card.getAttribute('data-pick-mode');
          const mCfg = gameData.balance.modes.find(x => x.id === mId);
          if (mCfg && mCfg.status === 'release' && totalTrophies < mCfg.unlockTrophies) {
            showToast(i18n.t('mode_locked_trophies', { trophies: mCfg.unlockTrophies }));
            return;
          }
          save.selectedModeId = mId;
          onSaveChanged();
          modal.remove();
          renderAll();
        };
      });

      modal.querySelectorAll('[data-boss-tier]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          save.bossTier = parseInt(btn.getAttribute('data-boss-tier'), 10) || 1;
          save.selectedModeId = 'boss_siege';
          onSaveChanged();
          modal.querySelectorAll('[data-boss-tier]').forEach(b => b.classList.toggle('active', b === btn));
          renderAll();
        };
      });

      modal.querySelectorAll('[data-pick-mod]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          save.selectedModifierId = btn.getAttribute('data-pick-mod') || 'none';
          onSaveChanged();
          modal.querySelectorAll('[data-pick-mod]').forEach(b => b.classList.toggle('active', b === btn));
          renderAll();
        };
      });

      const hcChk = modal.querySelector('#saHardcoreChk');
      if (hcChk) {
        hcChk.onchange = () => {
          uiClickSfx();
          save.hardcoreEnabled = hcChk.checked;
          onSaveChanged();
          renderPlayView(document.getElementById('saViewContent'));
        };
      }

      const closeBtn = modal.querySelector('#saCloseEventsBtn');
      if (closeBtn) {
        closeBtn.onclick = () => {
          uiClickSfx();
          modal.remove();
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PROFILE MODAL (Edit Callsign + Choose Emblem + Mastery Titles + Career Stats)
    // ─────────────────────────────────────────────────────────────
    function openProfileModal() {
      if (document.getElementById('saProfileModal')) return;
      const totalTrophies = SaveMod.getTotalTrophies(save);
      let chosenAvatar = save.avatarId || 'crown';
      let chosenTitleArch = save.equippedTitleArchId || null;
      const unlockedTitles = SaveMod.getUnlockedTitles ? SaveMod.getUnlockedTitles(save, gameData) : [];

      const modal = document.createElement('div');
      modal.className = 'sa-case-overlay';
      modal.id = 'saProfileModal';
      modal.innerHTML = `
        <div class="sa-case-card">
          <h3>${ico(chosenAvatar)} ${i18n.t('profile_modal_title')}</h3>
          <div style="text-align:left;margin:10px 0;">
            <div class="sa-muted" style="margin-bottom:4px;">${i18n.t('profile_name_label')}</div>
            <input type="text" id="saProfileNameInput" class="sa-input" style="width:100%;" maxlength="20" value="${save.playerName.replace(/"/g, '&quot;')}" />
          </div>
          <div style="text-align:left;margin:10px 0;">
            <div class="sa-muted" style="margin-bottom:6px;">${i18n.t('profile_avatar_label')}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;" id="saAvatarPickerRow">
              ${AVATAR_OPTIONS.map(av => `
                <button type="button" class="sa-chip-btn ${chosenAvatar === av ? 'active' : ''}" data-av="${av}">${ico(av)}</button>
              `).join('')}
            </div>
          </div>

          <div style="text-align:left;margin:10px 0;">
            <div class="sa-muted" style="margin-bottom:6px;">${ico('mastery')} ${i18n.t('profile_title_label')}</div>
            <select id="saProfileTitleSelect" class="sa-select" style="width:100%;">
              <option value="">${i18n.t('profile_title_none')}</option>
              ${unlockedTitles.map(ut => `
                <option value="${ut.archId}" ${chosenTitleArch === ut.archId ? 'selected' : ''}>★ ${i18n.getLang() === 'ru' ? ut.titleRu : ut.titleEn}</option>
              `).join('')}
            </select>
          </div>

          <div class="sa-stat-grid" style="margin:12px 0;">
            <div><span>${i18n.t('profile_stats_max_trophies')}:</span> <b>${totalTrophies}</b></div>
            <div><span>${i18n.t('profile_stats_wins')}:</span> <b>${save.stats.wins}</b></div>
            <div><span>${i18n.t('profile_stats_takedowns')}:</span> <b>${save.stats.takedowns}</b></div>
            <div><span>${ico('flame')} Макс. серия:</span> <b>${save.stats.maxWinStreak || 0}</b></div>
            <div><span>${ico('boss')} Мега-Титаны:</span> <b>${save.stats.bossesDefeated || 0}</b></div>
            <div><span>${i18n.t('btn_fighters')}:</span> <b>${SaveMod.getUnlockedHeroCount(save)} / 72</b></div>
          </div>

          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button class="sa-btn sa-btn-gold sa-btn-sm" id="saProfOpenRoadBtn">${ico('trophy')} ${i18n.t('profile_open_road_btn')}</button>
            <button class="sa-btn sa-btn-green sa-btn-sm" id="saProfSaveBtn">${i18n.t('profile_save_btn')}</button>
            <button class="sa-btn sa-btn-secondary sa-btn-sm" id="saProfCloseBtn">${i18n.t('btn_close')}</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelectorAll('[data-av]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          chosenAvatar = btn.getAttribute('data-av');
          modal.querySelectorAll('[data-av]').forEach(b => b.classList.toggle('active', b === btn));
        };
      });

      const roadBtn = modal.querySelector('#saProfOpenRoadBtn');
      if (roadBtn) {
        roadBtn.onclick = () => {
          uiClickSfx();
          modal.remove();
          activeTab = 'road';
          renderAll();
        };
      }

      const saveBtn = modal.querySelector('#saProfSaveBtn');
      if (saveBtn) {
        saveBtn.onclick = () => {
          uiClickSfx();
          const inp = modal.querySelector('#saProfileNameInput');
          if (inp && inp.value.trim()) {
            save.playerName = inp.value.trim().slice(0, 20);
          }
          const tSel = modal.querySelector('#saProfileTitleSelect');
          save.equippedTitleArchId = (tSel && tSel.value) ? tSel.value : null;
          save.avatarId = chosenAvatar;
          onSaveChanged();
          modal.remove();
          showToast(i18n.t('toast_profile_saved'));
          renderAll();
        };
      }

      const closeBtn = modal.querySelector('#saProfCloseBtn');
      if (closeBtn) closeBtn.onclick = () => { uiClickSfx(); modal.remove(); };
    }

    // ─────────────────────────────────────────────────────────────
    // DAILY GIFTS & CAPSULES SHOWCASE MODAL (100% Free-to-Play, Zero IAP)
    // ─────────────────────────────────────────────────────────────
    function openGiftsModal() {
      if (document.getElementById('saGiftsModal')) return;
      const streakCoins = Math.min(200, 40 + (save.daily.streak || 1) * 15);
      const streakPp = 15;
      const maxDailyAds = 3;
      const usedDailyAds = save.daily.rewardedCasesCount || 0;
      const leftDailyAds = Math.max(0, maxDailyAds - usedDailyAds);

      const modal = document.createElement('div');
      modal.className = 'sa-case-overlay';
      modal.id = 'saGiftsModal';
      modal.innerHTML = `
        <div class="sa-case-card">
          <h3>${ico('gift')} ${i18n.t('gifts_modal_title')}</h3>
          <p class="sa-muted">${i18n.t('no_iap_notice')}</p>

          <div class="sa-chain-box" style="margin:10px 0;">
            <span>★ ${i18n.t('streak_login_box', { days: save.daily.streak, coins: streakCoins, pp: streakPp })}</span>
            ${!save.daily.streakClaimed
              ? `<button class="sa-btn sa-btn-green sa-btn-sm" id="saGiftStreakClaimBtn">${i18n.t('btn_claim')}</button>`
              : `<span class="sa-muted">${i18n.t('btn_claimed')}</span>`}
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;margin:12px 0;">
            <button class="sa-btn sa-btn-gold" id="saGiftOpenCaseBtn" ${save.cases <= 0 ? 'disabled' : ''}>
              ${ico('case')} ${i18n.t('btn_open_case')} (${save.cases})
            </button>
            <button class="sa-btn sa-btn-accent" id="saGiftAdCaseBtn" ${leftDailyAds <= 0 ? 'disabled' : ''}>
              ▶ ${leftDailyAds <= 0 ? i18n.t('btn_daily_claimed') : i18n.t('btn_free_daily_case_n', { left: leftDailyAds, max: maxDailyAds })}
            </button>
          </div>

          <div class="sa-case-odds-box">
            <div class="sa-odds-title">${i18n.t('case_odds_title')}</div>
            <div class="sa-odds-vals">${i18n.t('case_odds_line')}</div>
          </div>

          <button class="sa-btn sa-btn-secondary" id="saGiftsCloseBtn">${i18n.t('btn_close')}</button>
        </div>
      `;
      document.body.appendChild(modal);

      const stBtn = modal.querySelector('#saGiftStreakClaimBtn');
      if (stBtn) {
        stBtn.onclick = () => {
          if (save.daily.streakClaimed) return;
          uiClickSfx();
          save.daily.streakClaimed = true;
          SaveMod.addCurrency(save, 'coins', streakCoins, i18n.t('ledger_streak_login'));
          SaveMod.addCurrency(save, 'pp', streakPp, i18n.t('ledger_streak_login'));
          if (audio) audio.playPickup();
          onSaveChanged();
          modal.remove();
          renderAll();
        };
      }

      const openC = modal.querySelector('#saGiftOpenCaseBtn');
      if (openC) {
        openC.onclick = () => {
          uiClickSfx();
          modal.remove();
          triggerOpenCase();
        };
      }

      const adC = modal.querySelector('#saGiftAdCaseBtn');
      if (adC) {
        adC.onclick = () => handleDailyRewardedCase(adC);
      }

      const closeB = modal.querySelector('#saGiftsCloseBtn');
      if (closeB) closeB.onclick = () => { uiClickSfx(); modal.remove(); };
    }

    // ─────────────────────────────────────────────────────────────
    // EXPRESSIVE CHIBI ILLUSTRATED PORTRAIT GENERATOR (ALL 72 FIGHTERS)
    // ─────────────────────────────────────────────────────────────
    function hashHeroCode(str) {
      const s = String(str || 'h');
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    function renderHeroBustSvg(hero) {
      const p = hero.palette || { primary: '#ff5722', secondary: '#ffb300', glow: '#ff8a50', dark: '#1e293b' };
      const sil = hero.silhouette || 'visor_dual';
      const elem = hero.elementId || 'fire';
      const seed = hashHeroCode(hero.id || hero.nameEn || sil);
      const glow = p.glow || p.secondary || '#38bdf8';
      const hairCol = (sil === 'cyber_fox' || sil === 'bomb_grenadier')
        ? p.primary
        : (seed % 3 === 0 ? p.primary : p.secondary);

      const warmSkins = ['#ffdfc4', '#ffe4c8', '#f9d2b0', '#ffdbb8', '#f5cba7'];
      const skinCol = (sil === 'prism_mage' || (sil === 'hulking_paladin' && elem === 'shadow'))
        ? '#1e1b4b'
        : (elem === 'ice' ? '#e0f2fe' : (elem === 'shadow' ? '#ddd6fe' : warmSkins[seed % warmSkins.length]));

      let backLayer = '';
      let topHatLayer = '';
      let propLayer = '';

      if (sil === 'visor_dual') {
        // Spiky ranger hair + forehead pilot goggles + ray pistol tip
        topHatLayer = `
          <path d="M24,28 L18,12 L33,20 L44,6 L53,20 L68,13 L63,28 Z" fill="${hairCol}" stroke="#060a17" stroke-width="2.6" stroke-linejoin="round"/>
          <rect x="24" y="21" width="40" height="9" rx="4.5" fill="#0f172a" stroke="#060a17" stroke-width="2.2"/>
          <circle cx="34" cy="25.5" r="5.5" fill="${glow}" stroke="#060a17" stroke-width="2.2"/>
          <circle cx="54" cy="25.5" r="5.5" fill="${glow}" stroke="#060a17" stroke-width="2.2"/>
          <circle cx="32.5" cy="24" r="1.8" fill="#fff"/>
          <circle cx="52.5" cy="24" r="1.8" fill="#fff"/>
        `;
        propLayer = `<rect x="66" y="52" width="14" height="9" rx="4" transform="rotate(-18 72 56)" fill="${p.secondary}" stroke="#060a17" stroke-width="2.3"/>`;
      } else if (sil === 'cyber_fox') {
        // Fluffy tail + big tufted fox/lynx ears with cream inner ear + kunai blade
        backLayer = `<path d="M16,68 Q3,50 13,38 Q22,42 23,58 Z" fill="${p.primary}" stroke="#060a17" stroke-width="2.6"/><circle cx="13" cy="40" r="4.5" fill="${glow}"/>`;
        topHatLayer = `
          <polygon points="21,30 13,5 36,20" fill="${p.primary}" stroke="#060a17" stroke-width="2.8" stroke-linejoin="round"/>
          <polygon points="22,27 17,11 32,21" fill="#fff7ed"/>
          <polygon points="67,30 75,5 52,20" fill="${p.primary}" stroke="#060a17" stroke-width="2.8" stroke-linejoin="round"/>
          <polygon points="66,27 71,11 56,21" fill="#fff7ed"/>
        `;
        propLayer = `<polygon points="73,44 83,64 68,62" fill="${glow}" stroke="#060a17" stroke-width="2.2"/>`;
      } else if (sil === 'hulking_paladin') {
        // Heroic cape + winged knight helm crest + star shield rim
        backLayer = `<path d="M14,78 L20,46 L68,46 L74,78 Z" fill="${p.secondary}" stroke="#060a17" stroke-width="2.6"/>`;
        topHatLayer = `
          <polygon points="19,34 8,16 24,24" fill="${p.secondary}" stroke="#060a17" stroke-width="2.5"/>
          <polygon points="69,34 80,16 64,24" fill="${p.secondary}" stroke="#060a17" stroke-width="2.5"/>
          <path d="M22,29 C22,13 66,13 66,29 L56,29 L44,23 L32,29 Z" fill="${p.primary}" stroke="#060a17" stroke-width="2.6"/>
        `;
        propLayer = `<circle cx="17" cy="64" r="12" fill="${p.secondary}" stroke="#060a17" stroke-width="2.6"/><circle cx="17" cy="64" r="5" fill="${glow}"/>`;
      } else if (sil === 'hawk_sniper') {
        // Pointed falcon hood + beak visor + glowing rifle scope
        topHatLayer = `
          <path d="M19,38 C18,12 44,5 44,5 C44,5 70,12 69,38 Q44,24 19,38 Z" fill="${p.primary}" stroke="#060a17" stroke-width="2.8"/>
          <polygon points="37,22 51,22 44,33" fill="${p.secondary}" stroke="#060a17" stroke-width="2.2"/>
        `;
        propLayer = `<rect x="67" y="42" width="7" height="30" rx="3" transform="rotate(14 70 56)" fill="#0f172a" stroke="#060a17" stroke-width="2.2"/><circle cx="71" cy="44" r="4" fill="${glow}" stroke="#060a17" stroke-width="1.8"/>`;
      } else if (sil === 'seraph_halo') {
        // Floating halo + cute chibi wings + twin hair buns + star wand
        backLayer = `
          <path d="M21,58 Q5,45 10,34 Q22,38 25,50 Z" fill="${glow}" stroke="#060a17" stroke-width="2.3"/>
          <path d="M67,58 Q83,45 78,34 Q66,38 63,50 Z" fill="${glow}" stroke="#060a17" stroke-width="2.3"/>
          <circle cx="21" cy="28" r="8.5" fill="${hairCol}" stroke="#060a17" stroke-width="2.5"/>
          <circle cx="67" cy="28" r="8.5" fill="${hairCol}" stroke="#060a17" stroke-width="2.5"/>
        `;
        topHatLayer = `<ellipse cx="44" cy="8.5" rx="17" ry="4.5" fill="none" stroke="${glow}" stroke-width="3.6"/>`;
        propLayer = `<polygon points="74,40 77,47 84,48 78,53 80,60 74,56 68,60 70,53 64,48 71,47" fill="${glow}" stroke="#060a17" stroke-width="2"/>`;
      } else if (sil === 'alchemist_pack') {
        // Bubbling potion bulb + quirky tilted beret
        backLayer = `<circle cx="18" cy="52" r="11" fill="${glow}" stroke="#060a17" stroke-width="2.5"/><circle cx="15" cy="48" r="3" fill="#fff"/>`;
        topHatLayer = `<ellipse cx="42" cy="19" rx="24" ry="9" transform="rotate(-10 42 19)" fill="${p.primary}" stroke="#060a17" stroke-width="2.6"/>`;
      } else if (sil === 'prism_mage') {
        // Big curved witch/wizard brim hat + orbiting crystal orb
        topHatLayer = `
          <path d="M26,24 L42,3 L54,10 L61,24 Z" fill="${p.primary}" stroke="#060a17" stroke-width="2.7" stroke-linejoin="round"/>
          <ellipse cx="44" cy="24" rx="31" ry="7" transform="rotate(-5 44 24)" fill="${p.primary}" stroke="#060a17" stroke-width="2.7"/>
          <path d="M27,22 Q44,26 60,21" stroke="${p.secondary}" stroke-width="3.5" fill="none"/>
        `;
        propLayer = `<polygon points="74,40 81,50 74,60 67,50" fill="${glow}" stroke="#060a17" stroke-width="2.2"/>`;
      } else if (sil === 'dome_inventor') {
        // Ear-muff headphones + cap + hovering cute mini-drone!
        backLayer = `
          <circle cx="20" cy="39" r="7" fill="${p.secondary}" stroke="#060a17" stroke-width="2.4"/>
          <circle cx="68" cy="39" r="7" fill="${p.secondary}" stroke="#060a17" stroke-width="2.4"/>
        `;
        topHatLayer = `
          <path d="M22,28 C22,12 66,12 66,28 Z" fill="${p.primary}" stroke="#060a17" stroke-width="2.6"/>
          <circle cx="15" cy="18" r="7.5" fill="${glow}" stroke="#060a17" stroke-width="2.2"/>
          <rect x="7" y="16" width="16" height="3.5" rx="1.5" fill="#0f172a"/>
        `;
      } else if (sil === 'martial_champ') {
        // Spiky anime hair + tied headband + boxing glove fist!
        topHatLayer = `
          <path d="M20,29 L14,13 L30,20 L43,4 L55,19 L73,12 L67,29 Z" fill="${hairCol}" stroke="#060a17" stroke-width="2.6" stroke-linejoin="round"/>
          <rect x="22" y="23" width="44" height="6.5" rx="3" fill="${p.primary}" stroke="#060a17" stroke-width="2.2"/>
          <polygon points="66,25 81,18 77,29" fill="${p.primary}" stroke="#060a17" stroke-width="2"/>
        `;
        propLayer = `<circle cx="71" cy="61" r="10.5" fill="${p.primary}" stroke="#060a17" stroke-width="2.6"/><path d="M66,57 Q71,54 75,57" stroke="#fff" stroke-width="2" fill="none"/>`;
      } else if (sil === 'cosmic_jester') {
        // Twin curved jester horns + golden pom-pom bells + trick card
        topHatLayer = `
          <path d="M44,22 Q24,4 13,22 Q24,22 30,29 Z" fill="${p.primary}" stroke="#060a17" stroke-width="2.6"/>
          <path d="M44,22 Q64,4 75,22 Q64,22 58,29 Z" fill="${p.secondary}" stroke="#060a17" stroke-width="2.6"/>
          <circle cx="12" cy="23" r="5" fill="${glow}" stroke="#060a17" stroke-width="2.2"/>
          <circle cx="76" cy="23" r="5" fill="${glow}" stroke="#060a17" stroke-width="2.2"/>
        `;
        propLayer = `<rect x="67" y="47" width="13" height="18" rx="2.5" transform="rotate(14 73 56)" fill="${glow}" stroke="#060a17" stroke-width="2.2"/>`;
      } else if (sil === 'broad_cannon') {
        // Swept punk mohawk + blunderbuss muzzle
        topHatLayer = `<path d="M35,25 Q34,5 52,6 Q50,18 54,25 Z" fill="${p.primary}" stroke="#060a17" stroke-width="2.6"/>`;
        propLayer = `<circle cx="72" cy="58" r="10" fill="#0f172a" stroke="#060a17" stroke-width="2.5"/><circle cx="72" cy="58" r="4.5" fill="${glow}"/>`;
      } else {
        // Bomb-Buddy aviator helmet + lit fuse + sparkling star
        topHatLayer = `
          <path d="M21,34 C21,13 67,13 67,34 L63,27 L25,27 Z" fill="#1e293b" stroke="#060a17" stroke-width="2.6"/>
          <path d="M44,15 Q48,6 55,8" stroke="${p.secondary}" stroke-width="3" fill="none" stroke-linecap="round"/>
          <polygon points="57,3 59,8 64,9 60,12 61,17 57,14 53,17 54,12 50,9 55,8" fill="${glow}" stroke="#060a17" stroke-width="1.6"/>
        `;
      }

      // Elemental Crown Badge (subtle distinct accent per element!)
      let elemBadge = '';
      if (elem === 'nature') {
        elemBadge = `<path d="M44,18 Q38,10 34,14 Q38,20 44,18 M44,18 Q50,10 54,14 Q50,20 44,18" fill="#4ade80" stroke="#060a17" stroke-width="1.6"/>`;
      } else if (elem === 'ice') {
        elemBadge = `<polygon points="44,13 48,19 44,25 40,19" fill="#7dd3fc" stroke="#060a17" stroke-width="1.5"/>`;
      } else if (elem === 'storm') {
        elemBadge = `<polygon points="46,11 40,20 45,20 42,27 50,18 45,18" fill="#fde047" stroke="#060a17" stroke-width="1.4"/>`;
      }

      // Expressive Eyes + Catchlights
      let eyesSvg = '';
      if (sil === 'alchemist_pack') {
        eyesSvg = `
          <circle cx="35" cy="40" r="8.2" fill="#e0f2fe" stroke="#060a17" stroke-width="2.8"/>
          <circle cx="53" cy="40" r="9.2" fill="#e0f2fe" stroke="#060a17" stroke-width="2.8"/>
          <line x1="43" y1="40" x2="45" y2="40" stroke="${p.secondary}" stroke-width="3"/>
          <circle cx="36" cy="40" r="3.6" fill="#060a17"/><circle cx="34" cy="38" r="1.8" fill="#fff"/>
          <circle cx="52" cy="40" r="4.0" fill="#060a17"/><circle cx="50" cy="37.5" r="2.0" fill="#fff"/>
        `;
      } else if (sil === 'prism_mage') {
        eyesSvg = `
          <ellipse cx="35" cy="41" rx="6.2" ry="4.8" fill="${glow}"/>
          <ellipse cx="53" cy="41" rx="6.2" ry="4.8" fill="${glow}"/>
          <circle cx="33.5" cy="39.5" r="2" fill="#fff"/>
          <circle cx="51.5" cy="39.5" r="2" fill="#fff"/>
        `;
      } else {
        const hasPatch = sil === 'broad_cannon' && (seed % 2 === 0);
        eyesSvg = `
          <ellipse cx="34.5" cy="40.5" rx="5.6" ry="6.8" fill="#fff"/>
          <ellipse cx="35.3" cy="41" rx="4.6" ry="5.8" fill="#0b1026"/>
          <ellipse cx="35.3" cy="43.2" rx="3.7" ry="3.2" fill="${glow}"/>
          <ellipse cx="35.3" cy="40.8" rx="2.7" ry="3.4" fill="#0b1026"/>
          <circle cx="33.5" cy="38.2" r="2.2" fill="#fff"/>
          <path d="M28.5,39 Q34.5,33 40.5,39" stroke="#060a17" stroke-width="2.6" fill="none" stroke-linecap="round"/>
          ${hasPatch ? `
            <line x1="45" y1="32" x2="63" y2="45" stroke="#060a17" stroke-width="2.8"/>
            <circle cx="53.5" cy="40.5" r="6.2" fill="#0f172a" stroke="#060a17" stroke-width="2"/>
            <circle cx="53.5" cy="40.5" r="2.2" fill="${p.secondary}"/>
          ` : `
            <ellipse cx="53.5" cy="40.5" rx="5.6" ry="6.8" fill="#fff"/>
            <ellipse cx="52.7" cy="41" rx="4.6" ry="5.8" fill="#0b1026"/>
            <ellipse cx="52.7" cy="43.2" rx="3.7" ry="3.2" fill="${glow}"/>
            <ellipse cx="52.7" cy="40.8" rx="2.7" ry="3.4" fill="#0b1026"/>
            <circle cx="50.8" cy="38.2" r="2.2" fill="#fff"/>
            <path d="M47.5,39 Q53.5,33 59.5,39" stroke="#060a17" stroke-width="2.6" fill="none" stroke-linecap="round"/>
          `}
        `;
      }

      // Mouth / Muzzle / Mask
      let mouthSvg = '';
      if (sil === 'cyber_fox') {
        mouthSvg = `
          <ellipse cx="44" cy="49" rx="13" ry="8" fill="#fff7ed"/>
          <polygon points="41,45 47,45 44,49" fill="#060a17"/>
          <path d="M38,51 Q41,55 44,50 Q47,55 50,51" stroke="#060a17" stroke-width="2.1" fill="none" stroke-linecap="round"/>
        `;
      } else if (sil === 'hawk_sniper') {
        mouthSvg = `<path d="M25,46 Q44,41 63,46 L59,59 Q44,64 29,59 Z" fill="#0f172a" stroke="#060a17" stroke-width="2.2"/>`;
      } else if (sil !== 'prism_mage') {
        mouthSvg = (seed % 2 === 0 || sil === 'bomb_grenadier' || sil === 'martial_champ')
          ? `<path d="M38,49 A6.5,6.5 0 0,0 50,49 Z" fill="#7f1d1d" stroke="#060a17" stroke-width="2"/><rect x="40" y="49" width="8" height="2.4" fill="#fff"/>`
          : `<path d="M38,50 Q45,54 51,48" stroke="#060a17" stroke-width="2.3" fill="none" stroke-linecap="round"/>`;
      }

      return `<svg viewBox="0 0 88 80" class="sa-portrait-svg" aria-hidden="true">
        ${backLayer}
        <!-- Sculpted Jacket Shoulders, Lapels & Collar -->
        <path d="M16,80 C17,56 71,56 72,80 Z" fill="${p.primary}" stroke="#060a17" stroke-width="3"/>
        <polygon points="37,61 51,61 48,80 40,80" fill="#1e293b"/>
        <path d="M29,60 Q44,68 59,60" stroke="${p.secondary}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <!-- Chibi Rounded Head -->
        <ellipse cx="44" cy="40" rx="21.5" ry="20" fill="${skinCol}" stroke="#060a17" stroke-width="3"/>
        <!-- Rosy Blush Cheeks -->
        ${sil !== 'prism_mage' && sil !== 'hawk_sniper' ? `
          <ellipse cx="29" cy="46" rx="4" ry="2.3" fill="rgba(255,105,135,0.5)"/>
          <ellipse cx="59" cy="46" rx="4" ry="2.3" fill="rgba(255,105,135,0.5)"/>
        ` : ''}
        <!-- Bangs / Hairline -->
        ${sil !== 'prism_mage' && sil !== 'hulking_paladin' && sil !== 'hawk_sniper' ? `
          <path d="M23,36 C24,18 64,18 65,36 Q56,28 50,34 Q44,26 37,34 Q30,28 23,36 Z" fill="${hairCol}" stroke="#060a17" stroke-width="2.4"/>
        ` : ''}
        ${eyesSvg}
        ${mouthSvg}
        ${topHatLayer}
        ${elemBadge}
        ${propLayer}
      </svg>`;
    }

    // ─────────────────────────────────────────────────────────────
    // FIGHTERS MENU (2-State Hero-Arena Design: Roster Grid ↔ Full-Screen 3D Showcase)
    // ─────────────────────────────────────────────────────────────
    function renderHeroesView(container) {
      disposeTurntable();
      if (heroSubView === 'detail') {
        renderHeroDetailShowcase(container);
      } else {
        renderHeroesRosterGrid(container);
      }
    }

    function getFilteredSortedHeroes() {
      const rarityWeight = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 };
      const list = gameData.heroes.filter(h => {
        if (heroFilterArch !== 'all' && h.archetypeId !== heroFilterArch) return false;
        if (heroFilterElem !== 'all' && h.elementId !== heroFilterElem) return false;
        return true;
      });
      list.sort((a, b) => {
        const sa = save.heroes[a.id] || { unlocked: false, level: 1, trophies: 0 };
        const sb = save.heroes[b.id] || { unlocked: false, level: 1, trophies: 0 };
        if (heroSortBy === 'power') {
          if (sb.level !== sa.level) return sb.level - sa.level;
          return (sb.trophies || 0) - (sa.trophies || 0);
        }
        if (heroSortBy === 'rarity') {
          const rw = (rarityWeight[b.rarity] || 0) - (rarityWeight[a.rarity] || 0);
          if (rw !== 0) return rw;
          return (sb.trophies || 0) - (sa.trophies || 0);
        }
        if ((sb.trophies || 0) !== (sa.trophies || 0)) return (sb.trophies || 0) - (sa.trophies || 0);
        return (rarityWeight[b.rarity] || 0) - (rarityWeight[a.rarity] || 0);
      });
      return list;
    }

    function renderHeroesRosterGrid(container) {
      const filtered = getFilteredSortedHeroes();
      const unlockedList = filtered.filter(h => save.heroes[h.id] && save.heroes[h.id].unlocked);
      const lockedList = filtered.filter(h => !save.heroes[h.id] || !save.heroes[h.id].unlocked);
      const sortLabelKey = heroSortBy === 'power' ? 'sort_power' : (heroSortBy === 'rarity' ? 'sort_rarity' : 'sort_trophies');

      const renderCard = (h, unlocked) => {
        const st = save.heroes[h.id] || { unlocked: false, level: 1, trophies: 0 };
        const arch = getArchById(h.archetypeId);
        const canUpg = unlocked && isHeroUpgradeable(h.id);
        const rank = computeHeroRank(st.trophies || 0);
        const nextRankAt = rank * 25;
        const prevRankAt = (rank - 1) * 25;
        const trPct = Math.min(100, Math.round((((st.trophies || 0) - prevRankAt) / Math.max(1, nextRankAt - prevRankAt)) * 100));
        const isSelected = save.selectedHeroId === h.id;
        return `
          <button type="button" class="sa-roster-card ${h.rarity} ${unlocked ? 'unlocked' : 'locked'} ${isSelected ? 'equipped' : ''}" data-hid="${h.id}">
            <div class="sa-rcard-top">
              ${unlocked ? `
                <span class="sa-rcard-rank">R${rank}</span>
                <div class="sa-rcard-trbar">
                  <div class="sa-rcard-trfill" style="width:${trPct}%"></div>
                  <span>${ico('trophy')} ${st.trophies || 0}</span>
                </div>
              ` : `
                <span class="sa-rcard-locktag">${ico('lock')} ${i18n.t('hero_rarity_' + h.rarity)}</span>
              `}
            </div>
            <div class="sa-rcard-stage">
              ${renderHeroBustSvg(h)}
              ${unlocked ? `<span class="sa-rcard-lv">⚡${st.level}</span>` : ''}
              ${canUpg ? `<span class="sa-rcard-upg">▲</span>` : ''}
              ${isSelected ? `<span class="sa-rcard-eq">✓ ${i18n.t('hero_in_squad_tag')}</span>` : ''}
            </div>
            <div class="sa-rcard-foot">
              <div class="sa-rcard-name">${i18n.pick(h, 'name')}</div>
              <div class="sa-rcard-sub">${i18n.pick(arch, 'name')}</div>
            </div>
          </button>
        `;
      };

      container.innerHTML = `
        <div class="sa-roster-screen">
          <div class="sa-roster-header">
            <div class="sa-roster-title-group">
              <button type="button" class="sa-btn sa-btn-secondary sa-btn-sm" id="saRosterBackLobbyBtn">${i18n.t('roster_back_lobby')}</button>
              <h2 class="sa-roster-h2">${ico('sword')} ${i18n.t('btn_fighters')} <span>${SaveMod.getUnlockedHeroCount(save)} / 72</span></h2>
            </div>
            <div class="sa-roster-controls">
              <button type="button" class="sa-btn sa-btn-gold sa-btn-sm" id="saCycleSortBtn">${i18n.t(sortLabelKey)}</button>
              <select id="saArchFilter" class="sa-select">
                <option value="all">${i18n.t('filter_all')}</option>
                ${gameData.balance.archetypes.map(a => `<option value="${a.id}" ${heroFilterArch === a.id ? 'selected' : ''}>${i18n.pick(a, 'name')}</option>`).join('')}
              </select>
              <select id="saElemFilter" class="sa-select">
                <option value="all">${i18n.t('filter_elem_all')}</option>
                ${gameData.balance.elements.map(e => `<option value="${e.id}" ${heroFilterElem === e.id ? 'selected' : ''}>${i18n.pick(e, 'name')}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="sa-roster-section-lbl">${i18n.t('roster_unlocked_header', { n: unlockedList.length })}</div>
          <div class="sa-roster-grid">
            ${unlockedList.map(h => renderCard(h, true)).join('')}
          </div>

          ${lockedList.length > 0 ? `
            <div class="sa-roster-section-lbl locked">${i18n.t('roster_locked_header', { n: lockedList.length })}</div>
            <div class="sa-roster-grid">
              ${lockedList.map(h => renderCard(h, false)).join('')}
            </div>
          ` : ''}
        </div>
      `;

      const backBtn = document.getElementById('saRosterBackLobbyBtn');
      if (backBtn) {
        backBtn.onclick = () => {
          uiClickSfx();
          activeTab = 'play';
          renderAll();
        };
      }

      const sortBtn = document.getElementById('saCycleSortBtn');
      if (sortBtn) {
        sortBtn.onclick = () => {
          uiClickSfx();
          heroSortBy = heroSortBy === 'trophies' ? 'power' : (heroSortBy === 'power' ? 'rarity' : 'trophies');
          renderHeroesView(container);
        };
      }

      const archFilterEl = document.getElementById('saArchFilter');
      if (archFilterEl) {
        archFilterEl.onchange = (e) => {
          heroFilterArch = e.target.value;
          renderHeroesView(container);
        };
      }
      const elemFilterEl = document.getElementById('saElemFilter');
      if (elemFilterEl) {
        elemFilterEl.onchange = (e) => {
          heroFilterElem = e.target.value;
          renderHeroesView(container);
        };
      }

      container.querySelectorAll('.sa-roster-card').forEach(card => {
        card.onclick = () => {
          uiClickSfx();
          inspectedHeroId = card.getAttribute('data-hid');
          previewSkinHeroId = inspectedHeroId;
          previewSkinId = undefined;
          heroSubView = 'detail';
          renderAll();
        };
      });
    }

    function renderHeroDetailShowcase(container) {
      const inspected = getHeroById(inspectedHeroId);
      const orderedHeroes = getFilteredSortedHeroes();
      const fullList = orderedHeroes.length ? orderedHeroes : gameData.heroes;
      const curIdx = Math.max(0, fullList.findIndex(h => h.id === inspected.id));

      const hState = save.heroes[inspected.id] || { unlocked: false, level: 1, trophies: 0, skinId: null };
      const arch = getArchById(inspected.archetypeId);
      const elem = getElemById(inspected.elementId);
      const archSkins = gameData.skins.filter(s => s.archetypeId === inspected.archetypeId);
      if (previewSkinHeroId !== inspected.id) {
        previewSkinHeroId = inspected.id;
        previewSkinId = undefined;
      }
      const activeSkinId = previewSkinId !== undefined ? previewSkinId : (hState.skinId || null);
      const activeSkinObj = activeSkinId ? gameData.skins.find(s => s.id === activeSkinId) : null;
      const isSkinPreviewOnly = Boolean(activeSkinId && !save.unlockedSkins.includes(activeSkinId));

      const lvMult = gameData.balance.levelCurve.find(c => c.level === hState.level).statMult;
      const nextCurve = gameData.balance.levelCurve.find(c => c.level === hState.level + 1);
      const nextMult = nextCurve ? nextCurve.statMult : lvMult;

      const curHp = Math.round(arch.baseHp * lvMult);
      const hpDelta = nextCurve ? Math.max(1, Math.round(arch.baseHp * nextMult) - curHp) : 0;
      const curDmg = Math.round(arch.weapon.damagePerHit * lvMult);
      const dmgDelta = nextCurve ? Math.max(1, Math.round(arch.weapon.damagePerHit * nextMult) - curDmg) : 0;
      const supRaw = (arch.super && arch.super.damage) ? arch.super.damage : Math.round(arch.weapon.damagePerHit * 1.45);
      const curSup = Math.round(supRaw * lvMult);
      const supDelta = nextCurve ? Math.max(1, Math.round(supRaw * nextMult) - curSup) : 0;

      const ppAdsLeft = Math.max(0, 2 - (save.daily.rewardedPpCount || 0));
      const rank = computeHeroRank(hState.trophies || 0);
      const nextRankAt = rank * 25;
      const prevRankAt = (rank - 1) * 25;
      const rankPct = Math.min(100, Math.round((((hState.trophies || 0) - prevRankAt) / Math.max(1, nextRankAt - prevRankAt)) * 100));

      const mState = SaveMod.getMasteryState ? SaveMod.getMasteryState(save, inspected.id) : { pts: 0, tier: 0, nextPts: 80 };
      const tierNames = [i18n.t('mastery_tier_0'), i18n.t('mastery_tier_1'), i18n.t('mastery_tier_2'), i18n.t('mastery_tier_3')];
      const mPct = Math.min(100, Math.round((mState.pts / Math.max(1, mState.nextPts)) * 100));
      const archTitleTxt = i18n.getLang() === 'ru' ? (arch.titleRu || '') : (arch.titleEn || '');
      let claimableMasteryTier = 0;
      for (let mt = 1; mt <= mState.tier; mt++) {
        if (!(save.claimedMastery || []).includes(`${inspected.id}:${mt}`)) {
          claimableMasteryTier = mt;
          break;
        }
      }

      const slotsMeta = {
        gadget: {
          id: 'gadget',
          short: i18n.t('slot_gadget_short'),
          icon: ico('gadget'),
          unlocked: true,
          status: i18n.t('slot_status_charges'),
          title: `${i18n.t('hero_gadget_label')}: ${i18n.pick(arch, 'gadgetName')}`,
          desc: i18n.pick(arch, 'gadgetDesc'),
          cls: 'gadget'
        },
        talent7: {
          id: 'talent7',
          short: i18n.t('slot_talent_short'),
          icon: '★',
          unlocked: hState.level >= 7,
          status: hState.level >= 7 ? i18n.t('slot_status_active') : i18n.t('slot_status_unlock7'),
          title: `${i18n.t('hero_talent_lv7')}: ${i18n.pick(arch, 'talent7Name')}`,
          desc: i18n.pick(arch, 'talent7Desc'),
          cls: 'talent'
        },
        super9: {
          id: 'super9',
          short: i18n.t('slot_super9_short'),
          icon: '⚡',
          unlocked: hState.level >= 9,
          status: hState.level >= 9 ? i18n.t('slot_status_active') : i18n.t('slot_status_unlock9'),
          title: `${i18n.t('hero_super_lv9')}: ${i18n.pick(arch, 'super9Name')}`,
          desc: i18n.pick(arch, 'super9Desc'),
          cls: 'super9'
        },
        overdrive: {
          id: 'overdrive',
          short: i18n.t('slot_overdrive_short'),
          icon: ico('overdrive'),
          unlocked: true,
          status: i18n.t('slot_status_active'),
          title: `${i18n.t('hero_overdrive_label')}: ${i18n.pick(arch, 'overdriveName')}`,
          desc: i18n.pick(arch, 'overdriveDesc'),
          cls: 'overdrive'
        }
      };
      const curSlot = slotsMeta[selectedLoadoutSlot] || slotsMeta.overdrive;

      container.innerHTML = `
        <div class="sa-fighter-screen ${inspected.rarity}">
          <!-- Top Navigation, Prev/Next Switcher, Rank Progress & Mastery -->
          <div class="sa-fighter-topbar">
            <div class="sa-fighter-nav-left">
              <button type="button" class="sa-btn sa-btn-secondary sa-btn-sm" id="saBackToRosterBtn">${i18n.t('roster_back_list')}</button>
              <div class="sa-fighter-pager">
                <button type="button" class="sa-pager-btn" id="saPrevHeroBtn" aria-label="Prev">◀</button>
                <span>${curIdx + 1} / ${fullList.length}</span>
                <button type="button" class="sa-pager-btn" id="saNextHeroBtn" aria-label="Next">▶</button>
              </div>
            </div>

            <div class="sa-fighter-progress-cluster">
              <div class="sa-fighter-rank-pill">
                <span class="sa-rank-shield">R${rank}</span>
                <div class="sa-rank-bar-wrap">
                  <div class="sa-rank-bar-lbl">${ico('trophy')} ${i18n.t('next_rank_trophies', { rank, cur: hState.trophies || 0, next: nextRankAt })}</div>
                  <div class="sa-rank-bar-track"><div class="sa-rank-bar-fill" style="width:${rankPct}%"></div></div>
                </div>
              </div>

              <div class="sa-fighter-mastery-pill" title="${i18n.t('mastery_gold_title_hint', { title: archTitleTxt })}">
                <span>${ico('mastery')} ${tierNames[mState.tier]} (${mState.pts}/${mState.nextPts})</span>
                <div class="sa-mini-mbar"><div style="width:${mPct}%"></div></div>
                ${claimableMasteryTier > 0 ? `
                  <button type="button" class="sa-btn sa-btn-gold sa-btn-xs" id="saClaimMasteryBtn">
                    ${ico('gift')} ${i18n.t('btn_claim')}
                  </button>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Two-Column Hero-Arena Showcase Body -->
          <div class="sa-fighter-body">
            <!-- LEFT: Full-Body 3D Pedestal Spotlight + Identity + Skin Carousel -->
            <div class="sa-fighter-stage-wing">
              <div class="sa-fighter-id-overlay">
                <div class="sa-fighter-tags-row">
                  <span class="sa-rarity-tag ${inspected.rarity}">${i18n.t('hero_rarity_' + inspected.rarity)}</span>
                  <span class="sa-elem-chip" style="border-color:${inspected.palette.glow || '#38bdf8'}">${i18n.pick(elem, 'name')}</span>
                </div>
                <h1 class="sa-fighter-big-name">${i18n.pick(inspected, 'name')}</h1>
                <div class="sa-fighter-role-sub">${i18n.pick(arch, 'name')} · ${i18n.pick(arch, 'role')}</div>
              </div>

              <div class="sa-fighter-3d-viewport">
                <canvas id="saHeroInspectCanvas"></canvas>
                <span class="sa-spin-badge">${i18n.t('spin_360_hint')}</span>
              </div>

              <div class="sa-fighter-skins-strip">
                <div class="sa-skin-pills" id="saSkinPillsRow">
                  <button type="button" class="sa-chip-btn ${!activeSkinId ? 'active' : ''}" data-skin="">
                    ${!hState.skinId ? '✓ ' : ''}${i18n.t('skin_default')}
                  </button>
                  ${archSkins.map(sk => {
                    const owned = save.unlockedSkins.includes(sk.id);
                    const isAct = activeSkinId === sk.id;
                    return `<button type="button" class="sa-chip-btn ${isAct ? 'active' : ''}" data-skin="${sk.id}">
                      ${owned ? '★' : ico('lock')} ${i18n.pick(sk, 'name')}
                    </button>`;
                  }).join('')}
                </div>
                <div class="sa-skin-preview-note ${isSkinPreviewOnly ? '' : 'hidden'}" id="saSkinPreviewNote">
                  ${ico('lock')} ${i18n.t('skin_preview_locked')}
                </div>
              </div>
            </div>

            <!-- RIGHT: Power Level, Core Stat Bars (+Upgrade Deltas), 4 Loadout Medallions & CTA -->
            <div class="sa-fighter-info-wing">
              <!-- Power Banner -->
              <div class="sa-fighter-power-banner">
                <div class="sa-power-hex">
                  <span>⚡</span>
                  <div>
                    <div class="sa-power-hex-lbl">${i18n.t('power_level_full', { lv: hState.level })}</div>
                    <small>${hState.level >= 9 ? i18n.t('btn_max_level') : `${hState.level} / 9`}</small>
                  </div>
                </div>

                ${hState.unlocked && nextCurve ? `
                  <div class="sa-power-cost-cluster">
                    <div class="sa-cost-pill ${save.pp >= nextCurve.powerPoints ? 'ok' : 'short'}">
                      ${ico('bolt')} <b>${save.pp}</b> / ${nextCurve.powerPoints}
                    </div>
                    <div class="sa-cost-pill ${save.coins >= nextCurve.coins ? 'ok' : 'short'}">
                      ${ico('coin')} <b>${save.coins}</b> / ${nextCurve.coins}
                    </div>
                    ${ppAdsLeft > 0 ? `
                      <button type="button" class="sa-btn sa-btn-gold sa-btn-xs" id="saAdPpBoostBtn">
                        ▶ +30⚡ (${ppAdsLeft}/2)
                      </button>
                    ` : ''}
                  </div>
                ` : (!hState.unlocked ? `
                  <div class="sa-locked-banner-note">${ico('lock')} ${i18n.t('hero_locked_hint')}</div>
                ` : `<span class="sa-badge release">${i18n.t('btn_max_level')}</span>`)}
              </div>

              <!-- 3 Signature Stat Cards -->
              <div class="sa-fighter-stats-stack">
                <div class="sa-fstat-row hp">
                  <div class="sa-fstat-ico">❤</div>
                  <div class="sa-fstat-meta">
                    <div class="sa-fstat-lbl">${i18n.t('hero_stats_hp')}</div>
                    <div class="sa-fstat-val">
                      <b>${curHp}</b>
                      ${hpDelta > 0 ? `<span class="sa-fstat-delta">+${hpDelta}</span>` : ''}
                    </div>
                  </div>
                </div>

                <div class="sa-fstat-row atk">
                  <div class="sa-fstat-ico">${ico('sword')}</div>
                  <div class="sa-fstat-meta">
                    <div class="sa-fstat-lbl">${i18n.t('hero_stats_dmg')} · <span>${i18n.pick(arch, 'weaponName')}</span></div>
                    <div class="sa-fstat-val">
                      <b>${curDmg} × ${arch.weapon.projectiles || 1}</b>
                      ${dmgDelta > 0 ? `<span class="sa-fstat-delta">+${dmgDelta}</span>` : ''}
                    </div>
                  </div>
                </div>

                <div class="sa-fstat-row sup">
                  <div class="sa-fstat-ico">★</div>
                  <div class="sa-fstat-meta">
                    <div class="sa-fstat-lbl">${i18n.t('hero_stats_super')} · <span>${i18n.pick(arch, 'superName')}</span></div>
                    <div class="sa-fstat-val">
                      <b>${curSup}</b>
                      ${supDelta > 0 ? `<span class="sa-fstat-delta">+${supDelta}</span>` : ''}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 4 Interactive Circular Loadout Medallions -->
              <div class="sa-loadout-medallions" id="saLoadoutMedallions">
                ${Object.values(slotsMeta).map(sl => `
                  <button type="button" class="sa-medallion-btn ${sl.cls} ${sl.unlocked ? 'unlocked' : 'locked'} ${curSlot.id === sl.id ? 'selected' : ''}" data-slot-id="${sl.id}">
                    <span class="sa-medallion-ring">${sl.icon}</span>
                    <span class="sa-medallion-lbl">${sl.short}</span>
                    ${!sl.unlocked ? `<span class="sa-medallion-lock">${ico('lock')}</span>` : ''}
                  </button>
                `).join('')}
              </div>

              <!-- Active Loadout Ability Detail Card -->
              <div class="sa-loadout-card ${curSlot.cls}" id="saLoadoutDetailCard">
                <div class="sa-loadout-card-head">
                  <strong id="saLoadoutCardTitle">${curSlot.title}</strong>
                  <span class="sa-loadout-status ${curSlot.unlocked ? 'on' : 'off'}" id="saLoadoutCardStatus">${curSlot.status}</span>
                </div>
                <div class="sa-loadout-card-desc" id="saLoadoutCardDesc">${curSlot.desc}</div>
              </div>

              <!-- Mastery Gold Title Strip -->
              <div class="sa-mastery-title-hint">
                ${ico('mastery')} ${i18n.t('mastery_gold_title_hint', { title: archTitleTxt })}
              </div>

              <!-- Bottom Chunky 3-Button Arcade CTA Row -->
              <div class="sa-fighter-cta-row">
                <button type="button" class="sa-btn sa-btn-accent" id="saTryInspectedBtn">◎ ${i18n.t('btn_try_hero')}</button>

                ${hState.unlocked && nextCurve ? `
                  <button type="button" class="sa-btn sa-btn-green" id="saUpgradeHeroBtn" ${(save.coins < nextCurve.coins || save.pp < nextCurve.powerPoints) ? 'disabled' : ''}>
                    ▲ ${i18n.t('btn_upgrade')} · ${ico('coin')}${nextCurve.coins} ${ico('bolt')}${nextCurve.powerPoints}
                  </button>
                ` : ''}

                ${hState.unlocked ? `
                  <button type="button" class="sa-btn sa-btn-gold" id="saSelectHeroBtn" ${save.selectedHeroId === inspected.id ? 'disabled' : ''}>
                    ${save.selectedHeroId === inspected.id ? ('✓ ' + i18n.t('btn_selected')) : ('✓ ' + i18n.t('btn_select'))}
                  </button>
                ` : (save.cases > 0 ? `
                  <button type="button" class="sa-btn sa-btn-gold" id="saOpenCaseFromHeroBtn">
                    ${ico('case_box')} ${i18n.t('btn_open_case_count', { n: save.cases })}
                  </button>
                ` : '')}
              </div>
            </div>
          </div>
        </div>
      `;

      const inspectCanvas = document.getElementById('saHeroInspectCanvas');
      if (inspectCanvas && root.SA.Renderer3D) {
        turntable = root.SA.Renderer3D.createHeroTurntable(inspectCanvas);
        if (turntable) turntable.setHero(inspected, activeSkinObj);
      }

      const backBtn = document.getElementById('saBackToRosterBtn');
      if (backBtn) {
        backBtn.onclick = () => {
          uiClickSfx();
          heroSubView = 'roster';
          renderAll();
        };
      }

      const prevBtn = document.getElementById('saPrevHeroBtn');
      if (prevBtn) {
        prevBtn.onclick = () => {
          uiClickSfx();
          const nextIdx = (curIdx - 1 + fullList.length) % fullList.length;
          inspectedHeroId = fullList[nextIdx].id;
          previewSkinId = undefined;
          renderHeroDetailShowcase(container);
        };
      }

      const nextBtn = document.getElementById('saNextHeroBtn');
      if (nextBtn) {
        nextBtn.onclick = () => {
          uiClickSfx();
          const nextIdx = (curIdx + 1) % fullList.length;
          inspectedHeroId = fullList[nextIdx].id;
          previewSkinId = undefined;
          renderHeroDetailShowcase(container);
        };
      }

      // Live Loadout Slot Switcher (zero WebGL teardown!)
      container.querySelectorAll('[data-slot-id]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          const sid = btn.getAttribute('data-slot-id');
          selectedLoadoutSlot = sid;
          const meta = slotsMeta[sid] || slotsMeta.overdrive;
          container.querySelectorAll('[data-slot-id]').forEach(b => b.classList.toggle('selected', b === btn));
          const cardEl = document.getElementById('saLoadoutDetailCard');
          const titleEl = document.getElementById('saLoadoutCardTitle');
          const statusEl = document.getElementById('saLoadoutCardStatus');
          const descEl = document.getElementById('saLoadoutCardDesc');
          if (cardEl) cardEl.className = `sa-loadout-card ${meta.cls}`;
          if (titleEl) titleEl.textContent = meta.title;
          if (statusEl) {
            statusEl.textContent = meta.status;
            statusEl.className = `sa-loadout-status ${meta.unlocked ? 'on' : 'off'}`;
          }
          if (descEl) descEl.textContent = meta.desc;
          if (turntable && typeof turntable.triggerPose === 'function') turntable.triggerPose();
        };
      });

      // Live 3D Skin Switcher (zero WebGL teardown — equips if owned, 3D-previews if locked!)
      container.querySelectorAll('[data-skin]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          const skId = btn.getAttribute('data-skin') || null;
          previewSkinId = skId;
          const owned = !skId || save.unlockedSkins.includes(skId);
          if (hState.unlocked && owned) {
            save.heroes[inspected.id].skinId = skId;
            onSaveChanged();
          }
          const skObj = skId ? gameData.skins.find(s => s.id === skId) : null;
          if (turntable) turntable.setHero(inspected, skObj);
          container.querySelectorAll('[data-skin]').forEach(b => b.classList.toggle('active', b === btn));
          const noteEl = document.getElementById('saSkinPreviewNote');
          if (noteEl) noteEl.classList.toggle('hidden', owned);
        };
      });

      const tryBtn = document.getElementById('saTryInspectedBtn');
      if (tryBtn) {
        tryBtn.onclick = () => {
          uiClickSfx();
          const testSkin = (previewSkinId && save.unlockedSkins.includes(previewSkinId)) ? previewSkinId : (hState.skinId || null);
          onStartMatch('practice', null, inspected.id, testSkin, hState.unlocked ? hState.level : 9);
        };
      }

      const openCaseHeroBtn = document.getElementById('saOpenCaseFromHeroBtn');
      if (openCaseHeroBtn) {
        openCaseHeroBtn.onclick = () => {
          uiClickSfx();
          triggerOpenCase();
        };
      }

      const claimMastBtn = document.getElementById('saClaimMasteryBtn');
      if (claimMastBtn && claimableMasteryTier > 0) {
        claimMastBtn.onclick = () => {
          uiClickSfx();
          save.claimedMastery = save.claimedMastery || [];
          const key = `${inspected.id}:${claimableMasteryTier}`;
          if (!save.claimedMastery.includes(key)) {
            save.claimedMastery.push(key);
            if (claimableMasteryTier === 1) {
              SaveMod.addCurrency(save, 'coins', 150, i18n.t('ledger_mastery'));
            } else if (claimableMasteryTier === 2) {
              SaveMod.addCurrency(save, 'pp', 80, i18n.t('ledger_mastery'));
              SaveMod.addCurrency(save, 'cases', 1, i18n.t('ledger_mastery'));
            } else if (claimableMasteryTier === 3) {
              SaveMod.addCurrency(save, 'coins', 300, i18n.t('ledger_mastery'));
              save.equippedTitleArchId = inspected.archetypeId;
              showToast(i18n.t('mastery_title_unlocked', { title: archTitleTxt }));
            }
            if (audio) audio.playPickup();
            onSaveChanged();
            renderAll();
          }
        };
      }

      const selBtn = document.getElementById('saSelectHeroBtn');
      if (selBtn) {
        selBtn.onclick = () => {
          uiClickSfx();
          save.selectedHeroId = inspected.id;
          onSaveChanged();
          activeTab = 'play';
          renderAll();
        };
      }

      const upgBtn = document.getElementById('saUpgradeHeroBtn');
      if (upgBtn) {
        upgBtn.onclick = () => {
          const reason = i18n.t('ledger_upgrade', { hero: i18n.pick(inspected, 'name'), lv: hState.level + 1 });
          const res = SaveMod.upgradeHero(save, inspected.id, gameData, reason);
          if (res.ok) {
            if (audio) audio.playPickup();
            showToast(`${i18n.pick(inspected, 'name')} -> ${i18n.t('hero_power_badge', { lv: res.newLevel })}!`);
            onSaveChanged();
            renderAll();
            if (turntable && typeof turntable.triggerPose === 'function') turntable.triggerPose();
          }
        };
      }

      const ppBoostBtn = document.getElementById('saAdPpBoostBtn');
      if (ppBoostBtn) {
        ppBoostBtn.onclick = async () => {
          const used = save.daily.rewardedPpCount || 0;
          if (adBusy || used >= 2) return;
          uiClickSfx();
          adBusy = true;
          ppBoostBtn.disabled = true;
          try {
            const res = await platform.showRewardedAd('hero_pp_supply');
            if (res && res.rewarded) {
              save.daily.rewardedPpCount = used + 1;
              SaveMod.addCurrency(save, 'pp', 30, i18n.t('ledger_ad_pp_supply'));
              if (audio) audio.playPickup();
              onSaveChanged();
              renderAll();
            } else {
              ppBoostBtn.disabled = false;
            }
          } finally {
            adBusy = false;
          }
        };
      }
    }

    function grantRewardObject(reward, reasonText) {
      if (reward.type === 'coins') {
        SaveMod.addCurrency(save, 'coins', reward.amount, reasonText);
      } else if (reward.type === 'power_points') {
        SaveMod.addCurrency(save, 'pp', reward.amount, reasonText);
      } else if (reward.type === 'case') {
        SaveMod.addCurrency(save, 'cases', reward.count || 1, reasonText);
      } else if (reward.type === 'hero' && reward.heroId) {
        if (!save.heroes[reward.heroId] || !save.heroes[reward.heroId].unlocked) {
          save.heroes[reward.heroId] = { unlocked: true, level: 1, trophies: 0, skinId: null };
        } else {
          SaveMod.addCurrency(save, 'coins', 200, reasonText + i18n.t('ledger_duplicate_suffix'));
        }
      } else if (reward.type === 'skin' && reward.skinId) {
        if (!save.unlockedSkins.includes(reward.skinId)) {
          save.unlockedSkins.push(reward.skinId);
        } else {
          SaveMod.addCurrency(save, 'coins', 140, reasonText + i18n.t('ledger_duplicate_suffix'));
        }
      }
    }

    function renderRoadView(container) {
      disposeTurntable();
      const totalTrophies = SaveMod.getTotalTrophies(save);

      container.innerHTML = `
        <div class="sa-card">
          <h2>${ico('trophy')} ${i18n.t('road_title')} — ${totalTrophies} / 1500</h2>
          <p class="sa-muted">${i18n.t('road_subtitle')}</p>
          <div class="sa-road-track">
            ${gameData.meta.trophyRoad.map(node => {
              const reached = totalTrophies >= node.trophies;
              const claimed = save.claimedRoad.includes(node.trophies);
              const rIco = node.reward.type === 'hero' ? ico('star') : (node.reward.type === 'case' ? ico('case') : (node.reward.type === 'power_points' ? ico('bolt') : ico('coin')));
              return `
                <div class="sa-road-node ${reached ? 'reached' : ''} ${claimed ? 'claimed' : ''}">
                  <div class="sa-road-trophies">${ico('trophy')} ${node.trophies}</div>
                  <div class="sa-road-ico">${rIco}</div>
                  <div class="sa-road-lbl">${i18n.pick(node.reward, 'label')}</div>
                  ${reached && !claimed
                    ? `<button class="sa-btn sa-btn-gold sa-btn-sm" data-claim-road="${node.trophies}">${i18n.t('btn_claim')}</button>`
                    : `<span class="sa-road-status">${claimed ? i18n.t('btn_claimed') : ico('lock')}</span>`}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      container.querySelectorAll('[data-claim-road]').forEach(btn => {
        btn.onclick = () => {
          const tVal = Number(btn.getAttribute('data-claim-road'));
          const node = gameData.meta.trophyRoad.find(n => n.trophies === tVal);
          if (!node || save.claimedRoad.includes(tVal) || totalTrophies < tVal) return;
          save.claimedRoad.push(tVal);
          grantRewardObject(node.reward, i18n.t('ledger_road', { t: tVal }));
          if (audio) audio.playPickup();
          onSaveChanged();
          renderAll();
        };
      });
    }

    function renderSeasonView(container) {
      disposeTurntable();
      const season = gameData.meta.season;
      container.innerHTML = `
        <div class="sa-card">
          <h2>${ico('star')} ${i18n.pick(season, 'name')}</h2>
          <p class="sa-muted">${i18n.t('season_subtitle')} · ★ <b>${save.seasonTokens}</b></p>
          <div class="sa-road-track">
            ${season.tiers.map(node => {
              const reached = save.seasonTokens >= node.tokensRequired;
              const claimed = save.claimedSeason.includes(node.tier);
              const rIco = node.reward.type === 'case' ? ico('case') : (node.reward.type === 'skin' ? ico('star') : (node.reward.type === 'power_points' ? ico('bolt') : ico('coin')));
              return `
                <div class="sa-road-node ${reached ? 'reached' : ''} ${claimed ? 'claimed' : ''}">
                  <div class="sa-road-trophies">${i18n.t('season_tier_label', { tier: node.tier, tokens: node.tokensRequired })}</div>
                  <div class="sa-road-ico">${rIco}</div>
                  <div class="sa-road-lbl">${i18n.pick(node.reward, 'label')}</div>
                  ${reached && !claimed
                    ? `<button class="sa-btn sa-btn-gold sa-btn-sm" data-claim-season="${node.tier}">${i18n.t('btn_claim')}</button>`
                    : `<span class="sa-road-status">${claimed ? i18n.t('btn_claimed') : ico('lock')}</span>`}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      container.querySelectorAll('[data-claim-season]').forEach(btn => {
        btn.onclick = () => {
          const tier = Number(btn.getAttribute('data-claim-season'));
          const node = season.tiers.find(n => n.tier === tier);
          if (!node || save.claimedSeason.includes(tier) || save.seasonTokens < node.tokensRequired) return;
          save.claimedSeason.push(tier);
          grantRewardObject(node.reward, i18n.t('ledger_season', { tier }));
          if (audio) audio.playPickup();
          onSaveChanged();
          renderAll();
        };
      });
    }

    function renderQuestsView(container) {
      disposeTurntable();
      const allThreeDone = save.daily.quests.every(q => q.claimed);
      const now = new Date();
      const msUntilMidnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
      const resetH = Math.max(0, Math.floor(msUntilMidnightUtc / 3600000));
      const resetM = Math.max(0, Math.floor((msUntilMidnightUtc % 3600000) / 60000));
      const streakCoins = Math.min(200, 40 + (save.daily.streak || 1) * 15);
      const streakPp = 15;

      container.innerHTML = `
        <div class="sa-quests-layout">
          <div class="sa-card">
            <div class="sa-quest-head" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
              <h3>◈ ${i18n.t('quests_title')}</h3>
              <div>
                <span class="sa-badge release">★ ${i18n.t('quests_streak', { days: save.daily.streak })}</span>
                <span class="sa-muted" style="margin-left:6px;">${i18n.t('quests_reset_in', { h: resetH, m: resetM })}</span>
              </div>
            </div>

            <div class="sa-chain-box" style="margin-bottom:8px;">
              <span>★ ${i18n.t('streak_login_box', { days: save.daily.streak, coins: streakCoins, pp: streakPp })}</span>
              ${!save.daily.streakClaimed
                ? `<button class="sa-btn sa-btn-gold sa-btn-sm" id="saClaimStreakBtn">${i18n.t('btn_claim')}</button>`
                : `<span class="sa-muted">${i18n.t('btn_claimed')}</span>`}
            </div>

            <p class="sa-muted">${i18n.t('quests_chain_bonus')}</p>
            <div class="sa-quest-list">
              ${save.daily.quests.map((q, idx) => {
                const tpl = gameData.meta.dailyQuestTemplates.find(t => t.id === q.id) || gameData.meta.dailyQuestTemplates[0];
                const done = q.progress >= q.target;
                const rewStr = tpl.rewardCoins ? `${ico('coin')}${tpl.rewardCoins}` : `${ico('bolt')}${tpl.rewardPowerPoints}`;
                return `
                  <div class="sa-quest-row">
                    <div>
                      <strong>${i18n.pick(tpl, 'name')}</strong>
                      <div class="sa-muted">${Math.min(q.progress, q.target)} / ${q.target} · ${rewStr} + ★${tpl.seasonTokens}</div>
                    </div>
                    ${done && !q.claimed
                      ? `<div style="display:flex;gap:6px;">
                          <button class="sa-btn sa-btn-gold sa-btn-sm" data-dq="${idx}">${i18n.t('btn_claim')}</button>
                          <button class="sa-btn sa-btn-accent sa-btn-sm" data-dq-ad="${idx}">${i18n.t('btn_claim_x2_ad')}</button>
                        </div>`
                      : `<span class="sa-muted">${q.claimed ? i18n.t('btn_claimed') : '...'}</span>`}
                  </div>
                `;
              }).join('')}
            </div>

            <div class="sa-chain-box">
              <span>${ico('case')} ${i18n.t('quests_chain_bonus')}</span>
              ${allThreeDone && !save.daily.chainBonusClaimed
                ? `<button class="sa-btn sa-btn-gold sa-btn-sm" id="saClaimChainCaseBtn">${i18n.t('btn_claim')}</button>`
                : `<span>${save.daily.chainBonusClaimed ? i18n.t('btn_claimed') : `${save.daily.quests.filter(q => q.claimed).length}/3`}</span>`}
            </div>
          </div>

          <div class="sa-card">
            <h3>★ ${i18n.t('ach_section_title')}</h3>
            <div class="sa-quest-list">
              ${gameData.meta.achievements.map(ach => {
                const cur = getAchievementProgress(ach);
                const done = cur >= ach.target;
                const claimed = save.claimedAchievements.includes(ach.id);
                const rew = ach.reward.type === 'case' ? `${ico('case')} 1` : (ach.reward.type === 'coins' ? `${ico('coin')} ${ach.reward.amount}` : `${ico('bolt')} ${ach.reward.amount}`);
                return `
                  <div class="sa-quest-row">
                    <div>
                      <strong>${i18n.pick(ach, 'name')}</strong> — <small>${i18n.pick(ach, 'desc')}</small>
                      <div class="sa-muted">${Math.min(cur, ach.target)} / ${ach.target} · ${rew}</div>
                    </div>
                    ${done && !claimed
                      ? `<button class="sa-btn sa-btn-gold sa-btn-sm" data-ach="${ach.id}">${i18n.t('btn_claim')}</button>`
                      : `<span class="sa-muted">${claimed ? i18n.t('btn_claimed') : ''}</span>`}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;

      const streakBtn = document.getElementById('saClaimStreakBtn');
      if (streakBtn) {
        streakBtn.onclick = () => {
          if (save.daily.streakClaimed) return;
          save.daily.streakClaimed = true;
          SaveMod.addCurrency(save, 'coins', streakCoins, i18n.t('ledger_streak_login'));
          SaveMod.addCurrency(save, 'pp', streakPp, i18n.t('ledger_streak_login'));
          if (audio) audio.playPickup();
          onSaveChanged();
          renderAll();
        };
      }

      container.querySelectorAll('[data-dq]').forEach(btn => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-dq'));
          const q = save.daily.quests[idx];
          if (!q || q.claimed || q.progress < q.target) return;
          const tpl = gameData.meta.dailyQuestTemplates.find(t => t.id === q.id) || gameData.meta.dailyQuestTemplates[0];
          q.claimed = true;
          if (tpl.rewardCoins) SaveMod.addCurrency(save, 'coins', tpl.rewardCoins, i18n.t('ledger_quest'));
          if (tpl.rewardPowerPoints) SaveMod.addCurrency(save, 'pp', tpl.rewardPowerPoints, i18n.t('ledger_quest'));
          save.seasonTokens += tpl.seasonTokens || 25;
          if (audio) audio.playPickup();
          onSaveChanged();
          renderAll();
        };
      });

      container.querySelectorAll('[data-dq-ad]').forEach(btn => {
        btn.onclick = async () => {
          const idx = Number(btn.getAttribute('data-dq-ad'));
          const q = save.daily.quests[idx];
          if (adBusy || !q || q.claimed || q.progress < q.target) return;
          uiClickSfx();
          adBusy = true;
          btn.disabled = true;
          try {
            const res = await platform.showRewardedAd('daily_quest_x2');
            if (res && res.rewarded && !q.claimed) {
              const tpl = gameData.meta.dailyQuestTemplates.find(t => t.id === q.id) || gameData.meta.dailyQuestTemplates[0];
              q.claimed = true;
              if (tpl.rewardCoins) SaveMod.addCurrency(save, 'coins', tpl.rewardCoins * 2, i18n.t('ledger_quest') + ' ×2');
              if (tpl.rewardPowerPoints) SaveMod.addCurrency(save, 'pp', tpl.rewardPowerPoints * 2, i18n.t('ledger_quest') + ' ×2');
              save.seasonTokens += (tpl.seasonTokens || 25) * 2;
              if (audio) audio.playPickup();
              onSaveChanged();
              renderAll();
            } else {
              btn.disabled = false;
            }
          } finally {
            adBusy = false;
          }
        };
      });

      const chainBtn = document.getElementById('saClaimChainCaseBtn');
      if (chainBtn) {
        chainBtn.onclick = () => {
          save.daily.chainBonusClaimed = true;
          SaveMod.addCurrency(save, 'cases', 1, 'Daily 3-Quest Chain Case');
          onSaveChanged();
          renderAll();
          triggerOpenCase();
        };
      }

      container.querySelectorAll('[data-ach]').forEach(btn => {
        btn.onclick = () => {
          const achId = btn.getAttribute('data-ach');
          const ach = gameData.meta.achievements.find(a => a.id === achId);
          if (!ach || save.claimedAchievements.includes(achId)) return;
          save.claimedAchievements.push(achId);
          grantRewardObject(ach.reward, i18n.t('ledger_ach'));
          if (audio) audio.playPickup();
          onSaveChanged();
          renderAll();
        };
      });
    }

    function renderSocialView(container) {
      disposeTurntable();
      const myTrophies = SaveMod.getTotalTrophies(save);
      const myGhostCode = SaveMod.encodeFriendGhost(save, gameData);

      const board = [
        { name: '★ Вега_Прайм', trophies: 1380, me: false },
        { name: i18n.pick(gameData.meta.presetFriendGhosts[2], 'name'), trophies: 920, me: false },
        { name: i18n.pick(gameData.meta.presetFriendGhosts[0], 'name'), trophies: 770, me: false },
        { name: i18n.pick(gameData.meta.presetFriendGhosts[1], 'name'), trophies: 540, me: false },
        { name: '★ Комета_RU', trophies: 290, me: false },
        { name: save.playerName + i18n.t('social_you_suffix'), trophies: myTrophies, me: true }
      ].sort((a, b) => b.trophies - a.trophies);

      container.innerHTML = `
        <div class="sa-quests-layout">
          <div class="sa-card">
            <h3>${ico('ghost')} ${i18n.t('social_ghost_title')}</h3>
            <p class="sa-muted">${i18n.t('social_ghost_desc')}</p>

            <div class="sa-ghost-mycode">
              <span>${i18n.t('social_my_code')}</span>
              <code>${myGhostCode}</code>
              <button class="sa-chip-btn" id="saCopyGhostBtn">${i18n.t('social_copy_code')}</button>
            </div>

            <div class="sa-ghost-import-row">
              <input type="text" id="saGhostInput" class="sa-input" placeholder="${i18n.t('social_import_placeholder')}" />
              <button class="sa-btn sa-btn-primary sa-btn-sm" id="saImportGhostBtn">${i18n.t('social_import_btn')}</button>
              ${save.activeFriendGhost ? `<button class="sa-btn sa-btn-secondary sa-btn-sm" id="saClearGhostBtn">${i18n.t('social_clear_ghost')}</button>` : ''}
            </div>

            <div class="sa-preset-ghosts">
              ${gameData.meta.presetFriendGhosts.map(g => `
                <button class="sa-chip-btn" data-preset-ghost="${g.code}">
                  ${ico('ghost')} ${i18n.pick(g, 'name')} (${ico('trophy')}${g.trophies} · Ур.${g.level})
                </button>
              `).join('')}
            </div>

            <div style="margin-top:12px;">
              <button class="sa-btn sa-btn-accent" id="saInviteVkBtn" ${save.daily.inviteCaseClaimed ? 'disabled' : ''}>
                ★ ${i18n.t('btn_invite_case')}
              </button>
            </div>
          </div>

          <div class="sa-card">
            <h3>★ ${i18n.t('club_title')}</h3>
            <p class="sa-muted">${i18n.t('club_desc')}</p>
            <button class="sa-btn sa-btn-gold sa-btn-sm" id="saOpenClubBtn">${i18n.t('club_title')} — ${i18n.t('club_join')}</button>
            <div style="height:12px"></div>
            <h3>${ico('trophy')} ${i18n.t('social_title')}</h3>
            <div class="sa-quest-list">
              ${board.map((row, idx) => `
                <div class="sa-quest-row ${row.me ? 'me-highlight' : ''}">
                  <span><b>#${idx + 1}</b> ${row.name}</span>
                  <b>${ico('trophy')} ${row.trophies}</b>
                </div>
              `).join('')}
            </div>

            <h4 style="margin-top:14px;">◈ ${i18n.t('social_bracket_stats')}</h4>
            <div class="sa-bracket-mini">
              ${gameData.balance.botBrackets.map(b => {
                const st = save.stats.bracketWinrate[b.id] || { matches: 0, wins: 0 };
                const wr = st.matches > 0 ? Math.round((st.wins / st.matches) * 100) + '%' : '—';
                return `<span class="sa-chip-btn">${b.minTrophies}+: ${wr} (${st.wins}/${st.matches})</span>`;
              }).join('')}
            </div>
          </div>
        </div>
      `;

      const copyGhostBtn = document.getElementById('saCopyGhostBtn');
      if (copyGhostBtn) {
        copyGhostBtn.onclick = () => {
          uiClickSfx();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(myGhostCode).catch(() => {});
          }
          showToast(i18n.t('toast_copied'));
        };
      }

      const importGhostBtn = document.getElementById('saImportGhostBtn');
      if (importGhostBtn) {
        importGhostBtn.onclick = () => {
          uiClickSfx();
          const inpEl = document.getElementById('saGhostInput');
          const val = inpEl ? inpEl.value : '';
          const decoded = SaveMod.decodeFriendGhost(val, gameData);
          if (decoded) {
            save.activeFriendGhost = decoded;
            onSaveChanged();
            showToast(i18n.t('toast_ghost_set'));
            renderSocialView(container);
          }
        };
      }

      const clrBtn = document.getElementById('saClearGhostBtn');
      if (clrBtn) {
        clrBtn.onclick = () => {
          uiClickSfx();
          save.activeFriendGhost = null;
          onSaveChanged();
          renderSocialView(container);
        };
      }

      container.querySelectorAll('[data-preset-ghost]').forEach(btn => {
        btn.onclick = () => {
          uiClickSfx();
          const decoded = SaveMod.decodeFriendGhost(btn.getAttribute('data-preset-ghost'), gameData);
          if (decoded) {
            save.activeFriendGhost = decoded;
            onSaveChanged();
            showToast(i18n.t('toast_ghost_set'));
            renderSocialView(container);
          }
        };
      });

      const clubOpenBtn = document.getElementById('saOpenClubBtn');
      if(clubOpenBtn) clubOpenBtn.onclick=()=>{ uiClickSfx(); openClubModal(); };
      const invBtn = document.getElementById('saInviteVkBtn');
      if (invBtn) {
        invBtn.onclick = async () => {
          if (adBusy || save.daily.inviteCaseClaimed) return;
          uiClickSfx();
          adBusy = true;
          invBtn.disabled = true;
          try {
            const res = await platform.inviteFriend();
            if (res && res.invited) {
              save.daily.inviteCaseClaimed = true;
              SaveMod.addCurrency(save, 'cases', 1, i18n.t('ledger_invite'));
              onSaveChanged();
              renderAll();
              triggerOpenCase();
            } else {
              invBtn.disabled = false;
            }
          } finally {
            adBusy = false;
          }
        };
      }
    }

    function openSettingsModal() {
      if (document.getElementById('saSettingsModal')) return;
      const modal = document.createElement('div');
      modal.className = 'sa-case-overlay';
      modal.id = 'saSettingsModal';
      modal.innerHTML = `
        <div class="sa-case-card">
          <h3>⚙ ${i18n.t('settings_title')}</h3>
          <label class="sa-hardcore-row">
            <input type="checkbox" id="saSoundChk" ${save.settings.sound ? 'checked' : ''} />
            <span>♪ ${i18n.t('settings_sound')}</span>
          </label>
          <div style="margin:12px 0;text-align:left;">
            <div class="sa-muted">${i18n.t('settings_quality')}</div>
            <select id="saQualitySelect" class="sa-select" style="width:100%;margin-top:6px;">
              <option value="auto" ${save.settings.quality === 'auto' ? 'selected' : ''}>${i18n.t('quality_auto')}</option>
              <option value="high" ${save.settings.quality === 'high' ? 'selected' : ''}>${i18n.t('quality_high')}</option>
              <option value="low" ${save.settings.quality === 'low' ? 'selected' : ''}>${i18n.t('quality_low')}</option>
              <option value="2d" ${save.settings.quality === '2d' ? 'selected' : ''}>${i18n.t('quality_2d')}</option>
            </select>
          </div>
          <div class="sa-ledger-box" style="text-align:left;margin-bottom:12px;">
            ${(save.ledger || []).slice(-5).reverse().map(l => `<div class="sa-muted">${l.delta > 0 ? '+' : ''}${l.delta} ${l.currency}: ${l.reason}</div>`).join('')}
          </div>
          <button class="sa-btn sa-btn-primary" id="saCloseSettingsBtn">${i18n.t('btn_close')}</button>
        </div>
      `;
      document.body.appendChild(modal);

      const soundChk = modal.querySelector('#saSoundChk');
      if (soundChk) {
        soundChk.onchange = (e) => {
          save.settings.sound = e.target.checked;
          save.settings.music = e.target.checked;
          if (audio) audio.setSettings({ sound: save.settings.sound, music: save.settings.music });
          onSaveChanged();
        };
      }
      const qualSel = modal.querySelector('#saQualitySelect');
      if (qualSel) {
        qualSel.onchange = (e) => {
          save.settings.quality = e.target.value;
          onSaveChanged();
          if (onQualityChanged) onQualityChanged(save.settings.quality);
        };
      }
      const closeBtn = modal.querySelector('#saCloseSettingsBtn');
      if (closeBtn) {
        closeBtn.onclick = () => {
          uiClickSfx();
          modal.remove();
        };
      }
    }

    function renderViewContent() {
      const container = document.getElementById('saViewContent');
      if (!container) return;
      if (activeTab === 'play') renderPlayView(container);
      else if (activeTab === 'heroes') renderHeroesView(container);
      else if (activeTab === 'road') renderRoadView(container);
      else if (activeTab === 'season') renderSeasonView(container);
      else if (activeTab === 'quests') renderQuestsView(container);
      else if (activeTab === 'social') renderSocialView(container);
    }

    function renderAll() {
      renderTopBar();
      renderNavTabs();
      renderViewContent();
    }

    function showLobby(visible) {
      if (lobbyRoot) lobbyRoot.classList.toggle('hidden', !visible);
      if (matchHud) matchHud.classList.toggle('hidden', visible);
      if (visible) {
        pinTrayOpen = false;
        if (pinTrayEl) pinTrayEl.classList.add('hidden');
      }
    }

    function updateMatchHud(state, onSkipTutorial, onTogglePause) {
      ensureBattleOverlays();
      const scoreEl = document.getElementById('saHudScore');
      const timerEl = document.getElementById('saHudTimer');
      const bannerEl = document.getElementById('saHudBanner');
      const objectiveEl = document.getElementById('saHudObjective');
      const objectiveTextEl = document.getElementById('saHudObjectiveText');
      const superFillEl = document.getElementById('saSuperBtn');
      const gadgetBtnEl = document.getElementById('saGadgetBtn');
      const gadgetChargesEl = document.getElementById('saGadgetCharges');
      const overdriveBtnEl = document.getElementById('saOverdriveBtn');
      const bossHudEl = document.getElementById('saBossHudBar');
      const skipBtn = document.getElementById('saSkipTutorialBtn');
      const vignetteEl = document.getElementById('saBattleVignette');
      const frenzyEl = document.getElementById('saFrenzyBorder');
      const heartEl = document.getElementById('saLowHpHeart');
      const pracBtn = document.getElementById('saPracticeChargeBtn');
      const kfEl = document.getElementById('saKillFeed');

      const player = state.units.find(u => u.isPlayer) || state.units[0];
      // Low HP vignette + heartbeat + hit flash
      if (player) {
        const hpPct = player.maxHp > 0 ? player.hp / player.maxHp : 1;
        if (vignetteEl) vignetteEl.classList.toggle('active', hpPct > 0 && hpPct < 0.32);
        if (heartEl) {
          if (hpPct > 0 && hpPct < 0.30) {
            lowHpHeartTimer -= 0.016;
            if (lowHpHeartTimer <= 0) {
              heartEl.classList.remove('beat'); void heartEl.offsetWidth; heartEl.classList.add('beat');
              setTimeout(()=> heartEl.classList.remove('beat'), 600);
              lowHpHeartTimer = 0.85;
              if (audio && audio.playPopHit) { /* subtle hb */ }
            }
          } else {
            heartEl.classList.remove('beat');
          }
        }
        if (player.hitFlashTimer > 0.05 && player.hitFlashTimer < 0.17) {
          triggerBattleHitFlash(player.hitFlashTimer > 0.18);
        }
        // Quest live bar: pick active incomplete quest, or first unclaimed
        if (questLiveBarEl) {
          const quests = (save.daily && Array.isArray(save.daily.quests)) ? save.daily.quests : [];
          const active = quests.find(q => !q.claimed && q.progress < q.target) || quests.find(q => !q.claimed);
          if (active) {
            const info = formatQuestLiveText(active);
            if (info) {
              questLiveBarEl.classList.add('show');
              const txtEl = document.getElementById('saQuestLiveText');
              const fillEl = document.getElementById('saQuestLiveFill');
              if (txtEl && txtEl.textContent !== info.text) {
                txtEl.textContent = info.text;
              }
              if (fillEl) {
                fillEl.style.width = info.pct + '%';
                fillEl.style.background = info.isComplete
                  ? 'linear-gradient(90deg, #00e676, #76ff03)'
                  : 'linear-gradient(90deg, #ffea00, #ff9100)';
              }
            } else {
              questLiveBarEl.classList.remove('show');
            }
          } else {
            questLiveBarEl.classList.remove('show');
          }
        }
      }
      const bossUnit = state.modeId === 'boss_siege' ? state.units.find(u => u.isBoss) : null;
      const isTutOrPrac = state.modeId === 'tutorial' || state.modeId === 'practice';
      if (objectiveEl && objectiveTextEl) {
        const objective = state.modeId === 'practice'
          ? i18n.t('hud_practice_hint')
          : (!isTutOrPrac && state.modeId !== 'boss_siege' && state.modeCfg ? i18n.pick(state.modeCfg, 'desc') : '');
        objectiveEl.classList.toggle('hidden', !objective);
        const objectiveLabel = objective ? `${i18n.t('hud_goal_label')} · ${objective}` : '';
        if (objectiveTextEl.textContent !== objectiveLabel) objectiveTextEl.textContent = objectiveLabel;
      }

      if (timerEl) {
        if (state.modeId === 'practice') {
          timerEl.textContent = '∞';
        } else {
          const remSec = Math.max(0, Math.ceil(state.maxTimeSec - state.timeSec));
          const mm = Math.floor(remSec / 60);
          const ss = String(remSec % 60).padStart(2, '0');
          timerEl.textContent = `${mm}:${ss}`;
        }
      }

      if (skipBtn) {
        skipBtn.classList.toggle('hidden', !isTutOrPrac);
        if (isTutOrPrac) {
          skipBtn.textContent = state.modeId === 'practice' ? `◀ ${i18n.t('hud_exit_match')}` : i18n.t('btn_skip');
          skipBtn.onclick = onSkipTutorial;
        }
      }

      if (pracBtn) {
        pracBtn.classList.toggle('hidden', state.modeId !== 'practice');
        if (state.modeId === 'practice') {
          pracBtn.textContent = i18n.t('hud_charge_super');
        }
      }

      if (scoreEl) {
        if (state.modeId === 'crystal_rush') {
          scoreEl.innerHTML = `<span class="ally">${ico('crystal')} ${state.teamCrystals[0]}</span> <i>:</i> <span class="enemy">${ico('crystal')} ${state.teamCrystals[1]}</span>`;
        } else if (state.modeId === 'star_hunt') {
          scoreEl.innerHTML = `<span class="ally">${ico('star')} ${state.teamStars[0]}</span> <i>:</i> <span class="enemy">${ico('star')} ${state.teamStars[1]}</span>`;
        } else if (state.modeId === 'last_hero') {
          const alive = state.units.filter(u => u.alive && !u.isSummon).length;
          scoreEl.innerHTML = `<span class="ally">${i18n.t('hud_alive')}: ${alive}/6</span>`;
        } else if (state.modeId === 'vault_breach' && state.vaults) {
          const p0 = Math.round((state.vaults[0].hp / state.vaults[0].maxHp) * 100);
          const p1 = Math.round((state.vaults[1].hp / state.vaults[1].maxHp) * 100);
          scoreEl.innerHTML = `<span class="ally">${ico('shield')} ${p0}%</span> <i>:</i> <span class="enemy">${ico('shield')} ${p1}%</span>`;
        } else if (state.modeId === 'star_ball') {
          scoreEl.innerHTML = `<span class="ally">${ico('ball')} ${state.teamGoals[0]}</span> <i>:</i> <span class="enemy">${ico('ball')} ${state.teamGoals[1]}</span>`;
        } else if (state.modeId === 'hot_zone' && state.teamZonePct) {
          scoreEl.innerHTML = `<span class="ally">${ico('zone')} ${Math.floor(state.teamZonePct[0])}%</span> <i>:</i> <span class="enemy">${ico('zone')} ${Math.floor(state.teamZonePct[1])}%</span>`;
        } else if (state.modeId === 'boss_siege' && bossUnit) {
          const bPct = Math.max(0, Math.round((bossUnit.hp / Math.max(1, bossUnit.maxHp)) * 100));
          scoreEl.innerHTML = `<span class="enemy">${ico('boss')} ${i18n.t('boss_tier_label', { tier: state.bossTier || 1 })} · ${bPct}%</span>`;
        } else if (state.modeId === 'practice') {
          scoreEl.innerHTML = `<span class="ally">◎ ${i18n.t('hud_practice_title')} · ${i18n.t('result_damage')}: ${player ? player.damageDealt : 0}</span>`;
        } else if (state.modeId === 'tutorial') {
          scoreEl.innerHTML = `<span class="ally">◎ ${i18n.t('btn_tutorial')}</span>`;
        }
      }

      if (bossHudEl) {
        bossHudEl.classList.toggle('hidden', !bossUnit || !bossUnit.alive);
        if (bossUnit && bossUnit.alive) {
          const bNameEl = document.getElementById('saBossHudName');
          const bPhaseEl = document.getElementById('saBossHudPhase');
          const bFillEl = document.getElementById('saBossHpFill');
          const bTxtEl = document.getElementById('saBossHpText');
          const bPct = Math.max(0, Math.min(100, (bossUnit.hp / Math.max(1, bossUnit.maxHp)) * 100));
          if (bNameEl) bNameEl.textContent = bossUnit.name;
          if (bPhaseEl) bPhaseEl.textContent = i18n.t('boss_phase_label', { phase: bossUnit.bossPhase || 1 });
          if (bFillEl) bFillEl.style.width = `${bPct.toFixed(1)}%`;
          if (bTxtEl) bTxtEl.textContent = `${Math.max(0, bossUnit.hp)} / ${bossUnit.maxHp}`;
        }
      }

      if (kfEl && state.killFeed) {
        const recent = state.killFeed.filter(k => state.timeSec - k.timeSec < 5.5);
        const kfKey = recent.map(k => k.id).join('|');
        if (kfKey !== lastKillFeedKey) {
          lastKillFeedKey = kfKey;
          kfEl.innerHTML = recent.map(k => `
            <div class="sa-kf-item">
              <span class="${k.killerTeam === 0 ? 'sa-kf-ally' : 'sa-kf-enemy'}">${k.killer}</span>
              <span>⚔</span>
              <span class="${k.victimTeam === 0 ? 'sa-kf-ally' : 'sa-kf-enemy'}">${k.victim}</span>
            </div>
          `).join('');
          if (recent.length > lastHudKillCount) {
            const last = recent[recent.length-1];
            if (last && last.killerTeam===0) {
              // first blood check
              if (state.killFeed && state.killFeed.length===1) showStreakToast(state.lang==='ru' ? '★ ПЕРВАЯ КРОВЬ!' : '★ FIRST BLOOD!');
            }
          }
          lastHudKillCount = recent.length;
        }
      }
      // Combo detection from state.playerCombo
      if (state.playerCombo !== undefined && state.playerCombo !== lastHudCombo) {
        if (state.playerCombo >= 2 && state.playerCombo > lastHudCombo) {
          showBattleCombo(state.playerCombo);
          if (state.playerCombo >= 3) showStreakToast(state.lang==='ru' ? `РАМПАГА x${state.playerCombo}!` : `RAMPAGE x${state.playerCombo}!`);
        }
        lastHudCombo = state.playerCombo || 0;
      }
      // Frenzy border
      if (frenzyEl) frenzyEl.classList.toggle('active', Boolean(state.isFrenzy));
      // Revenge toast
      if (state.revengeTargetId && state.revengeTimer > 0 && state.revengeTimer < 7.9 && !state._revengeToastShown) {
        showStreakToast(state.lang==='ru' ? 'МЕСТЬ: убей обидчика!' : 'REVENGE: hunt killer!');
        state._revengeToastShown = true;
      }
      if (!state.revengeTargetId) state._revengeToastShown = false;

      if (bannerEl) {
        let msg = '';
        if (state.modeId === 'tutorial') {
          msg = i18n.t('tut_step_' + (state.tutorialStep || 1));
        } else if (state.modeId === 'practice' && state.timeSec < 8.0) {
          msg = i18n.t('hud_practice_hint');
        } else if (state.countdownTeam !== null && state.modeId === 'crystal_rush') {
          msg = i18n.t('hud_countdown', { sec: Math.ceil(state.countdownSec) });
        } else if (player && !player.alive) {
          msg = i18n.t('hud_respawn', { sec: Math.ceil(player.respawnTimer) });
        } else if (player && player.inBush) {
          msg = `★ ${i18n.t('hud_bush_hidden')}`;
        } else if (state.timeSec < 4.0 && state.modeCfg && state.modeCfg.descRu && (!state.bracketInfo || state.bracketInfo.baseIdx > 0)) {
          msg = i18n.pick(state.modeCfg, 'desc');
        } else if (state.bracketInfo && state.bracketInfo.baseIdx === 0) {
          if (state.timeSec < 8) msg = i18n.t('onboard_tip_move');
          else if (state.timeSec < 16) msg = i18n.t('onboard_tip_shoot');
          else if (player && player.superCharge >= 100) msg = i18n.t('onboard_tip_super');
        }
        bannerEl.textContent = msg;
        bannerEl.classList.toggle('hidden', !msg);
      }

      if (superFillEl && player) {
        const pct = Math.round(player.superCharge);
        superFillEl.classList.toggle('ready', pct >= 100);
        const supKey = pct >= 100 ? 'RDY' : String(pct);
        if (superFillEl.dataset.hudKey !== supKey) {
          superFillEl.dataset.hudKey = supKey;
          superFillEl.innerHTML = pct >= 100 ? `★<small>${i18n.t('hud_super_ready')}</small>` : `⚡<small>${pct}%</small>`;
        }
      }

      if (gadgetBtnEl && player) {
        const charges = player.gadgetCharges || 0;
        const onCd = (player.gadgetCooldown || 0) > 0;
        gadgetBtnEl.classList.toggle('empty', charges <= 0 || onCd);
        if (gadgetChargesEl) {
          gadgetChargesEl.textContent = onCd ? `${Math.ceil(player.gadgetCooldown)}с` : (charges > 9 ? '∞' : `${charges}/3`);
        }
      }

      if (overdriveBtnEl && player) {
        const odPct = Math.round(player.overdriveCharge || 0);
        const odActive = (player.overdriveTimer || 0) > 0;
        overdriveBtnEl.classList.toggle('ready', odPct >= 100 && !odActive);
        overdriveBtnEl.classList.toggle('active', odActive);
        const odKey = odActive ? `ACT_${player.overdriveTimer.toFixed(1)}` : (odPct >= 100 ? 'RDY' : `PCT_${odPct}`);
        if (overdriveBtnEl.dataset.hudKey !== odKey) {
          overdriveBtnEl.dataset.hudKey = odKey;
          if (odActive) {
            overdriveBtnEl.innerHTML = `<span class="sa-od-ico">${ico('overdrive')}</span><small>${player.overdriveTimer.toFixed(1)}s</small>`;
          } else if (odPct >= 100) {
            overdriveBtnEl.innerHTML = `<span class="sa-od-ico">${ico('overdrive')}</span><small>${i18n.t('hud_overdrive_ready')}</small>`;
          } else {
            overdriveBtnEl.innerHTML = `<span class="sa-od-ico">${ico('overdrive')}</span><small id="saOverdrivePct">${odPct}%</small>`;
          }
        }
      }

      const pauseBtn = document.getElementById('saHudPauseBtn');
      if (pauseBtn) {
        pauseBtn.onclick = onTogglePause;
      }
    }

    function showPauseModal(visible, { isTutorial = false, onResume, onLeaveMatch } = {}) {
      if (!pauseOverlay) return;
      if (!visible) {
        pauseOverlay.classList.add('hidden');
        pauseOverlay.innerHTML = '';
        return;
      }
      pauseOverlay.classList.remove('hidden');
      pauseOverlay.innerHTML = `
        <div class="sa-case-card">
          <h2>❚❚ ${i18n.t('hud_pause')}</h2>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px;">
            <button class="sa-btn sa-btn-primary" id="saResumeMatchBtn">▶ ${i18n.t('hud_resume')}</button>
            <button class="sa-btn sa-btn-secondary" id="saLeaveMatchBtn">${isTutorial ? i18n.t('hud_exit_match') : i18n.t('hud_leave_match')}</button>
          </div>
        </div>
      `;
      const resBtn = document.getElementById('saResumeMatchBtn');
      if (resBtn) resBtn.onclick = () => { uiClickSfx(); if (onResume) onResume(); };
      const leaveBtn = document.getElementById('saLeaveMatchBtn');
      if (leaveBtn) leaveBtn.onclick = () => { uiClickSfx(); if (onLeaveMatch) onLeaveMatch(); };
    }

    function showVsIntro(state, durationMs = 1300) {
      if (!vsOverlay) return Promise.resolve();
      const allies = state.units.filter(u => !u.isSummon && u.team === 0);
      const enemies = state.units.filter(u => !u.isSummon && u.team !== 0);
      const eqTitle = getEquippedTitleText();
      const modCfg = (gameData.balance.modifiers || []).find(m => m.id === state.modifierId);
      const modNote = (modCfg && modCfg.id !== 'none') ? ` · ${i18n.pick(modCfg, 'name')}` : '';

      const renderCard = (u, side) => {
        const heroDef = getHeroById(u.heroId);
        const heroLbl = u.isBoss ? i18n.t('boss_tier_label', { tier: state.bossTier || 1 }) : i18n.pick(heroDef, 'name');
        const subTitle = (u.isPlayer && eqTitle) ? `<div class="sa-vs-title">★ ${eqTitle}</div>` : '';
        return `
          <div class="sa-vs-fighter ${side} ${u.isBoss ? 'boss' : ''}" style="--f-col:${u.palette.primary}">
            <div class="sa-vs-emblem" style="padding:0;overflow:hidden;">${u.isBoss ? ico('boss') : renderHeroBustSvg(heroDef)}</div>
            <div class="sa-vs-meta">
              <div class="sa-vs-uname">${u.name}</div>
              <div class="sa-vs-uhsub">${heroLbl} · ⚡${u.level}</div>
              ${subTitle}
            </div>
          </div>
        `;
      };

      vsOverlay.classList.remove('hidden');
      vsOverlay.innerHTML = `
        <div class="sa-vs-stage">
          <div class="sa-vs-header">
            <span class="sa-badge release">${i18n.pick(state.modeCfg, 'name')}</span>
            <div class="sa-vs-map">${i18n.pick(state.map, 'name')}${modNote}</div>
          </div>
          <div class="sa-vs-clash-row">
            <div class="sa-vs-team blue">
              <div class="sa-vs-team-lbl">${i18n.t('vs_your_squad')}</div>
              ${allies.map(u => renderCard(u, 'blue')).join('')}
            </div>
            <div class="sa-vs-bolt">VS</div>
            <div class="sa-vs-team red">
              <div class="sa-vs-team-lbl">${state.modeId === 'boss_siege' ? i18n.t('boss_name') : i18n.t('vs_enemy_squad')}</div>
              ${enemies.slice(0, 3).map(u => renderCard(u, 'red')).join('')}
            </div>
          </div>
        </div>
      `;

      if (audio && audio.playVsClash) audio.playVsClash();
      return new Promise((resolve) => {
        setTimeout(() => {
          vsOverlay.classList.add('hidden');
          vsOverlay.innerHTML = '';
          resolve();
        }, durationMs);
      });
    }

    function showResultsModal({ summary, onDoubleCoins, onContinue, onPlayAgain }) {
      if (!resultsOverlay) return;
      disposePodiumTurntable();
      resultsOverlay.classList.remove('hidden');

      let transitionBusy = false;
      let doubledClaimed = false;

      const title = summary.isVictory
        ? i18n.t('result_victory')
        : (summary.isDraw ? i18n.t('result_draw') : i18n.t('result_defeat'));

      const squadHtml = Array.isArray(summary.squadStats) && summary.squadStats.length
        ? `<div class="sa-res-squad-grid">
            ${summary.squadStats.slice(0, 6).map(u => `
              <div class="sa-res-fighter-chip ${u.isMvp ? 'mvp' : ''}">
                <div style="font-weight:900;color:${u.team === 0 ? '#38bdf8' : '#ff6b81'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${u.isMvp ? '★ ' : ''}${u.name}
                </div>
                <div class="sa-muted">${i18n.t('result_kills')}: <b>${u.kills}</b> · ${i18n.t('result_damage')}: <b>${u.damage}</b></div>
              </div>
            `).join('')}
          </div>`
        : '';

      resultsOverlay.innerHTML = `
        <div class="sa-results-card ${summary.isVictory ? 'win' : 'loss'}">
          <div style="display:flex;justify-content:center;gap:6px;flex-wrap:wrap;align-items:center;">
            <span class="sa-badge release">${summary.modeName}</span>
            ${summary.starPlayerName ? `<span class="sa-mvp-banner">${ico('crown')} ${i18n.t('result_star_player')}: ${summary.starPlayerName}</span>` : ''}
          </div>
          <h1 class="sa-res-title">${title}</h1>

          <div class="sa-podium-wrap">
            <canvas id="saResultsPodiumCanvas" width="380" height="145"></canvas>
          </div>

          <div style="display:flex;justify-content:center;gap:6px;flex-wrap:wrap;">
            ${summary.playerIsMvp ? `<span class="sa-pity-pill">★ ${i18n.t('result_mvp_bonus')}</span>` : ''}
            ${summary.streakBonus > 0 ? `<span class="sa-pity-pill">${ico('flame')} ${i18n.t('result_streak_bonus', { count: summary.streakCount, bonus: summary.streakBonus })}</span>` : ''}
            ${summary.fiveWinsCaseGranted ? `<span class="sa-pity-pill">${ico('case')} ${i18n.t('toast_5wins_case')}</span>` : ''}
            ${summary.rankText ? `<span class="sa-pity-pill">${summary.rankText}</span>` : ''}
          </div>
          ${summary.rubberbandingActive ? `<div class="sa-muted">${i18n.t('result_rubberband')}</div>` : ''}

          ${squadHtml}

          <div class="sa-res-rewards">
            <div class="sa-res-pill">${ico('trophy')} ${i18n.t('result_trophies')}: <b>${summary.trophyDelta >= 0 ? '+' : ''}${summary.trophyDelta}</b></div>
            <div class="sa-res-pill">${ico('coin')} ${i18n.t('result_coins')}: <b id="saResCoinsVal">+${summary.coinsEarned}</b></div>
            <div class="sa-res-pill">${ico('star')} ${i18n.t('result_tokens')}: <b>+${summary.tokensEarned}</b></div>
            ${summary.masteryDelta > 0 ? `<div class="sa-res-pill">${ico('mastery')} ${i18n.t('mastery_gained', { pts: summary.masteryDelta })}</div>` : ''}
          </div>

          <div class="sa-res-actions">
            ${summary.coinsEarned > 0 ? `<button class="sa-btn sa-btn-gold" id="saResDoubleCoinsBtn">${i18n.t('btn_ad_double_coins', { coins: summary.coinsEarned })}</button>` : ''}
            ${summary.isVictory ? `<button class="sa-btn sa-btn-accent" id="saShareWinBtn">↗ ${i18n.t('btn_share_win')}</button>` : ''}
            <button class="sa-btn sa-btn-secondary" id="saResContinueBtn">${i18n.t('btn_continue')}</button>
            <button class="sa-btn sa-btn-battle" style="font-size:16px;padding:10px 20px;min-width:140px;" id="saResAgainBtn">⚔ ${i18n.t('btn_play_again')}</button>
          </div>
          <div class="sa-play-again-bar" id="saPlayAgainBar">
            <div class="sa-countdown-ring" id="saCountdownRing">3</div>
            <span id="saCountdownText">${"ru"===i18n.getLang() ? "Ещё бой через 3с..." : "Again in 3s..."}</span>
            <button class="sa-btn sa-btn-primary sa-btn-xs" id="saCancelCountdownBtn">${"ru"===i18n.getLang() ? "Отмена" : "Cancel"}</button>
          </div>
        </div>
      `;

      const podCanvas = document.getElementById('saResultsPodiumCanvas');
      if (podCanvas && root.SA.Renderer3D && Array.isArray(summary.podiumEntries) && summary.podiumEntries.length) {
        podiumTurntable = root.SA.Renderer3D.createHeroTurntable(podCanvas);
        if (podiumTurntable && typeof podiumTurntable.setPodium === 'function') {
          podiumTurntable.setPodium(summary.podiumEntries, Boolean(summary.isVictory));
        }
      }
      if (summary.isVictory) {
        spawnConfetti(2400);
        if (summary.tokensEarned > 0) setTimeout(()=>spawnTokenFly(summary.tokensEarned), 400);
        triggerScreenShake(summary.isVictory ? 1.4 : 0.7);
        if (audio && audio.playVictory) audio.playVictory(true);
      }

      const dblBtn = document.getElementById('saResDoubleCoinsBtn');
      if (dblBtn && typeof onDoubleCoins === 'function') {
        dblBtn.onclick = async () => {
          if (adBusy || doubledClaimed || transitionBusy) return;
          uiClickSfx();
          adBusy = true;
          dblBtn.disabled = true;
          try {
            const ok = await onDoubleCoins();
            if (ok) {
              doubledClaimed = true;
              dblBtn.textContent = i18n.t('btn_ad_double_claimed');
              const coinsEl = document.getElementById('saResCoinsVal');
              if (coinsEl) coinsEl.textContent = `+${summary.coinsEarned * 2}`;
            } else {
              dblBtn.disabled = false;
            }
          } finally {
            adBusy = false;
          }
        };
      }

      const shareBtn = document.getElementById('saShareWinBtn');
      if (shareBtn) {
        shareBtn.onclick = async () => {
          uiClickSfx();
          await platform.shareVictory({
            trophies: SaveMod.getTotalTrophies(save),
            heroName: summary.heroName,
            modeName: summary.modeName
          });
          showToast(i18n.t('toast_shared'));
        };
      }

      let countdownVal = 3;
      let countdownTimer = null;
      const ringEl = document.getElementById('saCountdownRing');
      const textEl = document.getElementById('saCountdownText');
      const barEl = document.getElementById('saPlayAgainBar');
      function stopCountdown(){ if(countdownTimer){ clearInterval(countdownTimer); countdownTimer=null; } if(barEl) barEl.style.display='none'; }
      function startCountdown(){
        if(!ringEl || !textEl) return;
        countdownTimer = setInterval(()=>{
          countdownVal -= 1;
          if(ringEl) ringEl.textContent = String(Math.max(0,countdownVal));
          if(textEl) textEl.textContent = i18n.t('play_again_countdown', {sec: countdownVal});
          if(countdownVal <= 0){
            stopCountdown();
            if(!transitionBusy && !adBusy){
              transitionBusy=true;
              uiClickSfx();
              disposePodiumTurntable();
              resultsOverlay.classList.add('hidden');
              onPlayAgain();
            }
          }
        }, 1000);
      }
      startCountdown();
      const cancelBtn = document.getElementById('saCancelCountdownBtn');
      if(cancelBtn) cancelBtn.onclick = ()=>{ uiClickSfx(); stopCountdown(); };
      // pause countdown when interacting with double coins
      if(dblBtn){
        const origDbl = dblBtn.onclick;
        // we already have logic, just pause on click
      }

      const contBtn = document.getElementById('saResContinueBtn');
      if (contBtn) {
        contBtn.onclick = () => {
          if (transitionBusy || adBusy) return;
          transitionBusy = true;
          stopCountdown();
          uiClickSfx();
          disposePodiumTurntable();
          resultsOverlay.classList.add('hidden');
          onContinue();
        };
      }
      const againBtn = document.getElementById('saResAgainBtn');
      if (againBtn) {
        againBtn.onclick = () => {
          if (transitionBusy || adBusy) return;
          transitionBusy = true;
          stopCountdown();
          uiClickSfx();
          disposePodiumTurntable();
          resultsOverlay.classList.add('hidden');
          onPlayAgain();
        };
      }
    }

    function renderTurntableTick(dt) {
      if (podiumTurntable && resultsOverlay && !resultsOverlay.classList.contains('hidden')) {
        podiumTurntable.renderFrame(dt);
        return;
      }
      if ((activeTab === 'play' || activeTab === 'heroes') && turntable) {
        turntable.renderFrame(dt);
      }
    }

    function setTab(tabId) {
      activeTab = tabId;
      renderAll();
    }

    // Expose hero bust renderer for the Star Capsule reveal modal
    root.SA.RenderHeroBustSvg = renderHeroBustSvg;

    return {
      renderAll,
      showLobby,
      updateMatchHud,
      showPauseModal,
      showVsIntro,
      showResultsModal,
      renderTurntableTick,
      showToast,
      setTab,
      triggerOpenCase,
      openPartyModal,
      joinPartyFromUrlIfPresent
    };
  }

  const api = { createAppUI };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.AppUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
