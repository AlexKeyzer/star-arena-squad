/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * 6-Bracket Smart & Human-Like Bot AI
 * - Brackets: 0-99, 100-299, 300-499, 500-799, 800-1199, 1200+
 * - Allied bots = bracket - 1 step
 * - Rubberbanding: -1 step after 3 losses at 300+, +0 after 3 wins
 * - Human traits: miss streaks, micro-pauses, 3 personalities (aggressor / cautious / greedy)
 */
(function (root) {
  'use strict';

  const Physics = (typeof module !== 'undefined' && module.exports)
    ? require('./physics')
    : root.SA.Physics;

  const PERSONALITIES = ['aggressor', 'cautious', 'greedy'];

  function getBaseBracketIndex(totalTrophies, brackets) {
    for (let i = brackets.length - 1; i >= 0; i--) {
      if (totalTrophies >= brackets[i].minTrophies) return i;
    }
    return 0;
  }

  /**
   * Computes effective Enemy & Ally AI bracket indices applying:
   *  1. Base trophy bracket (0..5)
   *  2. Rubberbanding (-1 after 3 losses at 300+, +0 after wins)
   *  3. Hardcore modifier (+1 enemy AI step)
   *  4. Allied bot rule (enemy step - 1)
   */
  function resolveMatchBracketIndices({
    totalTrophies = 0,
    consecutiveLosses = 0,
    hardcoreEnabled = false,
    balance
  }) {
    const brackets = balance.botBrackets;
    const maxIdx = brackets.length - 1;
    const baseIdx = getBaseBracketIndex(totalTrophies, brackets);

    let rubberDelta = 0;
    if (
      totalTrophies >= balance.rubberbanding.minTrophies &&
      consecutiveLosses >= balance.rubberbanding.lossStreakTrigger
    ) {
      rubberDelta = balance.rubberbanding.aiStepDeltaOnLossStreak; // -1
    }

    const hardcoreDelta = hardcoreEnabled ? balance.hardcoreModifier.enemyAiStepDelta : 0;
    const enemyIdx = Physics.clamp(baseIdx + rubberDelta + hardcoreDelta, 0, maxIdx);
    const allyIdx = Physics.clamp(enemyIdx + balance.alliedBotStepDelta, 0, maxIdx);

    return {
      baseIdx,
      enemyIdx,
      allyIdx,
      rubberbandingActive: rubberDelta < 0
    };
  }

  function createBotMemory(slotIndex, personalityOverride, rng) {
    const personality = personalityOverride || PERSONALITIES[slotIndex % PERSONALITIES.length];
    return {
      personality,
      decisionTimer: rng.range(0.05, 0.35),
      pauseTimer: 0,
      wanderAngle: rng.range(-Math.PI, Math.PI),
      targetId: null,
      desiredMoveX: 0,
      desiredMoveZ: 0,
      missStreakLeft: 0,
      missStreakSign: 1,
      bushCheckCooldown: rng.range(1.5, 3.5),
      laneOffset: (slotIndex % 3 - 1) * 3.4
    };
  }

  function applyHumanAimOffset(baseAngle, aimErrorDeg, mem, rng) {
    const errRad = (aimErrorDeg * Math.PI) / 180;
    if (errRad <= 0.001) return baseAngle;

    // Human-like correlated miss streak: 22% chance to begin a 2-3 shot drift streak
    if (mem.missStreakLeft > 0) {
      mem.missStreakLeft -= 1;
      const mag = errRad * rng.range(0.65, 1.15);
      return baseAngle + mem.missStreakSign * mag;
    }
    if (rng.next() < 0.22) {
      mem.missStreakLeft = rng.int(1, 2);
      mem.missStreakSign = rng.next() < 0.5 ? -1 : 1;
      return baseAngle + mem.missStreakSign * errRad * rng.range(0.7, 1.1);
    }

    // Normal human thumb jitter
    return baseAngle + rng.range(-errRad, errRad) * 0.65;
  }

  function pickObstacleAvoidance(unit, moveX, moveZ, state) {
    const len = Math.hypot(moveX, moveZ);
    if (len < 0.05) return { moveX: 0, moveZ: 0 };
    const nx = moveX / len;
    const nz = moveZ / len;
    const probeX = unit.x + nx * 1.35;
    const probeZ = unit.z + nz * 1.35;
    const hit = Physics.pointHitsWall(probeX, probeZ, unit.radius + 0.15, state.map.walls, state.barriers);
    if (!hit) return { moveX: nx, moveZ: nz };

    // Slide around wall toward open side
    const leftX = -nz;
    const leftZ = nx;
    const rightX = nz;
    const rightZ = -nx;
    const hitL = Physics.pointHitsWall(unit.x + leftX * 1.4, unit.z + leftZ * 1.4, unit.radius, state.map.walls, state.barriers);
    if (!hitL) return { moveX: leftX, moveZ: leftZ };
    return { moveX: rightX, moveZ: rightZ };
  }

  /**
   * Computes 1 tick (dt=0.05s) of Bot AI input:
   * returns { moveX, moveZ, fire, superCast, aimAngle }
   */
  function computeBotInput(unit, state, bracketCfg, dt, rng) {
    if (!unit.botMem) {
      unit.botMem = createBotMemory(unit.slotIndex || 0, unit.personality, rng);
    }
    const mem = unit.botMem;
    const pers = mem.personality;
    const homeZ = unit.team === 0 ? state.map.height * 0.42 : -state.map.height * 0.42;
    const enemyBaseZ = -homeZ;

    // Human micro-pause countdown
    if (mem.pauseTimer > 0) {
      mem.pauseTimer -= dt;
      return { moveX: 0, moveZ: 0, fire: false, superCast: false, aimAngle: unit.rot };
    }

    mem.decisionTimer -= dt;
    mem.bushCheckCooldown -= dt;

    // Gather visible enemies
    const enemies = [];
    for (let i = 0; i < state.units.length; i++) {
      const other = state.units[i];
      if (!other.alive || other.id === unit.id) continue;
      if (state.modeId !== 'last_hero' && other.team === unit.team) continue;
      if (!Physics.canSeeUnit(unit, other, state)) continue;
      const d = Physics.dist(unit.x, unit.z, other.x, other.z);
      enemies.push({ unit: other, dist: d });
    }

    // Focus-fire / weak-target selection
    let chosenEnemy = null;
    if (enemies.length > 0) {
      enemies.sort((a, b) => {
        let scoreA = a.dist;
        let scoreB = b.dist;
        if (bracketCfg.kiteRange || bracketCfg.focusFire) {
          scoreA -= (1 - a.unit.hp / a.unit.maxHp) * 4.5;
          scoreB -= (1 - b.unit.hp / b.unit.maxHp) * 4.5;
        }
        if (bracketCfg.focusFire) {
          // Focus crystal carriers or high-star bounties
          scoreA -= (a.unit.crystals || 0) * 0.6 + (a.unit.bountyStars || 0) * 0.3;
          scoreB -= (b.unit.crystals || 0) * 0.6 + (b.unit.bountyStars || 0) * 0.3;
        }
        return scoreA - scoreB;
      });
      chosenEnemy = enemies[0];
    }

    // Recompute movement intent every reactionMs window
    const reactionSec = Math.max(0.12, bracketCfg.reactionMs / 1000);
    if (mem.decisionTimer <= 0) {
      mem.decisionTimer = reactionSec * rng.range(0.8, 1.2);

      // Small human micro-pause chance (more common at low brackets)
      const pauseChance = Physics.clamp((1.0 - bracketCfg.aggression) * 0.16, 0.02, 0.14);
      if (rng.next() < pauseChance) {
        mem.pauseTimer = rng.range(0.10, 0.24);
      }

      const hpRatio = unit.hp / unit.maxHp;
      const retreatThreshold = bracketCfg.retreatHpRatio + (pers === 'cautious' ? 0.10 : (pers === 'aggressor' ? -0.06 : 0));

      let goalX = unit.x;
      let goalZ = unit.z;
      let hasObjectiveGoal = false;

      // 0. Dodge incoming Meteor Shower / Boss Rocket Salvo danger circles!
      if (state.meteors && state.meteors.length > 0 && bracketCfg.aggression >= 0.35) {
        for (const m of state.meteors) {
          const dm = Physics.dist(unit.x, unit.z, m.x, m.z);
          if (dm <= m.radius + 0.85) {
            const awayX = dm > 0.05 ? (unit.x - m.x) / dm : 1;
            const awayZ = dm > 0.05 ? (unit.z - m.z) / dm : 0;
            goalX = unit.x + awayX * 4.2;
            goalZ = unit.z + awayZ * 4.2;
            hasObjectiveGoal = true;
            break;
          }
        }
      }

      // 1. Low HP or holding winning crystal countdown -> retreat toward friendly side
      const teamCrystals = state.teamCrystals ? state.teamCrystals[unit.team] || 0 : 0;
      if (
        (retreatThreshold > 0 && hpRatio < retreatThreshold) ||
        (state.modeId === 'crystal_rush' && unit.crystals >= 3 && teamCrystals >= 10)
      ) {
        goalX = mem.laneOffset * 0.6;
        goalZ = state.modeId === 'last_hero' ? 0 : homeZ * 0.82;
        hasObjectiveGoal = true;
      }

      // 2. Mode-specific objective awareness (gentle pickup at 0-99, active objective play at 100+)
      if (!hasObjectiveGoal) {
        const objRange = bracketCfg.aggression >= 0.42 ? 10.5 : 7.8;
        if (state.modeId === 'crystal_rush' && state.groundItems.length > 0) {
          let bestItem = null;
          let bestD = 999;
          for (const it of state.groundItems) {
            if (it.kind !== 'crystal') continue;
            const d = Physics.dist(unit.x, unit.z, it.x, it.z);
            if (d < bestD) { bestD = d; bestItem = it; }
          }
          if (bestItem && bestD < objRange) {
            goalX = bestItem.x;
            goalZ = bestItem.z;
            hasObjectiveGoal = true;
          }
        } else if (state.modeId === 'star_ball' && state.ball && bracketCfg.aggression >= 0.40) {
          if (state.ball.carrierId === unit.id) {
            goalX = 0;
            goalZ = enemyBaseZ;
            hasObjectiveGoal = true;
          } else if (!state.ball.carrierId) {
            goalX = state.ball.x;
            goalZ = state.ball.z;
            hasObjectiveGoal = true;
          }
        } else if (state.modeId === 'vault_breach' && bracketCfg.aggression >= 0.40) {
          const enemyVault = state.vaults && state.vaults.find(v => v.team !== unit.team && v.hp > 0);
          if (enemyVault && (!chosenEnemy || pers === 'greedy' || chosenEnemy.dist > 8.0)) {
            goalX = enemyVault.x + mem.laneOffset * 0.5;
            goalZ = enemyVault.z + (unit.team === 0 ? 4.5 : -4.5);
            hasObjectiveGoal = true;
          }
        } else if (state.modeId === 'last_hero') {
          // Stay inside shrinking cosmic storm ring!
          const distCenter = Math.hypot(unit.x, unit.z);
          if (state.stormRadius && distCenter > state.stormRadius - 2.8) {
            goalX = 0;
            goalZ = 0;
            hasObjectiveGoal = true;
          }
        } else if (state.modeId === 'hot_zone' && bracketCfg.aggression >= 0.35) {
          const distCenter = Math.hypot(unit.x, unit.z);
          if (distCenter > 2.8) {
            goalX = mem.laneOffset * 0.45;
            goalZ = rng.range(-1.8, 1.8);
            hasObjectiveGoal = true;
          }
        }
      }

      // 3. Combat positioning / kiting / bush ambush / wandering
      if (!hasObjectiveGoal) {
        if (chosenEnemy && rng.next() < bracketCfg.aggression + (pers === 'aggressor' ? 0.14 : 0)) {
          const idealRange = unit.weaponRange * (pers === 'cautious' ? 0.86 : 0.72);
          const dx = chosenEnemy.unit.x - unit.x;
          const dz = chosenEnemy.unit.z - unit.z;
          const d = Math.max(0.1, chosenEnemy.dist);
          if (bracketCfg.kiteRange && d < idealRange * 0.68 && unit.weaponRange > 5.5) {
            // Kite backward while strafing
            goalX = unit.x - (dx / d) * 3.5 + (-dz / d) * 1.8;
            goalZ = unit.z - (dz / d) * 3.5 + (dx / d) * 1.8;
          } else if (d > idealRange) {
            goalX = chosenEnemy.unit.x + (bracketCfg.focusFire ? mem.laneOffset * 0.35 : 0);
            goalZ = chosenEnemy.unit.z;
          } else {
            // Strafe dance
            const strafeSign = rng.next() < 0.5 ? -1 : 1;
            goalX = unit.x + (-dz / d) * 2.6 * strafeSign;
            goalZ = unit.z + (dx / d) * 2.6 * strafeSign;
          }
        } else if (bracketCfg.spawnDeny && state.modeId !== 'last_hero' && (state.teamCrystals[unit.team] >= state.teamCrystals[1 - unit.team])) {
          // High bracket: press forward advantage when ahead on objective
          goalX = mem.laneOffset * 0.85;
          goalZ = enemyBaseZ * 0.16;
        } else if (bracketCfg.useBushes && state.map.bushes.length > 0 && rng.next() < 0.45) {
          const b = state.map.bushes[(unit.slotIndex + Math.floor(state.timeSec / 6)) % state.map.bushes.length];
          goalX = b.x;
          goalZ = b.z;
        } else if (bracketCfg.aggression < 0.38) {
          // 0-99 onboarding wander around central arena
          mem.wanderAngle += rng.range(-1.0, 1.0);
          goalX = Physics.clamp(Math.cos(mem.wanderAngle) * 3.8, -4.8, 4.8);
          goalZ = Physics.clamp(Math.sin(mem.wanderAngle) * 3.8, -4.8, 4.8);
        } else {
          // Hold center arena lane
          goalX = mem.laneOffset * 0.75 + rng.range(-1.5, 1.5);
          goalZ = rng.range(-2.2, 2.2);
        }
      }

      // Always respect storm ring in FFA
      if (state.modeId === 'last_hero' && state.stormRadius) {
        const gDist = Math.hypot(goalX, goalZ);
        if (gDist > state.stormRadius - 1.8 && gDist > 0.01) {
          const scale = (state.stormRadius - 2.2) / gDist;
          goalX *= scale;
          goalZ *= scale;
        }
      }

      const rawDx = goalX - unit.x;
      const rawDz = goalZ - unit.z;
      const steered = pickObstacleAvoidance(unit, rawDx, rawDz, state);
      mem.desiredMoveX = steered.moveX;
      mem.desiredMoveZ = steered.moveZ;
    }

    // Shooting & Super decision
    let fire = false;
    let superCast = false;
    let aimAngle = unit.rot;

    // Star Ball carrier shoots toward enemy goal when close!
    if (state.modeId === 'star_ball' && state.ball && state.ball.carrierId === unit.id) {
      const distGoal = Math.abs(enemyBaseZ - unit.z);
      if (distGoal < 9.5) {
        aimAngle = Math.atan2(0 - unit.x, enemyBaseZ - unit.z);
        if (unit.superCharge >= 100 && rng.next() < Math.max(0.4, bracketCfg.superUseChance)) {
          superCast = true;
        } else {
          fire = true;
        }
        return { moveX: mem.desiredMoveX, moveZ: mem.desiredMoveZ, fire, superCast, aimAngle };
      }
    }

    if (chosenEnemy && chosenEnemy.dist <= unit.weaponRange * 1.04) {
      const target = chosenEnemy.unit;
      const canHitOverWall = unit.lobOverWalls;
      const clearShot = canHitOverWall || Physics.hasLineOfSight(
        unit.x, unit.z, target.x, target.z, state.map.walls, state.barriers
      );

      if (clearShot && unit.ammo >= 1.0 && unit.fireCooldown <= 0) {
        let tx = target.x;
        let tz = target.z;
        // 1200+ Predictive Lead Aiming (damped for strafing targets)
        if (bracketCfg.predictiveAim && unit.projSpeed > 1) {
          const leadT = Physics.clamp((chosenEnemy.dist / unit.projSpeed) * 0.42, 0, 0.22);
          tx += (target.vx || 0) * leadT;
          tz += (target.vz || 0) * leadT;
        }
        const idealAngle = Math.atan2(tx - unit.x, tz - unit.z);
        aimAngle = applyHumanAimOffset(idealAngle, bracketCfg.aimErrorDeg, mem, rng);

        // Shoot eagerness scales with aggression
        if (rng.next() < bracketCfg.aggression + 0.22) {
          if (unit.superCharge >= 100 && rng.next() < bracketCfg.superUseChance) {
            superCast = true;
          } else {
            fire = true;
          }
        }
      }
    } else if (state.modeId === 'vault_breach' && state.vaults) {
      // Shoot enemy safe when in range!
      const enemyVault = state.vaults.find(v => v.team !== unit.team && v.hp > 0);
      if (enemyVault) {
        const dVault = Physics.dist(unit.x, unit.z, enemyVault.x, enemyVault.z);
        if (dVault <= unit.weaponRange * 0.98 && unit.ammo >= 1.0 && unit.fireCooldown <= 0) {
          aimAngle = Math.atan2(enemyVault.x - unit.x, enemyVault.z - unit.z);
          if (unit.superCharge >= 100 && rng.next() < bracketCfg.superUseChance) {
            superCast = true;
          } else if (rng.next() < bracketCfg.aggression + 0.2) {
            fire = true;
          }
        }
      }
    } else if (bracketCfg.checkBushes && mem.bushCheckCooldown <= 0 && unit.ammo >= 2.2) {
      // 500+ Bush-checking behavior: probe nearby bushes with a shot!
      for (const b of state.map.bushes) {
        const d = Physics.dist(unit.x, unit.z, b.x, b.z);
        if (d > 3.2 && d < unit.weaponRange * 0.9) {
          aimAngle = Math.atan2(b.x - unit.x, b.z - unit.z);
          fire = true;
          mem.bushCheckCooldown = rng.range(3.5, 6.0);
          break;
        }
      }
    }

    return {
      moveX: mem.desiredMoveX,
      moveZ: mem.desiredMoveZ,
      fire,
      superCast,
      aimAngle
    };
  }

  /**
   * Mid-skill human player reference agent used ONLY in headless QA benchmark
   * (Requirement 10.1: 100 simulations per bracket -> mid-skill player-bot winrate 45-55%).
   * Models a focused human player whose skill progresses naturally alongside their trophy bracket
   * while playing with two (bracket - 1) allied bots against three (bracket) enemy bots.
   */
  function computeMidPlayerBenchmarkInput(unit, state, enemyBracketIdx, balance, dt, rng) {
    const brackets = balance.botBrackets;
    const baseB = brackets[enemyBracketIdx];
    // Models an average human player at each trophy bracket:
    // - At b0 (0-99), beginner player learning controls -> matches b0 pace (~50% winrate)
    // - At b1 (100-299), player understands objectives while allies are b0 -> strong objective/aim uplift
    // - At b2..b4 (300-1199), player compensates cleanly for (bracket - 1) allies
    // - At b5 (1200+), top-bracket duel against predictive bots
    const profiles = [
      // 0: 0-99
      { aimMult: 1.05, reactMult: 1.04, aggAdd: -0.02, superAdd: 0.00, pred: false, retreat: 0.00, pers: 'aggressor' },
      // 1: 100-299
      { aimMult: 0.18, reactMult: 0.30, aggAdd: 0.48, superAdd: 0.75, pred: true,  retreat: 0.38, pers: 'greedy' },
      // 2: 300-499
      { aimMult: 0.50, reactMult: 0.62, aggAdd: 0.17, superAdd: 0.28, pred: false, retreat: 0.38, pers: 'greedy' },
      // 3: 500-799
      { aimMult: 0.52, reactMult: 0.66, aggAdd: 0.14, superAdd: 0.15, pred: true,  retreat: 0.40, pers: 'greedy' },
      // 4: 800-1199
      { aimMult: 0.52, reactMult: 0.68, aggAdd: 0.10, superAdd: 0.00, pred: true,  retreat: 0.42, pers: 'greedy' },
      // 5: 1200+
      { aimMult: 1.48, reactMult: 1.30, aggAdd: -0.08, superAdd: 0.00, pred: false, retreat: 0.36, pers: 'cautious' }
    ];
    const p = profiles[enemyBracketIdx] || profiles[2];
    const tunedProfile = {
      aimErrorDeg: Math.max(1.5, baseB.aimErrorDeg * p.aimMult),
      reactionMs: Math.max(140, baseB.reactionMs * p.reactMult),
      aggression: Math.min(0.98, baseB.aggression + p.aggAdd),
      superUseChance: Math.min(1.0, baseB.superUseChance + p.superAdd),
      predictiveAim: p.pred,
      retreatHpRatio: p.retreat,
      useBushes: enemyBracketIdx >= 2,
      kiteRange: enemyBracketIdx >= 1,
      checkBushes: enemyBracketIdx >= 3,
      focusFire: enemyBracketIdx >= 1,
      spawnDeny: false
    };
    unit.personality = p.pers;
    const res = computeBotInput(unit, state, tunedProfile, dt, rng);
    if (unit.overdriveCharge >= 100) {
      res.overdriveCast = true;
    }
    return res;
  }

  const api = {
    PERSONALITIES,
    getBaseBracketIndex,
    resolveMatchBracketIndices,
    createBotMemory,
    computeBotInput,
    computeMidPlayerBenchmarkInput
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.BotAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
