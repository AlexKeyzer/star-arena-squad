/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Dual-Thumb Mobile (Portrait & Landscape) + Desktop Keyboard/Mouse Controls
 * - Left screen half: Floating Virtual Joystick
 * - Right screen half:
 *   - Fire Joystick/Button (Tap = 25° Auto-Aim, Drag = Live Trajectory Telegraph, Center-return = Cancel)
 *   - Super Joystick/Button (Tap = Auto-Aim Super, Drag = Live Golden Super Telegraph)
 *   - Active Gadget Button (3 charges/match, KeyF / KeyR)
 *   - Combat Emote Pins (Keys 1..5 or HUD Pin Picker)
 */
(function (root) {
  'use strict';

  function createMatchControls({
    leftZoneEl,
    stickBaseEl,
    stickKnobEl,
    fireBtnEl,
    superBtnEl,
    gadgetBtnEl,
    overdriveBtnEl
  }) {
    const keys = {};
    let joyPointerId = null;
    let joyOriginX = 0;
    let joyOriginY = 0;
    let joyMoveX = 0;
    let joyMoveZ = 0;

    let firePointerId = null;
    let fireOriginX = 0;
    let fireOriginY = 0;
    let fireDragged = false;
    let fireCanceled = false;
    let fireQueuedTap = false;
    let manualAimAngle = null;
    let aimDistRatio = 0.8;

    let superPointerId = null;
    let superOriginX = 0;
    let superOriginY = 0;
    let superDragged = false;
    let superCanceled = false;
    let superQueued = false;
    let superManualAngle = null;

    let gadgetQueued = false;
    let overdriveQueued = false;
    let emoteQueued = null;
    let enabled = false;

    const MAX_RADIUS = 48;
    const AIM_DRAG_THRESHOLD = 12;
    const AIM_CANCEL_RADIUS = 10;
    let controlMode = 'auto'; // auto/phone/large/desktop
    let hapticsEnabled = true;
    let mouseAimX = 0, mouseAimY = 0;
    let mouseActive = false;
    let rightHalfPointerId = null;

    function resetAll() {
      for (const k of Object.keys(keys)) {
        keys[k] = false;
      }
      joyPointerId = null;
      joyMoveX = 0;
      joyMoveZ = 0;
      rightHalfPointerId = null;
      firePointerId = null;
      fireDragged = false;
      fireCanceled = false;
      fireQueuedTap = false;
      manualAimAngle = null;

      superPointerId = null;
      superDragged = false;
      superCanceled = false;
      superQueued = false;
      superManualAngle = null;

      gadgetQueued = false;
      overdriveQueued = false;
      emoteQueued = null;

      if (stickBaseEl) stickBaseEl.classList.remove('active');
      if (stickKnobEl) stickKnobEl.style.transform = 'translate3d(0px, 0px, 0)';
      if (fireBtnEl) fireBtnEl.style.transform = '';
      if (superBtnEl) superBtnEl.style.transform = '';
    }

    function setEnabled(flag) {
      enabled = Boolean(flag);
      if (!enabled) resetAll();
    }
    function setControlMode(mode) {
      controlMode = mode || 'auto';
      const isDesktop = window.innerWidth >= 900;
      const hud = document.getElementById('saMatchHud');
      if (hud) {
        hud.classList.toggle('sa-phone-large', controlMode==='large' || (controlMode==='auto' && window.innerWidth < 900 && window.innerHeight < 700));
      }
    }
    function vibrate(ms) {
      if (!hapticsEnabled) return;
      try { if (navigator.vibrate) navigator.vibrate(ms); } catch(_){}
    }
    // expose for settings
    if (typeof window !== 'undefined') {
      window.SAControlsMode = { setControlMode, getMode: ()=>controlMode };
    }

    // Left Half Virtual Joystick
    if (leftZoneEl) {
      leftZoneEl.addEventListener('pointerdown', (e) => {
        if (!enabled || joyPointerId !== null) return;
        joyPointerId = e.pointerId;
        try { leftZoneEl.setPointerCapture(e.pointerId); } catch (_) {}
        const rect = leftZoneEl.getBoundingClientRect();
        joyOriginX = e.clientX - rect.left;
        joyOriginY = e.clientY - rect.top;
        if (stickBaseEl) {
          stickBaseEl.style.left = `${joyOriginX}px`;
          stickBaseEl.style.top = `${joyOriginY}px`;
          stickBaseEl.classList.add('active');
        }
        if (stickKnobEl) stickKnobEl.style.transform = 'translate3d(0px, 0px, 0)';
      });

      leftZoneEl.addEventListener('pointermove', (e) => {
        if (!enabled || e.pointerId !== joyPointerId) return;
        const rect = leftZoneEl.getBoundingClientRect();
        const dx = (e.clientX - rect.left) - joyOriginX;
        const dy = (e.clientY - rect.top) - joyOriginY;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(MAX_RADIUS, dist);
        const nx = dist > 2 ? dx / dist : 0;
        const ny = dist > 2 ? dy / dist : 0;
        joyMoveX = nx * (clamped / MAX_RADIUS);
        joyMoveZ = ny * (clamped / MAX_RADIUS);
        if (stickKnobEl) {
          stickKnobEl.style.transform = `translate3d(${(nx * clamped).toFixed(1)}px, ${(ny * clamped).toFixed(1)}px, 0)`;
        }
      });

      const endJoy = (e) => {
        if (e.pointerId !== joyPointerId) return;
        joyPointerId = null;
        joyMoveX = 0;
        joyMoveZ = 0;
        if (stickBaseEl) stickBaseEl.classList.remove('active');
        if (stickKnobEl) stickKnobEl.style.transform = 'translate3d(0px, 0px, 0)';
      };
      leftZoneEl.addEventListener('pointerup', endJoy);
      leftZoneEl.addEventListener('pointercancel', endJoy);
      // Tap anywhere on left half to move (alternative to joystick center)
      leftZoneEl.addEventListener('click', (e)=>{
        if (!enabled) return;
        // single tap dash hint - ignore
      });
    }
    // Right half global aim-drag (convenient for phone & desktop): drag anywhere on right 50% = fire aim
    const matchHud = typeof document !== 'undefined' ? document.getElementById('saMatchHud') : null;
    const rightZoneEl = matchHud || (typeof document!=='undefined'? document.body : null);
    if (rightZoneEl) {
      rightZoneEl.addEventListener('pointerdown', (e)=>{
        if (!enabled) return;
        const isFireBtn = e.target && (e.target.closest && e.target.closest('#saFireBtn'));
        const isSuperBtn = e.target && (e.target.closest && e.target.closest('#saSuperBtn'));
        if (isFireBtn || isSuperBtn) return; // let dedicated handlers own it
        const vw = window.innerWidth;
        if (e.clientX < vw * 0.5) return; // only right half
        if (firePointerId !== null || superPointerId !== null) return;
        // treat as fire drag
        firePointerId = e.pointerId;
        try { rightZoneEl.setPointerCapture(e.pointerId); } catch(_){}
        fireOriginX = e.clientX; fireOriginY = e.clientY;
        fireDragged = false; fireCanceled = false; manualAimAngle = null;
      });
      rightZoneEl.addEventListener('pointermove', (e)=>{
        if (!enabled || e.pointerId !== firePointerId) return;
        const dx = e.clientX - fireOriginX;
        const dy = e.clientY - fireOriginY;
        const d = Math.hypot(dx,dy);
        if (d > AIM_DRAG_THRESHOLD) {
          fireDragged = true;
          manualAimAngle = Math.atan2(dx, dy);
          aimDistRatio = Math.min(1, d/64);
        }
      });
      const endRight = (e)=>{
        if (e.pointerId !== firePointerId) return;
        const wasDrag = fireDragged;
        firePointerId = null;
        if (!fireCanceled) fireQueuedTap = true;
        if (wasDrag) vibrate(12);
        fireDragged=false; fireCanceled=false;
      };
      rightZoneEl.addEventListener('pointerup', endRight);
      rightZoneEl.addEventListener('pointercancel', endRight);
    }

    // Right Half Fire Button (Tap = 25° Auto-Aim, Drag = Live Manual Aim Telegraph!)
    if (fireBtnEl) {
      fireBtnEl.addEventListener('pointerdown', (e) => {
        if (!enabled) return;
        e.stopPropagation();
        firePointerId = e.pointerId;
        try { fireBtnEl.setPointerCapture(e.pointerId); } catch (_) {}
        fireOriginX = e.clientX;
        fireOriginY = e.clientY;
        fireDragged = false;
        fireCanceled = false;
        manualAimAngle = null;
      });

      fireBtnEl.addEventListener('pointermove', (e) => {
        if (!enabled || e.pointerId !== firePointerId) return;
        const dx = e.clientX - fireOriginX;
        const dy = e.clientY - fireOriginY;
        const d = Math.hypot(dx, dy);
        if (d > AIM_DRAG_THRESHOLD) {
          fireDragged = true;
          fireCanceled = false;
          manualAimAngle = Math.atan2(dx, dy);
          aimDistRatio = Math.min(1, d / 64);
          const clampD = Math.min(22, d);
          fireBtnEl.style.transform = `translate3d(${((dx / d) * clampD).toFixed(1)}px, ${((dy / d) * clampD).toFixed(1)}px, 0)`;
        } else if (fireDragged && d < AIM_CANCEL_RADIUS) {
          fireCanceled = true;
          fireBtnEl.style.transform = '';
        }
      });

      const endFire = (e) => {
        if (e.pointerId !== firePointerId) return;
        firePointerId = null;
        fireBtnEl.style.transform = '';
        if (!fireCanceled) {
          fireQueuedTap = true;
        } else {
          manualAimAngle = null;
        }
        fireDragged = false;
        fireCanceled = false;
      };
      fireBtnEl.addEventListener('pointerup', endFire);
      fireBtnEl.addEventListener('pointercancel', endFire);
    }

    // Super Button (Tap = Auto-Aim Super, Drag = Manual Super Telegraph!)
    if (superBtnEl) {
      superBtnEl.addEventListener('pointerdown', (e) => {
        if (!enabled) return;
        e.stopPropagation();
        superPointerId = e.pointerId;
        try { superBtnEl.setPointerCapture(e.pointerId); } catch (_) {}
        superOriginX = e.clientX;
        superOriginY = e.clientY;
        superDragged = false;
        superCanceled = false;
        superManualAngle = null;
      });

      superBtnEl.addEventListener('pointermove', (e) => {
        if (!enabled || e.pointerId !== superPointerId) return;
        const dx = e.clientX - superOriginX;
        const dy = e.clientY - superOriginY;
        const d = Math.hypot(dx, dy);
        if (d > AIM_DRAG_THRESHOLD) {
          superDragged = true;
          superCanceled = false;
          superManualAngle = Math.atan2(dx, dy);
          aimDistRatio = Math.min(1, d / 64);
          const clampD = Math.min(18, d);
          superBtnEl.style.transform = `translate3d(${((dx / d) * clampD).toFixed(1)}px, ${((dy / d) * clampD).toFixed(1)}px, 0)`;
        } else if (superDragged && d < AIM_CANCEL_RADIUS) {
          superCanceled = true;
          superBtnEl.style.transform = '';
        }
      });

      const endSuper = (e) => {
        if (e.pointerId !== superPointerId) return;
        superPointerId = null;
        superBtnEl.style.transform = '';
        if (!superCanceled) {
          superQueued = true;
        } else {
          superManualAngle = null;
        }
        superDragged = false;
        superCanceled = false;
      };
      superBtnEl.addEventListener('pointerup', endSuper);
      superBtnEl.addEventListener('pointercancel', endSuper);
    }

    // Gadget Button
    if (gadgetBtnEl) {
      gadgetBtnEl.addEventListener('pointerdown', (e) => {
        if (!enabled) return;
        e.stopPropagation();
        gadgetQueued = true;
      });
    }

    // Overdrive Button
    if (overdriveBtnEl) {
      overdriveBtnEl.addEventListener('pointerdown', (e) => {
        if (!enabled) return;
        e.stopPropagation();
        overdriveQueued = true;
      });
    }

    // Desktop mouse aim: track cursor, allow mouse move to set aim without dragging button
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const arenaCanvas = document.getElementById('saArenaCanvas3D');
      if (arenaCanvas) {
        arenaCanvas.addEventListener('mousemove', (e)=>{
          if (!enabled) return;
          mouseAimX = e.clientX; mouseAimY = e.clientY; mouseActive = true;
        });
        arenaCanvas.addEventListener('mouseleave', ()=>{ mouseActive=false; });
        arenaCanvas.addEventListener('mousedown', (e)=>{
          if (!enabled) return;
          if (e.button===0) { fireQueuedTap=true; if (mouseActive) manualAimAngle = Math.atan2(e.clientX - window.innerWidth/2, e.clientY - window.innerHeight/2); vibrate(10); }
          if (e.button===2) { superQueued=true; if (mouseActive) superManualAngle = Math.atan2(e.clientX - window.innerWidth/2, e.clientY - window.innerHeight/2); }
        });
        arenaCanvas.addEventListener('contextmenu', (e)=>{ e.preventDefault(); });
        // wheel = gadget
        arenaCanvas.addEventListener('wheel', (e)=>{
          if (!enabled) return;
          if (Math.abs(e.deltaY)>5) gadgetQueued=true;
        }, {passive:true});
      }
    }
    // Desktop Keyboard Support (Steam / Web)
    if (typeof window !== 'undefined') {
      const PIN_MAP = { Digit1: 'fire', Digit2: 'cool', Digit3: 'bolt', Digit4: 'heart', Digit5: 'crown' };
      window.addEventListener('keydown', (e) => {
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        keys[e.code] = true;
        if (!enabled) return;
        if (e.code === 'Space') {
          e.preventDefault();
          fireQueuedTap = true;
        } else if (e.code === 'KeyE' || e.code === 'ShiftLeft') {
          superQueued = true;
        } else if (e.code === 'KeyQ' || e.code === 'KeyC') {
          overdriveQueued = true;
        } else if (e.code === 'KeyF' || e.code === 'KeyR') {
          gadgetQueued = true;
        } else if (PIN_MAP[e.code]) {
          emoteQueued = PIN_MAP[e.code];
        }
      });
      window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
      });
      window.addEventListener('blur', () => {
        resetAll();
      });
    }

    function getAimPreview() {
      if (!enabled) return null;
      if (superPointerId !== null && superDragged && !superCanceled && typeof superManualAngle === 'number') {
        return { active: true, isSuper: true, angle: superManualAngle, distRatio: aimDistRatio };
      }
      if (firePointerId !== null && fireDragged && !fireCanceled && typeof manualAimAngle === 'number') {
        return { active: true, isSuper: false, angle: manualAimAngle, distRatio: aimDistRatio };
      }
      return null;
    }

    function sampleTickInput() {
      if (!enabled) {
        return { moveX: 0, moveZ: 0, fire: false, superCast: false, gadgetCast: false, emoteId: null, manualAimAngle: null };
      }

      let kx = 0;
      let kz = 0;
      if (keys.KeyA || keys.ArrowLeft) kx -= 1;
      if (keys.KeyD || keys.ArrowRight) kx += 1;
      if (keys.KeyW || keys.ArrowUp) kz -= 1;
      if (keys.KeyS || keys.ArrowDown) kz += 1;

      let mx = joyMoveX;
      let mz = joyMoveZ;
      if (kx !== 0 || kz !== 0) {
        const len = Math.hypot(kx, kz);
        mx = kx / len;
        mz = kz / len;
      }

      // mouse aim overrides button aim when active
      if (mouseActive && typeof mouseAimX==='number' && (fireQueuedTap || superQueued)) {
        const cx = window.innerWidth*0.5, cy = window.innerHeight*0.5;
        const mAng = Math.atan2(mouseAimX - cx, mouseAimY - cy);
        if (superQueued) superManualAngle = mAng;
        else manualAimAngle = mAng;
      }
      const fire = Boolean(fireQueuedTap || keys.Space);
      const superCast = Boolean(superQueued);
      const gadgetCast = Boolean(gadgetQueued);
      const overdriveCast = Boolean(overdriveQueued);
      const emoteId = emoteQueued;
      const aim = superCast && typeof superManualAngle === 'number'
        ? superManualAngle
        : manualAimAngle;

      fireQueuedTap = false;
      superQueued = false;
      gadgetQueued = false;
      overdriveQueued = false;
      emoteQueued = null;
      if (firePointerId === null) manualAimAngle = null;
      if (superPointerId === null) superManualAngle = null;

      return { moveX: mx, moveZ: mz, fire, superCast, gadgetCast, overdriveCast, emoteId, manualAimAngle: aim };
    }

    // Wire control mode toggle (phone large / desktop / auto)
    if (typeof document !== 'undefined') {
      setTimeout(()=>{
        const toggle = document.getElementById('saControlToggle');
        if (toggle) {
          toggle.querySelectorAll('[data-ctrl]').forEach(btn=>{
            btn.onclick = (e)=>{
              e.stopPropagation();
              const mode = btn.getAttribute('data-ctrl');
              setControlMode(mode);
              toggle.querySelectorAll('[data-ctrl]').forEach(b=> b.classList.toggle('active', b===btn));
              try{ localStorage.setItem('sa_ctrl_mode', mode); }catch(_){}
            };
          });
          try{ const saved = localStorage.getItem('sa_ctrl_mode'); if (saved) setControlMode(saved); else setControlMode('auto'); }catch(_){}
        }
      }, 120);
    }
    return {
      setEnabled,
      resetAll,
      sampleTickInput,
      getAimPreview,
      setControlMode,
      triggerSuper: () => { superQueued = true; },
      triggerFire: () => { fireQueuedTap = true; },
      triggerGadget: () => { gadgetQueued = true; },
      triggerOverdrive: () => { overdriveQueued = true; },
      triggerEmote: (id) => { emoteQueued = id || 'fire'; }
    };
  }

  const api = { createMatchControls };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Controls = api;
})(typeof window !== 'undefined' ? window : globalThis);
