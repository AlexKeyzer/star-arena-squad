/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Three.js 3D Match & Lobby Turntable Renderer
 * - 20Hz -> 60fps state interpolation
 * - Pooled particle system capped strictly at <= 200 simultaneous particles (cartoon stars & pop bursts)
 * - Auto-Quality Governor: <50 FPS (3s) -> reduce DPR & particles; <40 FPS (3s) -> switch to 2.5D sprite fallback
 */
(function (root) {
  'use strict';

  const MAX_PARTICLES = 200;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function createRenderer3D({ canvas, overlayEl, onFallbackTo2D }) {
    const THREE = root.THREE;
    if (!THREE) return null;

    let glRenderer = null;
    try {
      glRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false
      });
    } catch (_) {
      return null;
    }

    glRenderer.shadowMap.enabled = false; // Section 7: blob-shadows only, NO realtime shadow!
    glRenderer.setClearColor(0x0b1024, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1024, 28, 52);

    const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 80);

    // Premium AAA lighting: key + fill + rim (Pixar 3-point)
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e1b4b, 1.15);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff4e0, 1.15);
    key.position.set(10, 24, 9);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ecfff, 0.55);
    fill.position.set(-9, 12, -8);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x00e5ff, 0.65);
    rim.position.set(-6, 10, 14);
    scene.add(rim);
    // subtle ambient for material richness
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));

    let atlasBundle = null;
    let arenaGroup = null;
    let currentMapId = null;
    let currentModeId = null;

    const unitMeshes = new Map();
    const projMeshes = new Map();
    const itemMeshes = new Map();
    const zoneMeshes = new Map();
    const barrierMeshes = new Map();
    const meteorMeshes = new Map();
    const transientFx = []; // shockwaves & laser beams
    const floatingTexts = []; // screen-space pop damage numbers

    // Pre-allocated Particle Pool (<= 200 simultaneous!)
    const particlePool = [];
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);

    let qualityTier = 'high'; // 'high' | 'low'
    let qualityModeSetting = 'auto';
    let particleBudget = MAX_PARTICLES;
    let fpsAccumFrames = 0;
    let fpsAccumSec = 0;
    let lowFpsStreakSec = 0;

    // Shared geometries for dynamic entities (keeps GC & triangle count tiny)
    const sharedProjGeo = new THREE.SphereGeometry(0.32, 6, 6);
    const sharedCrystalGeo = new THREE.OctahedronGeometry(0.46, 0);
    const sharedCrateGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
    const sharedVaultGeo = new THREE.CylinderGeometry(1.1, 1.3, 1.8, 8);
    const sharedBarrelGeo = new THREE.CylinderGeometry(0.68, 0.72, 1.28, 10);
    const sharedBallGeo = new THREE.IcosahedronGeometry(0.54, 1);
    const sharedGeoSet = new Set([sharedProjGeo, sharedCrystalGeo, sharedCrateGeo, sharedVaultGeo, sharedBarrelGeo, sharedBallGeo]);

    function disposeObject3D(obj) {
      if (!obj) return;
      obj.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry && !sharedGeoSet.has(child.geometry)) {
            child.geometry.dispose();
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m && m.dispose && m.dispose());
            } else if (child.material.dispose) {
              child.material.dispose();
            }
          }
        }
      });
    }

    function ensureLazyAssets() {
      if (!atlasBundle) {
        atlasBundle = root.SA.Atlas.buildArenaAtlas1024(THREE);
        // Build pooled particle sprites (<= 200)
        const starGeo = new THREE.PlaneGeometry(0.55, 0.55);
        for (let i = 0; i < MAX_PARTICLES; i++) {
          const mat = new THREE.MeshBasicMaterial({
            map: atlasBundle.textures.starTex,
            color: 0xffea00,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            side: THREE.DoubleSide
          });
          const mesh = new THREE.Mesh(starGeo, mat);
          mesh.visible = false;
          particleGroup.add(mesh);
          particlePool.push({
            mesh,
            active: false,
            x: 0, y: 0, z: 0,
            vx: 0, vy: 0, vz: 0,
            life: 0, maxLife: 0.5,
            scale: 1
          });
        }
      }
    }

    function spawnCartoonStars(x, z, count = 5, colorHex = 0xffea00) {
      ensureLazyAssets();
      let activeCount = 0;
      for (let i = 0; i < particlePool.length; i++) {
        if (particlePool[i].active) activeCount++;
      }
      let spawned = 0;
      for (let i = 0; i < particlePool.length && spawned < count && activeCount < particleBudget; i++) {
        const p = particlePool[i];
        if (p.active) continue;
        p.active = true;
        activeCount++;
        spawned++;
        const ang = Math.random() * Math.PI * 2;
        const spd = 2.5 + Math.random() * 4.5;
        p.x = x;
        p.y = 1.0 + Math.random() * 0.5;
        p.z = z;
        p.vx = Math.cos(ang) * spd;
        p.vy = 3.2 + Math.random() * 3.0;
        p.vz = Math.sin(ang) * spd;
        p.maxLife = 0.42 + Math.random() * 0.2;
        p.life = p.maxLife;
        p.scale = 0.7 + Math.random() * 0.6;
        p.mesh.material.color.setHex(colorHex);
        p.mesh.visible = true;
      }
    }

    function resize(w, h) {
      if (!w || !h) return;
      const dprCap = qualityTier === 'low' ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.75);
      glRenderer.setPixelRatio(dprCap);
      glRenderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Portrait needs slightly wider vertical framing so full combat cone is visible!
      camera.fov = w < h ? 54 : 44;
      camera.updateProjectionMatrix();
    }

    function setQualitySetting(mode) {
      qualityModeSetting = mode || 'auto';
      if (qualityModeSetting === 'low') {
        qualityTier = 'low';
        particleBudget = 65;
      } else if (qualityModeSetting === 'high') {
        qualityTier = 'high';
        particleBudget = MAX_PARTICLES;
      }
      resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    }

    function clearDynamicMeshes() {
      for (const m of unitMeshes.values()) { scene.remove(m); disposeObject3D(m); }
      unitMeshes.clear();
      for (const m of projMeshes.values()) { scene.remove(m); disposeObject3D(m); }
      projMeshes.clear();
      for (const m of itemMeshes.values()) { scene.remove(m); disposeObject3D(m); }
      itemMeshes.clear();
      for (const m of zoneMeshes.values()) { scene.remove(m); disposeObject3D(m); }
      zoneMeshes.clear();
      for (const m of barrierMeshes.values()) { scene.remove(m); disposeObject3D(m); }
      barrierMeshes.clear();
      for (const m of meteorMeshes.values()) { scene.remove(m); disposeObject3D(m); }
      meteorMeshes.clear();
      for (const fx of transientFx) { scene.remove(fx.mesh); disposeObject3D(fx.mesh); }
      transientFx.length = 0;
      floatingTexts.length = 0;
      if (overlayEl) overlayEl.innerHTML = '';
    }

    function syncArenaMap(state) {
      ensureLazyAssets();
      if (arenaGroup && currentMapId === state.map.id && currentModeId === state.modeId) return;
      if (arenaGroup) {
        scene.remove(arenaGroup);
        disposeObject3D(arenaGroup);
        arenaGroup = null;
      }
      clearDynamicMeshes();
      currentMapId = state.map.id;
      currentModeId = state.modeId;
      arenaGroup = root.SA.Meshes.createArenaSceneGroup(THREE, state.map, state.modeId, atlasBundle.textures);
      scene.add(arenaGroup);
    }

    let stormRingMesh = null;
    let hotZoneRingMesh = null;
    let tutorialPadMesh = null;
    let ballMesh = null;
    let aimConeMesh = null;
    let aimBeamMesh = null;
    let aimLandingMesh = null;
    let arcadeToyBloom = 1.0;
    let shakeTimer = 0;
    let shakeMag = 0;

    function ensureAimCone() {
      if (aimConeMesh) return aimConeMesh;
      // 25-degree forward auto-aim cone indicator aligned with local +Z!
      const rad = (25 * Math.PI) / 180;
      const geo = new THREE.RingGeometry(1.1, 6.8, 12, 1, -rad * 0.5, rad);
      geo.rotateX(-Math.PI / 2); // +X stays +X, +Y -> -Z
      geo.rotateY(-Math.PI / 2); // +X -> +Z (exact forward direction of bodyRig!)
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00e676,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      aimConeMesh = new THREE.Mesh(geo, mat);
      aimConeMesh.position.y = 0.035;
      scene.add(aimConeMesh);
      return aimConeMesh;
    }

    function ensureManualAimTelegraph() {
      if (!aimBeamMesh) {
        const bGeo = new THREE.PlaneGeometry(0.95, 1.0);
        bGeo.translate(0, 0.5, 0);
        bGeo.rotateX(-Math.PI / 2);
        bGeo.rotateY(Math.PI);
        aimBeamMesh = new THREE.Mesh(
          bGeo,
          new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })
        );
        aimBeamMesh.position.y = 0.045;
        aimBeamMesh.visible = false;
        scene.add(aimBeamMesh);
      }
      if (!aimLandingMesh) {
        aimLandingMesh = new THREE.Mesh(
          new THREE.RingGeometry(1.3, 1.9, 24),
          new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
        );
        aimLandingMesh.rotation.x = -Math.PI / 2;
        aimLandingMesh.position.y = 0.05;
        aimLandingMesh.visible = false;
        scene.add(aimLandingMesh);
      }
    }


    function applySquashAndAnticipation(unit, group, dt){
      if (!unit || !group) return;
      const gd=(typeof window!=='undefined'&&window.SA&&window.SA.GameData)?window.SA.GameData:null;
      const arch=(gd&&gd.balance&&gd.balance.archetypes)?gd.balance.archetypes.find(a=>a.id===unit.archetypeId):null;
      const cadHz = arch&&arch.walkCadenceHz?arch.walkCadenceHz:14;
      const isMoving = unit._moveSpeedNow ? unit._moveSpeedNow>0.45 : (unit.vx*unit.vx+unit.vz*unit.vz>0.25);
      // tiny bob cadence varied
      if (isMoving){ group.position.y += Math.sin((unit._animPhase||0)*cadHz*0.22)*0.04; }
      // anticipation 80ms before shot: scale down then pop
      if (unit._anticipation && unit._anticipation>0){ group.scale.set(0.94,1.08,0.94); unit._anticipation-=dt; } else {
        // recoil squash: keep if just fired
        const rec = unit._recoilTimer||0;
        if (rec>0){ const k=rec/0.16; group.scale.set(1+0.14*k, 1-0.10*k, 1+0.12*k); unit._recoilTimer-=dt; }
        else if (unit._hitStopShake && unit._hitStopShake>0){ group.scale.set(1.06,0.95,1.06); unit._hitStopShake-=dt; }
        else group.scale.set(1,1,1);
      }
      // super signature: expand ring pulse if unit.superActive
      if (unit.superActive && unit.superCharge>0){
        const pul = 1 + Math.sin((unit._animPhase||0)*8)*0.06;
        group.scale.multiplyScalar(pul);
      }
    }

    function updateArcadeToyFX(dt){ arcadeToyBloom = 1.0 + Math.sin(Date.now()*0.003)*0.08; }
    function rebuildWallsIfNeeded(state){
      if (!state.events) return;
      for(const ev of state.events){
        if(ev.type==='wall_destroyed'){
          // remove wall meshes near event
          if(arenaGroup){
            for(let i=arenaGroup.children.length-1;i>=0;i--){
              const ch=arenaGroup.children[i];
              if(Math.abs(ch.position.x - ev.x)<0.2 && Math.abs(ch.position.z - ev.z)<0.2){ arenaGroup.remove(ch); }
            }
          }
          spawnCartoonStars(ev.x, ev.z, 12, 0xff6d00);
          floatingTexts.push({x:ev.x, y:1.8, z:ev.z, text:'КРАШ!', color:'#ff6d00', life:0.8, scale:1.2});
          if(audio && audio.playExplosion) audio.playExplosion();
          shakeTimer=0.28; shakeMag=0.34;
        }
        if(ev.type==='wall_restored'){
          spawnCartoonStars(ev.x, ev.z, 8, 0x00e676);
        }
      }
    }
    function consumeMatchEvents(state, audio) {
      const koWord = state.lang === 'ru' ? 'БАХ! ★' : 'POP! ★';
      for (const ev of state.events) {
        if (ev.type === 'pop_hit') {
          const isCrit = Boolean(ev.isCrit);
          const stars = isCrit ? (qualityTier === 'low' ? 6 : 10) : (qualityTier === 'low' ? 3 : 6);
          const col = isCrit ? 0xffea00 : 0xffea00;
          spawnCartoonStars(ev.x, ev.z, stars, col);
          if (isCrit) spawnCartoonStars(ev.x, ev.z, 4, 0xffffff);
          floatingTexts.push({
            x: ev.x + (Math.random() - 0.5) * 0.5,
            y: 2.1 + (isCrit ? 0.15 : 0),
            z: ev.z,
            text: isCrit ? `КРИТ! ${ev.amount}` : `★${ev.amount}`,
            color: isCrit ? '#FFEA00' : '#FFEA00',
            life: isCrit ? 0.85 : 0.65,
            scale: isCrit ? 1.35 : 1.0
          });
          if (isCrit) { shakeTimer = Math.max(shakeTimer, 0.10); shakeMag = Math.max(shakeMag, 0.10); }
          if (isCrit && ev.attackerId){ const atk=state.units.find(u=>u.id===ev.attackerId); if(atk){ atk._voiceTimer=1.15; try{ const gd=(typeof window!=='undefined'&&window.SA&&window.SA.GameData)?window.SA.GameData:null; const bl=(gd&&gd.balance&&gd.balance.voiceLines)?gd.balance.voiceLines:null; const vl=bl?bl[atk.archetypeId]:null; atk._voiceText=vl? (state.lang==='ru'?vl.ru:vl.en) : (state.lang==='ru'?'В точку!':'Nice!'); }catch(_){ atk._voiceText='Nice!'; } } }
          if (audio) audio.playPopHit();
          // muzzle/recoil handled in shoot event below, but also small hit pause
          if (isCrit && audio && audio.playPopHit) { /* extra crit chime */ }
        } else if (ev.type === 'heal_pulse' || ev.type === 'heal') {
          spawnCartoonStars(ev.x, ev.z, 5, 0x00e676);
          floatingTexts.push({ x: ev.x, y: 2.0, z: ev.z, text: `+${ev.amount || 12}`, color: '#00E676', life: 0.7 });
        } else if (ev.type === 'first_blood') {
          spawnCartoonStars(ev.x, ev.z, 14, 0xff1744);
          floatingTexts.push({ x: ev.x, y: 2.9, z: ev.z, text: state.lang==='ru' ? 'ПЕРВАЯ КРОВЬ!' : 'FIRST BLOOD!', color: '#FF1744', life: 1.3, scale: 1.4 });
          shakeTimer = 0.24; shakeMag = 0.32;
          if (audio && audio.playExplosion) audio.playExplosion();
        } else if (ev.type === 'combo') {
          const n = ev.count || 2;
          spawnCartoonStars(ev.x, ev.z, 8 + n*2, 0xffea00);
          floatingTexts.push({ x: ev.x, y: 2.7, z: ev.z, text: `x${n} КОМБО!`, color: '#FFEA00', life: 1.1, scale: 1.25 });
          shakeTimer = 0.15; shakeMag = 0.18 + n*0.04;
          if (audio) audio.playPickup();
        } else if (ev.type === 'rampage') {
          const n = ev.count || 3;
          spawnCartoonStars(ev.x, ev.z, 12 + n*2, 0xff1744);
          floatingTexts.push({ x: ev.x, y: 2.9, z: ev.z, text: state.lang==='ru' ? `РАМПАГА x${n}!` : `RAMPAGE x${n}!`, color: '#FF1744', life: 1.25, scale: 1.45 });
          shakeTimer = 0.22; shakeMag = 0.30;
          if (audio && audio.playOverdrive) audio.playOverdrive();
        } else if (ev.type === 'revenge_mark') {
          floatingTexts.push({ x: ev.x, y: 2.6, z: ev.z, text: state.lang==='ru' ? 'МЕСТЬ!' : 'REVENGE!', color: '#FF1744', life: 1.0, scale: 1.2 });
        } else if (ev.type === 'revenge_payback') {
          spawnCartoonStars(ev.x, ev.z, 12, 0x00e676);
          floatingTexts.push({ x: ev.x, y: 2.8, z: ev.z, text: state.lang==='ru' ? 'МЕСТЬ +1!' : 'REVENGE!', color: '#00E676', life: 1.2, scale: 1.3 });
          shakeTimer = 0.20; shakeMag = 0.26;
          if (audio) audio.playPickup();
        } else if (ev.type === 'frenzy_start') {
          floatingTexts.push({ x: 0, y: 3.2, z: 0, text: state.lang==='ru' ? 'ФИНАЛЬНЫЙ ШТУРМ!' : 'FRENZY!', color: '#FF1744', life: 1.4, scale: 1.5 });
          shakeTimer = 0.28; shakeMag = 0.34;
          if (audio && audio.playSuperCast) audio.playSuperCast();
        } else if (ev.type === 'near_miss') {
          spawnCartoonStars(ev.x, ev.z, 5, 0xff5252);
          floatingTexts.push({ x: ev.x, y: 2.5, z: ev.z, text: state.lang==='ru' ? `ЕДВА УШЁЛ! ${ev.hp} HP` : `NEAR MISS! ${ev.hp} HP`, color: '#FF5252', life: 1.0, scale: 1.15 });
        } else if (ev.type === 'mastery_gain') {
          floatingTexts.push({ x: ev.x, y: 2.2, z: ev.z, text: `+${ev.amount} Mastery`, color: '#FFD54F', life: 0.9, scale: 1.1 });
        } else if (ev.type === 'power_star_spawn') {
          spawnCartoonStars(ev.x, ev.z, 10, 0x00e676);
          floatingTexts.push({ x: ev.x, y: 2.4, z: ev.z, text: state.lang==='ru' ? 'СИЛА!' : 'POWER UP!', color: '#00E676', life: 1.2, scale: 1.3 });
          shakeTimer = 0.15; shakeMag=0.18;
        } else if (ev.type === 'golden_spawn') {
          spawnCartoonStars(ev.x, ev.z, 12, 0xffd54f);
          floatingTexts.push({ x: ev.x, y: 2.6, z: ev.z, text: state.lang==='ru' ? 'ЗОЛОТОЙ ЯЩИК!' : 'GOLDEN BOX!', color: '#FFD54F', life: 1.3, scale: 1.4 });
        } else if (ev.type === 'golden_pickup') {
          spawnCartoonStars(ev.x, ev.z, 10, 0xffd54f);
          floatingTexts.push({ x: ev.x, y: 2.3, z: ev.z, text: '+60', color: '#FFD54F', life: 1.0, scale: 1.2 });
          if (audio) audio.playPickup();
        } else if (ev.type === 'comeback_spawn') {
          spawnCartoonStars(ev.x, ev.z, 10, 0x00e5ff);
          floatingTexts.push({ x: ev.x, y: 2.2, z: ev.z, text: state.lang==='ru' ? 'ШАНС!' : 'COMEBACK!', color: '#00E5FF', life: 1.0, scale: 1.2 });
        } else if (ev.type === 'knockout') {
          spawnCartoonStars(ev.x, ev.z, qualityTier === 'low' ? 6 : 14, 0x00e5ff);
          floatingTexts.push({ x: ev.x, y: 2.4, z: ev.z, text: koWord, color: '#40C4FF', life: 0.9 });
          shakeTimer = 0.22;
          shakeMag = 0.28;
          if (audio) audio.playKnockout();
        } else if (ev.type === 'shoot') {
          // weapon recoil + muzzle flash for shooter
          const shooter = state.units.find(u=>u.id===ev.unitId);
          if (shooter) {
            shooter._recoilTimer = 0.12;
            // spawn muzzle flash particle
            spawnCartoonStars(ev.x, ev.z, 2, 0xffffff);
          }
          if (audio && ev.unitId === 'u_player') audio.playShoot(ev.archetypeId);
        } else if (ev.type === 'super_cast') {
          spawnCartoonStars(ev.x, ev.z, 10, 0xffd54f);
          if (ev.unitId === 'u_player') { shakeTimer = 0.18; shakeMag = 0.22; }
          if (audio) audio.playSuperCast();
        } else if (ev.type === 'gadget_cast') {
          spawnCartoonStars(ev.x, ev.z, 8, 0x00e676);
          if (audio) audio.playPickup();
        } else if (ev.type === 'overdrive_cast') {
          spawnCartoonStars(ev.x, ev.z, 14, 0xe040fb);
          const odWord = state.lang === 'ru' ? '⚡ ОВЕРДРАЙВ!' : '⚡ OVERDRIVE!';
          floatingTexts.push({ x: ev.x, y: 2.6, z: ev.z, text: odWord, color: '#EA80FC', life: 1.0 });
          if (ev.unitId === 'u_player') { shakeTimer = 0.25; shakeMag = 0.30; }
          if (audio && audio.playOverdrive) audio.playOverdrive();
        } else if (ev.type === 'jump_pad') {
          spawnCartoonStars(ev.x, ev.z, 6, 0xffea00);
          if (audio && audio.playJumpPad) audio.playJumpPad();
        } else if (ev.type === 'teleport') {
          spawnCartoonStars(ev.x, ev.z, 9, 0x00e5ff);
          if (audio && audio.playTeleport) audio.playTeleport();
        } else if (ev.type === 'barrel_explode') {
          spawnCartoonStars(ev.x, ev.z, qualityTier === 'low' ? 6 : 12, 0xff6d00);
          shakeTimer = 0.22;
          shakeMag = 0.30;
          if (audio && audio.playExplosion) audio.playExplosion();
        } else if (ev.type === 'energy_grab') {
          spawnCartoonStars(ev.x, ev.z, 9, 0x00e676);
          const eWord = state.lang === 'ru' ? '⚡ ЭНЕРГИЯ!' : '⚡ SURGE!';
          floatingTexts.push({ x: ev.x, y: 2.3, z: ev.z, text: eWord, color: '#69F0AE', life: 0.9 });
          if (audio) audio.playPickup();
        } else if (ev.type === 'boss_phase') {
          const pWord = state.lang === 'ru' ? `⚠ ФАЗА ${ev.phase}!` : `⚠ PHASE ${ev.phase}!`;
          floatingTexts.push({ x: ev.x, y: 3.4, z: ev.z, text: pWord, color: '#FF5252', life: 1.25 });
          shakeTimer = 0.32;
          shakeMag = 0.36;
          if (audio && audio.playExplosion) audio.playExplosion();
        } else if (ev.type === 'crystal_grab' || ev.type === 'goal_scored') {
          spawnCartoonStars(ev.x, ev.z, 8, 0xe040fb);
          if (ev.type === 'goal_scored') { shakeTimer = 0.28; shakeMag = 0.35; }
          if (audio) audio.playPickup();
        } else if (ev.type === 'shockwave') {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.3, ev.radius, 24),
            new THREE.MeshBasicMaterial({
              color: ev.color || '#FFD54F',
              transparent: true,
              opacity: 0.72,
              side: THREE.DoubleSide,
              depthWrite: false
            })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(ev.x, 0.08, ev.z);
          scene.add(ring);
          transientFx.push({ mesh: ring, life: 0.32, maxLife: 0.32, scaleUp: true });
        } else if (ev.type === 'laser_beam') {
          const len = Math.hypot(ev.x2 - ev.x1, ev.z2 - ev.z1);
          const beam = new THREE.Mesh(
            new THREE.BoxGeometry(ev.width, 0.35, len),
            new THREE.MeshBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.85 })
          );
          beam.position.set((ev.x1 + ev.x2) * 0.5, 0.85, (ev.z1 + ev.z2) * 0.5);
          beam.rotation.y = Math.atan2(ev.x2 - ev.x1, ev.z2 - ev.z1);
          scene.add(beam);
          transientFx.push({ mesh: beam, life: 0.28, maxLife: 0.28, scaleUp: false });
        }
      }
      state.events.length = 0;
    }

    function renderMatch(state, alpha, realDt, audio, aimPreview) {
      syncArenaMap(state);
      rebuildWallsIfNeeded(state);
      consumeMatchEvents(state, audio);

      // Rolling 3s Auto-Quality FPS Governor
      if (qualityModeSetting === 'auto' && realDt > 0 && realDt < 0.5) {
        fpsAccumFrames += 1;
        fpsAccumSec += realDt;
        if (fpsAccumSec >= 3.0) {
          const avgFps = fpsAccumFrames / fpsAccumSec;
          fpsAccumFrames = 0;
          fpsAccumSec = 0;
          if (avgFps < 40 && qualityTier === 'low') {
            lowFpsStreakSec += 3;
            if (lowFpsStreakSec >= 3 && typeof onFallbackTo2D === 'function') {
              onFallbackTo2D(avgFps);
              return;
            }
          } else if (avgFps < 50 && qualityTier === 'high') {
            qualityTier = 'low';
            particleBudget = 60;
            resize(canvas.clientWidth, canvas.clientHeight);
          } else {
            lowFpsStreakSec = 0;
          }
        }
      }

      const player = state.units.find(u => u.isPlayer) || state.units[0];

      // Rotate central mine crystal
      if (arenaGroup && arenaGroup.userData.mineCore) {
        arenaGroup.userData.mineCore.rotation.y += realDt * 2.2;
      }

      // Bush translucency when player is near/inside + destroyed bush hiding
      if (arenaGroup && arenaGroup.userData.bushMeshes && player) {
        const bushesArr = state.bushes || [];
        for (let bi = 0; bi < arenaGroup.userData.bushMeshes.length; bi++) {
          const bm = arenaGroup.userData.bushMeshes[bi];
          const bState = bushesArr[bi];
          if (bState && bState.destroyed) {
            bm.visible = false;
            continue;
          }
          bm.visible = true;
          const d = Math.hypot(player.x - bm.userData.bx, player.z - bm.userData.bz);
          bm.material.opacity = d < bm.userData.br + 1.1 ? 0.42 : 0.92;
        }
      }
      if (arenaGroup && arenaGroup.userData.teleporterMeshes) {
        for (const tm of arenaGroup.userData.teleporterMeshes) {
          tm.ring.rotation.z += realDt * 2.4;
        }
      }

      // Tutorial pad
      if (state.modeId === 'tutorial' && state.tutorialPad) {
        if (!tutorialPadMesh) {
          tutorialPadMesh = new THREE.Mesh(
            new THREE.RingGeometry(1.1, 1.8, 24),
            new THREE.MeshBasicMaterial({ color: 0x00e676, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
          );
          tutorialPadMesh.rotation.x = -Math.PI / 2;
          scene.add(tutorialPadMesh);
        }
        tutorialPadMesh.visible = true;
        tutorialPadMesh.position.set(state.tutorialPad.x, 0.06, state.tutorialPad.z);
        tutorialPadMesh.scale.setScalar(1 + Math.sin(state.timeSec * 6) * 0.08);
      } else if (tutorialPadMesh) {
        tutorialPadMesh.visible = false;
      }

      // FFA Storm Ring
      if (state.modeId === 'last_hero' && state.stormRadius) {
        if (!stormRingMesh) {
          stormRingMesh = new THREE.Mesh(
            new THREE.RingGeometry(1.0, 1.35, 36),
            new THREE.MeshBasicMaterial({ color: 0xe040fb, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
          );
          stormRingMesh.rotation.x = -Math.PI / 2;
          stormRingMesh.position.y = 0.07;
          scene.add(stormRingMesh);
        }
        stormRingMesh.visible = true;
        stormRingMesh.scale.setScalar(state.stormRadius);
      } else if (stormRingMesh) {
        stormRingMesh.visible = false;
      }

      // Hot Zone Capture Ring
      if (state.modeId === 'hot_zone') {
        if (!hotZoneRingMesh) {
          hotZoneRingMesh = new THREE.Mesh(
            new THREE.RingGeometry(3.15, 3.85, 36),
            new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: false })
          );
          hotZoneRingMesh.rotation.x = -Math.PI / 2;
          hotZoneRingMesh.position.y = 0.06;
          scene.add(hotZoneRingMesh);
        }
        hotZoneRingMesh.visible = true;
        const p0 = state.teamZonePct ? state.teamZonePct[0] : 0;
        const p1 = state.teamZonePct ? state.teamZonePct[1] : 0;
        hotZoneRingMesh.material.color.setHex(p0 >= p1 ? 0x00e5ff : 0xff4081);
        hotZoneRingMesh.scale.setScalar(1 + Math.sin(state.timeSec * 4) * 0.03);
      } else if (hotZoneRingMesh) {
        hotZoneRingMesh.visible = false;
      }

      // Sync Units + Interpolate 20Hz -> 60fps
      const seenUnits = new Set();
      for (const u of state.units) {
        seenUnits.add(u.id);
        let mesh = unitMeshes.get(u.id);
        if (!mesh) {
          mesh = root.SA.Meshes.createHeroMesh(THREE, {
            silhouette: u.silhouette,
            palette: u.palette,
            heroId: u.heroId,
            elementId: u.elementId,
            team: u.team,
            isPlayer: u.isPlayer,
            isSummon: u.isSummon,
            isBoss: Boolean(u.isBoss),
            shadowTex: atlasBundle.textures.shadowTex
          });
          scene.add(mesh);
          unitMeshes.set(u.id, mesh);
        }

        const visibleToPlayer = u.alive && (!player || root.SA.Physics.canSeeUnit(player, u, state));
        mesh.visible = visibleToPlayer;
        if (!visibleToPlayer) continue;

        const ix = lerp(u.prevX, u.x, alpha);
        const iz = lerp(u.prevZ, u.z, alpha);
        const irot = lerpAngle(u.prevRot, u.rot, alpha);
        let yLift = 0;
        if (u.airborneTimer > 0) {
          const prog = 1 - u.airborneTimer / Math.max(0.01, u.airborneDuration || 0.65);
          yLift = Math.sin(prog * Math.PI) * 4.4;
        } else if (u.knockupTimer > 0) {
          yLift = Math.sin((u.knockupTimer / 0.75) * Math.PI) * 2.2;
        }

        mesh.position.set(ix, yLift, iz);
        mesh.userData.bodyRig.rotation.y = irot;

        // Walk cycle leg & arm swing + lively character accessory motion
        const moving = Math.hypot(u.vx, u.vz) > 0.3;
        const swing = moving ? Math.sin(state.timeSec * 15 + u.slotIndex) * 0.44 : 0;
        mesh.userData.leftLeg.rotation.x = swing;
        mesh.userData.rightLeg.rotation.x = -swing;
        if (mesh.userData.leftArm && mesh.userData.rightArm) {
          mesh.userData.leftArm.rotation.x = 0.65 - swing * 0.45;
          mesh.userData.rightArm.rotation.x = 0.65 + swing * 0.45;
        }
        if (mesh.userData.animAccessory) {
          const acc = mesh.userData.animAccessory;
          if (acc.kind === 'wag') acc.group.rotation.y = Math.sin(state.timeSec * 8 + u.slotIndex) * 0.38;
          else if (acc.kind === 'flutter') acc.group.position.y = 0.92 + Math.sin(state.timeSec * 6 + u.slotIndex) * 0.06;
          else if (acc.kind === 'hover') acc.group.position.y = 1.56 + Math.sin(state.timeSec * 5 + u.slotIndex) * 0.09;
          else if (acc.kind === 'orbit') acc.group.rotation.y = state.timeSec * 2.2 + u.slotIndex;
        }

        // recoil pulse 0.12s after shoot
        if (u._recoilTimer > 0) u._recoilTimer -= realDt;
        const recoilSquash = (u._recoilTimer || 0) > 0 ? 0.88 : 1.0;
        const squash = u.hitFlashTimer > 0 ? 1.18 * recoilSquash : recoilSquash;
        const odScale = u.overdriveTimer > 0 ? 1.12 : (u.energyTimer > 0 ? 1.08 : 1.0);
        const baseS = (u.isBoss ? 2.15 : (u.isSummon ? 0.65 : 1.0)) * odScale;
        mesh.userData.bodyRig.scale.set(baseS * squash, baseS / squash, baseS * squash);
        mesh.userData.superRing.visible = u.superCharge >= 100;
        if (mesh.userData.overdriveRing) {
          mesh.userData.overdriveRing.visible = (u.overdriveTimer > 0 || (u.overdriveCharge || 0) >= 100);
          mesh.userData.overdriveRing.scale.setScalar(u.overdriveTimer > 0 ? (1.08 + Math.sin(state.timeSec * 14) * 0.1) : 1.0);
        }
        mesh.userData.shieldDome.visible = u.shieldTimer > 0;
      }
      for (const [id, m] of unitMeshes.entries()) {
        if (!seenUnits.has(id)) {
          scene.remove(m);
          disposeObject3D(m);
          unitMeshes.delete(id);
        }
      }

      // Player 25-degree Auto-Aim Cone + Manual Drag Telegraph
      const cone = ensureAimCone();
      ensureManualAimTelegraph();
      if (player && player.alive) {
        const px = lerp(player.prevX, player.x, alpha);
        const pz = lerp(player.prevZ, player.z, alpha);
        if (aimPreview && aimPreview.active) {
          cone.visible = false;
          const isSup = Boolean(aimPreview.isSuper);
          const rangeLen = isSup ? Math.max(7.5, player.weaponRange * 1.1) : player.weaponRange;
          aimBeamMesh.visible = true;
          aimBeamMesh.position.x = px;
          aimBeamMesh.position.z = pz;
          aimBeamMesh.rotation.y = aimPreview.angle;
          aimBeamMesh.scale.set(isSup ? 1.45 : 1.0, 1, rangeLen);
          aimBeamMesh.material.color.setHex(isSup ? 0xffd54f : 0x00e5ff);

          if (player.lobOverWalls || isSup) {
            aimLandingMesh.visible = true;
            const landDist = rangeLen * Math.max(0.35, aimPreview.distRatio || 0.85);
            aimLandingMesh.position.x = px + Math.sin(aimPreview.angle) * landDist;
            aimLandingMesh.position.z = pz + Math.cos(aimPreview.angle) * landDist;
            aimLandingMesh.material.color.setHex(isSup ? 0xffd54f : 0x00e5ff);
          } else {
            aimLandingMesh.visible = false;
          }
        } else {
          cone.visible = true;
          cone.position.x = px;
          cone.position.z = pz;
          cone.rotation.y = lerpAngle(player.prevRot, player.rot, alpha);
          aimBeamMesh.visible = false;
          aimLandingMesh.visible = false;
        }
      } else {
        cone.visible = false;
        aimBeamMesh.visible = false;
        aimLandingMesh.visible = false;
      }

      // Sync Projectiles
      const seenProjs = new Set();
      for (const p of state.projectiles) {
        seenProjs.add(p.id);
        let pm = projMeshes.get(p.id);
        if (!pm) {
          pm = new THREE.Mesh(
            sharedProjGeo,
            new THREE.MeshBasicMaterial({ color: p.color || '#FFD54F' })
          );
          scene.add(pm);
          projMeshes.set(p.id, pm);
        }
        const px = lerp(p.prevX, p.x, alpha);
        const pz = lerp(p.prevZ, p.z, alpha);
        let py = 0.85;
        if (p.overWalls) {
          const prog = Math.min(1, p.traveled / Math.max(0.1, p.maxDist));
          py = 0.85 + Math.sin(prog * Math.PI) * 3.2;
        }
        pm.position.set(px, py, pz);
        // trail puff every 3 frames
        if (state.tick % 3 === 0) {
          // reuse particle pool for trail hint (small star at projectile tail)
          spawnCartoonStars(px - p.vx*0.02, pz - p.vz*0.02, 1, p.color ? (parseInt(p.color.replace('#',''),16)||0xffea00) : 0xffea00);
        }
        pm.scale.setScalar(p.isSuper ? 1.35 : 1.0);
      }
      for (const [id, m] of projMeshes.entries()) {
        if (!seenProjs.has(id)) {
          scene.remove(m);
          disposeObject3D(m);
          projMeshes.delete(id);
        }
      }

      // Sync Ground Pickups, Crates & Vaults
      const seenItems = new Set();
      for (const it of state.groundItems) {
        seenItems.add(it.id);
        let im = itemMeshes.get(it.id);
        if (!im) {
          const col = it.kind === 'crystal' ? 0xe040fb : (it.kind === 'bounty_star' ? 0xffea00 : (it.kind === 'golden_box' ? 0xffd54f : (it.kind === 'power_star' ? 0x00e676 : 0x00e5ff)));
          im = new THREE.Mesh(sharedCrystalGeo, new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.35 }));
          scene.add(im);
          itemMeshes.set(it.id, im);
        }
        im.position.set(it.x, 0.55 + Math.sin(state.timeSec * 4 + it.x) * 0.12, it.z);
        im.rotation.y += realDt * 2.5;
      }
      for (const c of state.crates) {
        if (c.hp <= 0) continue;
        seenItems.add(c.id);
        let cm = itemMeshes.get(c.id);
        if (!cm) {
          cm = new THREE.Mesh(sharedCrateGeo, new THREE.MeshLambertMaterial({ color: 0xffb300 }));
          scene.add(cm);
          itemMeshes.set(c.id, cm);
        }
        cm.position.set(c.x, 0.58, c.z);
      }
      if (state.vaults) {
        for (const v of state.vaults) {
          if (v.hp <= 0) continue;
          seenItems.add(v.id);
          let vm = itemMeshes.get(v.id);
          if (!vm) {
            vm = new THREE.Mesh(sharedVaultGeo, new THREE.MeshLambertMaterial({ color: v.team === 0 ? 0x29b6f6 : 0xff5252 }));
            scene.add(vm);
            itemMeshes.set(v.id, vm);
          }
          vm.position.set(v.x, 0.9, v.z);
        }
      }
      if (state.barrels) {
        for (const br of state.barrels) {
          if (br.hp <= 0) continue;
          seenItems.add(br.id);
          let brm = itemMeshes.get(br.id);
          if (!brm) {
            brm = new THREE.Mesh(sharedBarrelGeo, new THREE.MeshLambertMaterial({ color: 0xff6d00, emissive: 0xd50000, emissiveIntensity: 0.35 }));
            scene.add(brm);
            itemMeshes.set(br.id, brm);
          }
          const pulse = br.hp < br.maxHp ? (1 + Math.sin(state.timeSec * 16) * 0.06) : 1;
          brm.scale.setScalar(pulse);
          brm.position.set(br.x, 0.65, br.z);
        }
      }
      // Practice Cave dynamic Jump-Pads & Teleporters (if map itself didn't define static meshes)
      if (state.modeId === 'practice') {
        if (state.jumpPads) {
          for (const jp of state.jumpPads) {
            seenItems.add(jp.id);
            let jpm = itemMeshes.get(jp.id);
            if (!jpm) {
              jpm = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.16, 10), new THREE.MeshBasicMaterial({ color: 0xffea00 }));
              scene.add(jpm);
              itemMeshes.set(jp.id, jpm);
            }
            jpm.position.set(jp.x, 0.08, jp.z);
          }
        }
        if (state.teleporters) {
          for (const tp of state.teleporters) {
            seenItems.add(tp.id);
            let tpm = itemMeshes.get(tp.id);
            if (!tpm) {
              tpm = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.05, 16), new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide }));
              tpm.rotation.x = -Math.PI / 2;
              scene.add(tpm);
              itemMeshes.set(tp.id, tpm);
            }
            tpm.position.set(tp.x, 0.05, tp.z);
            tpm.rotation.z += realDt * 2.5;
          }
        }
      }
      for (const [id, m] of itemMeshes.entries()) {
        if (!seenItems.has(id)) {
          scene.remove(m);
          disposeObject3D(m);
          itemMeshes.delete(id);
        }
      }

      // Falling Meteors & Boss Rocket Salvo Danger Rings
      const seenMeteors = new Set();
      if (state.meteors) {
        for (const mt of state.meteors) {
          seenMeteors.add(mt.id);
          let mm = meteorMeshes.get(mt.id);
          if (!mm) {
            const g = new THREE.Group();
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(mt.radius * 0.82, mt.radius, 24),
              new THREE.MeshBasicMaterial({ color: 0xff1744, side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthWrite: false })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.06;
            const fill = new THREE.Mesh(
              new THREE.CircleGeometry(mt.radius * 0.8, 20),
              new THREE.MeshBasicMaterial({ color: 0xff5252, side: THREE.DoubleSide, transparent: true, opacity: 0.25, depthWrite: false })
            );
            fill.rotation.x = -Math.PI / 2;
            fill.position.y = 0.05;
            const rock = new THREE.Mesh(sharedBallGeo, new THREE.MeshBasicMaterial({ color: 0xff9100 }));
            g.add(ring, fill, rock);
            g.userData = { fill, rock };
            scene.add(g);
            meteorMeshes.set(mt.id, g);
            mm = g;
          }
          const prog = 1 - Math.max(0, mt.timer) / Math.max(0.1, mt.maxTimer || 1.8);
          mm.position.set(mt.x, 0, mt.z);
          mm.userData.fill.scale.setScalar(0.2 + prog * 0.8);
          mm.userData.rock.position.set(0, (1 - prog) * 14.0 + 0.5, 0);
          mm.userData.rock.scale.setScalar(1.3);
        }
      }
      for (const [id, m] of meteorMeshes.entries()) {
        if (!seenMeteors.has(id)) {
          scene.remove(m);
          disposeObject3D(m);
          meteorMeshes.delete(id);
        }
      }

      // Star Ball
      if (state.modeId === 'star_ball' && state.ball) {
        if (!ballMesh) {
          ballMesh = new THREE.Mesh(sharedBallGeo, new THREE.MeshLambertMaterial({ color: 0xffea00, emissive: 0xff9100, emissiveIntensity: 0.4 }));
          scene.add(ballMesh);
        }
        ballMesh.visible = true;
        ballMesh.position.set(lerp(state.ball.prevX, state.ball.x, alpha), 0.55, lerp(state.ball.prevZ, state.ball.z, alpha));
        ballMesh.rotation.x += realDt * 4;
        ballMesh.rotation.z += realDt * 3;
      } else if (ballMesh) {
        ballMesh.visible = false;
      }

      // Zones & Mines
      const seenZones = new Set();
      for (const z of state.zones) {
        seenZones.add(z.id);
        let zm = zoneMeshes.get(z.id);
        if (!zm) {
          const zCol = z.kind === 'heal' ? 0x00e676 : (z.kind === 'mine' ? 0xff9100 : 0xaa00ff);
          zm = new THREE.Mesh(
            new THREE.RingGeometry(z.kind === 'mine' ? 0.15 : z.radius * 0.78, z.radius, 20),
            new THREE.MeshBasicMaterial({ color: zCol, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false })
          );
          zm.rotation.x = -Math.PI / 2;
          scene.add(zm);
          zoneMeshes.set(z.id, zm);
        }
        zm.position.set(z.x, 0.05, z.z);
      }
      for (const [id, m] of zoneMeshes.entries()) {
        if (!seenZones.has(id)) { scene.remove(m); disposeObject3D(m); zoneMeshes.delete(id); }
      }

      // Dynamic Barriers
      const seenBars = new Set();
      for (const b of state.barriers) {
        seenBars.add(b.id);
        let bm = barrierMeshes.get(b.id);
        if (!bm) {
          bm = new THREE.Mesh(
            new THREE.BoxGeometry(b.w, 1.5, b.d),
            new THREE.MeshLambertMaterial({ color: 0x40c4ff, transparent: true, opacity: 0.78 })
          );
          scene.add(bm);
          barrierMeshes.set(b.id, bm);
        }
        bm.position.set(b.x, 0.75, b.z);
      }
      for (const [id, m] of barrierMeshes.entries()) {
        if (!seenBars.has(id)) { scene.remove(m); disposeObject3D(m); barrierMeshes.delete(id); }
      }

      // Transient Shockwaves & Lasers
      for (let i = transientFx.length - 1; i >= 0; i--) {
        const fx = transientFx[i];
        fx.life -= realDt;
        if (fx.life <= 0) {
          scene.remove(fx.mesh);
          disposeObject3D(fx.mesh);
          transientFx.splice(i, 1);
        } else {
          const prog = 1 - fx.life / fx.maxLife;
          fx.mesh.material.opacity = 0.75 * (1 - prog);
          if (fx.scaleUp) fx.mesh.scale.setScalar(0.5 + prog * 0.65);
        }
      }

      // Pooled Cartoon Star Particles (<= 200)
      for (let i = 0; i < particlePool.length; i++) {
        const p = particlePool[i];
        if (!p.active) continue;
        p.life -= realDt;
        if (p.life <= 0) {
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
        p.vy -= 9.5 * realDt;
        p.x += p.vx * realDt;
        p.y = Math.max(0.1, p.y + p.vy * realDt);
        p.z += p.vz * realDt;
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.quaternion.copy(camera.quaternion);
        const s = p.scale * (p.life / p.maxLife);
        p.mesh.scale.setScalar(s);
      }

      // Follow Camera (responsive to Portrait & Landscape + impact punch!)
      if (player) {
        const px = lerp(player.prevX, player.x, alpha);
        const pz = lerp(player.prevZ, player.z, alpha);
        const isPortrait = camera.aspect < 1.0;
        const camHeight = isPortrait ? 20.5 : 16.5;
        const camBackZ = isPortrait ? 12.0 : 10.2;
        let sx = 0;
        let sz = 0;
        if (shakeTimer > 0) {
          shakeTimer = Math.max(0, shakeTimer - realDt);
          sx = (Math.random() - 0.5) * shakeMag;
          sz = (Math.random() - 0.5) * shakeMag;
        }
        camera.position.set(px * 0.68 + sx, camHeight, pz * 0.75 + camBackZ + sz);
        camera.lookAt(px * 0.68, 0.4, pz * 0.75 - 1.2);
      }

      glRenderer.render(scene, camera);
      renderWorldOverlayLabels(state, alpha, realDt, player);
    }

    function projectToScreen(wx, wy, wz, width, height) {
      const v = new THREE.Vector3(wx, wy, wz);
      v.project(camera);
      if (v.z > 1) return null;
      return {
        x: (v.x * 0.5 + 0.5) * width,
        y: (-v.y * 0.5 + 0.5) * height
      };
    }

    function renderWorldOverlayLabels(state, alpha, realDt, player) {
      if (!overlayEl) return;
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const html = [];

      for (const u of state.units) {
        if (!u.alive) continue;
        if (player && !root.SA.Physics.canSeeUnit(player, u, state)) continue;
        const ix = lerp(u.prevX, u.x, alpha);
        const iz = lerp(u.prevZ, u.z, alpha);
        const pt = projectToScreen(ix, u.isBoss ? 4.75 : (u.isSummon ? 1.65 : 2.35), iz, w, h);
        if (!pt) continue;
        const hpPct = Math.max(0, Math.min(100, Math.round((u.hp / u.maxHp) * 100)));
        const barColor = u.isPlayer ? '#00E676' : (u.team === 0 && state.modeId !== 'last_hero' ? '#29B6F6' : '#FF5252');
        const ico = root.SA && root.SA.Icons ? root.SA.Icons.svg : () => '';
        const badge = u.crystals > 0
          ? `<span class="sa-tag-crystal">${ico('crystal')}${u.crystals}</span>`
          : (state.modeId === 'star_hunt' ? `<span class="sa-tag-star">★${u.bountyStars}</span>` : (u.powerStars > 0 ? `<span class="sa-tag-star">⚡${u.powerStars}</span>` : ''));
        const ammoHtml = u.isPlayer
          ? `<div class="sa-ammo-row">${[0, 1, 2].map(k => `<span class="sa-ammo-pip ${u.ammo >= k + 1 ? 'full' : ''}"></span>`).join('')}</div>`
          : '';
        const pinSvg = u.emoteTimer > 0 && u.emoteId
          ? `<div class="sa-unit-pin">${ico('pin_' + u.emoteId) || ico('pin_fire')}</div>`
          : '';
        html.push(`
          <div class="sa-unit-plate" style="transform:translate3d(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px,0)">
            ${pinSvg}
            <div class="sa-unit-name">${u.name} ${badge}</div>
            <div class="sa-hp-track"><div class="sa-hp-fill" style="width:${hpPct}%;background:${barColor}"></div></div>
            ${ammoHtml}
          </div>
        `);
      }

      if (state.vaults) {
        const ico = root.SA && root.SA.Icons ? root.SA.Icons.svg : () => '';
        for (const v of state.vaults) {
          if (v.hp <= 0) continue;
          const pt = projectToScreen(v.x, 2.4, v.z, w, h);
          if (!pt) continue;
          const pct = Math.round((v.hp / v.maxHp) * 100);
          html.push(`
            <div class="sa-unit-plate" style="transform:translate3d(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px,0)">
              <div class="sa-unit-name">${ico('shield')} ${pct}% (${v.hp})</div>
            </div>
          `);
        }
      }

      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.life -= realDt;
        ft.y += realDt * 1.9;
        if (ft.life <= 0) {
          floatingTexts.splice(i, 1);
          continue;
        }
        const pt = projectToScreen(ft.x, ft.y, ft.z, w, h);
        if (pt) {
          const sc = ft.scale || 1.0;
          html.push(`<div class="sa-pop-num" style="transform:translate3d(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px,0) scale(${sc});color:${ft.color}">${ft.text}</div>`);
        }
      }

      overlayEl.innerHTML = html.join('');
    }

    return {
      resize,
      setQualitySetting,
      renderMatch,
      clearDynamicMeshes,
      getQualityTier: () => qualityTier
    };
  }

  // Standalone lightweight 3D Lobby & Fighter Showcase Turntable viewer
  function createHeroTurntable(canvas) {
    const THREE = root.THREE;
    if (!THREE || !canvas) return null;
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (_) {
      return null;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.2, 30);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x312e81, 1.18));
    const keyLight = new THREE.DirectionalLight(0xfff8e1, 0.92);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.42);
    rimLight.position.set(-3.5, 3.2, -3.0);
    scene.add(rimLight);

    // Arcade Holo-Pedestal disc + glowing cyan outer ring + 2 Flanking Squad Pedestals
    const pedGroup = new THREE.Group();
    function buildPedestal(radius, height, ringColorHex) {
      const g = new THREE.Group();
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 1.12, height, 24),
        new THREE.MeshLambertMaterial({ color: 0x1e3a8a })
      );
      cyl.position.y = -height * 0.5;
      g.add(cyl);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.96, radius * 1.12, 28),
        new THREE.MeshBasicMaterial({ color: ringColorHex, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      g.add(ring);
      return g;
    }

    const centerPed = buildPedestal(1.16, 0.24, 0x00e5ff);
    const leftPed = buildPedestal(0.92, 0.20, 0x38bdf8);
    leftPed.position.set(-2.05, -0.06, -0.82);
    leftPed.visible = false;
    const rightPed = buildPedestal(0.92, 0.20, 0x38bdf8);
    rightPed.position.set(2.05, -0.06, -0.82);
    rightPed.visible = false;
    pedGroup.add(centerPed, leftPed, rightPed);
    scene.add(pedGroup);

    let currentHeroMesh = null;
    const flankMeshes = [null, null];
    let stageMode = 'single'; // 'single' | 'squad' | 'podium_win' | 'podium_loss'
    let spinAngle = -0.28;
    let idleClock = 0;
    let jumpTimer = 0;
    let jumpSpinActive = false;
    let dragging = false;
    let dragMoved = false;
    let lastX = 0;
    let disposed = false;

    const onDown = (e) => {
      dragging = true;
      dragMoved = false;
      lastX = e.clientX;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      if (Math.abs(dx) > 3) dragMoved = true;
      lastX = e.clientX;
      spinAngle += dx * 0.018;
    };
    const onUp = () => {
      if (dragging && !dragMoved) {
        jumpTimer = 0.50;
        jumpSpinActive = true;
      }
      dragging = false;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    function disposeMeshTree(rootObj) {
      if (!rootObj) return;
      rootObj.traverse((c) => {
        if (c.isMesh) {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m && m.dispose && m.dispose());
            else if (c.material.dispose) c.material.dispose();
          }
        }
      });
    }

    function clearFlanks() {
      for (let i = 0; i < 2; i++) {
        if (flankMeshes[i]) {
          scene.remove(flankMeshes[i]);
          disposeMeshTree(flankMeshes[i]);
          flankMeshes[i] = null;
        }
      }
    }

    function buildPreviewMesh(hero, skin, isLead) {
      const palette = skin
        ? { primary: skin.colors.body, secondary: skin.colors.trim, glow: skin.colors.aura, dark: hero.palette && hero.palette.dark }
        : hero.palette;
      const m = root.SA.Meshes.createHeroMesh(THREE, {
        silhouette: hero.silhouette,
        palette,
        heroId: hero.id,
        elementId: hero.elementId,
        team: 0,
        isPlayer: Boolean(isLead)
      });
      // Hide combat-only floor rings on lobby/podium pedestals for cleaner showcase look
      if (m.userData.teamRing) m.userData.teamRing.visible = false;
      return m;
    }

    function applyCameraFraming(aspect) {
      const safeAspect = Math.max(0.35, aspect || 1);
      const tanHalfFov = Math.tan((camera.fov * 0.5) * Math.PI / 180); // tan(18 deg) ~ 0.3249
      if (stageMode === 'single') {
        // Full hero + pedestal + horns + jump-lift spans Y: [-0.34 .. +2.48], X: [-1.45 .. +1.45]
        const distV = 1.62 / tanHalfFov; // ~4.98
        const distH = 1.48 / (safeAspect * tanHalfFov);
        const zDist = Math.max(distV, distH);
        camera.position.set(0, 1.48, zDist);
        camera.lookAt(0, 0.98, 0);
      } else if (stageMode === 'squad') {
        // 3 pedestals span X: [-3.15 .. +3.15], Y: [-0.35 .. +2.45]
        const distV = 1.72 / tanHalfFov;
        const distH = 3.18 / (safeAspect * tanHalfFov);
        const zDist = Math.max(distV, Math.min(9.6, distH));
        camera.position.set(0, 1.95, zDist);
        camera.lookAt(0, 0.92, -0.18);
      } else {
        // Podium 3 pedestals
        const distV = 1.75 / tanHalfFov;
        const distH = 3.05 / (safeAspect * tanHalfFov);
        const zDist = Math.max(distV, Math.min(9.4, distH));
        camera.position.set(0, 2.0, zDist);
        camera.lookAt(0, 0.98, -0.10);
      }
    }

    function setHero(hero, skin) {
      if (disposed || !hero) return;
      stageMode = 'single';
      clearFlanks();
      leftPed.visible = false;
      rightPed.visible = false;
      centerPed.position.set(0, 0, 0);
      applyCameraFraming(camera.aspect || 1);
      if (currentHeroMesh) {
        scene.remove(currentHeroMesh);
        disposeMeshTree(currentHeroMesh);
      }
      currentHeroMesh = buildPreviewMesh(hero, skin, true);
      currentHeroMesh.position.set(0, 0, 0);
      spinAngle = -0.28;
      jumpTimer = 0.34;
      jumpSpinActive = false;
      scene.add(currentHeroMesh);
    }

    function setSquad(leadHero, leadSkin, allies = []) {
      if (disposed || !leadHero) return;
      stageMode = 'squad';
      clearFlanks();
      centerPed.position.set(0, 0, 0.28);
      leftPed.position.set(-2.05, -0.06, -0.82);
      rightPed.position.set(2.05, -0.06, -0.82);
      leftPed.visible = true;
      rightPed.visible = true;
      applyCameraFraming(camera.aspect || 1.4);

      if (currentHeroMesh) {
        scene.remove(currentHeroMesh);
        disposeMeshTree(currentHeroMesh);
      }
      currentHeroMesh = buildPreviewMesh(leadHero, leadSkin, true);
      currentHeroMesh.position.set(0, 0, 0.28);
      scene.add(currentHeroMesh);

      for (let i = 0; i < 2; i++) {
        const al = allies[i];
        if (al && al.hero) {
          const fm = buildPreviewMesh(al.hero, al.skin || null, false);
          fm.scale.setScalar(0.88);
          fm.position.set(i === 0 ? -2.05 : 2.05, -0.04, -0.82);
          fm.rotation.y = i === 0 ? 0.32 : -0.32;
          scene.add(fm);
          flankMeshes[i] = fm;
        }
      }
      spinAngle = -0.22;
      jumpTimer = 0.30;
      jumpSpinActive = false;
    }

    function setPodium(entries = [], won = true) {
      if (disposed || !entries.length) return;
      stageMode = won ? 'podium_win' : 'podium_loss';
      clearFlanks();
      centerPed.position.set(0, 0.16, 0.22);
      leftPed.position.set(-1.95, -0.04, -0.55);
      rightPed.position.set(1.95, -0.04, -0.55);
      leftPed.visible = entries.length > 1;
      rightPed.visible = entries.length > 2;
      applyCameraFraming(camera.aspect || 1.8);

      if (currentHeroMesh) {
        scene.remove(currentHeroMesh);
        disposeMeshTree(currentHeroMesh);
      }
      currentHeroMesh = buildPreviewMesh(entries[0].hero, entries[0].skin || null, true);
      currentHeroMesh.position.set(0, 0.16, 0.22);
      scene.add(currentHeroMesh);

      for (let i = 0; i < 2; i++) {
        const ent = entries[i + 1];
        if (ent && ent.hero) {
          const fm = buildPreviewMesh(ent.hero, ent.skin || null, false);
          fm.scale.setScalar(0.90);
          fm.position.set(i === 0 ? -1.95 : 1.95, -0.02, -0.55);
          fm.rotation.y = i === 0 ? 0.26 : -0.26;
          scene.add(fm);
          flankMeshes[i] = fm;
        }
      }
      spinAngle = 0;
      jumpTimer = won ? 0.55 : 0;
      jumpSpinActive = won;
    }

    function triggerPose() {
      jumpTimer = 0.50;
      jumpSpinActive = true;
    }

    function renderFrame(dt) {
      if (disposed) return;
      const host = canvas.parentElement;
      const cssW = Math.max(64, (host ? host.clientWidth : 0) || canvas.clientWidth || 280);
      const cssH = Math.max(64, (host ? host.clientHeight : 0) || canvas.clientHeight || 240);
      const curDpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(cssW * curDpr);
      const targetH = Math.round(cssH * curDpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        renderer.setPixelRatio(curDpr);
        renderer.setSize(cssW, cssH, false);
        camera.aspect = cssW / cssH;
        applyCameraFraming(camera.aspect);
        camera.updateProjectionMatrix();
      }
      idleClock += dt;
      const baseY = stageMode.startsWith('podium') ? 0.16 : 0;
      if (currentHeroMesh) {
        let jumpLift = 0;
        if (jumpTimer > 0) {
          const prev = jumpTimer;
          jumpTimer = Math.max(0, jumpTimer - dt);
          const dur = jumpSpinActive ? 0.50 : 0.34;
          jumpLift = Math.sin((jumpTimer / dur) * Math.PI) * 0.38;
          if (jumpSpinActive) {
            spinAngle += ((prev - jumpTimer) / 0.50) * Math.PI * 2;
          }
          if (jumpTimer === 0) jumpSpinActive = false;
        }
        const winBounce = stageMode === 'podium_win' ? Math.abs(Math.sin(idleClock * 5.2)) * 0.18 : Math.abs(Math.sin(idleClock * 2.4)) * 0.045;
        const sway = dragging ? 0 : Math.sin(idleClock * 1.9) * 0.18;
        currentHeroMesh.rotation.y = spinAngle + sway;
        currentHeroMesh.rotation.x = stageMode === 'podium_loss' ? 0.16 : 0;
        currentHeroMesh.position.y = baseY + jumpLift + winBounce;
        if (currentHeroMesh.userData.animAccessory) {
          const acc = currentHeroMesh.userData.animAccessory;
          if (acc.kind === 'wag') acc.group.rotation.y = Math.sin(idleClock * 6.5) * 0.36;
          else if (acc.kind === 'flutter') acc.group.position.y = 0.92 + Math.sin(idleClock * 4.8) * 0.06;
          else if (acc.kind === 'hover') acc.group.position.y = 1.56 + Math.sin(idleClock * 4.2) * 0.09;
          else if (acc.kind === 'orbit') acc.group.rotation.y = idleClock * 1.8;
        }
      }
      for (let i = 0; i < 2; i++) {
        const fm = flankMeshes[i];
        if (!fm) continue;
        const baseRot = i === 0 ? 0.30 : -0.30;
        const fBounce = stageMode === 'podium_win'
          ? Math.abs(Math.sin(idleClock * 4.8 + i * 1.2)) * 0.14
          : Math.abs(Math.sin(idleClock * 2.1 + i + 1)) * 0.035;
        fm.rotation.y = baseRot + Math.sin(idleClock * 1.6 + i) * 0.14;
        fm.rotation.x = stageMode === 'podium_loss' ? 0.14 : 0;
        fm.position.y = -0.02 + fBounce;
        if (fm.userData && fm.userData.animAccessory) {
          const acc = fm.userData.animAccessory;
          if (acc.kind === 'wag') acc.group.rotation.y = Math.sin(idleClock * 5.8 + i) * 0.32;
          else if (acc.kind === 'flutter') acc.group.position.y = 0.92 + Math.sin(idleClock * 4.5 + i) * 0.05;
          else if (acc.kind === 'hover') acc.group.position.y = 1.56 + Math.sin(idleClock * 4.0 + i) * 0.08;
          else if (acc.kind === 'orbit') acc.group.rotation.y = idleClock * 1.6 + i;
        }
      }
      renderer.render(scene, camera);
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      if (currentHeroMesh) {
        scene.remove(currentHeroMesh);
        disposeMeshTree(currentHeroMesh);
        currentHeroMesh = null;
      }
      clearFlanks();
      disposeMeshTree(pedGroup);
      try {
        renderer.dispose();
      } catch (_) {}
    }

    return { setHero, setSquad, setPodium, renderFrame, triggerPose, dispose };
  }

  const api = { createRenderer3D, createHeroTurntable };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Renderer3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
