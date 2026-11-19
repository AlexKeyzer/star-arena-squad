/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Prepared 2.5D Sprite Fallback Renderer (Canvas 2D)
 * Activated automatically when FPS < 40 or when user launches 2.5D Lite Mode!
 */
(function (root) {
  'use strict';

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function createRenderer2D({ canvas, overlayEl }) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let atlasBundle = null;
    const stars = []; // Cartoon hit star particles (<= 80 in 2D mode)

    function ensureAtlas() {
      if (!atlasBundle && root.SA && root.SA.Atlas) {
        atlasBundle = root.SA.Atlas.buildArenaAtlas1024(null);
      }
    }

    function resize(w, h) {
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      if (overlayEl) overlayEl.innerHTML = '';
    }

    function renderMatch(state, alpha, realDt, audio, aimPreview) {
      ensureAtlas();
      const w = canvas.width || canvas.clientWidth || 800;
      const h = canvas.height || canvas.clientHeight || 600;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // Consume match FX events (battle juice enriched)
      for (const ev of state.events) {
        if (ev.type === 'pop_hit' || ev.type === 'knockout') {
          const cnt = ev.isCrit ? 7 : (ev.type==='knockout'?6:4);
          for (let i = 0; i < cnt && stars.length < 80; i++) {
            const ang = Math.random() * Math.PI * 2;
            stars.push({
              x: ev.x,
              z: ev.z,
              vx: Math.cos(ang) * (ev.isCrit?4.2:3.2),
              vz: Math.sin(ang) * (ev.isCrit?4.2:3.2),
              life: ev.isCrit?0.60:0.45,
              crit: Boolean(ev.isCrit)
            });
          }
          if (audio) {
            if (ev.type === 'knockout') audio.playKnockout();
            else audio.playPopHit();
          }
        } else if (ev.type === 'near_miss' || ev.type === 'mastery_gain' || ev.type === 'power_star_spawn' || ev.type === 'golden_spawn' || ev.type === 'golden_pickup' || ev.type === 'combo' || ev.type === 'rampage' || ev.type === 'first_blood' || ev.type === 'revenge_payback' || ev.type === 'frenzy_start') {
          for (let i = 0; i < 8 && stars.length < 80; i++) {
            const ang = Math.random() * Math.PI * 2;
            stars.push({ x: ev.x, z: ev.z, vx: Math.cos(ang)*3.8, vz: Math.sin(ang)*3.8, life: 0.55 });
          }
          if (audio) audio.playPickup();
        } else if (ev.type === 'shoot' && ev.unitId === 'u_player' && audio) {
          audio.playShoot(ev.archetypeId);
        } else if (ev.type === 'super_cast' && audio) {
          audio.playSuperCast();
        } else if (ev.type === 'overdrive_cast' && audio && audio.playOverdrive) {
          audio.playOverdrive();
        } else if (ev.type === 'jump_pad' && audio && audio.playJumpPad) {
          audio.playJumpPad();
        } else if (ev.type === 'teleport' && audio && audio.playTeleport) {
          audio.playTeleport();
        } else if (ev.type === 'barrel_explode' && audio && audio.playExplosion) {
          audio.playExplosion();
        } else if ((ev.type === 'crystal_grab' || ev.type === 'goal_scored' || ev.type === 'gadget_cast' || ev.type === 'energy_grab' || ev.type === 'comeback_spawn') && audio) {
          audio.playPickup();
        }
      }
      state.events.length = 0;

      const player = state.units.find(u => u.isPlayer) || state.units[0];
      const camX = player ? lerp(player.prevX, player.x, alpha) * 0.6 : 0;
      const camZ = player ? lerp(player.prevZ, player.z, alpha) * 0.6 : 0;
      const scale = Math.min(w, h) / 22;

      const toScreen = (wx, wz) => ({
        sx: w * 0.5 + (wx - camX) * scale,
        sy: h * 0.5 + (wz - camZ) * scale * 0.86 // 2.5D foreshortened angle!
      });

      // Background
      ctx.fillStyle = '#0b1024';
      ctx.fillRect(0, 0, w, h);

      // Floor bounds
      const tl = toScreen(-state.map.width * 0.5, -state.map.height * 0.5);
      const br = toScreen(state.map.width * 0.5, state.map.height * 0.5);
      ctx.fillStyle = '#192344';
      ctx.fillRect(tl.sx, tl.sy, br.sx - tl.sx, br.sy - tl.sy);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 3;
      ctx.strokeRect(tl.sx, tl.sy, br.sx - tl.sx, br.sy - tl.sy);

      // Center ring
      const c0 = toScreen(0, 0);
      ctx.strokeStyle = 'rgba(0,229,255,0.32)';
      ctx.beginPath();
      ctx.ellipse(c0.sx, c0.sy, scale * 2.4, scale * 2.4 * 0.86, 0, 0, Math.PI * 2);
      ctx.stroke();

      // FFA Storm ring
      if (state.modeId === 'last_hero' && state.stormRadius) {
        ctx.strokeStyle = 'rgba(224,64,251,0.75)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(c0.sx, c0.sy, state.stormRadius * scale, state.stormRadius * scale * 0.86, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Hot Zone capture ring
      if (state.modeId === 'hot_zone') {
        const p0 = state.teamZonePct ? state.teamZonePct[0] : 0;
        const p1 = state.teamZonePct ? state.teamZonePct[1] : 0;
        ctx.strokeStyle = p0 >= p1 ? '#00E5FF' : '#FF4081';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(c0.sx, c0.sy, 3.8 * scale, 3.8 * scale * 0.86, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Manual aim telegraph in 2.5D
      if (player && player.alive && aimPreview && aimPreview.active) {
        const px = lerp(player.prevX, player.x, alpha);
        const pz = lerp(player.prevZ, player.z, alpha);
        const rLen = aimPreview.isSuper ? Math.max(7.5, player.weaponRange * 1.1) : player.weaponRange;
        const pStart = toScreen(px, pz);
        const pEnd = toScreen(px + Math.sin(aimPreview.angle) * rLen, pz + Math.cos(aimPreview.angle) * rLen);
        ctx.strokeStyle = aimPreview.isSuper ? 'rgba(255,213,79,0.75)' : 'rgba(0,229,255,0.72)';
        ctx.lineWidth = scale * 0.6;
        ctx.beginPath();
        ctx.moveTo(pStart.sx, pStart.sy);
        ctx.lineTo(pEnd.sx, pEnd.sy);
        ctx.stroke();
      }

      // Zones, Jump-Pads, Teleporters & Meteor Danger Rings
      if (state.jumpPads) {
        for (const jp of state.jumpPads) {
          const jpp = toScreen(jp.x, jp.z);
          ctx.fillStyle = '#FFEA00';
          ctx.beginPath();
          ctx.ellipse(jpp.sx, jpp.sy, scale * 0.85, scale * 0.85 * 0.86, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (state.teleporters) {
        for (const tp of state.teleporters) {
          const tpp = toScreen(tp.x, tp.z);
          ctx.strokeStyle = tp.color || '#00E5FF';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(tpp.sx, tpp.sy, scale * 0.9, scale * 0.9 * 0.86, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (state.meteors) {
        for (const mt of state.meteors) {
          const mp = toScreen(mt.x, mt.z);
          ctx.strokeStyle = '#FF1744';
          ctx.fillStyle = 'rgba(255,23,68,0.22)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(mp.sx, mp.sy, mt.radius * scale, mt.radius * scale * 0.86, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      for (const z of state.zones) {
        const zp = toScreen(z.x, z.z);
        ctx.fillStyle = z.kind === 'heal' ? 'rgba(0,230,118,0.25)' : 'rgba(170,0,255,0.28)';
        ctx.beginPath();
        ctx.ellipse(zp.sx, zp.sy, z.radius * scale, z.radius * scale * 0.86, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2.5D Walls with extruded top face
      const allWalls = state.barriers.length ? state.map.walls.concat(state.barriers) : state.map.walls;
      for (const wall of allWalls) {
        const wp = toScreen(wall.x - wall.w * 0.5, wall.z - wall.d * 0.5);
        const ww = wall.w * scale;
        const wd = wall.d * scale * 0.86;
        const lift = scale * 0.48;
        ctx.fillStyle = '#263554';
        ctx.fillRect(wp.sx, wp.sy - lift, ww, wd + lift);
        ctx.fillStyle = wall.timer ? '#40C4FF' : '#4E6B9E';
        ctx.fillRect(wp.sx, wp.sy - lift, ww, wd);
        ctx.strokeStyle = '#8AB4F8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(wp.sx, wp.sy - lift, ww, wd);
      }

      // Pickups & Crates & Vaults
      for (const it of state.groundItems) {
        const ip = toScreen(it.x, it.z);
        if (it.kind === 'crystal') ctx.fillStyle = '#E040FB';
        else if (it.kind === 'power_star') ctx.fillStyle = '#00E676';
        else if (it.kind === 'golden_box') ctx.fillStyle = '#FFD54F';
        else if (it.kind === 'bounty_star') ctx.fillStyle = '#FFEA00';
        else ctx.fillStyle = '#00E5FF';
        ctx.beginPath();
        ctx.arc(ip.sx, ip.sy, scale * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      if (state.vaults) {
        for (const v of state.vaults) {
          if (v.hp <= 0) continue;
          const vp = toScreen(v.x, v.z);
          ctx.fillStyle = v.team === 0 ? '#29B6F6' : '#FF5252';
          ctx.fillRect(vp.sx - scale, vp.sy - scale, scale * 2, scale * 1.7);
        }
      }
      if (state.barrels) {
        for (const br of state.barrels) {
          if (br.hp <= 0) continue;
          const bp = toScreen(br.x, br.z);
          ctx.fillStyle = '#FF6D00';
          ctx.beginPath();
          ctx.arc(bp.sx, bp.sy - scale * 0.15, scale * 0.62, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Units (drawn using prepared 2.5D sprite atlas + team tint!)
      for (const u of state.units) {
        if (!u.alive) continue;
        if (player && !root.SA.Physics.canSeeUnit(player, u, state)) continue;
        const ux = lerp(u.prevX, u.x, alpha);
        const uz = lerp(u.prevZ, u.z, alpha);
        const up = toScreen(ux, uz);
        const r = u.radius * scale * 1.15;

        // Blob shadow
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.ellipse(up.sx, up.sy + r * 0.35, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Team ring + Overdrive ring
        if (u.overdriveTimer > 0 || (u.overdriveCharge || 0) >= 100) {
          ctx.strokeStyle = '#E040FB';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(up.sx, up.sy + r * 0.25, r * 1.2, r * 0.78, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = u.isPlayer ? '#00E676' : (u.team === 0 && state.modeId !== 'last_hero' ? '#29B6F6' : '#FF5252');
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(up.sx, up.sy + r * 0.25, r, r * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Prepared Sprite from 1024 Atlas
        const sp = atlasBundle && atlasBundle.spriteMap[u.silhouette];
        if (sp) {
          ctx.save();
          ctx.translate(up.sx, up.sy - r * 0.2);
          ctx.rotate(-u.rot + Math.PI);
          ctx.drawImage(atlasBundle.atlasCanvas, sp.sx, sp.sy, sp.sw, sp.sh, -r, -r, r * 2, r * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = u.palette.primary;
          ctx.beginPath();
          ctx.arc(up.sx, up.sy - r * 0.2, r * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // HP bar & Name
        const bw = scale * 1.8;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(up.sx - bw * 0.5, up.sy - r * 1.55, bw, 6);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillRect(up.sx - bw * 0.5, up.sy - r * 1.55, bw * Math.max(0, u.hp / u.maxHp), 6);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(u.name, up.sx, up.sy - r * 1.72);
      }

      // Bushes (drawn over floor, translucent near player, hidden when destroyed)
      const bushList = state.bushes || state.map.bushes || [];
      for (const b of bushList) {
        if (b.destroyed) continue;
        const bp = toScreen(b.x, b.z);
        const near = player && Math.hypot(player.x - b.x, player.z - b.z) < b.r + 1.1;
        ctx.fillStyle = near ? 'rgba(0,200,83,0.42)' : 'rgba(0,200,83,0.88)';
        ctx.beginPath();
        ctx.ellipse(bp.sx, bp.sy, b.r * scale, b.r * scale * 0.86, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Projectiles with trails
      for (const p of state.projectiles) {
        const prev = toScreen(p.prevX, p.prevZ);
        const pp = toScreen(lerp(p.prevX, p.x, alpha), lerp(p.prevZ, p.z, alpha));
        // trail line
        ctx.strokeStyle = p.color || '#FFEA00';
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = scale * 0.22;
        ctx.beginPath();
        ctx.moveTo(prev.sx, prev.sy - scale*0.25);
        ctx.lineTo(pp.sx, pp.sy - scale*0.25);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.color || '#FFEA00';
        ctx.beginPath();
        ctx.arc(pp.sx, pp.sy - scale * 0.25, scale * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cartoon Hit Stars
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i];
        s.life -= realDt;
        if (s.life <= 0) { stars.splice(i, 1); continue; }
        s.x += s.vx * realDt;
        s.z += s.vz * realDt;
        const sp = toScreen(s.x, s.z);
        const ccol = s.crit ? '#FFE033' : '#FFEA00';
        root.SA.Atlas.drawStarShape(ctx, sp.sx, sp.sy - scale * 0.4, 5, s.crit?10:8, 4, ccol, null);
      }
    }

    return {
      resize,
      renderMatch,
      clearDynamicMeshes: () => { if (overlayEl) overlayEl.innerHTML = ''; },
      setQualitySetting: () => {},
      getQualityTier: () => '2d'
    };
  }

  const api = { createRenderer2D };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Renderer2D = api;
})(typeof window !== 'undefined' ? window : globalThis);
