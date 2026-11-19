/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * PlatformAdapter (PIRATE THROW v1.2 proven architecture)
 * Supports: VK Bridge ('vk'), GamePush ('gamepush'), Standalone Web/Steam ('web')
 */
(function (root) {
  'use strict';

  const SAVE_KEY = 'sa_save';
  const INTERSTITIAL_MIN_SESSION_MS = 120 * 1000; // 120s session guard
  const INTERSTITIAL_COOLDOWN_MS = 180 * 1000;    // 180s cooldown guard
  const FORBIDDEN_AD_SCENES = new Set(['match', 'case_anim', 'tutorial']);

  function createPlatformAdapter(options = {}) {
    const nowFn = options.nowFn || (() => Date.now());
    let initialized = false;
    let backend = 'web'; // 'vk' | 'gamepush' | 'web'
    let sessionStartMs = nowFn();
    let lastInterstitialMs = -Infinity;
    let currentScene = 'lobby'; // 'lobby' | 'match' | 'results' | 'case_anim' | 'tutorial'
    let pausedState = false;
    let rewardedInFlight = null;
    let interstitialInFlight = false;
    const pauseListeners = [];
    const adAuditLog = [];

    function getVkBridge() {
      if (options.mockVkBridge) return options.mockVkBridge;
      if (typeof window !== 'undefined' && window.vkBridge && typeof window.vkBridge.send === 'function') {
        return window.vkBridge;
      }
      return null;
    }

    function getGamePush() {
      if (options.mockGamePush) return options.mockGamePush;
      if (typeof window !== 'undefined' && window.gp) {
        return window.gp;
      }
      return null;
    }

    function emitPause(paused, source) {
      pausedState = Boolean(paused);
      for (const fn of pauseListeners) {
        try {
          fn(pausedState, source);
        } catch (_) {
          // Never crash host loop on listener error
        }
      }
    }

    async function init() {
      if (initialized) return { backend };
      sessionStartMs = nowFn();

      const vk = getVkBridge();
      const gp = getGamePush();

      if (vk) {
        backend = 'vk';
        try {
          // RULE 8: VKWebAppInit MUST be called FIRST!
          await vk.send('VKWebAppInit', {});
        } catch (_) {
          // Safe guard outside VK iframe
        }

        if (typeof vk.subscribe === 'function') {
          vk.subscribe((event) => {
            const type = event && event.detail && event.detail.type;
            if (type === 'VKWebAppViewHide') {
              emitPause(true, 'VKWebAppViewHide');
            } else if (type === 'VKWebAppViewRestore') {
              emitPause(false, 'VKWebAppViewRestore');
            }
          });
        }
      } else if (gp) {
        backend = 'gamepush';
        try {
          if (gp.on) {
            gp.on('pause', () => emitPause(true, 'gp_pause'));
            gp.on('resume', () => emitPause(false, 'gp_resume'));
          }
        } catch (_) {}
      } else {
        backend = 'web';
      }

      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
          emitPause(document.hidden, 'visibilitychange');
        });
      }
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('blur', () => {
          emitPause(true, 'window_blur');
        });
        window.addEventListener('focus', () => {
          if (typeof document === 'undefined' || !document.hidden) {
            emitPause(false, 'window_focus');
          }
        });
      }

      initialized = true;
      return { backend };
    }

    function gameReady() {
      const gp = getGamePush();
      if (gp && gp.gameStart) {
        try { gp.gameStart(); } catch (_) {}
      }
    }

    function onPauseChange(cb) {
      pauseListeners.push(cb);
    }

    function setSceneState(scene) {
      currentScene = scene || 'lobby';
    }

    function getSceneState() {
      return currentScene;
    }

    function isAdBlockedByScene() {
      return FORBIDDEN_AD_SCENES.has(currentScene);
    }

    function detectLanguage() {
      const gp = getGamePush();
      if (gp && typeof gp.language === 'string') {
        return gp.language.toLowerCase().startsWith('en') ? 'en' : 'ru';
      }
      if (root.SA && root.SA.i18n) {
        return root.SA.i18n.detectInitialLang();
      }
      return 'ru';
    }

    // Demo video fallback modal for AdBlock / Region / Web standalone
    function showDemoRewardedOverlay() {
      if (options.instantDemoAd) {
        return Promise.resolve({ rewarded: true, via: 'demo_video_instant' });
      }
      if (typeof document === 'undefined') {
        return Promise.resolve({ rewarded: true, via: 'demo_video_headless' });
      }
      return new Promise((resolve) => {
        const i18n = (root.SA && root.SA.i18n) || { t: (k) => k };
        const overlay = document.createElement('div');
        overlay.className = 'sa-demo-ad-overlay';
        overlay.innerHTML = `
          <div class="sa-demo-ad-card">
            <div class="sa-demo-ad-badge">★ DEMO VIDEO AD ★</div>
            <h3>${i18n.t('ad_demo_title')}</h3>
            <div class="sa-demo-ad-stage">
              <div class="sa-demo-ad-orbit"></div>
              <div class="sa-demo-ad-star">★</div>
            </div>
            <p class="sa-demo-ad-timer" id="saDemoAdTimer">${i18n.t('ad_demo_wait', { sec: 4 })}</p>
            <div class="sa-demo-ad-bar"><div class="sa-demo-ad-bar-fill" id="saDemoAdFill"></div></div>
          </div>
        `;
        document.body.appendChild(overlay);

        let remaining = 4;
        const fill = overlay.querySelector('#saDemoAdFill');
        const timerEl = overlay.querySelector('#saDemoAdTimer');
        emitPause(true, 'rewarded_demo');

        const stepMs = 1000;
        if (fill) {
          requestAnimationFrame(() => {
            fill.style.transition = 'width 4s linear';
            fill.style.width = '100%';
          });
        }

        const iv = setInterval(() => {
          remaining -= 1;
          if (remaining > 0) {
            if (timerEl) timerEl.textContent = i18n.t('ad_demo_wait', { sec: remaining });
          } else {
            clearInterval(iv);
            if (timerEl) timerEl.textContent = i18n.t('ad_demo_done');
            setTimeout(() => {
              overlay.remove();
              emitPause(false, 'rewarded_demo_end');
              resolve({ rewarded: true, via: 'demo_video' });
            }, 350);
          }
        }, stepMs);
      });
    }

    /**
     * Rewarded Ad:
     * - Guarded against running inside match / case_anim / tutorial!
     * - VK: CheckNativeAds -> ShowNativeAds({ad_format:'reward'}).
     * - RULE 8: Grants reward even if error occurs AFTER show started!
     * - Fallback: interactive Demo Video on web/adblock/region.
     */
    async function showRewardedAd(placement = 'daily_case') {
      if (isAdBlockedByScene()) {
        adAuditLog.push({ type: 'rewarded', placement, scene: currentScene, allowed: false, reason: 'forbidden_scene' });
        return { rewarded: false, blocked: true, reason: 'forbidden_scene' };
      }
      if (rewardedInFlight) {
        adAuditLog.push({ type: 'rewarded', placement, scene: currentScene, allowed: false, reason: 'already_in_flight' });
        return { rewarded: false, blocked: true, reason: 'already_in_flight' };
      }

      adAuditLog.push({ type: 'rewarded', placement, scene: currentScene, allowed: true, ts: nowFn() });

      const runFlow = async () => {
        const vk = getVkBridge();
        if (vk) {
          let showStarted = false;
          try {
            const check = await vk.send('VKWebAppCheckNativeAds', { ad_format: 'reward' });
            if (check && check.result) {
              showStarted = true;
              emitPause(true, 'vk_reward');
              const res = await vk.send('VKWebAppShowNativeAds', { ad_format: 'reward' });
              emitPause(false, 'vk_reward_end');
              if (res && res.result) {
                return { rewarded: true, via: 'vk_native' };
              }
              // Rule 8: even if post-show result is ambiguous after show started, honor reward
              return { rewarded: true, via: 'vk_post_show_grace' };
            }
          } catch (err) {
            emitPause(false, 'vk_reward_err');
            if (showStarted) {
              // RULE 8: Reward granted even on error after show began!
              return { rewarded: true, via: 'vk_error_after_show_grace', error: String(err) };
            }
          }
          // Adblock or no fill in region -> Demo video fallback
          return showDemoRewardedOverlay();
        }

        const gp = getGamePush();
        if (gp && gp.ads && typeof gp.ads.showRewardedVideo === 'function') {
          let gpStarted = false;
          try {
            gpStarted = true;
            emitPause(true, 'gp_reward');
            const ok = await gp.ads.showRewardedVideo();
            emitPause(false, 'gp_reward_end');
            if (ok) return { rewarded: true, via: 'gamepush' };
          } catch (err) {
            emitPause(false, 'gp_reward_err');
            if (gpStarted) {
              return { rewarded: true, via: 'gp_error_grace', error: String(err) };
            }
          }
        }

        return showDemoRewardedOverlay();
      };

      rewardedInFlight = runFlow();
      try {
        return await rewardedInFlight;
      } finally {
        rewardedInFlight = null;
      }
    }

    /**
     * Interstitial Ad:
     * - ONLY allowed when context === 'post_match_results' AND currentScene === 'results' or 'lobby'
     * - NEVER in match, case_anim, or tutorial
     * - Guard 120s session elapsed & 180s cooldown
     */
    async function tryShowInterstitial(context = 'unknown') {
      const now = nowFn();
      if (interstitialInFlight || rewardedInFlight) {
        return { shown: false, reason: 'ad_in_flight' };
      }
      if (isAdBlockedByScene() || context !== 'post_match_results') {
        adAuditLog.push({ type: 'interstitial', context, scene: currentScene, allowed: false, reason: 'context_or_scene_guard' });
        return { shown: false, reason: 'context_or_scene_guard' };
      }
      if (now - sessionStartMs < INTERSTITIAL_MIN_SESSION_MS) {
        adAuditLog.push({ type: 'interstitial', context, scene: currentScene, allowed: false, reason: 'session_120s_guard' });
        return { shown: false, reason: 'session_120s_guard' };
      }
      if (now - lastInterstitialMs < INTERSTITIAL_COOLDOWN_MS) {
        adAuditLog.push({ type: 'interstitial', context, scene: currentScene, allowed: false, reason: 'cooldown_180s_guard' });
        return { shown: false, reason: 'cooldown_180s_guard' };
      }

      interstitialInFlight = true;
      lastInterstitialMs = now;
      adAuditLog.push({ type: 'interstitial', context, scene: currentScene, allowed: true, ts: now });

      try {
        const vk = getVkBridge();
        if (vk) {
          try {
            const check = await vk.send('VKWebAppCheckNativeAds', { ad_format: 'interstitial' });
            if (check && check.result) {
              emitPause(true, 'vk_interstitial');
              await vk.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' });
              emitPause(false, 'vk_interstitial_end');
              return { shown: true, via: 'vk_native' };
            }
          } catch (_) {
            emitPause(false, 'vk_interstitial_err');
          }
          return { shown: false, reason: 'no_fill' };
        }

        const gp = getGamePush();
        if (gp && gp.ads && typeof gp.ads.showFullscreen === 'function') {
          try {
            emitPause(true, 'gp_interstitial');
            await gp.ads.showFullscreen();
            emitPause(false, 'gp_interstitial_end');
            return { shown: true, via: 'gamepush' };
          } catch (_) {
            emitPause(false, 'gp_interstitial_err');
          }
        }

        return { shown: true, via: 'web_silent_pass' };
      } finally {
        interstitialInFlight = false;
      }
    }

    async function loadRawSave() {
      let localVal = null;
      try {
        if (typeof localStorage !== 'undefined') {
          localVal = localStorage.getItem(SAVE_KEY);
        }
      } catch (_) {}

      const vk = getVkBridge();
      if (vk) {
        try {
          const res = await vk.send('VKWebAppStorageGet', { keys: [SAVE_KEY] });
          const entry = res && Array.isArray(res.keys) && res.keys.find(k => k.key === SAVE_KEY);
          if (entry && entry.value) {
            if (!localVal) return entry.value;
            try {
              const localObj = JSON.parse(localVal);
              const cloudObj = JSON.parse(entry.value);
              const localTs = Number(localObj && localObj.ts) || 0;
              const cloudTs = Number(cloudObj && cloudObj.ts) || 0;
              // Only prefer cloud if strictly newer; if cloud was compact-mirrored, preserve local-only fields
              if (cloudTs > localTs) {
                if (cloudObj && cloudObj.h && !cloudObj.heroes) {
                  return JSON.stringify(Object.assign({}, localObj, cloudObj));
                }
                return entry.value;
              }
              return localVal;
            } catch (_) {
              return localVal || entry.value;
            }
          }
        } catch (_) {}
      }
      return localVal;
    }

    async function writeRawSave(jsonStr) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SAVE_KEY, jsonStr);
        }
      } catch (_) {}

      const vk = getVkBridge();
      if (vk) {
        try {
          // VK Storage limit is 4096 chars per value; compact cloud payload if needed, full in localStorage
          if (jsonStr.length <= 4050) {
            await vk.send('VKWebAppStorageSet', { key: SAVE_KEY, value: jsonStr });
          } else {
            // Compact essential cloud mirror under single 'sa_save' key
            const parsed = JSON.parse(jsonStr);
            const compact = JSON.stringify({
              v: parsed.v,
              ts: parsed.ts,
              coins: parsed.coins,
              pp: parsed.pp,
              cases: parsed.cases,
              pity: parsed.casesWithoutHero,
              sel: parsed.selectedHeroId,
              h: parsed.heroes,
              sk: parsed.unlockedSkins,
              rd: parsed.claimedRoad,
              st: parsed.seasonTokens,
              sc: parsed.claimedSeason,
              ac: parsed.claimedAchievements,
              st_w: parsed.stats
            });
            await vk.send('VKWebAppStorageSet', { key: SAVE_KEY, value: compact.slice(0, 4050) });
          }
        } catch (_) {}
      }
      return true;
    }

    async function shareVictory({ trophies, heroName, modeName }) {
      const lang = (root.SA && root.SA.i18n && root.SA.i18n.getLang()) || 'en';
      const msg = lang === 'ru'
        ? `Победа в «Звёздная Арена: Отряд»! Герой: ${heroName}, режим: ${modeName}, кубков: ${trophies}!`
        : `Victory in Star Arena: Squad! Hero: ${heroName}, Mode: ${modeName}, Trophies: ${trophies}!`;

      const vk = getVkBridge();
      if (vk) {
        try {
          await vk.send('VKWebAppShare', {});
          return { shared: true, via: 'vk' };
        } catch (_) {}
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(msg);
          return { shared: true, via: 'clipboard', message: msg };
        } catch (_) {}
      }
      return { shared: true, via: 'fallback', message: msg };
    }

    async function inviteFriend() {
      const vk = getVkBridge();
      if (vk) {
        try {
          const res = await vk.send('VKWebAppShowInviteBox', {});
          if (res && res.success !== false) {
            return { invited: true, via: 'vk' };
          }
        } catch (_) {}
      }
      return { invited: true, via: 'web_share_fallback' };
    }

    function shouldShowSessionPreloader() {
      try {
        if (typeof sessionStorage !== 'undefined') {
          if (sessionStorage.getItem('sa_preloader_shown') === '1') {
            return false;
          }
          sessionStorage.setItem('sa_preloader_shown', '1');
          return true;
        }
      } catch (_) {}
      return true;
    }

    function getAdAuditLog() {
      return adAuditLog.slice();
    }

    return {
      SAVE_KEY,
      INTERSTITIAL_MIN_SESSION_MS,
      INTERSTITIAL_COOLDOWN_MS,
      init,
      gameReady,
      onPauseChange,
      isPaused: () => pausedState,
      setSceneState,
      getSceneState,
      isAdBlockedByScene,
      detectLanguage,
      showRewardedAd,
      tryShowInterstitial,
      loadRawSave,
      writeRawSave,
      shareVictory,
      inviteFriend,
      shouldShowSessionPreloader,
      getAdAuditLog
    };
  }

  const api = { SAVE_KEY, createPlatformAdapter };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Platform = api;
})(typeof window !== 'undefined' ? window : globalThis);
