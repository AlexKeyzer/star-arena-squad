/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Lazy 1024×1024 Arena Texture Atlas + Prepared 2.5D Sprite Set
 * Built strictly AFTER preloader per Section 7 technical budget.
 */
(function (root) {
  'use strict';

  let cachedBundle = null;

  function drawStarShape(ctx, cx, cy, spikes, outerR, innerR, fillStyle, strokeStyle) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
    }
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  function buildSubCanvas(w, h, drawFn) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    drawFn(ctx, w, h);
    return c;
  }

  function buildArenaAtlas1024(THREE) {
    if (cachedBundle) return cachedBundle;

    // Master 1024x1024 Atlas Canvas
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = 1024;
    atlasCanvas.height = 1024;
    const actx = atlasCanvas.getContext('2d');

    // 1. Floor Tile Quadrant (0, 0, 512, 512)
    const floorCanvas = buildSubCanvas(512, 512, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#1c2547');
      grad.addColorStop(1, '#151c38');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle arena sport tile bevels
      ctx.strokeStyle = 'rgba(110, 168, 255, 0.16)';
      ctx.lineWidth = 3;
      const step = 64;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Corner star rivets
      ctx.fillStyle = 'rgba(140, 200, 255, 0.18)';
      for (let x = step; x < w; x += step * 2) {
        for (let y = step; y < h; y += step * 2) {
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    actx.drawImage(floorCanvas, 0, 0);

    // 2. Beveled Wall Panel (512, 0, 256, 256)
    const wallCanvas = buildSubCanvas(256, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#546E9A');
      g.addColorStop(0.5, '#394D73');
      g.addColorStop(1, '#23314D');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#8AB4F8';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.fillRect(28, h * 0.45, w - 56, 18);
    });
    actx.drawImage(wallCanvas, 512, 0);

    // 3. Stealth Bush Texture (768, 0, 256, 256)
    const bushCanvas = buildSubCanvas(256, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 16, w * 0.5, h * 0.5, w * 0.5);
      g.addColorStop(0, '#69F0AE');
      g.addColorStop(0.65, '#00C853');
      g.addColorStop(1, '#085E2B');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 14; i++) {
        const x = ((i * 53) % 200) + 28;
        const y = ((i * 79) % 200) + 28;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    actx.drawImage(bushCanvas, 768, 0);

    // 4. Blob Shadow (512, 256, 256, 256)
    const shadowCanvas = buildSubCanvas(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const rg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.46);
      rg.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
      rg.addColorStop(0.65, 'rgba(0, 0, 0, 0.25)');
      rg.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    });
    actx.drawImage(shadowCanvas, 512, 256);

    // 5. Cartoon Star Particle (768, 256, 256, 256)
    const starCanvas = buildSubCanvas(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      drawStarShape(ctx, w / 2, h / 2, 5, 104, 48, '#FFEA00', '#FF9100');
    });
    actx.drawImage(starCanvas, 768, 256);

    // 6. Prepared 2.5D Fallback Sprites Strip (0, 512, 1024, 512)
    // Pre-bakes 12 distinct archetype top-down isometric character tokens (64x64 each) + props
    const silhouettes = [
      'visor_dual', 'broad_cannon', 'hulking_paladin', 'hawk_sniper',
      'seraph_halo', 'alchemist_pack', 'cyber_fox', 'prism_mage',
      'dome_inventor', 'martial_champ', 'cosmic_jester', 'bomb_grenadier'
    ];
    const spriteMap = {};
    silhouettes.forEach((sil, idx) => {
      const sx = (idx % 8) * 128;
      const sy = 512 + Math.floor(idx / 8) * 128;
      actx.save();
      actx.translate(sx + 64, sy + 64);
      // Base hero badge silhouette (tinted dynamically in 2.5D renderer)
      actx.fillStyle = '#FFFFFF';
      actx.strokeStyle = '#101828';
      actx.lineWidth = 6;
      actx.beginPath();
      actx.arc(0, 4, 34, 0, Math.PI * 2);
      actx.fill();
      actx.stroke();
      // Archetype distinctive crest/weapon silhouette marker
      actx.fillStyle = '#FFD54F';
      if (sil === 'hawk_sniper') {
        actx.fillRect(-6, -54, 12, 42);
      } else if (sil === 'broad_cannon') {
        actx.beginPath();
        actx.moveTo(-16, -22); actx.lineTo(16, -22); actx.lineTo(24, -48); actx.lineTo(-24, -48);
        actx.closePath(); actx.fill();
      } else if (sil === 'hulking_paladin') {
        actx.fillRect(-44, -18, 16, 32);
        actx.fillRect(28, -18, 16, 32);
      } else if (sil === 'seraph_halo') {
        actx.strokeStyle = '#FFF59D';
        actx.lineWidth = 5;
        actx.beginPath(); actx.arc(0, 4, 44, 0, Math.PI * 2); actx.stroke();
      } else if (sil === 'cyber_fox') {
        actx.beginPath();
        actx.moveTo(-26, -12); actx.lineTo(-14, -44); actx.lineTo(-4, -22);
        actx.moveTo(26, -12); actx.lineTo(14, -44); actx.lineTo(4, -22);
        actx.fill();
      } else {
        drawStarShape(actx, 0, -2, 5, 18, 8, '#FFD54F', null);
      }
      // Visor eyes
      actx.fillStyle = '#1E293B';
      actx.fillRect(-16, -14, 32, 10);
      actx.restore();
      spriteMap[sil] = { sx, sy, sw: 128, sh: 128 };
    });

    let textures = null;
    if (THREE) {
      const floorTex = new THREE.CanvasTexture(floorCanvas);
      floorTex.wrapS = THREE.RepeatWrapping;
      floorTex.wrapT = THREE.RepeatWrapping;
      floorTex.repeat.set(4, 5);

      const wallTex = new THREE.CanvasTexture(wallCanvas);
      const bushTex = new THREE.CanvasTexture(bushCanvas);
      const shadowTex = new THREE.CanvasTexture(shadowCanvas);
      const starTex = new THREE.CanvasTexture(starCanvas);
      const masterAtlasTex = new THREE.CanvasTexture(atlasCanvas);

      textures = {
        masterAtlasTex,
        floorTex,
        wallTex,
        bushTex,
        shadowTex,
        starTex
      };
    }

    cachedBundle = {
      atlasCanvas,
      floorCanvas,
      wallCanvas,
      bushCanvas,
      shadowCanvas,
      starCanvas,
      spriteMap,
      textures
    };
    return cachedBundle;
  }

  const api = { buildArenaAtlas1024, drawStarShape };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Atlas = api;
})(typeof window !== 'undefined' ? window : globalThis);
