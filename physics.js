/**
 * 2D XZ-plane Arena Physics & Stealth Visibility Helpers (20Hz fixed tick)
 */
(function (root) {
  'use strict';

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function dist2(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    return dx * dx + dz * dz;
  }

  function dist(ax, az, bx, bz) {
    return Math.sqrt(dist2(ax, az, bx, bz));
  }

  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Push circle (x, z, r) out of AABB wall { x, z, w, d }
  function resolveCircleWall(pos, radius, wall) {
    const halfW = wall.w * 0.5;
    const halfD = wall.d * 0.5;
    const closestX = clamp(pos.x, wall.x - halfW, wall.x + halfW);
    const closestZ = clamp(pos.z, wall.z - halfD, wall.z + halfD);
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) return null;

    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const overlap = radius - d;
      const nx = dx / d;
      const nz = dz / d;
      pos.x += nx * overlap;
      pos.z += nz * overlap;
      return { nx, nz };
    } else {
      // Circle center inside AABB: push along shallowest axis
      const penLeft = Math.abs(pos.x - (wall.x - halfW));
      const penRight = Math.abs((wall.x + halfW) - pos.x);
      const penTop = Math.abs(pos.z - (wall.z - halfD));
      const penBottom = Math.abs((wall.z + halfD) - pos.z);
      const minPen = Math.min(penLeft, penRight, penTop, penBottom);
      if (minPen === penLeft) {
        pos.x = wall.x - halfW - radius;
        return { nx: -1, nz: 0 };
      } else if (minPen === penRight) {
        pos.x = wall.x + halfW + radius;
        return { nx: 1, nz: 0 };
      } else if (minPen === penTop) {
        pos.z = wall.z - halfD - radius;
        return { nx: 0, nz: -1 };
      } else {
        pos.z = wall.z + halfD + radius;
        return { nx: 0, nz: 1 };
      }
    }
  }

  function resolveUnitArenaCollisions(pos, radius, map, dynamicBarriers) {
    const halfW = map.width * 0.5 - radius;
    const halfH = map.height * 0.5 - radius;
    pos.x = clamp(pos.x, -halfW, halfW);
    pos.z = clamp(pos.z, -halfH, halfH);

    for (let i = 0; i < map.walls.length; i++) {
      resolveCircleWall(pos, radius, map.walls[i]);
    }
    if (dynamicBarriers && dynamicBarriers.length) {
      for (let i = 0; i < dynamicBarriers.length; i++) {
        resolveCircleWall(pos, radius, dynamicBarriers[i]);
      }
    }
    pos.x = clamp(pos.x, -halfW, halfW);
    pos.z = clamp(pos.z, -halfH, halfH);
  }

  function pointHitsWall(x, z, r, walls, dynamicBarriers) {
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const hw = w.w * 0.5 + r;
      const hd = w.d * 0.5 + r;
      if (Math.abs(x - w.x) <= hw && Math.abs(z - w.z) <= hd) {
        return w;
      }
    }
    if (dynamicBarriers) {
      for (let i = 0; i < dynamicBarriers.length; i++) {
        const w = dynamicBarriers[i];
        const hw = w.w * 0.5 + r;
        const hd = w.d * 0.5 + r;
        if (Math.abs(x - w.x) <= hw && Math.abs(z - w.z) <= hd) {
          return w;
        }
      }
    }
    return null;
  }

  // Fast segment line-of-sight check (samples every ~0.6u)
  function hasLineOfSight(ax, az, bx, bz, walls, dynamicBarriers) {
    const total = dist(ax, az, bx, bz);
    if (total < 0.4) return true;
    const steps = Math.min(28, Math.max(3, Math.ceil(total / 0.65)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      if (pointHitsWall(px, pz, 0.1, walls, dynamicBarriers)) {
        return false;
      }
    }
    return true;
  }

  function isInsideBush(x, z, bushes) {
    if (!bushes) return false;
    for (let i = 0; i < bushes.length; i++) {
      const b = bushes[i];
      if (b.destroyed) continue;
      if (dist2(x, z, b.x, b.z) <= b.r * b.r) {
        return true;
      }
    }
    return false;
  }

  // Unit target is visible to observer if same team, not in bush/stealth, revealed by combat, or within 2.8u proximity
  function canSeeUnit(observer, target, state) {
    if (!target.alive) return false;
    if (observer.team === target.team && state.modeId !== 'last_hero') return true;
    if (target.revealedTimer > 0) return true;
    if (!target.inBush && target.stealthTimer <= 0) return true;
    return dist2(observer.x, observer.z, target.x, target.z) <= 2.85 * 2.85;
  }

  const api = {
    clamp,
    dist2,
    dist,
    angleDiff,
    resolveCircleWall,
    resolveUnitArenaCollisions,
    pointHitsWall,
    hasLineOfSight,
    isInsideBush,
    canSeeUnit
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Physics = api;
})(typeof window !== 'undefined' ? window : globalThis);
