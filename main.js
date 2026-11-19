/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Main Application Entry & 20Hz Fixed-Tick / 60FPS Interpolated Loop
 */
(function (root) {
  'use strict';

  function detectWebGLAvailable() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('forceNoWebGL') === '1') return false;
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2')
        || testCanvas.getContext('webgl')
        || testCanvas.getContext('experimental-webgl');
      return Boolean(gl && root.THREE);
    } catch (_) {
      return false;
    }
  }

  async function fetchJsonSafe(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return await res.json();
      } catch (err) {
        if (attempt === 1) throw err;
        await new Promise(r => setTimeout(r, 250));
      }
    }
  }

  async function fetchGameData() {
    const [balance, heroesData, maps, meta] = await Promise.all([
      fetchJsonSafe('./data/balance.json'),
      fetchJsonSafe('./data/heroes.json'),
      fetchJsonSafe('./data/maps.json'),
      fetchJsonSafe('./data/meta.json')
    ]);
    return {
      balance,
      heroes: heroesData.heroes,
      skins: heroesData.skins,
      maps,
      meta
    };
  }

  async function boot() {
    const i18n = root.SA.i18n;
    const platform = root.SA.Platform.createPlatformAdapter();

    // 1. VKWebAppInit MUST be called FIRST!
    await platform.init();
    i18n.setLang(platform.detectLanguage());

    const preloaderEl = document.getElementById('saPreloader');
    const preloaderTitleEl = document.getElementById('saPreloaderTitle');
    const preloaderTextEl = document.getElementById('saPreloaderText');
    const unsupportedEl = document.getElementById('saUnsupportedScreen');

    if (preloaderTitleEl) preloaderTitleEl.textContent = i18n.t('game_title');
    if (preloaderTextEl) preloaderTextEl.textContent = i18n.t('loading_arena');

    // 2. Polite WebGL Check (Rule 0.5 & 10: NEVER white screen or crash!)
    let force2dLite = false;
    const hasWebGL = detectWebGLAvailable();
    if (!hasWebGL) {
      if (preloaderEl) preloaderEl.classList.add('hidden');
      if (unsupportedEl) {
        const satSvg = root.SA && root.SA.Icons ? root.SA.Icons.svg('satellite') : '★';
        unsupportedEl.classList.remove('hidden');
        unsupportedEl.innerHTML = `
          <div class="sa-unsupported-card">
            <div class="sa-unsupported-ico">${satSvg}</div>
            <h2>${i18n.t('webgl_unsupported_title')}</h2>
            <p>${i18n.t('webgl_unsupported_desc')}</p>
            <div class="sa-unsupported-actions">
              <button class="sa-btn sa-btn-primary" id="saStart2DLiteBtn">${i18n.t('btn_2d_lite')}</button>
            </div>
          </div>
        `;
        await new Promise((resolve) => {
          const btn = document.getElementById('saStart2DLiteBtn');
          if (btn) {
            btn.onclick = () => {
              force2dLite = true;
              unsupportedEl.classList.add('hidden');
              resolve();
            };
          }
        });
      }
    }

    // 3. Load Game Data & Single-Key Save ('sa_save') with Preloader Retry Fallback
    let gameData = null;
    while (!gameData) {
      try {
        gameData = await Promise.race([
          fetchGameData(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('preloader_timeout')), 8000))
        ]);
      } catch (_) {
        if (preloaderEl) {
          preloaderEl.classList.remove('hidden');
          if (preloaderTextEl) {
            preloaderTextEl.innerHTML = `${i18n.t('boot_load_error')}<br/><button class="sa-btn sa-btn-primary sa-btn-sm" id="saBootRetryBtn" style="margin-top:10px;">${i18n.t('btn_retry')}</button>`;
          }
          await new Promise((resolve) => {
            const rBtn = document.getElementById('saBootRetryBtn');
            if (rBtn) rBtn.onclick = () => resolve();
            else setTimeout(resolve, 1500);
          });
          if (preloaderTextEl) preloaderTextEl.textContent = i18n.t('loading_arena');
        } else {
          break;
        }
      }
    }
    if (!gameData) return;

    const rawSave = await platform.loadRawSave();
    const save = root.SA.Save.migrateAndValidateSave(rawSave, gameData);
    if (save.settings && (save.settings.lang === 'en' || save.settings.lang === 'ru')) {
      i18n.setLang(save.settings.lang);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = i18n.getLang();
      document.title = i18n.t('game_title');
    }
    if (preloaderTitleEl) preloaderTitleEl.textContent = i18n.t('game_title');
    if (force2dLite) save.settings.quality = '2d';

    const persistSave = () => {
      save.ts = Date.now();
      platform.writeRawSave(JSON.stringify(save));
    };

    const audio = root.SA.Audio.createAudioEngine();
    audio.setSettings({ sound: save.settings.sound, music: save.settings.music });

    // Unlock WebAudio & start Lobby Music on first user gesture (B8)
    let audioUnlocked = false;
    const unlockOnFirstGesture = () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      audio.ensureContext();
      if (!activeMatch) audio.startMusic('lobby');
      window.removeEventListener('pointerdown', unlockOnFirstGesture, true);
      window.removeEventListener('keydown', unlockOnFirstGesture, true);
    };
    window.addEventListener('pointerdown', unlockOnFirstGesture, true);
    window.addEventListener('keydown', unlockOnFirstGesture, true);

    // 4. Session Preloader (once per session via sessionStorage) + Lazy Arena Asset Warmup
    const showPreloader = platform.shouldShowSessionPreloader();
    if (showPreloader && preloaderEl && hasWebGL) {
      preloaderEl.classList.remove('hidden');
      await new Promise(r => setTimeout(r, 420));
    }
    if (preloaderEl) preloaderEl.classList.add('hidden');

    // Lazy-build 1024 Atlas AFTER preloader per Section 7
    setTimeout(() => {
      try {
        root.SA.Atlas.buildArenaAtlas1024(hasWebGL ? root.THREE : null);
      } catch (_) {}
    }, 30);

    // 5. Setup Renderers (3D Three.js + Prepared 2.5D Sprite Fallback)
    const canvas3d = document.getElementById('saArenaCanvas3D');
    const canvas2d = document.getElementById('saArenaCanvas2D');
    const worldOverlay = document.getElementById('saWorldOverlay');

    let renderer3d = null;
    let renderer2d = root.SA.Renderer2D.createRenderer2D({ canvas: canvas2d, overlayEl: worldOverlay });
    let use2dRenderer = force2dLite || save.settings.quality === '2d';

    if (hasWebGL && !force2dLite) {
      renderer3d = root.SA.Renderer3D.createRenderer3D({
        canvas: canvas3d,
        overlayEl: worldOverlay,
        onFallbackTo2D: () => {
          use2dRenderer = true;
          if (canvas3d) canvas3d.classList.add('hidden');
          if (canvas2d) canvas2d.classList.remove('hidden');
          if (renderer2d) renderer2d.resize(window.innerWidth, window.innerHeight);
        }
      });
      if (!renderer3d) {
        use2dRenderer = true;
      } else {
        renderer3d.setQualitySetting(save.settings.quality);
      }
    }

    function syncActiveCanvas() {
      if (canvas3d) canvas3d.classList.toggle('hidden', use2dRenderer);
      if (canvas2d) canvas2d.classList.toggle('hidden', !use2dRenderer);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (use2dRenderer && renderer2d) renderer2d.resize(w, h);
      else if (renderer3d) renderer3d.resize(w, h);
    }
    syncActiveCanvas();
    window.addEventListener('resize', syncActiveCanvas);

    // 6. Controls
    const controls = root.SA.Controls.createMatchControls({
      leftZoneEl: document.getElementById('saLeftJoyZone'),
      stickBaseEl: document.getElementById('saStickBase'),
      stickKnobEl: document.getElementById('saStickKnob'),
      fireBtnEl: document.getElementById('saFireBtn'),
      superBtnEl: document.getElementById('saSuperBtn'),
      gadgetBtnEl: document.getElementById('saGadgetBtn'),
      overdriveBtnEl: document.getElementById('saOverdriveBtn')
    });

    let activeMatch = null;
    let systemPaused = false;
    let manualPaused = false;
    let tickAccumulator = 0;

    // Platform ViewHide / ViewRestore / visibilitychange / blur pause hook
    platform.onPauseChange((paused) => {
      systemPaused = Boolean(paused);
      audio.setSystemPaused(systemPaused);
      if (systemPaused) {
        controls.resetAll();
      }
    });

    // 7. Build App UI
    const ui = root.SA.AppUI.createAppUI({
      save,
      gameData,
      platform,
      audio,
      onStartMatch: (modeId, mapId, overrideHeroId, overrideSkinId, overrideLevel) =>
        startMatch(modeId, mapId, overrideHeroId, overrideSkinId, overrideLevel),
      onSaveChanged: persistSave,
      onQualityChanged: (q) => {
        use2dRenderer = force2dLite || q === '2d' || !renderer3d;
        if (renderer3d && !use2dRenderer) renderer3d.setQualitySetting(q);
        syncActiveCanvas();
      },
      onTriggerEmote: (pinId) => {
        if (controls && typeof controls.triggerEmote === 'function') {
          controls.triggerEmote(pinId);
        }
      },
      onChargePracticeSuper: () => {
        if (activeMatch && activeMatch.modeId === 'practice') {
          const p = activeMatch.units.find(u => u.isPlayer);
          if (p) {
            p.superCharge = 100;
            p.overdriveCharge = 100;
            p.gadgetCharges = 99;
            p.gadgetCooldown = 0;
            audio.playPickup();
          }
        }
      }
    });

    if (typeof ui.joinPartyFromUrlIfPresent === 'function') {
      ui.joinPartyFromUrlIfPresent();
      window.addEventListener('hashchange', () => {
        ui.joinPartyFromUrlIfPresent();
        ui.renderAll();
      });
    }
    ui.renderAll();
    ui.showLobby(true);
    platform.gameReady();

    async function startMatch(modeId, mapId, overrideHeroId, overrideSkinId, overrideLevel, skipIntro = false) {
      audio.ensureContext();
      audio.startMusic('match');

      const heroId = overrideHeroId || save.selectedHeroId;
      const hState = save.heroes[heroId] || { level: 1, skinId: null };
      const chosenSkinId = overrideSkinId !== undefined ? overrideSkinId : hState.skinId;
      const chosenLevel = overrideLevel !== undefined ? overrideLevel : hState.level;
      const totalTrophies = root.SA.Save.getTotalTrophies(save);

      const nextMatch = root.SA.MatchSim.createMatchState({
        modeId,
        mapId,
        playerHeroId: heroId,
        playerSkinId: chosenSkinId,
        playerLevel: chosenLevel,
        playerName: save.playerName,
        totalTrophies,
        consecutiveLosses: save.stats.consecutiveLosses,
        hardcoreEnabled: save.hardcoreEnabled,
        modifierId: save.selectedModifierId || 'none',
        bossTier: save.bossTier || 1,
        friendGhost: save.activeFriendGhost,
        partySlots: save.party && save.party.slots ? save.party.slots : null,
        lang: i18n.getLang(),
        seed: (Date.now() & 0x7fffffff) || 777,
        gameData
      });

      tickAccumulator = 0;
      manualPaused = false;
      ui.showPauseModal(false);
      platform.setSceneState(modeId === 'tutorial' || modeId === 'practice' ? 'tutorial' : 'match');
      ui.showLobby(false);
      syncActiveCanvas();

      const isRealArena = modeId !== 'tutorial' && modeId !== 'practice';
      if (isRealArena && !skipIntro && typeof ui.showVsIntro === 'function') {
        controls.setEnabled(false);
        // Render first frame of arena underneath VS clash screen!
        if (use2dRenderer && renderer2d) renderer2d.renderMatch(nextMatch, 0, 0, null, null);
        else if (renderer3d) renderer3d.renderMatch(nextMatch, 0, 0, null, null);
        await ui.showVsIntro(nextMatch, 1250);
      }

      activeMatch = nextMatch;
      controls.setEnabled(true);
      syncActiveCanvas();
    }

    function abortActiveMatchToLobby() {
      if (!activeMatch) return;
      activeMatch = null;
      manualPaused = false;
      ui.showPauseModal(false);
      controls.setEnabled(false);
      if (renderer3d) renderer3d.clearDynamicMeshes();
      if (renderer2d) renderer2d.clearDynamicMeshes();
      platform.setSceneState('lobby');
      audio.startMusic('lobby');
      ui.showLobby(true);
      ui.renderAll();
    }

    function finishActiveMatch(skippedTutorial = false) {
      if (!activeMatch) return;
      const st = activeMatch;
      activeMatch = null;
      manualPaused = false;
      ui.showPauseModal(false);
      controls.setEnabled(false);
      if (renderer3d) renderer3d.clearDynamicMeshes();
      if (renderer2d) renderer2d.clearDynamicMeshes();

      if (st.modeId === 'practice') {
        platform.setSceneState('lobby');
        audio.startMusic('lobby');
        ui.showLobby(true);
        ui.renderAll();
        return;
      }

      if (st.modeId === 'tutorial') {
        if (!save.tutorialDone) {
          save.tutorialDone = true;
          if (!skippedTutorial) {
            root.SA.Save.addCurrency(save, 'coins', 100, i18n.t('ledger_tutorial'));
            ui.showToast(i18n.t('tut_complete'));
          }
          persistSave();
        }
        platform.setSceneState('lobby');
        audio.startMusic('lobby');
        ui.showLobby(true);
        ui.renderAll();
        return;
      }

      // Apply Post-Match Progression & Telemetry
      platform.setSceneState('results');
      const modeCfg = st.modeCfg;
      const hero = gameData.heroes.find(h => h.id === save.selectedHeroId) || gameData.heroes[0];
      const hEntry = save.heroes[hero.id];
      const playerUnit = st.units.find(u => u.isPlayer) || st.units[0];
      const starUnit = root.SA.MatchSim.computeStarPlayer ? root.SA.MatchSim.computeStarPlayer(st) : null;
      const playerIsMvp = Boolean(starUnit && playerUnit && starUnit.id === playerUnit.id);

      const isVictory = st.winnerTeam === 0;
      const isDraw = st.winnerTeam === -1;

      let trophyDelta = 0;
      if (st.modeId === 'last_hero') {
        const ranks = modeCfg.trophyRanks || [12, 8, 4, -2, -4, -6];
        trophyDelta = ranks[Math.min(ranks.length - 1, (st.playerPlacement || 4) - 1)];
      } else {
        trophyDelta = isVictory ? modeCfg.trophyWin : (isDraw ? 0 : modeCfg.trophyLoss);
      }

      // Gentle onboarding below 50 hero trophies: soften trophy loss
      if (trophyDelta < 0 && hEntry.trophies < 40) {
        trophyDelta = Math.max(-2, trophyDelta);
      }
      hEntry.trophies = Math.max(0, hEntry.trophies + trophyDelta);

      const hcMult = save.hardcoreEnabled ? gameData.balance.hardcoreModifier.coinsMultiplier : 1.0;
      const baseCoins = isVictory ? modeCfg.coinsWin : modeCfg.coinsLoss;
      const coinsEarned = Math.round(baseCoins * hcMult);
      const tokensEarned = (isVictory ? 24 : 12) + (playerIsMvp ? 10 : 0);

      root.SA.Save.addCurrency(
        save,
        'coins',
        coinsEarned,
        isVictory ? i18n.t('ledger_match_win') : i18n.t('ledger_match_loss')
      );
      save.seasonTokens += tokensEarned;

      // Stats & Rubberbanding streaks & Bracket Winrate Log
      save.stats.matches += 1;
      save.stats.takedowns += playerUnit ? playerUnit.kills : 0;
      save.stats.crystalsGrabbed += st.playerCrystalsGrabbed || 0;
      save.stats.supersUsed += st.playerSupersUsed || 0;
      save.stats.overdrivesUsed = (save.stats.overdrivesUsed || 0) + (st.playerOverdrivesUsed || 0);
      if ((save.activeFriendGhost || (save.party && (save.party.slots[0] || save.party.slots[1]))) && st.modeId !== 'last_hero') {
        save.stats.ghostMatches += 1;
      }

      const bId = gameData.balance.botBrackets[st.bracketInfo.baseIdx].id;
      if (!save.stats.bracketWinrate[bId]) {
        save.stats.bracketWinrate[bId] = { matches: 0, wins: 0 };
      }
      save.stats.bracketWinrate[bId].matches += 1;

      let fiveWinsCaseGranted = false;
      let streakBonus = 0;
      if (isVictory) {
        save.stats.wins += 1;
        save.stats.consecutiveWins += 1;
        save.stats.consecutiveLosses = 0;
        save.stats.maxWinStreak = Math.max(save.stats.maxWinStreak || 0, save.stats.consecutiveWins);
        streakBonus = root.SA.Save.computeWinStreakBonus
          ? root.SA.Save.computeWinStreakBonus(save.stats.consecutiveWins)
          : 0;
        if (streakBonus > 0) {
          trophyDelta += streakBonus;
          hEntry.trophies += streakBonus;
        }
        save.stats.bracketWinrate[bId].wins += 1;
        if (save.hardcoreEnabled) save.stats.hardcoreWins += 1;
        if (st.modeId === 'boss_siege') {
          save.stats.bossesDefeated = (save.stats.bossesDefeated || 0) + 1;
          save.bossMaxCleared = Math.max(save.bossMaxCleared || 0, st.bossTier || 1);
          save.bossTier = Math.min(4, Math.max(save.bossTier || 1, (st.bossTier || 1) + 1));
        }
        if (save.stats.wins > 0 && save.stats.wins % 5 === 0) {
          root.SA.Save.addCurrency(save, 'cases', 1, i18n.t('ledger_5wins_case'));
          fiveWinsCaseGranted = true;
        }
      } else if (!isDraw) {
        save.stats.losses += 1;
        save.stats.consecutiveLosses += 1;
        save.stats.consecutiveWins = 0;
      }

      // Per-Fighter Mastery Points (+25 Win, +8 Loss/Draw, +8 Star Player MVP) + in-match kills already via event
      const masteryDelta = (isVictory ? 25 : 8) + (playerIsMvp ? 8 : 0) + (playerUnit ? (playerUnit.kills||0)*2 : 0);
      save.mastery = save.mastery || {};
      save.mastery[hero.id] = (save.mastery[hero.id] || 0) + masteryDelta;
      // Golden box bonus coins
      if (st.goldenCoinsEarned && st.goldenCoinsEarned > 0) {
        root.SA.Save.addCurrency(save, 'coins', st.goldenCoinsEarned, 'Golden Box');
      }
      // Club contribution — light, no pressure, just trophies sum + toast
      if (save.club && save.club.id && trophyDelta > 0) {
        save.club.contrib = (save.club.contrib || 0) + trophyDelta;
        // club bar will be rendered in lobby; also toast
        setTimeout(()=>{ if (typeof ui.showToast==='function') ui.showToast(`Клуб +${trophyDelta} ★`); }, 800);
      }

      // Advance Daily Quests
      for (const q of save.daily.quests) {
        if (q.metric === 'matches') q.progress += 1;
        else if (q.metric === 'wins' && isVictory) q.progress += 1;
        else if (q.metric === 'takedowns') q.progress += playerUnit ? playerUnit.kills : 0;
        else if (q.metric === 'supersUsed') q.progress += st.playerSupersUsed || 0;
        else if (q.metric === 'crystalsGrabbed') q.progress += st.playerCrystalsGrabbed || 0;
      }

      persistSave();
      audio.playVictory(isVictory);

      const squadStats = st.units
        .filter(u => !u.isSummon)
        .map(u => ({
          name: u.name,
          team: u.team,
          kills: u.kills || 0,
          damage: u.damageDealt || 0,
          isMvp: Boolean(starUnit && starUnit.id === u.id)
        }));

      const podiumEntries = st.units
        .filter(u => !u.isSummon && u.team === 0)
        .slice(0, 3)
        .map(u => ({
          hero: gameData.heroes.find(h => h.id === u.heroId) || hero,
          skin: u.skinId ? gameData.skins.find(s => s.id === u.skinId) : null,
          name: u.name
        }));

      ui.showResultsModal({
        summary: {
          isVictory,
          isDraw,
          modeName: i18n.pick(modeCfg, 'name'),
          heroName: i18n.pick(hero, 'name'),
          rankText: st.modeId === 'last_hero' ? i18n.t('result_rank', { rank: st.playerPlacement }) : '',
          trophyDelta,
          streakCount: save.stats.consecutiveWins || 0,
          streakBonus,
          masteryDelta,
          coinsEarned,
          tokensEarned,
          starPlayerName: starUnit ? starUnit.name : '',
          playerIsMvp,
          squadStats,
          podiumEntries,
          rubberbandingActive: st.bracketInfo.rubberbandingActive,
          fiveWinsCaseGranted
        },
        onDoubleCoins: async () => {
          if (coinsEarned <= 0) return false;
          const res = await platform.showRewardedAd('post_match_double_coins');
          if (res && res.rewarded) {
            root.SA.Save.addCurrency(save, 'coins', coinsEarned, i18n.t('ledger_ad_double_coins'));
            persistSave();
            audio.playPickup();
            ui.showToast(i18n.t('toast_double_coins', { coins: coinsEarned }));
            return true;
          }
          return false;
        },
        onContinue: async () => {
          // RULE 8: Interstitial ONLY AFTER results screen closes (120s session & 180s cooldown guarded!)
          await platform.tryShowInterstitial('post_match_results');
          platform.setSceneState('lobby');
          audio.startMusic('lobby');
          ui.showLobby(true);
          ui.renderAll();
        },
        onPlayAgain: async () => {
          await platform.tryShowInterstitial('post_match_results');
          startMatch(st.modeId, st.map.id);
        }
      });
    }

    // 8. Main Animation Loop (Fixed 20Hz Simulation + Smooth Render Interpolation)
    let lastRafMs = performance.now();
    function frame(nowMs) {
      const realDt = Math.min(0.1, Math.max(0.001, (nowMs - lastRafMs) / 1000));
      lastRafMs = nowMs;

      if (activeMatch) {
        const matchPaused = systemPaused || manualPaused;
        if (!matchPaused) {
          tickAccumulator += realDt;
          let safetySteps = 0;
          while (tickAccumulator >= root.SA.MatchSim.FIXED_DT && safetySteps < 5) {
            const pInput = controls.sampleTickInput();
            root.SA.MatchSim.stepMatchTick(activeMatch, pInput, false);
            tickAccumulator -= root.SA.MatchSim.FIXED_DT;
            safetySteps += 1;
            if (activeMatch.finished) break;
          }
        }

        if (activeMatch.finished) {
          finishActiveMatch(false);
        } else {
          const alpha = tickAccumulator / root.SA.MatchSim.FIXED_DT;
          const aimPreview = (!matchPaused && controls && typeof controls.getAimPreview === 'function')
            ? controls.getAimPreview()
            : null;
          if (use2dRenderer && renderer2d) {
            renderer2d.renderMatch(activeMatch, alpha, matchPaused ? 0 : realDt, audio, aimPreview);
          } else if (renderer3d) {
            renderer3d.renderMatch(activeMatch, alpha, matchPaused ? 0 : realDt, audio, aimPreview);
          }
          ui.updateMatchHud(
            activeMatch,
            () => finishActiveMatch(true),
            () => {
              if (!activeMatch) return;
              manualPaused = !manualPaused;
              controls.setEnabled(!manualPaused);
              ui.showPauseModal(manualPaused, {
                isTutorial: activeMatch.modeId === 'tutorial' || activeMatch.modeId === 'practice',
                onResume: () => {
                  manualPaused = false;
                  controls.setEnabled(true);
                  ui.showPauseModal(false);
                },
                onLeaveMatch: () => {
                  if (activeMatch && (activeMatch.modeId === 'tutorial' || activeMatch.modeId === 'practice')) {
                    finishActiveMatch(true);
                  } else {
                    abortActiveMatchToLobby();
                  }
                }
              });
            }
          );
        }
      } else if (!systemPaused) {
        ui.renderTurntableTick(realDt);
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Expose safe QA / Promo-Kit automation hooks
    root.SA_DEBUG = {
      getSave: () => save,
      getGameData: () => gameData,
      getPlatform: () => platform,
      getActiveMatch: () => activeMatch,
      setLang: (l) => {
        const applied = i18n.setLang(l);
        save.settings.lang = applied;
        persistSave();
        ui.renderAll();
      },
      setTab: (tab) => { ui.showLobby(true); ui.setTab(tab); },
      startMatch: (modeId, mapId, skipIntro = false) => startMatch(modeId, mapId, undefined, undefined, undefined, skipIntro),
      openPartyModal: () => ui.openPartyModal && ui.openPartyModal(0),
      forceSuperReady: () => {
        if (!activeMatch) return;
        const p = activeMatch.units.find(u => u.isPlayer);
        if (p) p.superCharge = 100;
      },
      forceOverdriveReady: () => {
        if (!activeMatch) return;
        const p = activeMatch.units.find(u => u.isPlayer);
        if (p) p.overdriveCharge = 100;
      },
      castPlayerOverdrive: () => {
        if (!activeMatch) return;
        const p = activeMatch.units.find(u => u.isPlayer);
        if (p) {
          p.overdriveCharge = 100;
          controls.triggerOverdrive();
        }
      },
      castPlayerSuper: () => {
        if (!activeMatch) return;
        const p = activeMatch.units.find(u => u.isPlayer);
        if (p) {
          p.superCharge = 100;
          controls.triggerSuper();
        }
      },
      grantAndOpenCase: () => {
        save.cases = Math.max(1, save.cases);
        ui.showLobby(true);
        ui.triggerOpenCase();
      },
      setTrophiesDemo: (val) => {
        const h = save.heroes[save.selectedHeroId];
        if (h) h.trophies = val;
        ui.renderAll();
      },
      forceVictoryScreen: () => {
        if (activeMatch) {
          activeMatch.winnerTeam = 0;
          activeMatch.finished = true;
          finishActiveMatch(false);
        }
      }
    };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', boot);
  }
})(typeof window !== 'undefined' ? window : globalThis);
