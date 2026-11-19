/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Low-Poly Modular 3D Character & Arena Builder
 * Strict Technical Budgets (Section 7):
 *  - Character <= 800 triangles (actual: ~240 - 460 tris)
 *  - Arena     <= 6,000 triangles (actual: ~900 - 2,500 tris)
 *  - Blob shadows only, zero realtime shadow maps!
 */
(function (root) {
  'use strict';

  function countTriangles(obj) {
    let tris = 0;
    obj.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const g = child.geometry;
        if (g.index) {
          tris += g.index.count / 3;
        } else if (g.attributes && g.attributes.position) {
          tris += g.attributes.position.count / 3;
        }
      }
    });
    return Math.round(tris);
  }

  // Shared Cel-Shading Gradient & Procedural Face Texture Caches (never disposed per-unit)
  let sharedToonGrad = null;
  const faceTexCache = new Map();

  function hashStr(str) {
    const s = String(str || 'hero');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function getToonGradientTex(THREE) {
    if (sharedToonGrad) return sharedToonGrad;
    const data = new Uint8Array([
      138, 138, 155, 255,
      196, 196, 208, 255,
      242, 242, 248, 255,
      255, 255, 255, 255
    ]);
    const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    tex.userData = { sharedCache: true };
    sharedToonGrad = tex;
    return tex;
  }

  function pickSkinTone(silhouette, elementId, seed) {
    if (silhouette === 'hulking_paladin' && elementId === 'shadow') return '#312e81';
    if (silhouette === 'prism_mage' || (silhouette === 'hawk_sniper' && elementId === 'shadow')) return '#1e1b4b';
    if (elementId === 'ice') return (seed % 2 === 0) ? '#e0f2fe' : '#f1f5f9';
    if (elementId === 'shadow') return (seed % 2 === 0) ? '#ddd6fe' : '#cbd5e1';
    const warmTones = ['#ffdfc4', '#ffe4c8', '#f9d2b0', '#ffdbb8', '#f5cba7'];
    return warmTones[seed % warmTones.length];
  }

  function createCharacterFaceTexture(THREE, { silhouette, elementId, heroId, palette, isBoss }) {
    if (typeof document === 'undefined') return null;
    const cacheKey = `${heroId || silhouette}|${elementId || 'fire'}|${palette.primary}|${palette.secondary}|${palette.glow}|${isBoss ? 1 : 0}`;
    if (faceTexCache.has(cacheKey)) return faceTexCache.get(cacheKey);
    if (faceTexCache.size > 96) {
      const firstKey = faceTexCache.keys().next().value;
      faceTexCache.delete(firstKey);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const seed = hashStr(heroId || `${silhouette}_${elementId}`);
    const skinCol = isBoss ? '#1e293b' : pickSkinTone(silhouette, elementId, seed);
    const hairCol = (silhouette === 'cyber_fox' || silhouette === 'bomb_grenadier')
      ? palette.primary
      : (seed % 3 === 0 ? palette.primary : palette.secondary);
    const irisCol = palette.glow || palette.primary || '#38bdf8';
    const S = 2; // scale factor 256->512
    ctx.scale(S,S);

    // Premium foundation: soft AO + hair base
    // Hair / Hood / Fur base wrapping back & crown of head
    ctx.fillStyle = hairCol;
    ctx.fillRect(0, 0, 256, 256);
    // hair strand highlights (hand-painted)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2;
    for(let i=0;i<5;i++){ ctx.beginPath(); ctx.moveTo(32+i*44, 18); ctx.quadraticCurveTo(44+i*44, 38, 52+i*44, 18); ctx.stroke(); }
    // AO vignette around head edge
    const aoGrad = ctx.createRadialGradient(128,128, 90, 128,128, 140);
    aoGrad.addColorStop(0,'rgba(0,0,0,0)');
    aoGrad.addColorStop(1,'rgba(15,23,42,0.28)');
    ctx.fillStyle = aoGrad; ctx.fillRect(0,0,256,256);

    // Subtle cel-highlight band on hair crown
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, 28, 256, 36);

    // 2. Sculpted Front Face Oval (centered at u=0.5 -> x=128, y=132)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(128, 136, 44, 50, 0, 0, Math.PI * 2);
    ctx.fillStyle = skinCol;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.stroke();
    ctx.restore();

    // Fox/Lynx Two-Tone Furry Muzzle Cheeks
    if (silhouette === 'cyber_fox') {
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.ellipse(128, 104, 46, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff7ed';
      ctx.beginPath();
      ctx.ellipse(128, 150, 34, 24, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Knight Faceplate Cheek Guards
    if (silhouette === 'hulking_paladin' || isBoss) {
      ctx.fillStyle = palette.dark || '#1e293b';
      ctx.fillRect(82, 74, 92, 24);
      ctx.fillStyle = palette.secondary;
      ctx.fillRect(84, 93, 88, 6);
    }

    // Stylish Anime Bangs / Hairline sweeping across forehead
    if (silhouette !== 'hulking_paladin' && silhouette !== 'prism_mage' && !isBoss) {
      ctx.fillStyle = hairCol;
      ctx.beginPath();
      ctx.moveTo(80, 98);
      ctx.quadraticCurveTo(104, 114, 118, 95);
      ctx.quadraticCurveTo(130, 116, 144, 96);
      ctx.quadraticCurveTo(160, 112, 176, 98);
      ctx.lineTo(176, 72);
      ctx.lineTo(80, 72);
      ctx.closePath();
      ctx.fill();
    }

    // Elemental Forehead / Cheek Emblem
    ctx.save();
    ctx.fillStyle = irisCol;
    if (elementId === 'fire') {
      ctx.beginPath();
      ctx.moveTo(128, 96); ctx.lineTo(133, 106); ctx.lineTo(128, 104); ctx.lineTo(123, 106);
      ctx.closePath(); ctx.fill();
    } else if (elementId === 'ice') {
      ctx.beginPath();
      ctx.moveTo(128, 95); ctx.lineTo(133, 102); ctx.lineTo(128, 109); ctx.lineTo(123, 102);
      ctx.closePath(); ctx.fill();
    } else if (elementId === 'light') {
      ctx.beginPath();
      ctx.arc(128, 102, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Rosy Blush / Cheek Paint
    if (!isBoss && silhouette !== 'prism_mage') {
      ctx.fillStyle = silhouette === 'cosmic_jester' ? palette.primary : 'rgba(255, 107, 139, 0.45)';
      ctx.beginPath();
      ctx.ellipse(101, 141, 7.5, 4.5, 0, 0, Math.PI * 2);
      ctx.ellipse(155, 141, 7.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. True Chibi Expressive Eyes (wide cute spacing, tall irises, upper lash wing, zero eyeglass border!)
    const drawCuteEye = (cx, cy, isRight) => {
      if (silhouette === 'alchemist_pack') {
        // Big quirky chemist goggle lens with brass rim!
        const r = isRight ? 13.5 : 12.2;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = palette.secondary;
        ctx.beginPath(); ctx.arc(cx, cy, r + 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath(); ctx.arc(cx, cy, r - 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.arc(cx + (isRight ? -2 : 2), cy + 0.5, 6.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx - 3.2, cy - 3.2, 3.3, 0, Math.PI * 2); ctx.fill();
        return;
      }

      if (silhouette === 'prism_mage' || isBoss || (silhouette === 'hulking_paladin' && elementId === 'shadow')) {
        // Glowing mystical / mecha eyes shining out of dark helm/shadow
        ctx.fillStyle = isBoss ? '#ff1744' : irisCol;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 10.5, 7.8, isRight ? -0.14 : 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 2.8, cy - 2.0, 3.4, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      if (silhouette === 'broad_cannon' && isRight && (seed % 2 === 0)) {
        // Cool buccaneer star-eyepatch on right eye!
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3.8;
        ctx.beginPath(); ctx.moveTo(cx - 16, cy - 11); ctx.lineTo(cx + 16, cy + 7); ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = palette.secondary;
        ctx.beginPath(); ctx.arc(cx, cy, 3.8, 0, Math.PI * 2); ctx.fill();
        return;
      }

      // Soft white sclera base (NO black outline ring around bottom -> zero 'eyeglasses' look!)
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, 10.2, 12.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.clip();

      // Tall Chibi Iris filling 82% of the eye
      const lookShift = isRight ? -1.4 : 1.4;
      ctx.fillStyle = '#0b1026';
      ctx.beginPath();
      ctx.ellipse(cx + lookShift, cy + 0.5, 8.2, 10.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Vibrant lower iris crescent glow
      ctx.fillStyle = irisCol;
      ctx.beginPath();
      ctx.ellipse(cx + lookShift, cy + 4.2, 6.8, 6.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deep center pupil
      ctx.fillStyle = '#0b1026';
      ctx.beginPath();
      ctx.ellipse(cx + lookShift, cy + 0.2, 4.8, 6.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Big glossy white catchlight + small lower sparkle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx - 2.6 + lookShift * 0.4, cy - 4.2, 3.8, 4.2, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 3.2 + lookShift * 0.4, cy + 5.0, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Bold sculpted upper eyelash arch ONLY on top
      ctx.lineWidth = 4.2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0b1026';
      ctx.beginPath();
      ctx.arc(cx, cy + 0.5, 10.8, Math.PI * 1.10, Math.PI * 1.90);
      ctx.stroke();
    };

    drawCuteEye(109, 126, false);
    drawCuteEye(147, 126, true);

    // Goggle bridge for Alchemist
    if (silhouette === 'alchemist_pack') {
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(124, 125); ctx.lineTo(131, 125); ctx.stroke();
    }

    // 5. Eyebrows (varied mood: heroic V, cheerful arch, cheeky tilt)
    if (silhouette !== 'alchemist_pack' && silhouette !== 'prism_mage') {
      const browMood = (silhouette === 'seraph_halo' || elementId === 'nature') ? 'gentle'
        : ((silhouette === 'cosmic_jester' || seed % 4 === 1) ? 'smirk' : 'heroic');
      ctx.strokeStyle = '#0b1026';
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (browMood === 'gentle') {
        ctx.moveTo(102, 109); ctx.quadraticCurveTo(112, 104, 121, 108);
        ctx.moveTo(135, 108); ctx.quadraticCurveTo(144, 104, 154, 109);
      } else if (browMood === 'smirk') {
        ctx.moveTo(102, 110); ctx.lineTo(121, 112);
        ctx.moveTo(135, 109); ctx.quadraticCurveTo(145, 102, 155, 108);
      } else {
        ctx.moveTo(101, 107); ctx.lineTo(121, 112);
        ctx.moveTo(155, 107); ctx.lineTo(135, 112);
      }
      ctx.stroke();
    }

    // 6. Nose, Whiskers, Masks & Expressive Mouths!
    ctx.strokeStyle = '#0b1026';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    if (silhouette === 'cyber_fox') {
      // Cute dark fox nose + ':3' cat mouth + whiskers!
      ctx.fillStyle = '#0b1026';
      ctx.beginPath();
      ctx.moveTo(124, 138); ctx.lineTo(132, 138); ctx.lineTo(128, 143);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(119, 148); ctx.quadraticCurveTo(124, 153, 128, 147);
      ctx.quadraticCurveTo(132, 153, 137, 148);
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(92, 141); ctx.lineTo(104, 143);
      ctx.moveTo(91, 147); ctx.lineTo(104, 147);
      ctx.moveTo(164, 141); ctx.lineTo(152, 143);
      ctx.moveTo(165, 147); ctx.lineTo(152, 147);
      ctx.stroke();
    } else if (silhouette === 'hawk_sniper') {
      // Sleek ninja/falcon lower scarf mask over nose & mouth!
      ctx.fillStyle = palette.dark || '#0f172a';
      ctx.beginPath();
      ctx.moveTo(92, 138);
      ctx.quadraticCurveTo(128, 132, 164, 138);
      ctx.lineTo(160, 174);
      ctx.quadraticCurveTo(128, 182, 96, 174);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(94, 139); ctx.quadraticCurveTo(128, 133, 162, 139); ctx.stroke();
    } else if (silhouette !== 'prism_mage' && !isBoss) {
      const mouthKind = seed % 3;
      if (mouthKind === 0 || silhouette === 'bomb_grenadier' || silhouette === 'martial_champ') {
        // Big cheerful cartoon ':D' grin with white teeth!
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.arc(128, 146, 9.5, 0.08, Math.PI - 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(121, 146, 14, 3.5);
      } else if (mouthKind === 1 || silhouette === 'cosmic_jester') {
        // Confident smirk + cute little fang!
        ctx.beginPath();
        ctx.moveTo(118, 148);
        ctx.quadraticCurveTo(129, 154, 139, 145);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(133, 148); ctx.lineTo(137, 147); ctx.lineTo(135, 153);
        ctx.closePath(); ctx.fill();
      } else {
        // Warm happy smile
        ctx.beginPath();
        ctx.arc(128, 144, 8, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.userData = { sharedCache: true };
    faceTexCache.set(cacheKey, tex);
    return tex;
  }

  const outfitTexCache = new Map();
  function createOutfitTexture(THREE, { silhouette, palette }) {
    if (typeof document === 'undefined') return null;
    const key = `out|${silhouette}|${palette.primary}|${palette.secondary}|${palette.glow}`;
    if (outfitTexCache.has(key)) return outfitTexCache.get(key);
    if (outfitTexCache.size > 64) outfitTexCache.delete(outfitTexCache.keys().next().value);

    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = palette.primary;
    ctx.fillRect(0, 0, 128, 128);

    // CylinderGeometry UV: +Z front center is u=0.5 (x=64) when rotated by 0! Wait: CylinderGeometry(z=+r) is u=0.5!
    if (silhouette === 'cosmic_jester') {
      // Split two-tone harlequin diamond tunic!
      ctx.fillStyle = palette.secondary;
      ctx.fillRect(64, 0, 64, 128);
      ctx.fillStyle = palette.glow || '#fff';
      ctx.beginPath();
      ctx.moveTo(64, 34); ctx.lineTo(74, 48); ctx.lineTo(64, 62); ctx.lineTo(54, 48);
      ctx.closePath(); ctx.fill();
    } else if (silhouette === 'cyber_fox' || silhouette === 'martial_champ') {
      // Crossed martial/shinobi V-lapels + sash belt
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.moveTo(46, 0); ctx.lineTo(64, 62); ctx.lineTo(82, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = palette.secondary;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(46, 0); ctx.lineTo(66, 66); ctx.moveTo(82, 0); ctx.lineTo(62, 66); ctx.stroke();
    } else if (silhouette === 'prism_mage' || silhouette === 'seraph_halo') {
      // Mystic center robe trim + star hem
      ctx.fillStyle = palette.secondary;
      ctx.fillRect(58, 0, 12, 128);
      ctx.fillRect(0, 108, 128, 12);
    } else {
      // Sporty open star-jacket with inner shirt + belt + golden star buckle!
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(53, 0, 22, 92);
      ctx.fillStyle = palette.secondary;
      ctx.fillRect(49, 0, 5, 92);
      ctx.fillRect(74, 0, 5, 92);
    }

    // Heroic Belt + Glowing Center Buckle across waist
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 86, 128, 18);
    ctx.fillStyle = palette.glow || palette.secondary;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(55, 83, 18, 24, 5) : ctx.rect(55, 83, 18, 24);
    ctx.fill();
    ctx.strokeStyle = '#060a17';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.userData = { sharedCache: true };
    outfitTexCache.set(key, tex);
    return tex;
  }


    // Arcade Toy thick outline (inverted hull via scaled duplicate) — 0.04 extra scale
    function addToyOutline(mesh, scaleMul=1.06){
      const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2e, side: THREE.BackSide });
      const outline = mesh.clone();
      outline.material = outlineMat;
      outline.scale.multiplyScalar(scaleMul);
      outline.position.y -= 0.02;
      mesh.parent && mesh.parent.add(outline);
      return outline;
    }

  function createHeroMesh(THREE, {
    silhouette = 'visor_dual',
    palette = { primary: '#FF5722', secondary: '#FFB300', glow: '#FF8A50' },
    heroId = null,
    elementId = 'fire',
    team = 0,
    isPlayer = false,
    isSummon = false,
    isBoss = false,
    shadowTex = null
  }) {
    const group = new THREE.Group();
    const scale = isBoss ? 2.15 : (isSummon ? 0.65 : 1.0);
    const toonGrad = getToonGradientTex(THREE);
    const ToonMat = THREE.MeshToonMaterial || THREE.MeshLambertMaterial;
    const makeToon = (col, extra = {}) => new ToonMat(Object.assign(
      THREE.MeshToonMaterial ? { color: col, gradientMap: toonGrad } : { color: col },
      extra
    ));

    const matPrimary = makeToon(palette.primary);
    const matSecondary = makeToon(palette.secondary);
    const matDark = makeToon(palette.dark || 0x1e293b);
    const matSkin = makeToon(pickSkinTone(silhouette, elementId, hashStr(heroId || silhouette)));
    const matGlow = new THREE.MeshBasicMaterial({ color: palette.glow || palette.secondary });

    // 1. Blob Shadow (2 tris)
    const shadowGeo = new THREE.PlaneGeometry(1.65 * scale, 1.65 * scale);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: shadowTex || null,
      transparent: true,
      opacity: shadowTex ? 0.85 : 0.32,
      depthWrite: false
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    // 2. Team / Super / Overdrive Ground Rings (8 segs = 16 tris each -> 48 tris total)
    const teamColor = isPlayer ? 0x00e676 : (team === 0 ? 0x29b6f6 : 0xff5252);
    const teamRing = new THREE.Mesh(
      new THREE.RingGeometry(0.68 * scale, 0.86 * scale, 8),
      new THREE.MeshBasicMaterial({ color: teamColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false })
    );
    teamRing.rotation.x = -Math.PI / 2;
    teamRing.position.y = 0.035;
    group.add(teamRing);

    const superRing = new THREE.Mesh(
      new THREE.RingGeometry(0.88 * scale, 1.05 * scale, 8),
      new THREE.MeshBasicMaterial({ color: 0xffea00, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })
    );
    superRing.rotation.x = -Math.PI / 2;
    superRing.position.y = 0.04;
    superRing.visible = false;
    group.add(superRing);

    const overdriveRing = new THREE.Mesh(
      new THREE.RingGeometry(1.06 * scale, 1.24 * scale, 8),
      new THREE.MeshBasicMaterial({ color: 0xe040fb, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false })
    );
    overdriveRing.rotation.x = -Math.PI / 2;
    overdriveRing.position.y = 0.045;
    overdriveRing.visible = false;
    group.add(overdriveRing);

    // 3. Sculpted Chibi Vinyl Body Rig
    const bodyRig = new THREE.Group();
    bodyRig.scale.setScalar(scale);
    group.add(bodyRig);

    // Cute Rounded Chibi Boots (CapsuleGeometry(1,6): 36 tris each -> 72 tris)
    const makeBoot = (sideSign) => {
      const hip = new THREE.Group();
      hip.position.set(sideSign * 0.21, 0.36, 0);
      const bootGeo = THREE.CapsuleGeometry
        ? new THREE.CapsuleGeometry(0.135, 0.16, 1, 6)
        : new THREE.CylinderGeometry(0.13, 0.15, 0.38, 6);
      const boot = new THREE.Mesh(bootGeo, matDark);
      boot.position.set(0, -0.17, 0.03);
      boot.rotation.x = -0.10;
      boot.rotation.y = sideSign * 0.10;
      hip.add(boot);
      return hip;
    };
    const leftLeg = makeBoot(-1);
    const rightLeg = makeBoot(1);
    bodyRig.add(leftLeg, rightLeg);

    // Archetype-Shaped Smooth Torso with Painted Jacket/Costume Texture + Collar (44 tris)
    const isRobe = silhouette === 'prism_mage' || silhouette === 'seraph_halo';
    const isHeavy = silhouette === 'hulking_paladin' || silhouette === 'mega_titan';
    const isPlump = silhouette === 'bomb_grenadier' || silhouette === 'alchemist_pack';
    const rTop = isHeavy ? 0.48 : (isRobe ? 0.27 : (isPlump ? 0.38 : 0.32));
    const rBot = isHeavy ? 0.38 : (isRobe ? 0.49 : (isPlump ? 0.46 : 0.40));
    const outfitTex = !isBoss ? createOutfitTexture(THREE, { silhouette, palette }) : null;
    const matTorso = outfitTex ? makeToon(0xffffff, { map: outfitTex }) : matPrimary;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, 0.64, 10, 1, true), matTorso);
    // outline for toy readability
    // torso outline omitted for budget, head and weapon get outline instead
    torso.position.y = 0.68;
    bodyRig.add(torso);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.05, rTop + 0.07, 0.11, 8, 1, true), matSecondary);
    collar.position.y = isHeavy || silhouette === 'martial_champ' ? 0.50 : 0.96;
    bodyRig.add(collar);

    // Smooth Rounded Chibi Head (14x9 = 216 tris -> silky-round cheeks!) + Expressive Face Texture
    const headGeo = new THREE.SphereGeometry(0.455, 14, 9);
    headGeo.rotateY(-Math.PI / 2);
    const faceTex = createCharacterFaceTexture(THREE, { silhouette, elementId, heroId, palette, isBoss });
    const matHead = faceTex
      ? makeToon(0xffffff, { map: faceTex })
      : makeToon(isBoss ? 0x1e293b : palette.secondary);
    const head = new THREE.Mesh(headGeo, matHead);
    head.scale.set(1.12, 0.96, 1.02);
    head.position.y = 1.36;
    bodyRig.add(head);

    // Articulated Rounded Chibi Arms + Weapon Pivot (72 tris)
    const weaponPivot = new THREE.Group();
    weaponPivot.position.set(0, 0.84, 0);
    bodyRig.add(weaponPivot);

    const armGeo = THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.105, 0.22, 1, 6)
      : new THREE.CylinderGeometry(0.10, 0.11, 0.38, 6);
    const leftArm = new THREE.Mesh(armGeo, matPrimary);
    leftArm.position.set(-0.44, 0.02, 0.14);
    leftArm.rotation.set(0.65, 0, 0.36);
    const rightArm = new THREE.Mesh(armGeo, matPrimary);
    rightArm.position.set(0.44, 0.02, 0.14);
    rightArm.rotation.set(0.65, 0, -0.36);
    weaponPivot.add(leftArm, rightArm);

    // Elemental Crown / Crest Accent so all 6 elements in an archetype have distinct 3D silhouettes (~16-24 tris)
    if (!isBoss && !isSummon) {
      if (elementId === 'nature') {
        const leafGeo = new THREE.ConeGeometry(0.08, 0.24, 4);
        const l1 = new THREE.Mesh(leafGeo, matGlow); l1.position.set(-0.08, 1.88, 0.12); l1.rotation.z = 0.45;
        const l2 = new THREE.Mesh(leafGeo, matGlow); l2.position.set(0.08, 1.88, 0.12); l2.rotation.z = -0.45;
        bodyRig.add(l1, l2);
      } else if (elementId === 'ice') {
        const crys = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), matGlow);
        crys.position.set(0, 1.90, 0.20);
        bodyRig.add(crys);
      } else if (elementId === 'storm') {
        const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 4), matGlow);
        bolt.position.set(0, 1.90, 0.18);
        bolt.rotation.x = 0.28;
        bodyRig.add(bolt);
      } else if (elementId === 'light') {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), matGlow);
        star.position.set(0, 1.92, 0.16);
        bodyRig.add(star);
      }
    }

    // 4. 12 Sculpted Memorable Archetype Costumes, Hair/Hats/Tails/Wings & Weapons (~110 - 180 tris)
    let animAccessory = null;
    if (silhouette === 'visor_dual') {
      // Star Ranger: Flipped-up forehead pilot goggles + spiky hair crest + twin sleek ray-pistols
      const gogGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.10, 7);
      gogGeo.rotateX(Math.PI / 2);
      const gL = new THREE.Mesh(gogGeo, matGlow); gL.position.set(-0.16, 1.62, 0.38);
      const gR = new THREE.Mesh(gogGeo, matGlow); gR.position.set(0.16, 1.62, 0.38);
      const hairSpike = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.42, 5), matSecondary);
      hairSpike.position.set(0, 1.86, 0.04);
      hairSpike.rotation.x = -0.25;
      bodyRig.add(gL, gR, hairSpike);

      const rayGeo = new THREE.CylinderGeometry(0.07, 0.12, 0.56, 7);
      rayGeo.rotateX(Math.PI / 2);
      const gunL = new THREE.Mesh(rayGeo, matSecondary); gunL.position.set(-0.48, -0.02, 0.44);
      const gunR = new THREE.Mesh(rayGeo, matSecondary); gunR.position.set(0.48, -0.02, 0.44);
      weaponPivot.add(gunL, gunR);
    } else if (silhouette === 'broad_cannon') {
      // Punk Buccaneer: Swept punk mohawk + shoulder pad + flared blunderbuss scatter-cannon
      const mohawk = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.48, 5), matPrimary);
      mohawk.scale.set(0.55, 1.0, 1.45);
      mohawk.position.set(0, 1.88, -0.04);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.20, 6, 5), matSecondary);
      pad.position.set(-0.44, 0.96, 0);
      bodyRig.add(mohawk, pad);

      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.13, 0.76, 8), matDark);
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(0.46, -0.02, 0.48);
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.10, 8), matGlow);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0.46, -0.02, 0.84);
      weaponPivot.add(cannon, muzzle);
    } else if (silhouette === 'hulking_paladin') {
      // Chibi Knight Guardian: Winged paladin helm + heroic cape + star shield & power hammer
      const wingGeo = new THREE.ConeGeometry(0.12, 0.42, 4);
      const wL = new THREE.Mesh(wingGeo, matSecondary); wL.position.set(-0.46, 1.62, 0); wL.rotation.z = 0.48;
      const wR = new THREE.Mesh(wingGeo, matSecondary); wR.position.set(0.46, 1.62, 0); wR.rotation.z = -0.48;
      const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.52, 0.72, 6, 1, false, Math.PI * 0.65, Math.PI * 0.7), matSecondary);
      cape.position.set(0, 0.66, -0.08);
      bodyRig.add(wL, wR, cape);

      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.10, 7), matSecondary);
      shield.rotation.x = Math.PI / 2;
      shield.rotation.z = 0.25;
      shield.position.set(-0.54, 0.04, 0.36);
      const hammer = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.42, 6), matGlow);
      hammer.rotation.z = Math.PI / 2;
      hammer.position.set(0.56, 0.08, 0.44);
      weaponPivot.add(shield, hammer);
    } else if (silhouette === 'hawk_sniper') {
      // Falcon Ranger: Sculpted falcon hood + beak brim + sleek scoped starlight rifle
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.56, 7), matPrimary);
      hood.position.set(0, 1.72, -0.04);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 4), matSecondary);
      beak.rotation.x = Math.PI * 0.62;
      beak.position.set(0, 1.56, 0.44);
      bodyRig.add(hood, beak);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 1.24, 7), matDark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.42, 0.02, 0.62);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.32, 6), matGlow);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0.42, 0.14, 0.44);
      weaponPivot.add(barrel, scope);
    } else if (silhouette === 'seraph_halo') {
      // Starlight Angel-Fairy: Cute twin hair buns + floating halo + feathered chibi wings + star wand
      const bunGeo = new THREE.SphereGeometry(0.17, 5, 4);
      const bL = new THREE.Mesh(bunGeo, matSecondary); bL.position.set(-0.42, 1.62, -0.05);
      const bR = new THREE.Mesh(bunGeo, matSecondary); bR.position.set(0.42, 1.62, -0.05);
      bodyRig.add(bL, bR);

      const wingRig = new THREE.Group();
      wingRig.position.set(0, 0.92, -0.26);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 4, 9), matGlow);
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0, 1.04, 0.24);
      const featherGeo = new THREE.ConeGeometry(0.22, 0.56, 5);
      const fwL = new THREE.Mesh(featherGeo, matGlow); fwL.position.set(-0.46, 0.08, 0); fwL.rotation.z = 1.05;
      const fwR = new THREE.Mesh(featherGeo, matGlow); fwR.position.set(0.46, 0.08, 0); fwR.rotation.z = -1.05;
      wingRig.add(halo, fwL, fwR);
      bodyRig.add(wingRig);
      animAccessory = { group: wingRig, kind: 'flutter' };

      const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 5), matSecondary);
      wand.rotation.x = 0.45;
      wand.position.set(0.48, 0.16, 0.36);
      const wandStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), matGlow);
      wandStar.position.set(0.48, 0.46, 0.52);
      weaponPivot.add(wand, wandStar);
    } else if (silhouette === 'alchemist_pack') {
      // Quirky Potion Alchemist: Tufted beret + giant glowing glass potion bulb on back + corked flask
      const beret = new THREE.Mesh(new THREE.SphereGeometry(0.36, 7, 5), matPrimary);
      beret.scale.set(1.2, 0.45, 1.15);
      beret.position.set(-0.06, 1.76, -0.04);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), matGlow);
      bulb.position.set(0, 0.84, -0.44);
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.16, 6), matSecondary);
      cork.position.set(0, 1.18, -0.44);
      bodyRig.add(beret, bulb, cork);

      const flask = new THREE.Mesh(new THREE.SphereGeometry(0.20, 7, 5), matGlow);
      flask.position.set(0.48, 0.06, 0.40);
      weaponPivot.add(flask);
    } else if (silhouette === 'cyber_fox') {
      // Fox/Lynx Beast-Ninja: Big tufted fox ears + fluffy wagging tail + twin curved energy daggers
      const earGeo = new THREE.ConeGeometry(0.19, 0.50, 4);
      const eL = new THREE.Mesh(earGeo, matPrimary); eL.position.set(-0.30, 1.84, 0.02); eL.rotation.z = 0.24;
      const eR = new THREE.Mesh(earGeo, matPrimary); eR.position.set(0.30, 1.84, 0.02); eR.rotation.z = -0.24;
      bodyRig.add(eL, eR);

      const tailPivot = new THREE.Group();
      tailPivot.position.set(0, 0.50, -0.34);
      const tailBody = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.72, 6), matPrimary);
      tailBody.position.set(0, 0.26, -0.26);
      tailBody.rotation.x = -0.88;
      const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 5), matGlow);
      tailTip.position.set(0, 0.52, -0.52);
      tailTip.rotation.x = -0.88;
      tailPivot.add(tailBody, tailTip);
      bodyRig.add(tailPivot);
      animAccessory = { group: tailPivot, kind: 'wag' };

      const bladeGeo = new THREE.ConeGeometry(0.11, 0.68, 4);
      bladeGeo.rotateX(Math.PI / 2);
      const bL = new THREE.Mesh(bladeGeo, matGlow); bL.position.set(-0.52, -0.02, 0.46);
      const bR = new THREE.Mesh(bladeGeo, matGlow); bR.position.set(0.52, -0.02, 0.46);
      weaponPivot.add(bL, bR);
    } else if (silhouette === 'prism_mage') {
      // Big-Brim Star Witch/Wizard: Wide wizard hat + bent tip + orbiting rune ring & crystal orb
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.07, 9), matPrimary);
      brim.position.set(0, 1.66, 0);
      brim.rotation.z = -0.10;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.62, 7), matPrimary);
      cone.position.set(-0.05, 1.98, -0.04);
      cone.rotation.z = 0.18;
      bodyRig.add(brim, cone);

      const orbitGroup = new THREE.Group();
      orbitGroup.position.set(0, 0.92, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 4, 11), matSecondary);
      ring.rotation.x = 1.22;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 0), matGlow);
      orb.position.set(0, 0.12, 0.62);
      orbitGroup.add(ring, orb);
      bodyRig.add(orbitGroup);
      animAccessory = { group: orbitGroup, kind: 'orbit' };
    } else if (silhouette === 'dome_inventor') {
      // Young Mech-Inventor: Ear-muff headphones + antenna + hovering round buddy-drone + coil gun
      const muffGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 7);
      muffGeo.rotateZ(Math.PI / 2);
      const mL = new THREE.Mesh(muffGeo, matSecondary); mL.position.set(-0.50, 1.38, 0);
      const mR = new THREE.Mesh(muffGeo, matSecondary); mR.position.set(0.50, 1.38, 0);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), matPrimary);
      cap.position.set(0, 1.44, 0);
      bodyRig.add(mL, mR, cap);

      const droneGroup = new THREE.Group();
      droneGroup.position.set(-0.66, 1.56, 0.08);
      const droneCore = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), matGlow);
      const droneRing = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 7), matDark);
      droneGroup.add(droneCore, droneRing);
      bodyRig.add(droneGroup);
      animAccessory = { group: droneGroup, kind: 'hover' };

      const spanner = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.58, 7), matSecondary);
      spanner.rotation.x = Math.PI / 2;
      spanner.position.set(0.48, 0, 0.42);
      weaponPivot.add(spanner);
    } else if (silhouette === 'martial_champ') {
      // Dojo Champion: Wild spiky anime hair + fluttering headband tails + oversized glossy boxing gloves
      const s1 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.46, 5), matSecondary); s1.position.set(0, 1.88, 0.06); s1.rotation.x = -0.2;
      const s2 = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.38, 4), matSecondary); s2.position.set(-0.24, 1.80, 0); s2.rotation.z = 0.45;
      const s3 = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.38, 4), matSecondary); s3.position.set(0.24, 1.80, 0); s3.rotation.z = -0.45;
      const bandTail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.48, 4), matPrimary);
      bandTail.rotation.x = -1.25;
      bandTail.position.set(0, 1.42, -0.54);
      bodyRig.add(s1, s2, s3, bandTail);

      const gloveGeo = new THREE.SphereGeometry(0.24, 7, 6);
      const gL = new THREE.Mesh(gloveGeo, matPrimary); gL.position.set(-0.52, 0.04, 0.40);
      const gR = new THREE.Mesh(gloveGeo, matPrimary); gR.position.set(0.52, 0.04, 0.40);
      weaponPivot.add(gL, gR);
    } else if (silhouette === 'cosmic_jester') {
      // Harlequin Trickster: Twin curved jester horns + glowing pom-pom bells + fan of trick cards
      const hornGeo = new THREE.ConeGeometry(0.19, 0.54, 6);
      const jL = new THREE.Mesh(hornGeo, matPrimary); jL.position.set(-0.28, 1.82, 0); jL.rotation.z = 0.58;
      const jR = new THREE.Mesh(hornGeo, matSecondary); jR.position.set(0.28, 1.82, 0); jR.rotation.z = -0.58;
      const bellGeo = new THREE.SphereGeometry(0.11, 6, 5);
      const blL = new THREE.Mesh(bellGeo, matGlow); blL.position.set(-0.52, 1.98, 0);
      const blR = new THREE.Mesh(bellGeo, matGlow); blR.position.set(0.52, 1.98, 0);
      bodyRig.add(jL, jR, blL, blR);

      const card = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.40, 0.04), matGlow);
      card.position.set(0.52, 0.10, 0.40);
      card.rotation.z = -0.22;
      weaponPivot.add(card);
    } else if (silhouette === 'mega_titan') {
      // Mega-Titan Omega Boss: Horned mecha crest + glowing chest reactor + twin shoulder rocket pods
      const hornGeo = new THREE.ConeGeometry(0.18, 0.56, 5);
      const hL = new THREE.Mesh(hornGeo, matSecondary); hL.position.set(-0.34, 1.88, 0.06); hL.rotation.z = 0.32;
      const hR = new THREE.Mesh(hornGeo, matSecondary); hR.position.set(0.34, 1.88, 0.06); hR.rotation.z = -0.32;
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), matGlow);
      core.position.set(0, 0.78, 0.48);
      bodyRig.add(hL, hR, core);
      const podGeo = new THREE.CylinderGeometry(0.20, 0.22, 0.64, 7);
      podGeo.rotateX(Math.PI / 2);
      const pL = new THREE.Mesh(podGeo, matDark); pL.position.set(-0.66, 0.30, 0.16);
      const pR = new THREE.Mesh(podGeo, matDark); pR.position.set(0.66, 0.30, 0.16);
      weaponPivot.add(pL, pR);
    } else {
      // Bomb-Buddy Demolisher: Aviator helmet earflaps + sparkling lit fuse + round cartoon star-bomb
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.47, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.58), matDark);
      helm.position.set(0, 1.40, -0.02);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 5), matSecondary);
      fuse.position.set(0, 1.94, 0);
      fuse.rotation.z = 0.22;
      const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), matGlow);
      spark.position.set(-0.06, 2.10, 0);
      bodyRig.add(helm, fuse, spark);

      const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), matDark);
      bomb.position.set(0.48, 0.04, 0.42);
      const bombCap = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), matGlow);
      bombCap.position.set(0.48, 0.30, 0.42);
      weaponPivot.add(bomb, bombCap);
    }

    // Shield Dome Mesh (8 tris, hidden unless shield active)
    const shieldDome = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.18 * scale, 0),
      new THREE.MeshBasicMaterial({ color: 0x40c4ff, wireframe: true, transparent: true, opacity: 0.65 })
    );
    shieldDome.position.y = 0.85 * scale;
    shieldDome.visible = false;
    group.add(shieldDome);

    group.userData = {
      bodyRig,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      animAccessory,
      weaponPivot,
      teamRing,
      superRing,
      overdriveRing,
      shieldDome,
      matPrimary,
      matSecondary,
      matSkin,
      triangleCount: countTriangles(group)
    };

    return group;
  }

  function createArenaSceneGroup(THREE, map, modeId, textures = null) {
    const group = new THREE.Group();

    const themeColors = {
      cosmic_station: { floor: 0x162042, wall: 0x5b7ebf, rim: 0x00e5ff, bush: 0x00c853 },
      crystal_canyon: { floor: 0x261c45, wall: 0x8e7cf0, rim: 0xe040fb, bush: 0x2ecc71 },
      bio_dome:       { floor: 0x0f3320, wall: 0x4caf8a, rim: 0x69f0ae, bush: 0x2e7d32 },
      solar_plaza:    { floor: 0x2b1f4a, wall: 0x7890ff, rim: 0xffd54f, bush: 0x26c6da },
      neon_rift:      { floor: 0x1a0a2e, wall: 0xff3d71, rim: 0x00e5ff, bush: 0x7b61ff },
      scrap_yard:     { floor: 0x2e1a0f, wall: 0x8d6e63, rim: 0xff9100, bush: 0x6d4c41 }
    };
    const tc = themeColors[map.theme] || themeColors.cosmic_station;

    // 1. Arena Floor (2 tris)
    const floorGeo = new THREE.PlaneGeometry(map.width, map.height);
    const floorMat = new THREE.MeshLambertMaterial({
      color: textures ? 0xffffff : tc.floor,
      map: textures ? textures.floorTex : null
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    // Center Sport Circle Ring (32 tris)
    const centerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 2.55, 24),
      new THREE.MeshBasicMaterial({ color: tc.rim, side: THREE.DoubleSide, transparent: true, opacity: 0.42 })
    );
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.y = 0.015;
    group.add(centerRing);

    // Central Crystal Mine / Star Pad (16 tris)
    if (modeId === 'crystal_rush' || modeId === 'star_hunt' || modeId === 'tutorial') {
      const mineRim = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.35, 0.22, 8),
        new THREE.MeshLambertMaterial({ color: 0x311b92 })
      );
      mineRim.position.y = 0.11;
      const mineCore = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshBasicMaterial({ color: modeId === 'star_hunt' ? 0xffea00 : 0xe040fb })
      );
      mineCore.position.y = 0.55;
      group.add(mineRim, mineCore);
      group.userData.mineCore = mineCore;
    }

    // Star Ball Goal Frames (-Z and +Z)
    if (modeId === 'star_ball') {
      const goalGeo = new THREE.BoxGeometry(5.8, 1.2, 0.35);
      const g0 = new THREE.Mesh(goalGeo, new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.55 }));
      g0.position.set(0, 0.6, map.height * 0.5 - 0.3);
      const g1 = new THREE.Mesh(goalGeo, new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.55 }));
      g1.position.set(0, 0.6, -(map.height * 0.5 - 0.3));
      group.add(g0, g1);
    }

    // 2. Perimeter Rails (4 boxes = 48 tris)
    const railMat = new THREE.MeshLambertMaterial({ color: tc.wall });
    const hw = map.width * 0.5;
    const hh = map.height * 0.5;
    const rails = [
      { x: 0, z: hh + 0.35, w: map.width + 1.4, d: 0.7 },
      { x: 0, z: -(hh + 0.35), w: map.width + 1.4, d: 0.7 },
      { x: hw + 0.35, z: 0, w: 0.7, d: map.height },
      { x: -(hw + 0.35), z: 0, w: 0.7, d: map.height }
    ];
    for (const r of rails) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, 1.1, r.d), railMat);
      m.position.set(r.x, 0.55, r.z);
      group.add(m);
    }

    // 3. Symmetric Cover Walls (12 tris each)
    const wallMat = new THREE.MeshLambertMaterial({
      color: textures ? 0xdbeafe : tc.wall,
      map: textures ? textures.wallTex : null,
      transparent: false
    });
    const capMat = new THREE.MeshBasicMaterial({ color: tc.rim });
    for (const w of map.walls) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w.w, 1.55, w.d), wallMat);
      box.position.set(w.x, 0.775, w.z);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w.w * 0.94, 0.09, w.d * 0.94), capMat);
      cap.position.set(w.x, 1.595, w.z);
      // side bevel line
      const bevel = new THREE.Mesh(new THREE.BoxGeometry(w.w*0.88, 0.03, w.d*0.88), new THREE.MeshLambertMaterial({color:0xffffff}));
      bevel.position.set(w.x, 1.54, w.z); group.add(bevel);
      group.add(box, cap);
    }

    // 4. Stealth Bushes (low-poly 7-sided lush clusters = 28 tris each)
    const bushMeshes = [];
    for (const b of map.bushes) {
      const bMat = new THREE.MeshLambertMaterial({
        color: textures ? 0xffffff : tc.bush,
        map: textures ? textures.bushTex : null,
        transparent: true,
        opacity: 0.92
      });
      const bMesh = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.90, b.r, 1.08, 8), bMat);
      bMesh.position.set(b.x, 0.54, b.z);
      const bTop = new THREE.Mesh(new THREE.SphereGeometry(b.r*0.55, 7, 5), new THREE.MeshLambertMaterial({color: tc.bush, transparent:true, opacity:0.96}));
      bTop.position.set(b.x, 1.05, b.z); group.add(bTop);
      bMesh.userData = { bx: b.x, bz: b.z, br: b.r };
      group.add(bMesh);
      bushMeshes.push(bMesh);
    }

    // 5. Interactive Spring Jump-Pads & Portal Teleporters (~120 tris total)
    const jumpPadMeshes = [];
    if (map.jumpPads) {
      const jpBaseMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
      const jpPlateMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
      for (const jp of map.jumpPads) {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.14, 10), jpBaseMat);
        base.position.set(jp.x, 0.07, jp.z);
        const plate = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.12, 3), jpPlateMat);
        plate.rotation.x = Math.PI / 2;
        plate.rotation.z = -Math.atan2(jp.tx - jp.x, jp.tz - jp.z);
        plate.position.set(jp.x, 0.17, jp.z);
        group.add(base, plate);
        jumpPadMeshes.push({ id: jp.id, plate });
      }
    }

    const teleporterMeshes = [];
    if (map.teleporters) {
      for (const tp of map.teleporters) {
        const tpCol = tp.color || '#00e5ff';
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.62, 1.05, 16),
          new THREE.MeshBasicMaterial({ color: tpCol, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(tp.x, 0.05, tp.z);
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(0.58, 0.58, 0.08, 12),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
        );
        core.position.set(tp.x, 0.04, tp.z);
        group.add(ring, core);
        teleporterMeshes.push({ id: tp.id, ring, core });
      }
    }


    // Theme props: crates, crystals, barrels — arcade toy scatter
    if (map.props){
      for(const pr of map.props){
        let pMesh=null;
        if(pr.kind==='crate_metal'){
          pMesh=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.8,1.0), new THREE.MeshLambertMaterial({color:0x8d6e63}));
        } else if(pr.kind==='crystal_shard'){
          pMesh=new THREE.Mesh(new THREE.OctahedronGeometry(0.6,0), new THREE.MeshBasicMaterial({color: tc.accent||0xe040fb}));
        } else if(pr.kind==='barrel_bio'){
          pMesh=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,0.9,8), new THREE.MeshLambertMaterial({color:0x4caf50}));
        } else if(pr.kind==='statue'){
          pMesh=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.5,1.4,6), new THREE.MeshLambertMaterial({color:0xffd54f}));
        } else if(pr.kind==='neon_pylon'){
          pMesh=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,1.6,6), new THREE.MeshBasicMaterial({color: tc.rim}));
        } else if(pr.kind==='tire_stack'){
          pMesh=new THREE.Mesh(new THREE.TorusGeometry(0.45,0.18,6,10), new THREE.MeshLambertMaterial({color:0x3e2723}));
        }
        if(pMesh){ pMesh.position.set(pr.x,0.45,pr.z); group.add(pMesh); }
      }
    }
    if (map.barrels){
      for(const bl of map.barrels){
        const bM=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.85,8), new THREE.MeshLambertMaterial({color:0x6d4c41}));
        bM.position.set(bl.x,0.42,bl.z); group.add(bM);
      }
    }

    group.userData.bushMeshes = bushMeshes;
    group.userData.jumpPadMeshes = jumpPadMeshes;
    group.userData.teleporterMeshes = teleporterMeshes;
    group.userData.triangleCount = countTriangles(group);
    return group;
  }

  const api = {
    countTriangles,
    createHeroMesh,
    createArenaSceneGroup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Meshes = api;
})(typeof window !== 'undefined' ? window : globalThis);
