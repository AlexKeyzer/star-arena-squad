/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Procedural WebAudio Sound & Music Engine (6+ Arcade Feel, Zero External MP3 Bloat)
 * Automatically pauses/resumes on VKWebAppViewHide / ViewRestore / visibilitychange!
 */
(function (root) {
  'use strict';

  function createAudioEngine() {
    let ctx = null;
    let soundEnabled = true;
    let musicEnabled = true;
    let systemPaused = false;
    let musicTimer = null;
    let musicStep = 0;
    let musicMode = 'lobby'; // 'lobby' | 'match'

    function ensureContext() {
      if (!soundEnabled && !musicEnabled) return null;
      if (systemPaused) return null;
      if (!ctx && typeof window !== 'undefined') {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          try { ctx = new AC(); } catch (_) { ctx = null; }
        }
      }
      if (ctx && ctx.state === 'suspended' && !systemPaused) {
        ctx.resume().catch(() => {});
      }
      return ctx;
    }

    function playTone({ freq = 440, endFreq = null, type = 'triangle', dur = 0.12, gain = 0.12, delay = 0 }) {
      if (!soundEnabled || systemPaused) return;
      const ac = ensureContext();
      if (!ac) return;
      try {
        const t0 = ac.currentTime + delay;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (endFreq !== null) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t0 + dur);
        }
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      } catch (_) {}
    }

    const ARCH_SOUND = {
      blaster:{a:{freq:640,endFreq:310,type:'square',dur:0.10,gain:0.10},b:{freq:900,endFreq:640,type:'triangle',dur:0.06,gain:0.07,delay:0.02}},
      shotgun:{a:{freq:180,endFreq:48,type:'square',dur:0.18,gain:0.13},b:{freq:140,endFreq:38,type:'sawtooth',dur:0.14,gain:0.11,delay:0.02}},
      sniper:{a:{freq:1020,endFreq:220,type:'sawtooth',dur:0.17,gain:0.11},b:{freq:1600,endFreq:900,type:'triangle',dur:0.07,gain:0.07,delay:0.02}},
      healer:{a:{freq:740,endFreq:520,type:'sine',dur:0.12,gain:0.10},b:{freq:880,endFreq:1100,type:'triangle',dur:0.10,gain:0.06,delay:0.04}},
      thrower:{a:{freq:520,endFreq:880,type:'sine',dur:0.13,gain:0.10},b:{freq:440,endFreq:320,type:'triangle',dur:0.09,gain:0.07,delay:0.03}},
      assassin:{a:{freq:860,endFreq:420,type:'triangle',dur:0.07,gain:0.09},b:null},
      controller:{a:{freq:380,endFreq:180,type:'sawtooth',dur:0.14,gain:0.11},b:{freq:700,endFreq:500,type:'sine',dur:0.10,gain:0.06,delay:0.03}},
      summoner:{a:{freq:480,endFreq:720,type:'square',dur:0.12,gain:0.10},b:{freq:600,endFreq:360,type:'triangle',dur:0.09,gain:0.06,delay:0.02}},
      tank:{a:{freq:160,endFreq:90,type:'square',dur:0.14,gain:0.11},b:{freq:80,endFreq:40,type:'sawtooth',dur:0.16,gain:0.10,delay:0.01}},
      fighter:{a:{freq:300,endFreq:140,type:'square',dur:0.11,gain:0.11},b:{freq:520,endFreq:260,type:'triangle',dur:0.07,gain:0.07,delay:0.02}},
      trickster:{a:{freq:540,endFreq:760,type:'square',dur:0.09,gain:0.09},b:{freq:760,endFreq:540,type:'triangle',dur:0.08,gain:0.07,delay:0.05}},
      demolisher:{a:{freq:120,endFreq:36,type:'sawtooth',dur:0.22,gain:0.13},b:{freq:200,endFreq:60,type:'square',dur:0.16,gain:0.10,delay:0.02}}
    };
    function playShoot(archetypeId) {
      const k = String(archetypeId||'').toLowerCase();
      const key = k.includes('sniper')?'sniper':k.includes('shotgun')||k.includes('cannon')||k.includes('paladin')?'shotgun':k.includes('heal')||k.includes('halo')||k.includes('alchem')?'healer':k.includes('prism')?'thrower':k.includes('jester')||k.includes('trickster')?'trickster':k.includes('assassin')||k.includes('cyber_fox')?'assassin': (ARCH_SOUND[k]?k:'blaster');
      const s = ARCH_SOUND[key]||ARCH_SOUND.blaster;
      playTone(s.a); if (s.b) playTone(s.b);
      if (key==='shotgun') playTone({freq:90,endFreq:30,type:'sawtooth',dur:0.08,gain:0.07,delay:0.01});
      if (key==='demolisher') playTone({freq:60,endFreq:22,type:'square',dur:0.12,gain:0.06,delay:0.02});
    }

    // Cartoon "POP!" + twinkling star chime (6+ non-violent!)
    function playPopHit() {
      playTone({ freq: 340, endFreq: 680, type: 'sine', dur: 0.075, gain: 0.11 });
      playTone({ freq: 1046, endFreq: 1318, type: 'triangle', dur: 0.07, gain: 0.06, delay: 0.03 });
      // subtle hitstop click for juicy feedback
      playTone({ freq: 1200, endFreq: 1800, type: 'square', dur: 0.04, gain: 0.04, delay: 0.01 });
    }

    function playKnockout() {
      playTone({ freq: 523, endFreq: 784, type: 'triangle', dur: 0.12, gain: 0.12 });
      playTone({ freq: 784, endFreq: 1174, type: 'sine', dur: 0.18, gain: 0.12, delay: 0.08 });
    }

    function playSuperCast() {
      playTone({ freq: 330, endFreq: 880, type: 'sawtooth', dur: 0.22, gain: 0.12 });
      playTone({ freq: 660, endFreq: 1320, type: 'triangle', dur: 0.24, gain: 0.10, delay: 0.05 });
    }

    function playOverdrive() {
      playTone({ freq: 220, endFreq: 880, type: 'sawtooth', dur: 0.28, gain: 0.14 });
      playTone({ freq: 587, endFreq: 1568, type: 'triangle', dur: 0.30, gain: 0.12, delay: 0.05 });
      playTone({ freq: 1174, endFreq: 1760, type: 'sine', dur: 0.22, gain: 0.10, delay: 0.12 });
    }

    function playJumpPad() {
      playTone({ freq: 260, endFreq: 980, type: 'sine', dur: 0.24, gain: 0.12 });
      playTone({ freq: 520, endFreq: 1240, type: 'triangle', dur: 0.18, gain: 0.08, delay: 0.04 });
    }

    function playTeleport() {
      playTone({ freq: 1180, endFreq: 420, type: 'sine', dur: 0.16, gain: 0.11 });
      playTone({ freq: 480, endFreq: 1360, type: 'triangle', dur: 0.18, gain: 0.10, delay: 0.07 });
    }

    function playExplosion() {
      playTone({ freq: 175, endFreq: 42, type: 'sawtooth', dur: 0.26, gain: 0.14 });
      playTone({ freq: 110, endFreq: 35, type: 'square', dur: 0.22, gain: 0.11, delay: 0.03 });
    }

    function playVsClash() {
      const notes = [392, 493.9, 587.3, 784];
      notes.forEach((f, idx) => {
        playTone({ freq: f, endFreq: f * 1.04, type: 'sawtooth', dur: 0.16, gain: 0.11, delay: idx * 0.065 });
      });
    }

    function playPickup() {
      playTone({ freq: 659, endFreq: 987, type: 'sine', dur: 0.10, gain: 0.11 });
      playTone({ freq: 987, endFreq: 1318, type: 'sine', dur: 0.12, gain: 0.10, delay: 0.07 });
    }

    function playUiClick() {
      playTone({ freq: 580, endFreq: 760, type: 'triangle', dur: 0.042, gain: 0.055 });
    }

    function playChestTap(step, maxSteps) {
      const base = 360 + (step / Math.max(1, maxSteps)) * 460;
      playTone({ freq: base, endFreq: base * 1.25, type: 'triangle', dur: 0.08, gain: 0.13 });
    }

    function playChestReveal(isRareOrHero) {
      const notes = isRareOrHero ? [523, 659, 784, 1046, 1318] : [440, 554, 659, 880];
      notes.forEach((f, idx) => {
        playTone({ freq: f, endFreq: f * 1.02, type: 'triangle', dur: 0.18, gain: 0.13, delay: idx * 0.08 });
      });
    }

    function playVictory(won) {
      const notes = won ? [523, 659, 784, 1046] : [392, 349, 330, 293];
      notes.forEach((f, idx) => {
        playTone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.12, delay: idx * 0.11 });
      });
    }

    function startMusic(mode = 'lobby') {
      musicMode = mode;
      if (musicTimer) return;
      const lobbyScale = [261.6, 329.6, 392.0, 523.2, 392.0, 329.6, 293.7, 349.2];
      const matchScale = [329.6, 392.0, 493.9, 587.3, 659.3, 587.3, 493.9, 392.0];
      const _baseInterval = 280;
      var _interval = _baseInterval;
      musicTimer = setInterval(() => {
        if (!musicEnabled || systemPaused || !ctx || ctx.state !== 'running') return;
        const seq = musicMode === 'match' ? matchScale : lobbyScale;
        const note = seq[musicStep % seq.length];
        musicStep += 1;
        playTone({
          freq: note * 0.5,
          type: 'sine',
          dur: musicMode === 'match' ? 0.16 : 0.24,
          gain: 0.032
        });
      }, 280);
    }

    function setMusicAccel(factor){ if(!musicTimer) return; const ni=Math.max(150, Math.round(280/Math.max(0.5,factor))); if(ni===_interval) return; clearInterval(musicTimer); _interval=ni; const seq2=(musicMode==='match'?[329.6,392,493.9,587.3,659.3,587.3,493.9,392]:[261.6,329.6,392,523.2,392,329.6,293.7,349.2]); musicTimer=setInterval(()=>{ if(!musicEnabled||systemPaused||!ctx||ctx.state!=='running') return; const note=seq2[musicStep%seq2.length]; musicStep+=1; playTone({freq:note*0.5,type:'sine',dur:musicMode==='match'?0.16:0.24,gain:0.032}); }, _interval); }
    function stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    }

    function setSettings({ sound, music }) {
      if (typeof sound === 'boolean') soundEnabled = sound;
      if (typeof music === 'boolean') musicEnabled = music;
      if (!musicEnabled) stopMusic();
    }

    function setSystemPaused(paused) {
      systemPaused = Boolean(paused);
      if (ctx) {
        if (systemPaused && ctx.state === 'running') {
          ctx.suspend().catch(() => {});
        } else if (!systemPaused && ctx.state === 'suspended' && (soundEnabled || musicEnabled)) {
          ctx.resume().catch(() => {});
        }
      }
    }

    return {
      ensureContext,
      playShoot,
      playPopHit,
      playKnockout,
      playSuperCast,
      playOverdrive,
      playJumpPad,
      playTeleport,
      playExplosion,
      playVsClash,
      playPickup,
      playUiClick,
      playChestTap,
      playChestReveal,
      playVictory,
      startMusic,
      stopMusic,
      setMusicAccel,
      setSettings,
      setSystemPaused
    };
  }

  const api = { createAudioEngine };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
