/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Deterministic 20Hz Fixed-Tick Match Simulation Engine
 * Runs identically in Browser (with 60fps render interpolation) and Node.js (for 600-match QA benchmarks).
 */
(function (root) {
  'use strict';

  const RngMod = (typeof module !== 'undefined' && module.exports) ? require('./rng') : root.SA.Rng;
  const Physics = (typeof module !== 'undefined' && module.exports) ? require('./physics') : root.SA.Physics;
  const BotAI = (typeof module !== 'undefined' && module.exports) ? require('./bot_ai') : root.SA.BotAI;

  const FIXED_DT = 0.05; // 20Hz fixed simulation tick

  const BOT_NAMES_RU = ['Комета', 'Зенит', 'Квазар', 'Орион', 'Вега', 'Сириус', 'Пульсар', 'Альтаир', 'Нова', 'Титан'];
  const BOT_NAMES_EN = ['Comet', 'Zenith', 'Quasar', 'Orion', 'Vega', 'Sirius', 'Pulsar', 'Altair', 'Nova', 'Titan'];

  function buildUnit({
    id,
    slotIndex,
    name,
    team,
    isPlayer,
    isBot,
    isSummon = false,
    ownerId = null,
    hero,
    skin,
    level = 1,
    x = 0,
    z = 0,
    rot = 0,
    personality = null,
    gameData
  }) {
    const arch = gameData.balance.archetypes.find(a => a.id === hero.archetypeId) || gameData.balance.archetypes[0];
    const elem = gameData.balance.elements.find(e => e.id === hero.elementId) || gameData.balance.elements[0];
    const lvEntry = gameData.balance.levelCurve.find(c => c.level === level) || gameData.balance.levelCurve[0];
    const mult = lvEntry.statMult;

    let maxHp = Math.round(arch.baseHp * mult);
    // Lv.7 Tank talent: +12% max HP
    if (arch.id === 'tank' && level >= 7) {
      maxHp = Math.round(maxHp * 1.12);
    }

    let moveSpeed = arch.moveSpeed;
    // Storm element: +5% move speed
    if (elem.id === 'storm') {
      moveSpeed *= 1.05;
    }

    return {
      id,
      slotIndex,
      name,
      team,
      isPlayer: Boolean(isPlayer),
      isBot: Boolean(isBot),
      isSummon: Boolean(isSummon),
      ownerId,
      heroId: hero.id,
      archetypeId: arch.id,
      elementId: elem.id,
      skinId: skin ? skin.id : null,
      palette: skin ? { primary: skin.colors.body, secondary: skin.colors.trim, glow: skin.colors.aura } : hero.palette,
      silhouette: arch.silhouette,
      level,
      hasLv7Talent: level >= 7,
      hasLv9Super: level >= 9,
      personality,

      x,
      z,
      prevX: x,
      prevZ: z,
      vx: 0,
      vz: 0,
      rot,
      prevRot: rot,
      radius: isSummon ? 0.52 : 0.72,

      hp: maxHp,
      maxHp,
      baseMoveSpeed: moveSpeed,
      weaponRange: arch.weapon.range,
      projSpeed: arch.weapon.projSpeed || 20,
      lobOverWalls: Boolean(arch.weapon.overWalls),
      reloadSec: arch.reloadSec,
      ammo: arch.maxAmmo,
      maxAmmo: arch.maxAmmo,
      fireCooldown: 0,
      comboCounter: 0,

      superCharge: 0, // 0..100
      superHitsNeeded: arch.superHitsNeeded,
      overdriveCharge: 0, // 0..100 (charges ~0.46x of Super)
      overdriveTimer: 0,  // 5.0s neon hyper-state
      energyTimer: 0,     // 7.5s Energy Surge cube buff
      gadgetCharges: isSummon ? 0 : 3,
      maxGadgetCharges: isSummon ? 0 : 3,
      gadgetCooldown: 0,
      teleportCd: 0,
      airborneTimer: 0,
      airborneDuration: 0,
      airborneStartX: x,
      airborneStartZ: z,
      airborneDestX: x,
      airborneDestZ: z,
      isBoss: false,
      bossPhase: 1,
      bossActionTimer: 1.8,
      bossSalvoTimer: 4.5,
      bossSpawnTimer: 9.0,

      // Mode objectives carried
      crystals: 0,
      bountyStars: 2,
      powerStars: 0,

      // Combat timers & status effects (6+ cartoon friendly)
      alive: true,
      respawnTimer: 0,
      invulnTimer: 1.0,
      outOfCombatTimer: 4.0,
      inBush: false,
      revealedTimer: 0,
      stealthTimer: 0,
      shieldTimer: 0,
      shieldReduction: 0,
      shieldAuraDps: 0,
      slowTimer: 0,
      slowAmount: 0,
      speedBoostTimer: 0,
      speedBoostAmount: 0,
      reloadHasteTimer: 0,
      stunTimer: 0,
      knockupTimer: 0,
      dotTimer: 0,
      dotDps: 0,
      dotSourceId: null,
      summonLifeTimer: isSummon ? 8.0 : 0,
      popDamageOnExpire: 0,
      hitFlashTimer: 0,
      emoteId: null,
      emoteTimer: 0,

      // Match stats
      kills: 0,
      deaths: 0,
      damageDealt: 0
    };
  }

  function getActiveMapsForMode(modeId, gameData, weekIndexOverride) {
    const allForMode = gameData.maps.maps.filter(m => m.modeId === modeId);
    if (allForMode.length <= 2) return allForMode;
    const weekIdx = weekIndexOverride !== undefined
      ? weekIndexOverride
      : Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    const first = weekIdx % allForMode.length;
    const second = (first + 1) % allForMode.length;
    return [allForMode[first], allForMode[second]];
  }

  /**
   * Auto-Aim in 25° forward cone (with optional range snap fallback for 1-thumb tap convenience)
   */
  function computeAutoAimAngle(unit, state, coneDeg = 25, allowSnapFallback = true) {
    const halfConeRad = ((coneDeg * 0.5) * Math.PI) / 180;
    let bestInCone = null;
    let bestConeDist = Infinity;
    let bestInRange = null;
    let bestRangeDist = Infinity;

    for (let i = 0; i < state.units.length; i++) {
      const other = state.units[i];
      if (!other.alive || other.id === unit.id) continue;
      if (state.modeId !== 'last_hero' && other.team === unit.team) continue;
      if (!Physics.canSeeUnit(unit, other, state)) continue;

      const d = Physics.dist(unit.x, unit.z, other.x, other.z);
      if (d > unit.weaponRange * 1.18) continue;
      if (!unit.lobOverWalls && !Physics.hasLineOfSight(unit.x, unit.z, other.x, other.z, state.map.walls, state.barriers)) {
        continue;
      }

      const ang = Math.atan2(other.x - unit.x, other.z - unit.z);
      const diff = Math.abs(Physics.angleDiff(unit.rot, ang));
      if (diff <= halfConeRad && d < bestConeDist) {
        bestConeDist = d;
        bestInCone = ang;
      }
      if (d < bestRangeDist) {
        bestRangeDist = d;
        bestInRange = ang;
      }
    }

    if (bestInCone !== null) return { angle: bestInCone, lockedInCone: true };
    if (allowSnapFallback && bestInRange !== null) return { angle: bestInRange, lockedInCone: false };

    // Vault Breach fallback: auto-aim enemy safe if in range
    if (state.modeId === 'vault_breach' && state.vaults) {
      const ev = state.vaults.find(v => v.team !== unit.team && v.hp > 0);
      if (ev && Physics.dist(unit.x, unit.z, ev.x, ev.z) <= unit.weaponRange * 1.15) {
        return { angle: Math.atan2(ev.x - unit.x, ev.z - unit.z), lockedInCone: false };
      }
    }

    // Last Hero crate fallback
    if (state.modeId === 'last_hero' && state.crates) {
      for (const c of state.crates) {
        if (c.hp > 0 && Physics.dist(unit.x, unit.z, c.x, c.z) <= unit.weaponRange) {
          return { angle: Math.atan2(c.x - unit.x, c.z - unit.z), lockedInCone: false };
        }
      }
    }

    return { angle: unit.rot, lockedInCone: false };
  }

  function createMatchState({
    modeId = 'crystal_rush',
    mapId = null,
    playerHeroId = 'blaster_fire',
    playerSkinId = null,
    playerLevel = 1,
    playerName = 'Player',
    totalTrophies = 0,
    consecutiveLosses = 0,
    hardcoreEnabled = false,
    modifierId = 'none',
    bossTier = 1,
    friendGhost = null,
    partySlots = null,
    lang = 'ru',
    seed = 42,
    gameData
  }) {
    const rng = RngMod.createRng(seed);

    if (modeId === 'tutorial') {
      return createTutorialMatchState({ playerHeroId, playerSkinId, playerLevel, playerName, lang, seed, gameData });
    }
    if (modeId === 'practice') {
      return createPracticeMatchState({ playerHeroId, playerSkinId, playerLevel, playerName, lang, seed, gameData });
    }

    const modeCfg = gameData.balance.modes.find(m => m.id === modeId) || gameData.balance.modes[0];
    const rotatedMaps = getActiveMapsForMode(modeCfg.id, gameData);
    const chosenMap = (mapId && gameData.maps.maps.find(m => m.id === mapId))
      || rng.pick(rotatedMaps)
      || gameData.maps.maps[0];

    const bracketInfo = BotAI.resolveMatchBracketIndices({
      totalTrophies,
      consecutiveLosses,
      hardcoreEnabled,
      balance: gameData.balance
    });

    const playerHero = gameData.heroes.find(h => h.id === playerHeroId) || gameData.heroes[0];
    const playerSkin = playerSkinId ? gameData.skins.find(s => s.id === playerSkinId) : null;

    const units = [];
    const botNames = lang === 'ru' ? BOT_NAMES_RU : BOT_NAMES_EN;

    if (modeCfg.id === 'last_hero') {
      // FFA: Player + 5 solo bots on 6 symmetric spawns
      const spawns = chosenMap.spawnsFfa;
      units.push(buildUnit({
        id: 'u_player',
        slotIndex: 0,
        name: playerName,
        team: 0,
        isPlayer: true,
        isBot: false,
        hero: playerHero,
        skin: playerSkin,
        level: playerLevel,
        x: spawns[0].x,
        z: spawns[0].z,
        rot: Math.PI,
        gameData
      }));
      for (let i = 1; i < 6; i++) {
        const bHero = gameData.heroes[(seed + i * 11) % gameData.heroes.length];
        const bLv = Physics.clamp(playerLevel + rng.int(-1, 1), 1, 9);
        units.push(buildUnit({
          id: `u_bot_${i}`,
          slotIndex: i,
          name: botNames[(seed + i) % botNames.length],
          team: i, // Distinct team per fighter in FFA
          isPlayer: false,
          isBot: true,
          hero: bHero,
          skin: null,
          level: bLv,
          x: spawns[i].x,
          z: spawns[i].z,
          rot: Math.atan2(-spawns[i].x, -spawns[i].z),
          gameData
        }));
      }
    } else {
      // 3v3 or Co-op Boss Siege: Player + 2 Squad Allies (team 0)
      const s0 = chosenMap.spawnsTeam0;
      const s1 = chosenMap.spawnsTeam1;
      units.push(buildUnit({
        id: 'u_player',
        slotIndex: 0,
        name: playerName,
        team: 0,
        isPlayer: true,
        isBot: false,
        hero: playerHero,
        skin: playerSkin,
        level: playerLevel,
        x: s0[1].x,
        z: s0[1].z,
        rot: Math.PI,
        gameData
      }));

      for (let a = 0; a < 2; a++) {
        const pSlot = Array.isArray(partySlots) ? partySlots[a] : null;
        const customAlly = pSlot && pSlot.heroId
          ? pSlot
          : (a === 0 && friendGhost && friendGhost.heroId ? friendGhost : null);
        const gHero = customAlly
          ? (gameData.heroes.find(h => h.id === customAlly.heroId) || gameData.heroes[(seed + 3) % gameData.heroes.length])
          : gameData.heroes[(seed + (a + 1) * 7) % gameData.heroes.length];
        const gSkin = (customAlly && customAlly.skinId)
          ? gameData.skins.find(s => s.id === customAlly.skinId)
          : null;
        const gLv = customAlly
          ? Physics.clamp(customAlly.level || playerLevel, 1, 9)
          : playerLevel;
        const gName = customAlly
          ? (customAlly.name || (lang === 'ru' ? customAlly.nameRu : customAlly.nameEn) || botNames[(seed + a) % botNames.length])
          : botNames[(seed + a) % botNames.length];
        const spawnPt = a === 0 ? s0[0] : s0[2];
        units.push(buildUnit({
          id: `u_ally_${a + 1}`,
          slotIndex: a + 1,
          name: gName,
          team: 0,
          isPlayer: false,
          isBot: true,
          hero: gHero,
          skin: gSkin,
          level: gLv,
          x: spawnPt.x,
          z: spawnPt.z,
          rot: Math.PI,
          personality: customAlly ? customAlly.personality : null,
          gameData
        }));
      }

      if (modeCfg.id === 'boss_siege') {
        const bTiers = gameData.balance.bossTiers || [{ tier: 1, hp: 26000, dmgMult: 1.0 }];
        const bCfg = bTiers.find(t => t.tier === bossTier) || bTiers[0];
        const bossHero = gameData.heroes.find(h => h.archetypeId === 'tank') || gameData.heroes[2];
        const bossUnit = buildUnit({
          id: 'u_boss',
          slotIndex: 3,
          name: lang === 'ru' ? 'МЕГА-ТИТАН ОМЕГА' : 'MEGA-TITAN OMEGA',
          team: 1,
          isPlayer: false,
          isBot: true,
          hero: bossHero,
          skin: null,
          level: Math.min(9, Math.max(playerLevel, bossTier * 2)),
          x: 0,
          z: -9.5,
          rot: 0,
          gameData
        });
        bossUnit.isBoss = true;
        bossUnit.silhouette = 'mega_titan';
        bossUnit.palette = { primary: '#D50000', secondary: '#FFEA00', glow: '#FF1744' };
        bossUnit.radius = 1.45;
        bossUnit.maxHp = bCfg.hp;
        bossUnit.hp = bCfg.hp;
        bossUnit.baseMoveSpeed = 4.9;
        bossUnit.bossDmgMult = bCfg.dmgMult || 1.0;
        bossUnit.invulnTimer = 0.6;
        units.push(bossUnit);
      } else {
        for (let e = 0; e < 3; e++) {
          const eHero = gameData.heroes[(seed + (e + 3) * 13) % gameData.heroes.length];
          const eLv = playerLevel;
          const spawnPt = s1[e];
          units.push(buildUnit({
            id: `u_enemy_${e + 1}`,
            slotIndex: e + 3,
            name: botNames[(seed + e + 4) % botNames.length],
            team: 1,
            isPlayer: false,
            isBot: true,
            hero: eHero,
            skin: null,
            level: eLv,
            x: spawnPt.x,
            z: spawnPt.z,
            rot: 0,
            gameData
          }));
        }
      }
    }

    const state = {
      lang,
      seed,
      rng,
      gameData,
      modeId: modeCfg.id,
      modeCfg,
      modifierId: modifierId || 'none',
      bossTier: bossTier || 1,
      map: chosenMap,
      bushes: (chosenMap.bushes || []).map((b, idx) => ({ id: `bush_${idx}`, x: b.x, z: b.z, r: b.r, destroyed: false })),
      jumpPads: (chosenMap.jumpPads || []).map(jp => Object.assign({}, jp, { chargeTimer: 0, cooldown: 0 })),
      teleporters: (chosenMap.teleporters || []).map(tp => Object.assign({}, tp, { cooldown: 0 })),
      barrels: (chosenMap.barrels || []).map(br => Object.assign({}, br, { hp: 1400, maxHp: 1400, radius: 0.78, respawnTimer: 0 })),
      meteors: [],
      modifierSpawnTimer: 5.0,
      bracketInfo,
      hardcoreEnabled,
      tick: 0,
      timeSec: 0,
      maxTimeSec: modeCfg.durationSec,
      finished: false,
      winnerTeam: null, // 0 = player team, 1 = enemy, -1 = draw; in FFA playerPlacement 1..6
      playerPlacement: 1,

      units,
      projectiles: [],
      zones: [],      // Healing zones & hazard puddles & proximity mines
      barriers: [],
      destroyedWalls: [],
      groundItems: [],// Crystals, center star, power stars
      crates: [],     // Last Hero power crates
      vaults: null,   // Vault Breach safes
      ball: null,     // Star Ball orb
      events: [],     // Per-tick FX events consumed by Renderer & Audio

      // Mode trackers
      mineTimer: 1.5,
      teamCrystals: [0, 0],
      countdownTeam: null,
      countdownSec: 15.0,
      teamStars: [0, 0],
      teamGoals: [0, 0],
      teamZonePct: [0, 0],
      hotZoneRadius: 3.8,
      goalResetTimer: 0,
      stormRadius: modeCfg.id === 'last_hero' ? 17.5 : null,
      killFeed: [],
      revengeTargetId: null,
      revengeTimer: 0,
      isFrenzy: false,
      frenzyAt: 0,
      comebackTimer: 7.0,
      playerCombo: 0,
      playerLastKillTime: -99
    };

    // Mode-specific initial arena objects
    if (modeCfg.id === 'crystal_rush') {
      state.groundItems.push({ id: 'it_init_c', kind: 'crystal', x: 0, z: 0 });
    } else if (modeCfg.id === 'star_hunt') {
      state.groundItems.push({ id: 'it_center_star', kind: 'bounty_star', x: 0, z: 0 });
    } else if (modeCfg.id === 'last_hero') {
      const cratePts = [
        { x: -2.2, z: 0 }, { x: 2.2, z: 0 },
        { x: 0, z: -5.2 }, { x: 0, z: 5.2 },
        { x: -6.2, z: -6.2 }, { x: 6.2, z: 6.2 }
      ];
      cratePts.forEach((pt, idx) => {
        state.crates.push({ id: `crate_${idx}`, x: pt.x, z: pt.z, hp: 2400, maxHp: 2400, radius: 0.85 });
      });
    } else if (modeCfg.id === 'vault_breach') {
      state.vaults = [
        { id: 'vault_0', team: 0, x: 0, z: chosenMap.height * 0.5 - 3.6, hp: 14000, maxHp: 14000, radius: 1.45 },
        { id: 'vault_1', team: 1, x: 0, z: -(chosenMap.height * 0.5 - 3.6), hp: 14000, maxHp: 14000, radius: 1.45 }
      ];
    } else if (modeCfg.id === 'star_ball') {
      state.ball = {
        x: 0, z: 0, prevX: 0, prevZ: 0,
        vx: 0, vz: 0, radius: 0.55,
        carrierId: null, pickupIgnoreId: null, pickupIgnoreTimer: 0
      };
    }

    return state;
  }

  function createTutorialMatchState({ playerHeroId, playerSkinId, playerLevel, playerName, lang = 'en', seed, gameData }) {
    const rng = RngMod.createRng(seed);
    const map = gameData.maps.maps[0];
    const hero = gameData.heroes.find(h => h.id === playerHeroId) || gameData.heroes[0];
    const skin = playerSkinId ? gameData.skins.find(s => s.id === playerSkinId) : null;
    const player = buildUnit({
      id: 'u_player',
      slotIndex: 0,
      name: playerName,
      team: 0,
      isPlayer: true,
      isBot: false,
      hero,
      skin,
      level: playerLevel,
      x: 0,
      z: 7.2,
      rot: Math.PI,
      gameData
    });

    return {
      lang,
      seed,
      rng,
      gameData,
      modeId: 'tutorial',
      modeCfg: { id: 'tutorial', durationSec: 60 },
      map,
      bracketInfo: { baseIdx: 0, enemyIdx: 0, allyIdx: 0, rubberbandingActive: false },
      hardcoreEnabled: false,
      tick: 0,
      timeSec: 0,
      maxTimeSec: 60,
      finished: false,
      winnerTeam: 0,
      playerPlacement: 1,
      tutorialStep: 1, // 1: move to pad (0, 3.5), 2: pop 2 target drones, 3: cast Super, 4: grab crystal
      tutorialPad: { x: 0, z: 3.5, r: 1.8 },
      units: [player],
      projectiles: [],
      zones: [],
      barriers: [],
      groundItems: [],
      crates: [],
      vaults: null,
      ball: null,
      events: [],
      destroyedWalls: [],
      teamCrystals: [0, 0],
      teamStars: [0, 0],
      teamGoals: [0, 0],
      teamZonePct: [0, 0],
      killFeed: [],
      destroyedWalls: []
    };
  }

  function createPracticeMatchState({ playerHeroId, playerSkinId, playerLevel, playerName, lang = 'ru', seed, gameData }) {
    const rng = RngMod.createRng(seed);
    const map = {
      id: 'map_practice_cave',
      modeId: 'practice',
      nameRu: 'Тренировочная Пещера',
      nameEn: 'Training Cave',
      theme: 'cosmic_station',
      width: 24,
      height: 30,
      walls: [
        { x: -5.5, z: 2.0, w: 2.6, d: 1.4, kind: 'wall' },
        { x: 5.5, z: 2.0, w: 2.6, d: 1.4, kind: 'wall' }
      ],
      bushes: [
        { x: -7.2, z: 6.5, r: 1.8 },
        { x: 7.2, z: 6.5, r: 1.8 }
      ],
      spawnsTeam0: [{ x: 0, z: 9.0 }, { x: 0, z: 9.0 }, { x: 0, z: 9.0 }],
      spawnsTeam1: [{ x: 0, z: -6.0 }, { x: -4.5, z: -3.5 }, { x: 4.5, z: -3.5 }]
    };
    const hero = gameData.heroes.find(h => h.id === playerHeroId) || gameData.heroes[0];
    const skin = playerSkinId ? gameData.skins.find(s => s.id === playerSkinId) : null;
    const player = buildUnit({
      id: 'u_player',
      slotIndex: 0,
      name: playerName,
      team: 0,
      isPlayer: true,
      isBot: false,
      hero,
      skin,
      level: playerLevel || 9,
      x: 0,
      z: 8.5,
      rot: Math.PI,
      gameData
    });
    player.superCharge = 100;
    player.overdriveCharge = 100;
    player.gadgetCharges = 99;
    player.maxGadgetCharges = 99;

    const boss = buildUnit({
      id: 'prac_boss',
      slotIndex: 1,
      name: lang === 'ru' ? 'Мега-Робот' : 'Boss Bot',
      team: 1,
      isPlayer: false,
      isBot: true,
      hero: gameData.heroes[2],
      skin: null,
      level: 9,
      x: 0,
      z: -4.8,
      rot: 0,
      gameData
    });
    boss.maxHp = 10000;
    boss.hp = 10000;
    boss.radius = 1.05;
    boss.invulnTimer = 0;

    const units = [player, boss];
    const swarmPts = [
      { x: -5.2, z: -3.2 },
      { x: -3.6, z: -4.4 },
      { x: -3.6, z: -2.0 }
    ];
    swarmPts.forEach((pt, i) => {
      const sw = buildUnit({
        id: `prac_swarm_${i}`,
        slotIndex: 2 + i,
        name: lang === 'ru' ? 'Робот-мишень' : 'Swarm Bot',
        team: 1,
        isPlayer: false,
        isBot: true,
        hero: gameData.heroes[0],
        skin: null,
        level: 1,
        x: pt.x,
        z: pt.z,
        rot: 0,
        gameData
      });
      sw.maxHp = 2200;
      sw.hp = 2200;
      sw.invulnTimer = 0;
      units.push(sw);
    });

    const shooter = buildUnit({
      id: 'prac_shooter',
      slotIndex: 5,
      name: lang === 'ru' ? 'Стрелок-бот' : 'Sniper Bot',
      team: 1,
      isPlayer: false,
      isBot: true,
      hero: gameData.heroes[3],
      skin: null,
      level: 3,
      x: 5.0,
      z: -3.5,
      rot: 0,
      gameData
    });
    shooter.maxHp = 3200;
    shooter.hp = 3200;
    shooter.invulnTimer = 0;
    units.push(shooter);

    return {
      lang,
      seed,
      rng,
      gameData,
      modeId: 'practice',
      modeCfg: { id: 'practice', durationSec: 999, nameRu: 'Испытание бойца', nameEn: 'Training Cave' },
      modifierId: 'none',
      map,
      bushes: map.bushes.map((b, idx) => ({ id: `pb_${idx}`, x: b.x, z: b.z, r: b.r, destroyed: false })),
      jumpPads: [{ id: 'pjp_0', x: -8.6, z: 9.2, tx: -6.5, tz: 0.0, chargeTimer: 0, cooldown: 0 }],
      teleporters: [
        { id: 'ptp_a', pairId: 'ptp_b', x: 8.6, z: 9.2, color: '#00e5ff', cooldown: 0 },
        { id: 'ptp_b', pairId: 'ptp_a', x: 8.6, z: -6.5, color: '#00e5ff', cooldown: 0 }
      ],
      barrels: [
        { id: 'pbrl_0', x: -2.4, z: -2.2, hp: 1400, maxHp: 1400, radius: 0.78, respawnTimer: 0 },
        { id: 'pbrl_1', x: 2.8, z: -2.2, hp: 1400, maxHp: 1400, radius: 0.78, respawnTimer: 0 }
      ],
      meteors: [],
      bracketInfo: { baseIdx: 0, enemyIdx: 0, allyIdx: 0, rubberbandingActive: false },
      hardcoreEnabled: false,
      tick: 0,
      timeSec: 0,
      maxTimeSec: 999,
      finished: false,
      winnerTeam: 0,
      playerPlacement: 1,
      units,
      projectiles: [],
      zones: [],
      barriers: [],
      groundItems: [],
      crates: [],
      vaults: null,
      ball: null,
      events: [],
      destroyedWalls: [],
      teamCrystals: [0, 0],
      teamStars: [0, 0],
      teamGoals: [0, 0],
      teamZonePct: [0, 0],
      killFeed: [],
      practiceDpsWindow: []
    };
  }

  function applyDamageToUnit(state, attacker, target, rawAmount, isSuper = false) {
    if (!target.alive || target.invulnTimer > 0) return 0;

    let dmg = rawAmount;
    if (attacker && attacker.powerStars > 0) {
      dmg *= 1 + attacker.powerStars * 0.10;
    }
    if (attacker && attacker.overdriveTimer > 0) {
      dmg *= 1.18;
    }
    if (attacker && attacker.energyTimer > 0) {
      dmg *= 1.30;
    }
    if (target.overdriveTimer > 0) {
      dmg *= 0.80;
    }
    if (target.shieldTimer > 0 && target.shieldReduction > 0) {
      dmg *= 1 - target.shieldReduction;
    }
    // 12% crit balanced
    let isCrit = false;
    if (attacker && state.rng && !isSuper) {
      isCrit = state.rng.next() < 0.12;
      if (isCrit) dmg = Math.max(1, Math.round(dmg * 1.30));
    }
    dmg = Math.max(1, Math.round(dmg));

    target.hp -= dmg;
    target.outOfCombatTimer = 0;
    target.revealedTimer = 1.1;
    target.hitFlashTimer = isCrit ? 0.22 : 0.16;
    target._hitStopShake = isCrit ? 0.09 : 0.05;
    // visual hitstop handled in renderer via shake

    if (isCrit) target.comboCounter = (target.comboCounter || 0) + 1;

    if (attacker) {
      attacker.outOfCombatTimer = 0;
      attacker.damageDealt += dmg;

      // Charge Super & Overdrive on primary hits (+5% bonus for Light element, x1.8 in ultra_charge!)
      if (!isSuper && !attacker.isSummon) {
        const elemBonus = attacker.elementId === 'light' ? 1.05 : 1.0;
        const modMult = state.modifierId === 'ultra_charge' ? 1.8 : 1.0;
        const gain = (100 / Math.max(1, attacker.superHitsNeeded)) * elemBonus * modMult;
        attacker.superCharge = Math.min(100, attacker.superCharge + gain);
        attacker.overdriveCharge = Math.min(100, (attacker.overdriveCharge || 0) + gain * 0.46);
      }

      // Elemental modifiers on hit
      if (attacker.elementId === 'fire') {
        target.dotTimer = 2.0;
        target.dotDps = Math.max(20, Math.round((dmg * 0.10) / 2.0));
        target.dotSourceId = attacker.id;
      } else if (attacker.elementId === 'ice') {
        target.slowTimer = Math.max(target.slowTimer, 1.8);
        target.slowAmount = Math.max(target.slowAmount, 0.08);
      } else if (attacker.elementId === 'shadow') {
        const heal = Math.max(1, Math.round(dmg * 0.05));
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      }

      // Lv.7 Shotgun talent: +15% speed on hit
      if (attacker.archetypeId === 'shotgun' && attacker.hasLv7Talent) {
        attacker.speedBoostTimer = 2.0;
        attacker.speedBoostAmount = 0.15;
      }
    }

    // 6+ Cartoon "POP!" + Star Burst event (NO blood!)
    state.events.push({
      type: 'pop_hit',
      x: target.x,
      z: target.z,
      amount: dmg,
      targetId: target.id,
      attackerId: attacker ? attacker.id : null,
      isCrit: isCrit,
      isHeal: false
    });
    // Near-miss: survives with <14% HP after big hit -> tension toast
    if (target.alive && target.hp > 0 && target.hp / Math.max(1,target.maxHp) < 0.14 && dmg >= target.maxHp * 0.18) {
      state.events.push({ type: 'near_miss', x: target.x, z: target.z, hp: target.hp, targetId: target.id });
    }
    // heal tick visual when shadow lifesteal triggers
    if (attacker && attacker.elementId === 'shadow' && !isSuper && target.hp > 0) {
      // heal already applied inside elemental block, emit green pop for attacker
      // we emit heal event for attacker at separate tick (handled in handleUnitKnockout's heal)
    }

    if (target.hp <= 0) {
      handleUnitKnockout(state, attacker, target);
    }

    return dmg;
  }

  function handleUnitKnockout(state, attacker, victim) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths += 1;

    // knockout shake
    state.events.push({
      type: 'knockout',
      x: victim.x,
      z: victim.z,
      victimId: victim.id,
      attackerId: attacker ? attacker.id : null
    });

    let creditName = null;
    let creditTeam = null;
    if (attacker && attacker.id !== victim.id) {
      const creditUnit = attacker.ownerId
        ? (state.units.find(u => u.id === attacker.ownerId) || attacker)
        : attacker;
      creditUnit.kills += 1;
      creditName = creditUnit.name;
      creditTeam = creditUnit.team;
      // mastery +8 float for any killer in-match
      state.events.push({ type: 'mastery_gain', x: creditUnit.x, z: creditUnit.z, amount: 8, unitId: creditUnit.id });
      if (creditUnit.archetypeId === 'assassin' && creditUnit.hasLv7Talent) {
        creditUnit.reloadHasteTimer = 4.0;
      }
      if (creditUnit.isBot && !creditUnit.emoteTimer && state.tick % 3 === 0) {
        creditUnit.emoteId = 'bolt';
        creditUnit.emoteTimer = 2.2;
      }
    }

    // Revenge mark: if player died, killer becomes revenge target for 8s
    if (victim.isPlayer && attacker && attacker.id) {
      state.revengeTargetId = attacker.id;
      state.revengeTimer = 8.0;
      state.events.push({ type: 'revenge_mark', targetId: attacker.id, x: attacker.x, z: attacker.z });
    }
    // Player combo tracking: kills within 4.5s stack
    if (attacker && attacker.isPlayer) {
      const dtSince = state.timeSec - (state.playerLastKillTime || -99);
      if (dtSince <= 4.5) state.playerCombo = (state.playerCombo || 0) + 1;
      else state.playerCombo = 1;
      state.playerLastKillTime = state.timeSec;
      // streak/combo events for HUD
      const combo = state.playerCombo;
      if (combo === 1 && state.tick > 20) {
        // First Blood if first kill of match
        const totalKills = state.units.reduce((s,u)=>s+(u.kills||0),0);
        if (totalKills <= 1) state.events.push({ type: 'first_blood', killerId: attacker.id, x: attacker.x, z: attacker.z });
      }
      if (combo >= 2) state.events.push({ type: 'combo', count: combo, x: attacker.x, z: attacker.z });
      if (combo >= 3) state.events.push({ type: 'rampage', count: combo, x: attacker.x, z: attacker.z });
      // revenge payback bonus
      if (state.revengeTargetId && attacker.id === state.revengeTargetId && victim.id === state.revengeTargetId) {
        // not used – revenge is when player kills his killer; handle below alternative check
      }
      if (victim.id === state.revengeTargetId) {
        state.events.push({ type: 'revenge_payback', x: victim.x, z: victim.z });
        state.revengeTargetId = null;
        state.revengeTimer = 0;
        // small heal 6% to keep winrate 45-55
        if (attacker) attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(attacker.maxHp * 0.08));
      }
    }
    // Revenge check reverse: if killer was revenge target and victim killed is that target, attacker gets payback (also for bots)
    if (attacker && victim.id === state.revengeTargetId) {
      state.revengeTargetId = null;
      state.revengeTimer = 0;
    }

    if (victim.isSummon) return;

    if (state.killFeed && creditName) {
      state.killFeed.push({
        id: `kf_${state.tick}_${victim.id}`,
        killer: creditName,
        killerTeam: creditTeam,
        victim: victim.name,
        victimTeam: victim.team,
        timeSec: state.timeSec
      });
      if (state.killFeed.length > 4) state.killFeed.shift();
    }

    // Mode-specific knockout consequences
    if (state.modeId === 'crystal_rush' && victim.crystals > 0) {
      const dropped = victim.crystals;
      victim.crystals = 0;
      for (let i = 0; i < dropped; i++) {
        const ang = (i / dropped) * Math.PI * 2;
        state.groundItems.push({
          id: `it_drop_${state.tick}_${victim.id}_${i}`,
          kind: 'crystal',
          x: Physics.clamp(victim.x + Math.cos(ang) * 1.1, -9, 9),
          z: Physics.clamp(victim.z + Math.sin(ang) * 1.1, -12, 12)
        });
      }
    } else if (state.modeId === 'star_hunt') {
      if (attacker && attacker.team !== victim.team) {
        state.teamStars[attacker.team] = (state.teamStars[attacker.team] || 0) + (victim.bountyStars || 2);
        attacker.bountyStars = Math.min(7, (attacker.bountyStars || 2) + 1);
      }
      victim.bountyStars = 2;
    } else if (state.modeId === 'last_hero') {
      // Drop a power star on defeat; NO respawn in FFA!
      state.groundItems.push({
        id: `it_pstar_${state.tick}_${victim.id}`,
        kind: 'power_star',
        x: victim.x,
        z: victim.z
      });
      // Record placement if player was knocked out
      if (victim.isPlayer) {
        const aliveOthers = state.units.filter(u => u.alive && !u.isSummon).length;
        state.playerPlacement = aliveOthers + 1;
        state.finished = true;
        state.winnerTeam = state.playerPlacement <= 3 ? 0 : 1;
      }
      return;
    } else if (state.modeId === 'star_ball' && state.ball && state.ball.carrierId === victim.id) {
      state.ball.carrierId = null;
      state.ball.vx = state.rng.range(-2, 2);
      state.ball.vz = state.rng.range(-2, 2);
    } else if (state.modeId === 'boss_siege') {
      if (victim.isBoss) {
        state.finished = true;
        state.winnerTeam = 0;
        return;
      }
      if (victim.team === 0) {
        const aliveHeroes = state.units.filter(u => u.team === 0 && !u.isSummon && u.alive);
        if (aliveHeroes.length === 0) {
          state.finished = true;
          state.winnerTeam = 1;
          return;
        }
        victim.respawnTimer = 4.5;
        return;
      }
    }

    victim.respawnTimer = 3.0;
  }

  function firePrimaryWeapon(state, unit, aimAngle) {
    if (unit.ammo < 1.0 || unit.fireCooldown > 0 || !unit.alive) return;

    // Star Ball: kicking the ball with Fire!
    if (state.modeId === 'star_ball' && state.ball && state.ball.carrierId === unit.id) {
      state.ball.carrierId = null;
      state.ball.pickupIgnoreId = unit.id;
      state.ball.pickupIgnoreTimer = 0.55;
      state.ball.vx = Math.sin(aimAngle) * 15.5;
      state.ball.vz = Math.cos(aimAngle) * 15.5;
      unit.fireCooldown = 0.35;
      state.events.push({ type: 'shoot', x: unit.x, z: unit.z, unitId: unit.id });
      return;
    }

    const arch = state.gameData.balance.archetypes.find(a => a.id === unit.archetypeId);
    const lvMult = state.gameData.balance.levelCurve.find(c => c.level === unit.level).statMult;
    const w = arch.weapon;

    unit.ammo -= 1.0;
    unit.fireCooldown = 0.24;
    unit.rot = aimAngle;
    unit.revealedTimer = 1.1;
    unit.stealthTimer = 0;

    state.events.push({ type: 'shoot', x: unit.x, z: unit.z, unitId: unit.id, archetypeId: arch.id });

    // Assassin dash-slash lunges slightly forward
    if (w.pattern === 'dash_slash') {
      unit.x += Math.sin(aimAngle) * w.dashDist;
      unit.z += Math.cos(aimAngle) * w.dashDist;
      Physics.resolveUnitArenaCollisions(unit, unit.radius, state.map, state.barriers);
    }

    const count = w.projectiles || 1;
    let spread = w.spreadDeg || 0;
    let pSpeed = w.projSpeed || 20;
    if (arch.id === 'blaster' && unit.hasLv7Talent) {
      spread *= 0.82;
      pSpeed *= 1.12;
    }

    for (let i = 0; i < count; i++) {
      const frac = count === 1 ? 0 : (i / (count - 1) - 0.5);
      const ang = aimAngle + (frac * spread * Math.PI) / 180;
      let baseDmg = w.damagePerHit * lvMult;
      if (w.pattern === 'combo_flurry' && i === count - 1 && unit.hasLv7Talent) {
        baseDmg *= 1.25;
      }

      let splashRadius = w.splashRadius || 0;
      if ((arch.id === 'thrower' || arch.id === 'demolisher') && unit.hasLv7Talent && splashRadius > 0) {
        splashRadius *= 1.15;
      }

      state.projectiles.push({
        id: `p_${state.tick}_${unit.id}_${i}`,
        ownerId: unit.id,
        team: unit.team,
        pattern: w.pattern,
        x: unit.x + Math.sin(ang) * 0.7,
        z: unit.z + Math.cos(ang) * 0.7,
        prevX: unit.x,
        prevZ: unit.z,
        startX: unit.x,
        startZ: unit.z,
        vx: Math.sin(ang) * pSpeed,
        vz: Math.cos(ang) * pSpeed,
        speed: pSpeed,
        maxDist: w.range,
        traveled: 0,
        radius: w.projRadius || 0.35,
        damage: baseDmg,
        allyHeal: w.allyHealPerHit ? w.allyHealPerHit * lvMult * (unit.hasLv7Talent ? 1.20 : 1.0) : 0,
        minScale: w.minScale || 1,
        maxScale: (w.maxScale || 1) + (arch.id === 'sniper' && unit.hasLv7Talent ? 0.15 : 0),
        slowAmount: (w.slowAmount || 0) + (arch.id === 'controller' && unit.hasLv7Talent ? 0.10 : 0),
        slowSec: w.slowSec || 0,
        bouncesLeft: w.bounces || 0,
        bounced: false,
        bounceBonus: arch.id === 'trickster' && unit.hasLv7Talent ? 1.20 : 1.0,
        splashRadius,
        overWalls: Boolean(w.overWalls),
        pierce: false,
        isSuper: false,
        hitSet: {},
        color: unit.palette.primary
      });
    }
  }

  function castOverdrive(state, unit) {
    if (!unit.alive || (unit.overdriveCharge || 0) < 100) return false;
    unit.overdriveCharge = 0;
    unit.overdriveTimer = 5.0;
    state.events.push({ type: 'overdrive_cast', x: unit.x, z: unit.z, unitId: unit.id });
    state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: 3.6, color: '#E040FB' });
    if (unit.isPlayer) {
      state.playerOverdrivesUsed = (state.playerOverdrivesUsed || 0) + 1;
    }
    return true;
  }

  function castSuperAbility(state, unit, aimAngle) {
    if (unit.superCharge < 100 || !unit.alive) return;

    // Star Ball: Super-Kick launches blazing golden shot!
    if (state.modeId === 'star_ball' && state.ball && state.ball.carrierId === unit.id) {
      unit.superCharge = 0;
      state.ball.carrierId = null;
      state.ball.pickupIgnoreId = unit.id;
      state.ball.pickupIgnoreTimer = 0.6;
      const kickSpd = unit.overdriveTimer > 0 ? 27.5 : 23.5;
      state.ball.vx = Math.sin(aimAngle) * kickSpd;
      state.ball.vz = Math.cos(aimAngle) * kickSpd;
      state.events.push({ type: 'super_cast', x: unit.x, z: unit.z, unitId: unit.id, pattern: 'super_kick' });
      return;
    }

    const arch = state.gameData.balance.archetypes.find(a => a.id === unit.archetypeId);
    const lvMult = state.gameData.balance.levelCurve.find(c => c.level === unit.level).statMult;
    const s = arch.super;
    const od = unit.overdriveTimer > 0;

    unit.superCharge = 0;
    unit.rot = aimAngle;
    unit.revealedTimer = 1.2;
    state.events.push({ type: 'super_cast', x: unit.x, z: unit.z, unitId: unit.id, pattern: s.pattern, overdrive: od });
    // Arcade Toy: ульты ломают даже нерушимые блоки — разрушаем стены в радиусе ульты
    const destroyRadius = s.pattern === 'shockwave' ? (s.radius || 3.5) : (s.pattern === 'barrage' ? 2.8 : 4.2);
    destroyWallsInRadius(state, unit.x + Math.sin(aimAngle)*1.2, unit.z + Math.cos(aimAngle)*1.2, destroyRadius + (od?1.2:0));

    if (s.pattern === 'barrage') {
      const cnt = od ? 9 : (unit.hasLv9Super ? s.projectilesLv9 : s.projectiles);
      for (let i = 0; i < cnt; i++) {
        const frac = (i / (cnt - 1)) - 0.5;
        const ang = aimAngle + (frac * (od ? 26 : s.spreadDeg) * Math.PI) / 180;
        state.projectiles.push({
          id: `sp_${state.tick}_${unit.id}_${i}`,
          ownerId: unit.id,
          team: unit.team,
          pattern: 'barrage',
          x: unit.x + Math.sin(ang) * 0.75,
          z: unit.z + Math.cos(ang) * 0.75,
          prevX: unit.x,
          prevZ: unit.z,
          startX: unit.x,
          startZ: unit.z,
          vx: Math.sin(ang) * (od ? s.projSpeed * 1.15 : s.projSpeed),
          vz: Math.cos(ang) * (od ? s.projSpeed * 1.15 : s.projSpeed),
          speed: od ? s.projSpeed * 1.15 : s.projSpeed,
          maxDist: s.range,
          traveled: 0,
          radius: od ? 0.52 : 0.45,
          damage: s.damagePerHit * lvMult,
          allyHeal: 0,
          bouncesLeft: 0,
          splashRadius: 0,
          overWalls: false,
          pierce: true,
          isSuper: true,
          hitSet: {},
          color: od ? '#E040FB' : '#FFD54F'
        });
      }
    } else if (s.pattern === 'shockwave') {
      const rad = (unit.hasLv9Super ? s.radiusLv9 : s.radius) * (od ? 1.4 : 1.0);
      state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: rad, color: od ? '#E040FB' : (unit.palette.glow || '#FFD54F') });
      for (const other of state.units) {
        if (!other.alive || other.id === unit.id) continue;
        if (state.modeId !== 'last_hero' && other.team === unit.team) continue;
        const d = Physics.dist(unit.x, unit.z, other.x, other.z);
        if (d <= rad) {
          applyDamageToUnit(state, unit, other, s.damagePerHit * lvMult, true);
          if (d > 0.05) {
            other.x += ((other.x - unit.x) / d) * s.knockback;
            other.z += ((other.z - unit.z) / d) * s.knockback;
            Physics.resolveUnitArenaCollisions(other, other.radius, state.map, state.barriers);
          }
          if (od || (unit.hasLv9Super && s.stunSecLv9)) {
            other.stunTimer = Math.max(other.stunTimer, od ? 0.8 : s.stunSecLv9);
          }
        }
      }
    } else if (s.pattern === 'shield') {
      unit.shieldTimer = unit.hasLv9Super ? s.durationSecLv9 : s.durationSec;
      unit.shieldReduction = s.damageReduction;
      unit.shieldAuraDps = (unit.hasLv9Super || od) ? (s.auraDpsLv9 || 380) * lvMult : 0;
      if (od) {
        unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(900 * lvMult));
        state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: 3.6, color: '#E040FB' });
      }
    } else if (s.pattern === 'laser_beam') {
      const width = (unit.hasLv9Super ? s.widthLv9 : s.width) * (od ? 1.8 : 1.0);
      const dx = Math.sin(aimAngle);
      const dz = Math.cos(aimAngle);
      const endX = unit.x + dx * s.range;
      const endZ = unit.z + dz * s.range;
      state.events.push({ type: 'laser_beam', x1: unit.x, z1: unit.z, x2: endX, z2: endZ, width, color: od ? '#E040FB' : '#FFF176' });
      for (const other of state.units) {
        if (!other.alive || other.id === unit.id) continue;
        if (state.modeId !== 'last_hero' && other.team === unit.team) continue;
        // Point-to-segment distance
        const vx = other.x - unit.x;
        const vz = other.z - unit.z;
        const proj = Physics.clamp(vx * dx + vz * dz, 0, s.range);
        const cx = unit.x + dx * proj;
        const cz = unit.z + dz * proj;
        if (Physics.dist(other.x, other.z, cx, cz) <= width * 0.5 + other.radius) {
          applyDamageToUnit(state, unit, other, s.damagePerHit * lvMult * (od ? 1.35 : 1.0), true);
          if (od || (unit.hasLv9Super && s.slowLv9)) {
            other.slowTimer = 2.0;
            other.slowAmount = s.slowLv9 || 0.30;
          }
        }
      }
    } else if (s.pattern === 'heal_zone') {
      state.zones.push({
        id: `z_heal_${state.tick}_${unit.id}`,
        kind: 'heal',
        ownerId: unit.id,
        team: unit.team,
        x: unit.x,
        z: unit.z,
        radius: od ? s.radius * 1.25 : s.radius,
        timer: s.durationSec,
        healPerSec: s.healPerSec * lvMult * (unit.hasLv7Talent ? 1.20 : 1.0) * (od ? 1.40 : 1.0),
        speedBoost: unit.hasLv9Super ? s.speedBoostLv9 : 0
      });
      if (od) {
        for (const ally of state.units) {
          if (ally.alive && ally.team === unit.team && Physics.dist(unit.x, unit.z, ally.x, ally.z) <= s.radius * 1.25) {
            ally.shieldTimer = Math.max(ally.shieldTimer, 2.5);
            ally.shieldReduction = Math.max(ally.shieldReduction, 0.30);
          }
        }
      }
    } else if (s.pattern === 'hazard_zone') {
      const rad = (unit.hasLv9Super ? s.radiusLv9 : s.radius) * (od ? 1.35 : 1.0);
      const tx = Physics.clamp(unit.x + Math.sin(aimAngle) * 6.5, -state.map.width * 0.45, state.map.width * 0.45);
      const tz = Physics.clamp(unit.z + Math.cos(aimAngle) * 6.5, -state.map.height * 0.45, state.map.height * 0.45);
      state.zones.push({
        id: `z_haz_${state.tick}_${unit.id}`,
        kind: 'hazard',
        ownerId: unit.id,
        team: unit.team,
        x: tx,
        z: tz,
        radius: rad,
        timer: s.durationSec,
        dps: s.dps * lvMult * (od ? 1.30 : 1.0),
        slowAmount: (unit.hasLv9Super || od) ? (s.slowLv9 || 0.25) : 0
      });
    } else if (s.pattern === 'blink_strike') {
      // Teleport behind nearest enemy along aim direction or ahead
      let destX = unit.x + Math.sin(aimAngle) * 6.5;
      let destZ = unit.z + Math.cos(aimAngle) * 6.5;
      for (const other of state.units) {
        if (!other.alive || other.id === unit.id) continue;
        if (state.modeId !== 'last_hero' && other.team === unit.team) continue;
        if (Physics.dist(unit.x, unit.z, other.x, other.z) <= s.range) {
          destX = other.x + Math.sin(aimAngle) * 1.1;
          destZ = other.z + Math.cos(aimAngle) * 1.1;
          break;
        }
      }
      unit.x = destX;
      unit.z = destZ;
      Physics.resolveUnitArenaCollisions(unit, unit.radius, state.map, state.barriers);
      if (unit.hasLv9Super && s.shieldLv9) {
        unit.shieldTimer = s.shieldSecLv9;
        unit.shieldReduction = s.shieldLv9;
      }
      if (od) {
        unit.superCharge = 50;
      }
      for (const other of state.units) {
        if (!other.alive || other.id === unit.id) continue;
        if (state.modeId !== 'last_hero' && other.team === unit.team) continue;
        if (Physics.dist(unit.x, unit.z, other.x, other.z) <= (od ? 3.5 : 2.6)) {
          applyDamageToUnit(state, unit, other, s.damagePerHit * lvMult, true);
        }
      }
    } else if (s.pattern === 'wall_barrier') {
      const wWidth = (unit.hasLv9Super ? s.widthLv9 : s.width) * (od ? 1.35 : 1.0);
      const bx = Physics.clamp(unit.x + Math.sin(aimAngle) * 4.2, -state.map.width * 0.42, state.map.width * 0.42);
      const bz = Physics.clamp(unit.z + Math.cos(aimAngle) * 4.2, -state.map.height * 0.42, state.map.height * 0.42);
      const horizontal = Math.abs(Math.cos(aimAngle)) >= Math.abs(Math.sin(aimAngle));
      state.barriers.push({
        id: `bar_${state.tick}_${unit.id}`,
        team: unit.team,
        x: bx,
        z: bz,
        w: horizontal ? wWidth : 1.1,
        d: horizontal ? 1.1 : wWidth,
        timer: s.durationSec
      });
      if (od || (unit.hasLv9Super && s.spawnDamageLv9)) {
        for (const other of state.units) {
          if (!other.alive || other.id === unit.id || other.team === unit.team) continue;
          if (Physics.dist(bx, bz, other.x, other.z) <= (od ? 4.2 : 3.0)) {
            applyDamageToUnit(state, unit, other, (s.spawnDamageLv9 || 650) * lvMult, true);
            if (od) {
              other.x = Physics.clamp(other.x + (bx - other.x) * 0.35, -state.map.width * 0.45, state.map.width * 0.45);
              other.z = Physics.clamp(other.z + (bz - other.z) * 0.35, -state.map.height * 0.45, state.map.height * 0.45);
            }
          }
        }
      }
    } else if (s.pattern === 'summon_drones') {
      const cnt = unit.hasLv9Super ? s.countLv9 : s.count;
      const heroDef = state.gameData.heroes.find(h => h.id === unit.heroId) || state.gameData.heroes[0];
      for (let i = 0; i < cnt; i++) {
        const ang = aimAngle + (i - (cnt - 1) * 0.5) * 1.1;
        const drone = buildUnit({
          id: `drone_${state.tick}_${unit.id}_${i}`,
          slotIndex: 10 + i,
          name: od ? (state.lang === 'ru' ? 'Омега-дрон' : 'Omega Drone') : (state.lang === 'ru' ? 'Дрон' : 'Drone'),
          team: unit.team,
          isPlayer: false,
          isBot: true,
          isSummon: true,
          ownerId: unit.id,
          hero: heroDef,
          skin: null,
          level: unit.level,
          x: unit.x + Math.sin(ang) * 1.5,
          z: unit.z + Math.cos(ang) * 1.5,
          rot: aimAngle,
          personality: 'aggressor',
          gameData: state.gameData
        });
        const servoMult = (unit.hasLv7Talent ? 1.35 : 1.0) * (od ? 1.60 : 1.0);
        drone.maxHp = Math.round(s.droneHp * lvMult * servoMult);
        drone.hp = drone.maxHp;
        drone.summonLifeTimer = s.durationSec * (unit.hasLv7Talent ? 1.35 : 1.0);
        drone.weaponRange = od ? 9.4 : 7.2;
        state.units.push(drone);
      }
    } else if (s.pattern === 'uppercut_leap') {
      const leapDist = unit.hasLv9Super ? s.rangeLv9 : s.range;
      unit.x += Math.sin(aimAngle) * leapDist;
      unit.z += Math.cos(aimAngle) * leapDist;
      Physics.resolveUnitArenaCollisions(unit, unit.radius, state.map, state.barriers);
      if (od) unit.ammo = unit.maxAmmo;
      state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: s.radius, color: od ? '#E040FB' : '#FFD54F' });
      for (const other of state.units) {
        if (!other.alive || other.id === unit.id) continue;
        if (state.modeId !== 'last_hero' && other.team === unit.team) continue;
        if (Physics.dist(unit.x, unit.z, other.x, other.z) <= s.radius) {
          applyDamageToUnit(state, unit, other, s.damagePerHit * lvMult, true);
          other.knockupTimer = s.knockupSec;
          other.stunTimer = Math.max(other.stunTimer, od ? 1.0 : s.knockupSec * 0.6);
        }
      }
    } else if (s.pattern === 'decoy_clone') {
      unit.stealthTimer = s.stealthSec;
      const cnt = (unit.hasLv9Super ? s.countLv9 : s.count) + (od ? 1 : 0);
      const heroDef = state.gameData.heroes.find(h => h.id === unit.heroId) || state.gameData.heroes[0];
      for (let i = 0; i < cnt; i++) {
        const clone = buildUnit({
          id: `clone_${state.tick}_${unit.id}_${i}`,
          slotIndex: 20 + i,
          name: unit.name,
          team: unit.team,
          isPlayer: false,
          isBot: true,
          isSummon: true,
          ownerId: unit.id,
          hero: heroDef,
          skin: null,
          level: unit.level,
          x: unit.x + (i === 0 ? 1.1 : (i === 1 ? -1.1 : 0)),
          z: unit.z + (i === 2 ? 1.1 : 0),
          rot: aimAngle,
          personality: 'aggressor',
          gameData: state.gameData
        });
        clone.maxHp = Math.round(s.cloneHp * lvMult);
        clone.hp = clone.maxHp;
        clone.summonLifeTimer = s.durationSec;
        clone.popDamageOnExpire = s.popDamage * lvMult;
        state.units.push(clone);
      }
    } else if (s.pattern === 'minefield') {
      const cnt = od ? 8 : (unit.hasLv9Super ? s.minesLv9 : s.mines);
      const cx = Physics.clamp(unit.x + Math.sin(aimAngle) * 5.0, -state.map.width * 0.42, state.map.width * 0.42);
      const cz = Physics.clamp(unit.z + Math.cos(aimAngle) * 5.0, -state.map.height * 0.42, state.map.height * 0.42);
      for (let i = 0; i < cnt; i++) {
        const ang = (i / cnt) * Math.PI * 2;
        state.zones.push({
          id: `z_mine_${state.tick}_${unit.id}_${i}`,
          kind: 'mine',
          ownerId: unit.id,
          team: unit.team,
          x: Physics.clamp(cx + Math.cos(ang) * 1.9, -state.map.width * 0.45, state.map.width * 0.45),
          z: Physics.clamp(cz + Math.sin(ang) * 1.9, -state.map.height * 0.45, state.map.height * 0.45),
          radius: s.triggerRadius,
          armTimer: 0.65,
          timer: s.durationSec,
          damage: s.mineDamage * lvMult * (od ? 1.2 : 1.0)
        });
      }
    }
  }

  function castGadgetAbility(state, unit, aimAngle) {
    if (!unit.alive || unit.gadgetCharges <= 0 || unit.gadgetCooldown > 0) return false;
    unit.gadgetCharges -= 1;
    unit.gadgetCooldown = 6.5;
    const archId = unit.archetypeId;
    const lvEntry = state.gameData.balance.levelCurve.find(c => c.level === unit.level) || { statMult: 1 };
    const lvMult = lvEntry.statMult;

    state.events.push({ type: 'gadget_cast', x: unit.x, z: unit.z, unitId: unit.id, archetypeId: archId });

    if (archId === 'blaster') {
      unit.ammo = Math.min(unit.maxAmmo, unit.ammo + 2.0);
      unit.speedBoostTimer = 2.5;
      unit.speedBoostAmount = 0.22;
    } else if (archId === 'shotgun') {
      unit.x += Math.sin(aimAngle) * 3.8;
      unit.z += Math.cos(aimAngle) * 3.8;
      Physics.resolveUnitArenaCollisions(unit, unit.radius, state.map, state.barriers);
      unit.shieldTimer = 2.0;
      unit.shieldReduction = 0.30;
    } else if (archId === 'tank') {
      unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(1250 * lvMult));
      state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: 3.4, color: '#40C4FF' });
      for (const o of state.units) {
        if (!o.alive || o.id === unit.id || (state.modeId !== 'last_hero' && o.team === unit.team)) continue;
        const d = Physics.dist(unit.x, unit.z, o.x, o.z);
        if (d <= 3.4) {
          const ang = Math.atan2(o.x - unit.x, o.z - unit.z);
          o.x += Math.sin(ang) * 2.4;
          o.z += Math.cos(ang) * 2.4;
          Physics.resolveUnitArenaCollisions(o, o.radius, state.map, state.barriers);
        }
      }
    } else if (archId === 'sniper') {
      unit.speedBoostTimer = 3.0;
      unit.speedBoostAmount = 0.25;
      state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: 8.5, color: '#00E5FF' });
      for (const o of state.units) {
        if (!o.alive || o.team === unit.team) continue;
        if (Physics.dist(unit.x, unit.z, o.x, o.z) <= 9.0) {
          o.revealedTimer = 3.5;
        }
      }
    } else if (archId === 'healer') {
      const healAmt = Math.round(900 * lvMult);
      state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: 4.5, color: '#00E676' });
      for (const ally of state.units) {
        if (!ally.alive || (state.modeId !== 'last_hero' && ally.team !== unit.team) || (state.modeId === 'last_hero' && ally.id !== unit.id)) continue;
        if (Physics.dist(unit.x, unit.z, ally.x, ally.z) <= 4.6) {
          ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
        }
      }
    } else if (archId === 'thrower') {
      state.zones.push({
        id: `z_gmine_${state.tick}_${unit.id}`,
        kind: 'mine',
        ownerId: unit.id,
        team: unit.team,
        x: unit.x,
        z: unit.z,
        radius: 1.9,
        armTimer: 0.4,
        timer: 10.0,
        damage: 850 * lvMult
      });
      unit.speedBoostTimer = 2.0;
      unit.speedBoostAmount = 0.24;
    } else if (archId === 'assassin') {
      unit.stealthTimer = 1.8;
      unit.slowTimer = 0;
      unit.slowAmount = 0;
      unit.speedBoostTimer = 1.8;
      unit.speedBoostAmount = 0.20;
    } else if (archId === 'controller') {
      state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: 4.6, color: '#80D8FF' });
      for (const o of state.units) {
        if (!o.alive || o.id === unit.id || (state.modeId !== 'last_hero' && o.team === unit.team)) continue;
        if (Physics.dist(unit.x, unit.z, o.x, o.z) <= 4.6) {
          o.slowTimer = 2.5;
          o.slowAmount = 0.35;
        }
      }
    } else if (archId === 'summoner') {
      unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(450 * lvMult));
      const baseHero = state.gameData.heroes.find(h => h.id === unit.heroId) || state.gameData.heroes[0];
      const drone = buildUnit({
        id: `gdrone_${state.tick}_${unit.id}`,
        slotIndex: 12,
        name: state.lang === 'ru' ? 'Мини-дрон' : 'Mini-Drone',
        team: unit.team,
        isPlayer: false,
        isBot: true,
        isSummon: true,
        ownerId: unit.id,
        hero: baseHero,
        skin: null,
        level: unit.level,
        x: unit.x + Math.sin(aimAngle) * 1.4,
        z: unit.z + Math.cos(aimAngle) * 1.4,
        rot: aimAngle,
        gameData: state.gameData
      });
      drone.maxHp = Math.round(1350 * lvMult);
      drone.hp = drone.maxHp;
      drone.summonLifeTimer = 9.0;
      state.units.push(drone);
    } else if (archId === 'fighter') {
      unit.superCharge = Math.min(100, unit.superCharge + 35);
      unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(650 * lvMult));
      state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: 2.8, color: '#FFD54F' });
    } else if (archId === 'trickster') {
      unit.x += Math.sin(aimAngle) * 3.8;
      unit.z += Math.cos(aimAngle) * 3.8;
      Physics.resolveUnitArenaCollisions(unit, unit.radius, state.map, state.barriers);
      unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(550 * lvMult));
      state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: 2.2, color: '#EA80FC' });
    } else {
      // demolisher
      state.events.push({ type: 'shockwave', x: unit.x, z: unit.z, radius: 3.0, color: '#FF9100' });
      for (const o of state.units) {
        if (!o.alive || o.id === unit.id || (state.modeId !== 'last_hero' && o.team === unit.team)) continue;
        if (Physics.dist(unit.x, unit.z, o.x, o.z) <= 3.0) {
          applyDamageToUnit(state, unit, o, 680 * lvMult, true);
        }
      }
      unit.knockupTimer = 0.45;
      unit.x += Math.sin(aimAngle) * 3.6;
      unit.z += Math.cos(aimAngle) * 3.6;
      Physics.resolveUnitArenaCollisions(unit, unit.radius, state.map, state.barriers);
    }
    return true;
  }

  /**
   * Advances simulation by 1 fixed 20Hz tick (dt = 0.05s)
   * playerInput: { moveX, moveZ, fire, superCast, gadgetCast, emoteId, manualAimAngle } or null (if benchmark AI drives player)
   */
  function stepMatchTick(state, playerInput, benchmarkPlayerBot = false) {
    if (state.finished) return state;

    const dt = FIXED_DT;
    state.tick += 1;
    state.timeSec = +(state.tick * dt).toFixed(3);
    state.events.length = 0;
    // Global battle juice timers
    if (state.revengeTimer > 0) {
      state.revengeTimer -= dt;
      if (state.revengeTimer <= 0) { state.revengeTimer = 0; state.revengeTargetId = null; }
    }
    if ((state.playerCombo || 0) > 0 && state.timeSec - (state.playerLastKillTime || 0) > 4.6) {
      state.playerCombo = 0;
    }
    if (!state.isFrenzy && state.maxTimeSec - state.timeSec <= 15.0 && state.timeSec > 5) {
      state.isFrenzy = true;
      state.frenzyAt = state.timeSec;
      state.events.push({ type: 'frenzy_start', x: 0, z: 0 });
    }
    if (state.comebackTimer !== undefined) state.comebackTimer -= dt;

    // Tutorial & Practice Cave state machines
    if (state.modeId === 'tutorial') {
      stepTutorialLogic(state, playerInput, dt);
      return state;
    }
    if (state.modeId === 'practice') {
      stepPracticeLogic(state, playerInput, dt);
      return state;
    }

    const brackets = state.gameData.balance.botBrackets;
    const enemyBracket = brackets[state.bracketInfo.enemyIdx];
    const allyBracket = brackets[state.bracketInfo.allyIdx];

    // 1. Snapshot prev transforms for smooth render interpolation & update units
    for (let i = state.units.length - 1; i >= 0; i--) {
      const u = state.units[i];
      u.prevX = u.x;
      u.prevZ = u.z;
      u.prevRot = u.rot;

      if (!u.alive) {
        if (u.isSummon) {
          state.units.splice(i, 1);
          continue;
        }
        if (state.modeId !== 'last_hero') {
          u.respawnTimer -= dt;
          if (u.respawnTimer <= 0) {
            const spawns = u.team === 0 ? state.map.spawnsTeam0 : state.map.spawnsTeam1;
            const sp = spawns[u.slotIndex % spawns.length];
            u.x = sp.x;
            u.z = sp.z;
            u.prevX = sp.x;
            u.prevZ = sp.z;
            u.hp = u.maxHp;
            u.ammo = u.maxAmmo;
            u.alive = true;
            u.invulnTimer = 1.6;
            u.dotTimer = 0;
            u.slowTimer = 0;
            u.stunTimer = 0;
          }
        }
        continue;
      }

      // Summon lifetime expiry
      if (u.isSummon) {
        u.summonLifeTimer -= dt;
        if (u.summonLifeTimer <= 0) {
          if (u.popDamageOnExpire > 0) {
            const owner = state.units.find(x => x.id === u.ownerId) || u;
            state.events.push({ type: 'shockwave', x: u.x, z: u.z, radius: 2.6, color: '#EA80FC' });
            for (const other of state.units) {
              if (!other.alive || other.team === u.team) continue;
              if (Physics.dist(u.x, u.z, other.x, other.z) <= 2.6) {
                applyDamageToUnit(state, owner, other, u.popDamageOnExpire, true);
              }
            }
          }
          state.units.splice(i, 1);
          continue;
        }
      }

      // Status timers
      if (u.invulnTimer > 0) u.invulnTimer -= dt;
      if (u.revealedTimer > 0) u.revealedTimer -= dt;
      if (u.stealthTimer > 0) u.stealthTimer -= dt;
      if (u.hitFlashTimer > 0) u.hitFlashTimer -= dt;
      if (u.fireCooldown > 0) u.fireCooldown -= dt;
      if (u.gadgetCooldown > 0) u.gadgetCooldown -= dt;
      if (u.emoteTimer > 0) {
        u.emoteTimer -= dt;
        if (u.emoteTimer <= 0) u.emoteId = null;
      }
      if (u.knockupTimer > 0) u.knockupTimer -= dt;
      if (u.reloadHasteTimer > 0) u.reloadHasteTimer -= dt;

      if (u.shieldTimer > 0) {
        u.shieldTimer -= dt;
        if (u.shieldAuraDps > 0 && state.tick % 5 === 0) {
          for (const other of state.units) {
            if (!other.alive || other.team === u.team) continue;
            if (Physics.dist(u.x, u.z, other.x, other.z) <= 3.4) {
              applyDamageToUnit(state, u, other, u.shieldAuraDps * 0.25, true);
            }
          }
        }
      }
      if (u.slowTimer > 0) {
        u.slowTimer -= dt;
        if (u.slowTimer <= 0) u.slowAmount = 0;
      }
      if (u.speedBoostTimer > 0) {
        u.speedBoostTimer -= dt;
        if (u.speedBoostTimer <= 0) u.speedBoostAmount = 0;
      }
      if (u.overdriveTimer > 0) u.overdriveTimer -= dt;
      if (u.energyTimer > 0) u.energyTimer -= dt;
      if (u.teleportCd > 0) u.teleportCd -= dt;

      // Airborne arc from Spring Jump-Pad (flies smoothly over walls!)
      if (u.airborneTimer > 0) {
        u.airborneTimer = Math.max(0, u.airborneTimer - dt);
        const prog = 1 - u.airborneTimer / Math.max(0.01, u.airborneDuration || 0.6);
        u.x = u.airborneStartX + (u.airborneDestX - u.airborneStartX) * prog;
        u.z = u.airborneStartZ + (u.airborneDestZ - u.airborneStartZ) * prog;
        u.invulnTimer = Math.max(u.invulnTimer, 0.08);
        if (u.airborneTimer === 0) {
          Physics.resolveUnitArenaCollisions(u, u.radius, state.map, state.barriers);
        }
        continue;
      }

      if (u.dotTimer > 0) {
        u.dotTimer -= dt;
        if (state.tick % 5 === 0) {
          const src = state.units.find(x => x.id === u.dotSourceId) || null;
          applyDamageToUnit(state, src, u, u.dotDps * 0.25, true);
          if (!u.alive) continue;
        }
      }

      // Dedicated Mega-Titan Boss AI in Boss Siege mode
      if (u.isBoss) {
        stepBossUnit(state, u, dt);
        continue;
      }

      // Ammo reload & Out-of-Combat Regeneration (+ Nature element bonus!)
      const reloadRate = (1.0 / u.reloadSec) * (u.reloadHasteTimer > 0 ? 1.20 : 1.0);
      u.ammo = Math.min(u.maxAmmo, u.ammo + reloadRate * dt);

      u.outOfCombatTimer += dt;
      if (!u.isSummon && u.hp < u.maxHp) {
        if (u.elementId === 'nature' && u.outOfCombatTimer >= 3.0) {
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02 * dt);
        }
        if (u.outOfCombatTimer >= 3.5) {
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.11 * dt);
        }
      }

      // Stun check
      if (u.stunTimer > 0) {
        u.stunTimer -= dt;
        u.vx = 0;
        u.vz = 0;
        continue;
      }

      // Gather control input (Player vs Benchmark Bot vs Ally/Enemy Bot)
      let cmd;
      if (u.isPlayer) {
        if (benchmarkPlayerBot) {
          cmd = BotAI.computeMidPlayerBenchmarkInput(u, state, state.bracketInfo.enemyIdx, state.gameData.balance, dt, state.rng);
        } else {
          const pi = playerInput || { moveX: 0, moveZ: 0, fire: false, superCast: false, manualAimAngle: null };
          let aimAngle = u.rot;
          if (typeof pi.manualAimAngle === 'number') {
            aimAngle = pi.manualAimAngle;
          } else if (pi.fire || pi.superCast) {
            aimAngle = computeAutoAimAngle(u, state, state.gameData.balance.autoAimConeDeg || 25, true).angle;
          } else if (Math.hypot(pi.moveX || 0, pi.moveZ || 0) > 0.1) {
            aimAngle = Math.atan2(pi.moveX, pi.moveZ);
          }
          cmd = {
            moveX: pi.moveX || 0,
            moveZ: pi.moveZ || 0,
            fire: Boolean(pi.fire),
            superCast: Boolean(pi.superCast),
            gadgetCast: Boolean(pi.gadgetCast),
            overdriveCast: Boolean(pi.overdriveCast),
            emoteId: pi.emoteId || null,
            aimAngle
          };
        }
      } else {
        const bCfg = (state.modeId !== 'last_hero' && u.team === 0) ? allyBracket : enemyBracket;
        cmd = BotAI.computeBotInput(u, state, bCfg, dt, state.rng);
        if (u.overdriveCharge >= 100 && state.rng.next() < bCfg.superUseChance + 0.15) {
          cmd.overdriveCast = true;
        }
      }

      if (cmd.emoteId) {
        u.emoteId = cmd.emoteId;
        u.emoteTimer = 2.5;
      }

      // Movement
      const mLen = Math.hypot(cmd.moveX, cmd.moveZ);
      let speedMult = 1.0
        - (u.slowTimer > 0 ? u.slowAmount : 0)
        + (u.speedBoostTimer > 0 ? u.speedBoostAmount : 0)
        + (u.overdriveTimer > 0 ? 0.22 : 0)
        + (u.energyTimer > 0 ? 0.22 : 0)
        + (state.isFrenzy ? 0.12 : 0);
      speedMult = Physics.clamp(speedMult, 0.45, 1.65);
      if (mLen > 0.04) {
        const nx = cmd.moveX / Math.max(1, mLen);
        const nz = cmd.moveZ / Math.max(1, mLen);
        const effSpeed = u.baseMoveSpeed * speedMult;
        u.vx = nx * effSpeed;
        u.vz = nz * effSpeed;
        u.x += u.vx * dt;
        u.z += u.vz * dt;
        Physics.resolveUnitArenaCollisions(u, u.radius, state.map, state.barriers);
        if (!cmd.fire && !cmd.superCast) {
          u.rot = Math.atan2(nx, nz);
        }
      } else {
        u.vx = 0;
        u.vz = 0;
      }

      u.inBush = Physics.isInsideBush(u.x, u.z, state.bushes || state.map.bushes);

      // Combat actions
      if (cmd.overdriveCast && u.overdriveCharge >= 100) {
        castOverdrive(state, u);
      }
      if (cmd.gadgetCast && u.gadgetCharges > 0 && u.gadgetCooldown <= 0) {
        castGadgetAbility(state, u, cmd.aimAngle);
      }
      if (cmd.superCast && u.superCharge >= 100) {
        u.rot = cmd.aimAngle;
        castSuperAbility(state, u, cmd.aimAngle);
        if (u.isPlayer) state.playerSupersUsed = (state.playerSupersUsed || 0) + 1;
      } else if (cmd.fire) {
        u.rot = cmd.aimAngle;
        firePrimaryWeapon(state, u, cmd.aimAngle);
      }
    }

    // 1.5. Interactive Arena Objects (Jump Pads, Teleporters, Barrels, Modifiers & Meteors)
    stepArenaInteractables(state, dt);

    // 2. Update Dynamic Barriers
    for (let i = state.barriers.length - 1; i >= 0; i--) {
      state.barriers[i].timer -= dt;
      if (state.barriers[i].timer <= 0) state.barriers.splice(i, 1);
    }
    if (state.destroyedWalls) updateDestroyedWalls(state, dt);

    // 3. Update Zones (Healing, Hazard Pools, Proximity Mines)
    for (let i = state.zones.length - 1; i >= 0; i--) {
      const z = state.zones[i];
      z.timer -= dt;
      if (z.armTimer > 0) z.armTimer -= dt;
      const owner = state.units.find(u => u.id === z.ownerId) || null;

      if (z.kind === 'heal') {
        for (const u of state.units) {
          if (!u.alive || (state.modeId !== 'last_hero' && u.team !== z.team) || (state.modeId === 'last_hero' && u.id !== z.ownerId)) continue;
          if (Physics.dist(z.x, z.z, u.x, u.z) <= z.radius) {
            u.hp = Math.min(u.maxHp, u.hp + z.healPerSec * dt);
            if (z.speedBoost > 0) {
              u.speedBoostTimer = Math.max(u.speedBoostTimer, 0.25);
              u.speedBoostAmount = Math.max(u.speedBoostAmount, z.speedBoost);
            }
          }
        }
      } else if (z.kind === 'hazard' && state.tick % 5 === 0) {
        for (const u of state.units) {
          if (!u.alive || (state.modeId !== 'last_hero' && u.team === z.team) || u.id === z.ownerId) continue;
          if (Physics.dist(z.x, z.z, u.x, u.z) <= z.radius) {
            applyDamageToUnit(state, owner, u, z.dps * 0.25, true);
            if (z.slowAmount > 0 && u.alive) {
              u.slowTimer = Math.max(u.slowTimer, 0.4);
              u.slowAmount = Math.max(u.slowAmount, z.slowAmount);
            }
          }
        }
      } else if (z.kind === 'mine' && z.armTimer <= 0) {
        let triggered = false;
        for (const u of state.units) {
          if (!u.alive || (state.modeId !== 'last_hero' && u.team === z.team) || u.id === z.ownerId) continue;
          if (Physics.dist(z.x, z.z, u.x, u.z) <= z.radius) {
            triggered = true;
            break;
          }
        }
        if (triggered) {
          state.events.push({ type: 'shockwave', x: z.x, z: z.z, radius: z.radius + 0.8, color: '#FF7043' });
          for (const u of state.units) {
            if (!u.alive || (state.modeId !== 'last_hero' && u.team === z.team) || u.id === z.ownerId) continue;
            if (Physics.dist(z.x, z.z, u.x, u.z) <= z.radius + 0.8) {
              applyDamageToUnit(state, owner, u, z.damage, true);
            }
          }
          state.zones.splice(i, 1);
          continue;
        }
      }

      if (z.timer <= 0) state.zones.splice(i, 1);
    }

    // 4. Update Projectiles
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.prevX = p.x;
      p.prevZ = p.z;
      const stepDist = p.speed * dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.traveled += stepDist;

      const owner = state.units.find(u => u.id === p.ownerId) || null;
      let removeProj = false;

      // Arena bounds check
      if (Math.abs(p.x) > state.map.width * 0.5 || Math.abs(p.z) > state.map.height * 0.5) {
        removeProj = true;
      }

      // Wall hit / Ricochet check (lobbed projectiles fly over walls until landing!)
      if (!removeProj && !p.overWalls) {
        const hitW = Physics.pointHitsWall(p.x, p.z, p.radius * 0.5, state.map.walls, state.barriers);
        if (hitW) {
          if (p.bouncesLeft > 0) {
            p.bouncesLeft -= 1;
            p.bounced = true;
            const dxW = Math.abs(p.x - hitW.x) / (hitW.w * 0.5);
            const dzW = Math.abs(p.z - hitW.z) / (hitW.d * 0.5);
            if (dxW > dzW) p.vx = -p.vx;
            else p.vz = -p.vz;
            p.x = p.prevX + p.vx * dt;
            p.z = p.prevZ + p.vz * dt;
          } else {
            removeProj = true;
          }
        }
      }

      // Unit & Ally collision (skip mid-air lobbed flasks until near impact!)
      if (!removeProj && (!p.overWalls || p.traveled >= p.maxDist * 0.82)) {
        // Healer harmonic wave heals touched allies
        if (p.allyHeal > 0) {
          for (const ally of state.units) {
            if (!ally.alive || ally.id === p.ownerId || ally.team !== p.team || p.hitSet[ally.id]) continue;
            if (Physics.dist(p.x, p.z, ally.x, ally.z) <= p.radius + ally.radius) {
              p.hitSet[ally.id] = true;
              ally.hp = Math.min(ally.maxHp, ally.hp + Math.round(p.allyHeal));
              state.events.push({ type: 'heal_pulse', x: ally.x, z: ally.z });
            }
          }
        }

        // Enemy units
        for (const target of state.units) {
          if (!target.alive || target.id === p.ownerId || p.hitSet[target.id]) continue;
          if (state.modeId !== 'last_hero' && target.team === p.team) continue;
          if (Physics.dist(p.x, p.z, target.x, target.z) <= p.radius + target.radius) {
            p.hitSet[target.id] = true;
            if (p.splashRadius > 0) {
              detonateSplashProjectile(state, p, owner);
              removeProj = true;
              break;
            } else {
              let dmg = p.damage;
              if (p.pattern === 'sniper_scale') {
                const ratio = Physics.clamp(p.traveled / p.maxDist, 0, 1);
                dmg *= p.minScale + (p.maxScale - p.minScale) * ratio;
              }
              if (p.bounced && p.bounceBonus > 1) {
                dmg *= p.bounceBonus;
              }
              applyDamageToUnit(state, owner, target, dmg, p.isSuper);
              if (p.slowAmount > 0 && target.alive) {
                target.slowTimer = Math.max(target.slowTimer, p.slowSec);
                target.slowAmount = Math.max(target.slowAmount, p.slowAmount);
              }
              if (!p.pierce) {
                removeProj = true;
                break;
              }
            }
          }
        }

        // Vault Breach safes
        if (!removeProj && state.vaults) {
          for (const v of state.vaults) {
            if (v.hp <= 0 || v.team === p.team || p.hitSet[v.id]) continue;
            if (Physics.dist(p.x, p.z, v.x, v.z) <= p.radius + v.radius) {
              p.hitSet[v.id] = true;
              const vDmg = Math.round(p.damage);
              v.hp = Math.max(0, v.hp - vDmg);
              state.events.push({ type: 'pop_hit', x: v.x, z: v.z, amount: vDmg, targetId: v.id });
              if (!p.pierce) removeProj = true;
              break;
            }
          }
        }

        // FFA Power Crates
        if (!removeProj && state.crates.length > 0) {
          for (const c of state.crates) {
            if (c.hp <= 0 || p.hitSet[c.id]) continue;
            if (Physics.dist(p.x, p.z, c.x, c.z) <= p.radius + c.radius) {
              p.hitSet[c.id] = true;
              c.hp -= Math.round(p.damage);
              state.events.push({ type: 'pop_hit', x: c.x, z: c.z, amount: Math.round(p.damage) });
              if (c.hp <= 0) {
                state.groundItems.push({ id: `it_crate_${state.tick}_${c.id}`, kind: 'power_star', x: c.x, z: c.z });
              }
              if (!p.pierce) removeProj = true;
              break;
            }
          }
        }

        // Explosive Plasma Barrels
        if (!removeProj && state.barrels && state.barrels.length > 0) {
          for (const br of state.barrels) {
            if (br.hp <= 0 || p.hitSet[br.id]) continue;
            if (Physics.dist(p.x, p.z, br.x, br.z) <= p.radius + br.radius) {
              p.hitSet[br.id] = true;
              br.hp -= Math.round(p.damage);
              state.events.push({ type: 'pop_hit', x: br.x, z: br.z, amount: Math.round(p.damage) });
              if (br.hp <= 0) {
                detonateBarrel(state, br, owner);
              }
              if (!p.pierce) removeProj = true;
              break;
            }
          }
        }
      }

      if (!removeProj && p.traveled >= p.maxDist) {
        if (p.splashRadius > 0) {
          detonateSplashProjectile(state, p, owner);
        }
        removeProj = true;
      }

      if (removeProj) {
        state.projectiles.splice(i, 1);
      }
    }

    // 5. Step Mode Objectives & Win Conditions
    stepModeObjectives(state, dt);
    return state;
  }

  function detonateSplashProjectile(state, p, owner) {
    state.events.push({ type: 'shockwave', x: p.x, z: p.z, radius: p.splashRadius, color: p.color || '#FF7043' });
    for (const target of state.units) {
      if (!target.alive) continue;
      if (state.modeId !== 'last_hero' && target.team === p.team) continue;
      if (state.modeId === 'last_hero' && target.id === p.ownerId) continue;
      if (Physics.dist(p.x, p.z, target.x, target.z) <= p.splashRadius + target.radius * 0.5) {
        applyDamageToUnit(state, owner, target, p.damage, p.isSuper);
      }
    }
    if (state.vaults) {
      for (const v of state.vaults) {
        if (v.hp > 0 && v.team !== p.team && Physics.dist(p.x, p.z, v.x, v.z) <= p.splashRadius + v.radius) {
          v.hp = Math.max(0, v.hp - Math.round(p.damage));
        }
      }
    }
  }

  function stepModeObjectives(state, dt) {
    // Crystal magnet: pull pickups toward nearby living players (retention juice)
    for (const it of state.groundItems) {
      if (it.kind === 'crystal' || it.kind === 'power_star' || it.kind === 'bounty_star') {
        for (const u of state.units) {
          if (!u.alive || u.isSummon) continue;
          const d = Math.hypot(it.x - u.x, it.z - u.z);
          if (d > 0.2 && d < 3.2) {
            const pull = 5.2 * FIXED_DT;
            it.x += (u.x - it.x) * pull * 0.5;
            it.z += (u.z - it.z) * pull * 0.5;
            break;
          }
        }
      }
    }
    // Timed surprise: balanced crystals near each base at 10s (fair early dopamine)
    if (!state._powerStarSpawned && state.timeSec >= 9.8 && state.timeSec < 10.6) {
      state._powerStarSpawned = true;
      const sp0 = state.map.spawnsTeam0 ? state.map.spawnsTeam0[1] : {x:0,z:8};
      const sp1 = state.map.spawnsTeam1 ? state.map.spawnsTeam1[1] : {x:0,z:-8};
      state.groundItems.push({ id: `it_ps_time_${state.tick}_a`, kind: 'golden_box', x: sp0.x + 0.5, z: sp0.z -0.5 });
      state.groundItems.push({ id: `it_ps_time_${state.tick}_b`, kind: 'golden_box', x: sp1.x -0.5, z: sp1.z +0.5 });
      state.events.push({ type: 'power_star_spawn', x: 0, z: 0 });
    }
    if (!state._goldenChecked && state.timeSec >= 44) {
      state._goldenChecked = true;
      // balanced late crystal near each base
      const sp0 = state.map.spawnsTeam0 ? state.map.spawnsTeam0[0] : {x:-4,z:6};
      const sp1 = state.map.spawnsTeam1 ? state.map.spawnsTeam1[0] : {x:4,z:-6};
      state.groundItems.push({ id: `it_gold_${state.tick}_a`, kind: 'golden_box', x: sp0.x, z: sp0.z });
      state.groundItems.push({ id: `it_gold_${state.tick}_b`, kind: 'golden_box', x: sp1.x, z: sp1.z });
      state.events.push({ type: 'golden_spawn', x: 0, z: 0 });
    }
    // Ground item pickups
    for (let i = state.groundItems.length - 1; i >= 0; i--) {
      const it = state.groundItems[i];
      for (const u of state.units) {
        if (!u.alive || u.isSummon) continue;
        if (Physics.dist(it.x, it.z, u.x, u.z) <= u.radius + 0.75) {
          if (it.kind === 'crystal') {
            u.crystals += 1;
            if (u.isPlayer) state.playerCrystalsGrabbed = (state.playerCrystalsGrabbed || 0) + 1;
            state.events.push({ type: 'crystal_grab', x: it.x, z: it.z, unitId: u.id });
          } else if (it.kind === 'bounty_star') {
            state.teamStars[u.team] = (state.teamStars[u.team] || 0) + 1;
            state.events.push({ type: 'crystal_grab', x: it.x, z: it.z, unitId: u.id });
          } else if (it.kind === 'power_star') {
            u.powerStars += 1;
            u.maxHp += 350;
            u.hp = Math.min(u.maxHp, u.hp + 350);
            state.events.push({ type: 'crystal_grab', x: it.x, z: it.z, unitId: u.id });
          } else if (it.kind === 'energy_cube') {
            u.energyTimer = 7.5;
            state.events.push({ type: 'energy_grab', x: it.x, z: it.z, unitId: u.id });
          } else if (it.kind === 'golden_box') {
            state.events.push({ type: 'golden_pickup', x: it.x, z: it.z, unitId: u.id });
            state.goldenCoinsEarned = (state.goldenCoinsEarned||0) + 25;
            u.hp = Math.min(u.maxHp, u.hp + 80);
          } else if (it.kind === 'golden_pickup') {
            state.events.push({ type: 'golden_pickup', x: it.x, z: it.z, unitId: u.id });
          }
          state.groundItems.splice(i, 1);
          break;
        }
      }
    }

    if (state.modeId === 'crystal_rush') {
      state.mineTimer -= dt;
      if (state.mineTimer <= 0 && state.groundItems.length < 14) {
        state.mineTimer = 4.2;
        state.groundItems.push({
          id: `it_mine_${state.tick}`,
          kind: 'crystal',
          x: state.rng.range(-1.1, 1.1),
          z: state.rng.range(-1.1, 1.1)
        });
      }

      let c0 = 0;
      let c1 = 0;
      for (const u of state.units) {
        if (!u.alive || u.isSummon) continue;
        if (u.team === 0) c0 += u.crystals;
        else if (u.team === 1) c1 += u.crystals;
      }
      state.teamCrystals[0] = c0;
      state.teamCrystals[1] = c1;
      // Comeback crate: if one team trails by 4+ crystals, spawn aid near its base (retention)
      if (state.comebackTimer <= 0) {
        if (c0 + 4 <= c1) {
          const sp = state.map.spawnsTeam0 ? state.map.spawnsTeam0[1] : { x: 0, z: 8 };
          state.groundItems.push({ id: `it_comeback_${state.tick}`, kind: 'crystal', x: sp.x + state.rng.range(-1.2,1.2), z: sp.z + state.rng.range(-0.8,0.8) });
          state.groundItems.push({ id: `it_comeback2_${state.tick}`, kind: 'crystal', x: sp.x + state.rng.range(-1.0,1.0), z: sp.z + state.rng.range(-1.0,1.0) });
          state.events.push({ type: 'comeback_spawn', team: 0, x: sp.x, z: sp.z });
          state.comebackTimer = 14.0;
        } else if (c1 + 4 <= c0) {
          const sp = state.map.spawnsTeam1 ? state.map.spawnsTeam1[1] : { x: 0, z: -8 };
          state.groundItems.push({ id: `it_comeback_${state.tick}`, kind: 'crystal', x: sp.x + state.rng.range(-1.2,1.2), z: sp.z + state.rng.range(-0.8,0.8) });
          state.events.push({ type: 'comeback_spawn', team: 1, x: sp.x, z: sp.z });
          state.comebackTimer = 14.0;
        }
      }

      if (c0 >= 10 && c0 > c1) {
        if (state.countdownTeam !== 0) {
          state.countdownTeam = 0;
          state.countdownSec = 15.0;
        } else {
          state.countdownSec -= dt;
          if (state.countdownSec <= 0) {
            state.finished = true;
            state.winnerTeam = 0;
            return;
          }
        }
      } else if (c1 >= 10 && c1 > c0) {
        if (state.countdownTeam !== 1) {
          state.countdownTeam = 1;
          state.countdownSec = 15.0;
        } else {
          state.countdownSec -= dt;
          if (state.countdownSec <= 0) {
            state.finished = true;
            state.winnerTeam = 1;
            return;
          }
        }
      } else {
        state.countdownTeam = null;
        state.countdownSec = 15.0;
      }

      if (state.timeSec >= state.maxTimeSec) {
        state.finished = true;
        state.winnerTeam = c0 > c1 ? 0 : (c1 > c0 ? 1 : -1);
      }
    } else if (state.modeId === 'star_hunt') {
      const s0 = state.teamStars[0] || 0;
      const s1 = state.teamStars[1] || 0;
      if (s0 >= 24 || s1 >= 24 || state.timeSec >= state.maxTimeSec) {
        state.finished = true;
        state.winnerTeam = s0 > s1 ? 0 : (s1 > s0 ? 1 : -1);
      }
    } else if (state.modeId === 'last_hero') {
      state.stormRadius = Math.max(3.6, 17.5 - state.timeSec * 0.14);
      if (state.tick % 10 === 0) {
        for (const u of state.units) {
          if (!u.alive || u.isSummon) continue;
          if (Math.hypot(u.x, u.z) > state.stormRadius) {
            applyDamageToUnit(state, null, u, 420, true);
          }
        }
      }
      const aliveFighters = state.units.filter(u => u.alive && !u.isSummon);
      if (!state.finished && (aliveFighters.length <= 1 || state.timeSec >= state.maxTimeSec)) {
        const player = state.units.find(u => u.isPlayer);
        if (player && player.alive) {
          // Rank remaining by HP
          aliveFighters.sort((a, b) => b.hp - a.hp);
          state.playerPlacement = Math.max(1, aliveFighters.findIndex(u => u.isPlayer) + 1);
        }
        state.finished = true;
        state.winnerTeam = state.playerPlacement <= 3 ? 0 : 1;
      }
    } else if (state.modeId === 'vault_breach') {
      const v0 = state.vaults[0];
      const v1 = state.vaults[1];
      if (v0.hp <= 0 || v1.hp <= 0 || state.timeSec >= state.maxTimeSec) {
        state.finished = true;
        state.winnerTeam = v1.hp < v0.hp ? 0 : (v0.hp < v1.hp ? 1 : -1);
      }
    } else if (state.modeId === 'star_ball' && state.ball) {
      const b = state.ball;
      b.prevX = b.x;
      b.prevZ = b.z;
      if (b.pickupIgnoreTimer > 0) b.pickupIgnoreTimer -= dt;

      if (state.goalResetTimer > 0) {
        state.goalResetTimer -= dt;
        if (state.goalResetTimer <= 0) {
          b.x = 0; b.z = 0; b.vx = 0; b.vz = 0; b.carrierId = null;
        }
      } else if (b.carrierId) {
        const carrier = state.units.find(u => u.id === b.carrierId && u.alive);
        if (carrier) {
          b.x = carrier.x + Math.sin(carrier.rot) * 0.85;
          b.z = carrier.z + Math.cos(carrier.rot) * 0.85;
        } else {
          b.carrierId = null;
        }
      } else {
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.vx *= 0.94;
        b.vz *= 0.94;

        // Bounce off side bounds & walls
        const halfW = state.map.width * 0.5 - b.radius;
        if (Math.abs(b.x) > halfW) {
          b.x = Physics.clamp(b.x, -halfW, halfW);
          b.vx = -b.vx * 0.8;
        }
        const hitW = Physics.pointHitsWall(b.x, b.z, b.radius, state.map.walls, state.barriers);
        if (hitW) {
          Physics.resolveCircleWall(b, b.radius, hitW);
          b.vx = -b.vx * 0.7;
          b.vz = -b.vz * 0.7;
        }

        // Goal check! Goal mouth width = 5.4u at top (-Z) and bottom (+Z)
        const goalZ = state.map.height * 0.5 - 1.1;
        if (Math.abs(b.x) <= 2.9 && Math.abs(b.z) >= goalZ) {
          const scoringTeam = b.z < 0 ? 0 : 1; // Team 0 attacks -Z goal!
          state.teamGoals[scoringTeam] += 1;
          state.events.push({ type: 'goal_scored', team: scoringTeam, x: b.x, z: b.z });
          b.x = 0; b.z = 0; b.vx = 0; b.vz = 0;
          state.goalResetTimer = 1.4;
          if (state.teamGoals[scoringTeam] >= 2) {
            state.finished = true;
            state.winnerTeam = scoringTeam;
            return;
          }
        } else {
          const halfH = state.map.height * 0.5 - b.radius;
          if (Math.abs(b.z) > halfH) {
            b.z = Physics.clamp(b.z, -halfH, halfH);
            b.vz = -b.vz * 0.8;
          }
        }

        // Pickup by walking fighter
        for (const u of state.units) {
          if (!u.alive || u.isSummon) continue;
          if (b.pickupIgnoreTimer > 0 && u.id === b.pickupIgnoreId) continue;
          if (Physics.dist(b.x, b.z, u.x, u.z) <= u.radius + b.radius) {
            b.carrierId = u.id;
            b.vx = 0;
            b.vz = 0;
            break;
          }
        }
      }

      if (state.timeSec >= state.maxTimeSec) {
        state.finished = true;
        const g0 = state.teamGoals[0];
        const g1 = state.teamGoals[1];
        state.winnerTeam = g0 > g1 ? 0 : (g1 > g0 ? 1 : -1);
      }
    } else if (state.modeId === 'hot_zone') {
      const rZone = state.hotZoneRadius || 3.8;
      let t0Inside = false;
      let t1Inside = false;
      for (const u of state.units) {
        if (!u.alive || u.isSummon) continue;
        if (Math.hypot(u.x, u.z) <= rZone) {
          if (u.team === 0) t0Inside = true;
          else if (u.team === 1) t1Inside = true;
        }
      }
      if (t0Inside) {
        state.teamZonePct[0] = Math.min(100, +(state.teamZonePct[0] + 5.2 * dt).toFixed(2));
      }
      if (t1Inside) {
        state.teamZonePct[1] = Math.min(100, +(state.teamZonePct[1] + 5.2 * dt).toFixed(2));
      }
      if (state.teamZonePct[0] >= 100 || state.teamZonePct[1] >= 100 || state.timeSec >= state.maxTimeSec) {
        state.finished = true;
        const p0 = state.teamZonePct[0];
        const p1 = state.teamZonePct[1];
        state.winnerTeam = p0 > p1 ? 0 : (p1 > p0 ? 1 : -1);
      }
    } else if (state.modeId === 'boss_siege') {
      const boss = state.units.find(u => u.isBoss);
      if (!boss || !boss.alive) {
        state.finished = true;
        state.winnerTeam = 0;
      } else if (state.timeSec >= state.maxTimeSec) {
        state.finished = true;
        state.winnerTeam = 1;
      }
    }
  }

  function detonateBarrel(state, br, attacker) {
    br.hp = 0;
    br.respawnTimer = 18.0;
    const rad = 3.2;
    state.events.push({ type: 'barrel_explode', x: br.x, z: br.z, radius: rad });
    state.events.push({ type: 'shockwave', x: br.x, z: br.z, radius: rad, color: '#FF6D00' });
    // Clear nearby bushes
    if (state.bushes) {
      for (const b of state.bushes) {
        if (!b.destroyed && Physics.dist(br.x, br.z, b.x, b.z) <= rad + b.r * 0.4) {
          b.destroyed = true;
        }
      }
    }
    // Damage & knockback units (damages enemies, or any non-owner in FFA)
    for (const u of state.units) {
      if (!u.alive) continue;
      if (attacker && state.modeId !== 'last_hero' && u.team === attacker.team && u.id !== attacker.id) continue;
      const d = Physics.dist(br.x, br.z, u.x, u.z);
      if (d <= rad + u.radius * 0.5) {
        const dmg = (attacker && u.id === attacker.id) ? 550 : 1250;
        applyDamageToUnit(state, attacker, u, dmg, true);
        if (d > 0.05 && !u.isBoss) {
          u.x += ((u.x - br.x) / d) * 1.6;
          u.z += ((u.z - br.z) / d) * 1.6;
          Physics.resolveUnitArenaCollisions(u, u.radius, state.map, state.barriers);
        }
      }
    }
  }


  function destroyWallsInRadius(state, x, z, radius) {
    const destroyed = [];
    for (let i = state.map.walls.length - 1; i >= 0; i--) {
      const w = state.map.walls[i];
      // Perimeter rails are at extreme edges, protect them (size >10)
      if (w.w > 10 || w.d > 10) continue;
      const dx = w.x - x; const dz = w.z - z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      // check inside wall expanded by radius
      const hw = w.w*0.5 + radius; const hd = w.d*0.5 + radius;
      if (Math.abs(dx) <= hw && Math.abs(dz) <= hd) {
        const taken = state.map.walls.splice(i,1)[0];
        taken._respawnIn = 18; taken._origIndex = i;
        state.destroyedWalls.push(taken);
        destroyed.push(taken);
        state.events.push({ type: 'wall_destroyed', x: taken.x, z: taken.z, w: taken.w, d: taken.d });
      }
    }
    return destroyed.length;
  }

  function updateDestroyedWalls(state, dt) {
    for (let i = state.destroyedWalls.length - 1; i >= 0; i--) {
      const w = state.destroyedWalls[i];
      w._respawnIn -= dt;
      if (w._respawnIn <= 0) {
        state.map.walls.push({ x: w.x, z: w.z, w: w.w, d: w.d, kind: 'wall' });
        state.events.push({ type: 'wall_restored', x: w.x, z: w.z });
        state.destroyedWalls.splice(i,1);
      }
    }
  }

  function stepArenaInteractables(state, dt) {
    // 1. Spring Jump-Pads (step onto pad -> charges 0.55s -> launches airborne!)
    if (state.jumpPads) {
      for (const jp of state.jumpPads) {
        if (jp.cooldown > 0) {
          jp.cooldown = Math.max(0, jp.cooldown - dt);
          jp.chargeTimer = 0;
          continue;
        }
        let occupied = false;
        for (const u of state.units) {
          if (u.alive && !u.isBoss && u.airborneTimer <= 0 && Physics.dist(u.x, u.z, jp.x, jp.z) <= 1.25) {
            occupied = true;
            break;
          }
        }
        if (occupied) {
          jp.chargeTimer = (jp.chargeTimer || 0) + dt;
          if (jp.chargeTimer >= 0.55) {
            jp.chargeTimer = 0;
            jp.cooldown = 2.4;
            state.events.push({ type: 'jump_pad', x: jp.x, z: jp.z });
            for (const u of state.units) {
              if (u.alive && !u.isBoss && u.airborneTimer <= 0 && Physics.dist(u.x, u.z, jp.x, jp.z) <= 1.45) {
                u.airborneStartX = u.x;
                u.airborneStartZ = u.z;
                u.airborneDestX = Physics.clamp(jp.tx, -state.map.width * 0.44, state.map.width * 0.44);
                u.airborneDestZ = Physics.clamp(jp.tz, -state.map.height * 0.44, state.map.height * 0.44);
                u.airborneDuration = 0.65;
                u.airborneTimer = 0.65;
                u.rot = Math.atan2(u.airborneDestX - u.x, u.airborneDestZ - u.z);
              }
            }
          }
        } else {
          jp.chargeTimer = Math.max(0, (jp.chargeTimer || 0) - dt * 1.5);
        }
      }
    }

    // 2. Paired Portal Teleporters
    if (state.teleporters && state.teleporters.length >= 2) {
      for (const tp of state.teleporters) {
        if (tp.cooldown > 0) tp.cooldown = Math.max(0, tp.cooldown - dt);
      }
      for (const tp of state.teleporters) {
        if (tp.cooldown > 0) continue;
        const dest = state.teleporters.find(o => o.id === tp.pairId);
        if (!dest) continue;
        for (const u of state.units) {
          if (!u.alive || u.isBoss || u.airborneTimer > 0 || u.teleportCd > 0) continue;
          if (Physics.dist(u.x, u.z, tp.x, tp.z) <= 1.1) {
            u.x = dest.x;
            u.z = dest.z;
            u.prevX = dest.x;
            u.prevZ = dest.z;
            u.teleportCd = 2.8;
            tp.cooldown = 1.6;
            dest.cooldown = 1.6;
            Physics.resolveUnitArenaCollisions(u, u.radius, state.map, state.barriers);
            state.events.push({ type: 'teleport', x: dest.x, z: dest.z, unitId: u.id, color: tp.color || '#00e5ff' });
            break;
          }
        }
      }
    }

    // 3. Explosive Barrel Respawn
    if (state.barrels) {
      for (const br of state.barrels) {
        if (br.hp <= 0 && br.respawnTimer > 0) {
          br.respawnTimer -= dt;
          if (br.respawnTimer <= 0) {
            br.hp = br.maxHp || 1400;
          }
        }
      }
    }

    // 4. Event Arena Modifiers (Meteor Shower & Energy Surge)
    if (state.modifierId === 'meteor_shower') {
      state.modifierSpawnTimer = (state.modifierSpawnTimer || 6.0) - dt;
      if (state.modifierSpawnTimer <= 0) {
        state.modifierSpawnTimer = 6.2;
        const aliveFighters = state.units.filter(u => u.alive && !u.isSummon && !u.isBoss);
        const pick = aliveFighters.length > 0 ? state.rng.pick(aliveFighters) : null;
        const mx = pick ? Physics.clamp(pick.x + state.rng.range(-2.2, 2.2), -state.map.width * 0.4, state.map.width * 0.4) : state.rng.range(-8, 8);
        const mz = pick ? Physics.clamp(pick.z + state.rng.range(-2.2, 2.2), -state.map.height * 0.4, state.map.height * 0.4) : state.rng.range(-8, 8);
        state.meteors.push({
          id: `met_${state.tick}`,
          x: mx,
          z: mz,
          radius: 3.1,
          timer: 1.9,
          maxTimer: 1.9,
          damage: 1550,
          team: -1 // hurts everyone except boss
        });
      }
    } else if (state.modifierId === 'energy_drink') {
      state.modifierSpawnTimer = (state.modifierSpawnTimer || 8.0) - dt;
      if (state.modifierSpawnTimer <= 0) {
        state.modifierSpawnTimer = 9.5;
        const cubesOnGround = state.groundItems.filter(it => it.kind === 'energy_cube').length;
        if (cubesOnGround < 3) {
          for (let k = 0; k < 8; k++) {
            const ex = state.rng.range(-state.map.width * 0.36, state.map.width * 0.36);
            const ez = state.rng.range(-state.map.height * 0.36, state.map.height * 0.36);
            if (!Physics.pointHitsWall(ex, ez, 0.9, state.map.walls, state.barriers)) {
              state.groundItems.push({ id: `ecube_${state.tick}`, kind: 'energy_cube', x: ex, z: ez });
              break;
            }
          }
        }
      }
    }

    // 5. Step Falling Meteors & Boss Rocket Salvos
    if (state.meteors && state.meteors.length > 0) {
      for (let i = state.meteors.length - 1; i >= 0; i--) {
        const m = state.meteors[i];
        m.timer -= dt;
        if (m.timer <= 0) {
          state.events.push({ type: 'barrel_explode', x: m.x, z: m.z, radius: m.radius });
          state.events.push({ type: 'shockwave', x: m.x, z: m.z, radius: m.radius, color: m.team === 1 ? '#FF1744' : '#FF9100' });
          if (state.bushes) {
            for (const b of state.bushes) {
              if (!b.destroyed && Physics.dist(m.x, m.z, b.x, b.z) <= m.radius) b.destroyed = true;
            }
          }
          const bossOwner = m.team === 1 ? (state.units.find(u => u.isBoss) || null) : null;
          for (const u of state.units) {
            if (!u.alive || u.isBoss || u.airborneTimer > 0) continue;
            if (m.team === 1 && u.team === 1) continue;
            if (Physics.dist(m.x, m.z, u.x, u.z) <= m.radius + u.radius * 0.4) {
              applyDamageToUnit(state, bossOwner, u, m.damage, true);
            }
          }
          state.meteors.splice(i, 1);
        }
      }
    }
  }

  function stepBossUnit(state, boss, dt) {
    const hpRatio = boss.hp / Math.max(1, boss.maxHp);
    const nextPhase = hpRatio <= 0.35 ? 3 : (hpRatio <= 0.70 ? 2 : 1);
    if (nextPhase > boss.bossPhase) {
      boss.bossPhase = nextPhase;
      state.events.push({ type: 'boss_phase', phase: nextPhase, x: boss.x, z: boss.z });
      state.events.push({ type: 'shockwave', x: boss.x, z: boss.z, radius: 5.2, color: '#FF1744' });
    }

    // Find closest living hero on Team 0
    const heroes = state.units.filter(u => u.alive && u.team === 0);
    if (heroes.length === 0) return;
    let nearest = heroes[0];
    let bestD = Physics.dist(boss.x, boss.z, nearest.x, nearest.z);
    for (let i = 1; i < heroes.length; i++) {
      const d = Physics.dist(boss.x, boss.z, heroes[i].x, heroes[i].z);
      if (d < bestD) { bestD = d; nearest = heroes[i]; }
    }

    const ang = Math.atan2(nearest.x - boss.x, nearest.z - boss.z);
    boss.rot = ang;
    const phaseSpeed = boss.baseMoveSpeed * (boss.bossPhase === 3 ? 1.32 : (boss.bossPhase === 2 ? 1.15 : 1.0));
    if (bestD > 3.6) {
      boss.vx = Math.sin(ang) * phaseSpeed;
      boss.vz = Math.cos(ang) * phaseSpeed;
      boss.x += boss.vx * dt;
      boss.z += boss.vz * dt;
      Physics.resolveUnitArenaCollisions(boss, boss.radius, state.map, state.barriers);
    }

    const dmgMult = boss.bossDmgMult || 1.0;

    // Primary Plasma Laser Fan Sweep
    boss.bossActionTimer -= dt;
    if (boss.bossActionTimer <= 0) {
      boss.bossActionTimer = boss.bossPhase === 3 ? 1.35 : (boss.bossPhase === 2 ? 1.75 : 2.1);
      const fanCnt = boss.bossPhase === 3 ? 7 : 5;
      for (let i = 0; i < fanCnt; i++) {
        const frac = (i / (fanCnt - 1)) - 0.5;
        const pAng = ang + frac * 0.72;
        state.projectiles.push({
          id: `boss_p_${state.tick}_${i}`,
          ownerId: boss.id,
          team: 1,
          pattern: 'single',
          x: boss.x + Math.sin(pAng) * 1.6,
          z: boss.z + Math.cos(pAng) * 1.6,
          prevX: boss.x,
          prevZ: boss.z,
          startX: boss.x,
          startZ: boss.z,
          vx: Math.sin(pAng) * 14.5,
          vz: Math.cos(pAng) * 14.5,
          speed: 14.5,
          maxDist: 14.5,
          traveled: 0,
          radius: 0.48,
          damage: Math.round(560 * dmgMult),
          allyHeal: 0,
          bouncesLeft: 0,
          splashRadius: 0,
          overWalls: false,
          pierce: false,
          isSuper: true,
          hitSet: {},
          color: '#FF1744'
        });
      }
      state.events.push({ type: 'fire', x: boss.x, z: boss.z, unitId: boss.id, pattern: 'spread' });
    }

    // Telegraphed Orbital Rocket Salvos (Phase 1+: 2-4 red danger zones)
    boss.bossSalvoTimer -= dt;
    if (boss.bossSalvoTimer <= 0) {
      boss.bossSalvoTimer = boss.bossPhase === 3 ? 4.2 : 6.0;
      const salvoCnt = boss.bossPhase + 1;
      for (let s = 0; s < salvoCnt; s++) {
        const tgt = heroes[s % heroes.length];
        state.meteors.push({
          id: `bsalvo_${state.tick}_${s}`,
          x: Physics.clamp(tgt.x + state.rng.range(-1.6, 1.6), -state.map.width * 0.42, state.map.width * 0.42),
          z: Physics.clamp(tgt.z + state.rng.range(-1.6, 1.6), -state.map.height * 0.42, state.map.height * 0.42),
          radius: 2.75,
          timer: 1.65,
          maxTimer: 1.65,
          damage: Math.round(1150 * dmgMult),
          team: 1
        });
      }
    }

    // Summon Siege Minion Drones (Phase 2+)
    if (boss.bossPhase >= 2) {
      boss.bossSpawnTimer -= dt;
      const curMinions = state.units.filter(u => u.alive && u.team === 1 && u.isSummon).length;
      if (boss.bossSpawnTimer <= 0 && curMinions < 3) {
        boss.bossSpawnTimer = boss.bossPhase === 3 ? 7.5 : 10.0;
        const droneHero = state.gameData.heroes[0];
        for (let m = 0; m < 2; m++) {
          const dAng = ang + (m === 0 ? -1.1 : 1.1);
          const minion = buildUnit({
            id: `bmin_${state.tick}_${m}`,
            slotIndex: 30 + m,
            name: state.lang === 'ru' ? 'Дрон Титана' : 'Titan Drone',
            team: 1,
            isPlayer: false,
            isBot: true,
            isSummon: true,
            ownerId: boss.id,
            hero: droneHero,
            skin: null,
            level: Math.max(1, state.bossTier * 2),
            x: Physics.clamp(boss.x + Math.sin(dAng) * 2.4, -state.map.width * 0.42, state.map.width * 0.42),
            z: Physics.clamp(boss.z + Math.cos(dAng) * 2.4, -state.map.height * 0.42, state.map.height * 0.42),
            rot: ang,
            personality: 'aggressor',
            gameData: state.gameData
          });
          minion.maxHp = Math.round(1650 * dmgMult);
          minion.hp = minion.maxHp;
          minion.summonLifeTimer = 18;
          state.units.push(minion);
        }
      }
    }
  }

  function stepTutorialLogic(state, playerInput, dt) {
    const player = state.units[0];
    player.prevX = player.x;
    player.prevZ = player.z;
    player.prevRot = player.rot;
    if (player.fireCooldown > 0) player.fireCooldown -= dt;
    player.ammo = Math.min(player.maxAmmo, player.ammo + dt * 1.5);

    const pi = playerInput || { moveX: 0, moveZ: 0, fire: false, superCast: false };
    const mLen = Math.hypot(pi.moveX || 0, pi.moveZ || 0);
    if (mLen > 0.04) {
      const nx = pi.moveX / Math.max(1, mLen);
      const nz = pi.moveZ / Math.max(1, mLen);
      player.x += nx * player.baseMoveSpeed * dt;
      player.z += nz * player.baseMoveSpeed * dt;
      Physics.resolveUnitArenaCollisions(player, player.radius, state.map, state.barriers);
      player.rot = Math.atan2(nx, nz);
    }
    player.inBush = Physics.isInsideBush(player.x, player.z, state.map.bushes);

    if (pi.superCast && player.superCharge >= 100) {
      const aim = computeAutoAimAngle(player, state, 25, true).angle;
      castSuperAbility(state, player, aim);
      if (state.tutorialStep === 3) {
        state.tutorialStep = 4;
        state.groundItems.push({ id: 'tut_crystal', kind: 'crystal', x: 0, z: 0 });
        state.events.push({ type: 'tutorial_step', step: 4 });
      }
    } else if (pi.fire) {
      const aim = computeAutoAimAngle(player, state, 25, true).angle;
      firePrimaryWeapon(state, player, aim);
    }

    // Advance tutorial projectiles
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.prevX = p.x; p.prevZ = p.z;
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.traveled += p.speed * dt;
      let rem = p.traveled >= p.maxDist;
      for (const t of state.units) {
        if (!t.alive || t.id === player.id) continue;
        if (Physics.dist(p.x, p.z, t.x, t.z) <= p.radius + t.radius) {
          applyDamageToUnit(state, player, t, p.damage * 1.8, p.isSuper);
          rem = true;
          break;
        }
      }
      if (rem) state.projectiles.splice(i, 1);
    }

    // Step progression (<60s smooth flow)
    if (state.tutorialStep === 1 && state.tutorialPad) {
      if (Physics.dist(player.x, player.z, state.tutorialPad.x, state.tutorialPad.z) <= state.tutorialPad.r) {
        state.tutorialStep = 2;
        state.tutorialPad = null;
        const dummyHero = state.gameData.heroes[1];
        for (let d = 0; d < 2; d++) {
          const dummy = buildUnit({
            id: `tut_drone_${d}`,
            slotIndex: d + 1,
            name: state.lang === 'ru' ? 'Учебный дрон' : 'Target Drone',
            team: 1,
            isPlayer: false,
            isBot: true,
            isSummon: true,
            hero: dummyHero,
            skin: null,
            level: 1,
            x: d === 0 ? -2.2 : 2.2,
            z: -1.5,
            rot: 0,
            gameData: state.gameData
          });
          dummy.maxHp = 1200;
          dummy.hp = 1200;
          dummy.invulnTimer = 0;
          dummy.summonLifeTimer = 999;
          state.units.push(dummy);
        }
        state.events.push({ type: 'tutorial_step', step: 2 });
      }
    } else if (state.tutorialStep === 2) {
      const aliveDummies = state.units.filter(u => u.team === 1 && u.alive);
      if (aliveDummies.length === 0) {
        state.tutorialStep = 3;
        player.superCharge = 100;
        const bossDummy = buildUnit({
          id: 'tut_boss_drone',
          slotIndex: 3,
          name: state.lang === 'ru' ? 'Мега-мишень' : 'Mega Target',
          team: 1,
          isPlayer: false,
          isBot: true,
          isSummon: true,
          hero: state.gameData.heroes[2],
          skin: null,
          level: 1,
          x: 0,
          z: -2.2,
          rot: 0,
          gameData: state.gameData
        });
        bossDummy.maxHp = 1500;
        bossDummy.hp = 1500;
        bossDummy.invulnTimer = 0;
        bossDummy.summonLifeTimer = 999;
        state.units.push(bossDummy);
        state.events.push({ type: 'tutorial_step', step: 3 });
      }
    } else if (state.tutorialStep === 4) {
      for (const it of state.groundItems) {
        if (Physics.dist(player.x, player.z, it.x, it.z) <= 1.5) {
          state.finished = true;
          state.winnerTeam = 0;
          break;
        }
      }
    }

    if (state.timeSec >= 60) {
      state.finished = true;
      state.winnerTeam = 0;
    }
  }

  function stepPracticeLogic(state, playerInput, dt) {
    const player = state.units[0];
    for (let i = state.units.length - 1; i >= 0; i--) {
      const u = state.units[i];
      u.prevX = u.x;
      u.prevZ = u.z;
      u.prevRot = u.rot;

      if (!u.alive) {
        if (u.isSummon) {
          state.units.splice(i, 1);
          continue;
        }
        u.respawnTimer -= dt;
        if (u.respawnTimer <= 0) {
          u.alive = true;
          u.hp = u.maxHp;
          u.invulnTimer = 0.5;
          if (u.id === 'prac_boss') { u.x = 0; u.z = -4.8; }
          else if (u.id === 'prac_shooter') { u.x = 5.0; u.z = -3.5; }
          else if (u.id.startsWith('prac_swarm_')) {
            const idx = parseInt(u.id.split('_')[2], 10) || 0;
            const pts = [{ x: -5.2, z: -3.2 }, { x: -3.6, z: -4.4 }, { x: -3.6, z: -2.0 }];
            u.x = pts[idx].x; u.z = pts[idx].z;
          }
          u.prevX = u.x; u.prevZ = u.z;
        }
        continue;
      }

      if (u.isSummon) {
        u.summonLifeTimer -= dt;
        if (u.summonLifeTimer <= 0) { state.units.splice(i, 1); continue; }
      }
      if (u.invulnTimer > 0) u.invulnTimer -= dt;
      if (u.hitFlashTimer > 0) u.hitFlashTimer -= dt;
      if (u.fireCooldown > 0) u.fireCooldown -= dt;
      if (u.gadgetCooldown > 0) u.gadgetCooldown -= dt;
      if (u.shieldTimer > 0) u.shieldTimer -= dt;
      if (u.speedBoostTimer > 0) u.speedBoostTimer -= dt;
      if (u.overdriveTimer > 0) u.overdriveTimer -= dt;
      if (u.teleportCd > 0) u.teleportCd -= dt;
      if (u.slowTimer > 0) u.slowTimer -= dt;
      if (u.stealthTimer > 0) u.stealthTimer -= dt;
      if (u.knockupTimer > 0) u.knockupTimer -= dt;
      if (u.airborneTimer > 0) {
        u.airborneTimer = Math.max(0, u.airborneTimer - dt);
        const prog = 1 - u.airborneTimer / Math.max(0.01, u.airborneDuration || 0.65);
        u.x = u.airborneStartX + (u.airborneDestX - u.airborneStartX) * prog;
        u.z = u.airborneStartZ + (u.airborneDestZ - u.airborneStartZ) * prog;
        continue;
      }
      if (u.emoteTimer > 0) {
        u.emoteTimer -= dt;
        if (u.emoteTimer <= 0) u.emoteId = null;
      }
      u.ammo = Math.min(u.maxAmmo, u.ammo + (1.4 / u.reloadSec) * dt);
      u.outOfCombatTimer += dt;
      if (u.isPlayer && u.outOfCombatTimer >= 2.2 && u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.20 * dt);
      }

      if (u.isPlayer) {
        u.gadgetCharges = Math.max(u.gadgetCharges, 3);
        if (u.overdriveTimer <= 0 && u.overdriveCharge < 100) {
          u.overdriveCharge = Math.min(100, (u.overdriveCharge || 0) + 18 * dt);
        }
        const pi = playerInput || { moveX: 0, moveZ: 0, fire: false, superCast: false, gadgetCast: false, overdriveCast: false };
        if (pi.emoteId) { u.emoteId = pi.emoteId; u.emoteTimer = 2.5; }
        let aimAngle = u.rot;
        if (typeof pi.manualAimAngle === 'number') aimAngle = pi.manualAimAngle;
        else if (pi.fire || pi.superCast) aimAngle = computeAutoAimAngle(u, state, 25, true).angle;
        else if (Math.hypot(pi.moveX || 0, pi.moveZ || 0) > 0.1) aimAngle = Math.atan2(pi.moveX, pi.moveZ);

        const mLen = Math.hypot(pi.moveX || 0, pi.moveZ || 0);
        if (mLen > 0.04) {
          const spd = u.baseMoveSpeed * (1 + (u.speedBoostTimer > 0 ? u.speedBoostAmount : 0) + (u.overdriveTimer > 0 ? 0.22 : 0));
          u.vx = (pi.moveX / Math.max(1, mLen)) * spd;
          u.vz = (pi.moveZ / Math.max(1, mLen)) * spd;
          u.x += u.vx * dt;
          u.z += u.vz * dt;
          Physics.resolveUnitArenaCollisions(u, u.radius, state.map, state.barriers);
          if (!pi.fire && !pi.superCast) u.rot = Math.atan2(u.vx, u.vz);
        } else {
          u.vx = 0; u.vz = 0;
        }
        u.inBush = Physics.isInsideBush(u.x, u.z, state.bushes || state.map.bushes);

        if (pi.overdriveCast && u.overdriveCharge >= 100) {
          castOverdrive(state, u);
        }
        if (pi.gadgetCast && u.gadgetCooldown <= 0) {
          castGadgetAbility(state, u, aimAngle);
          u.gadgetCooldown = 1.5;
        }
        if (pi.superCast && u.superCharge >= 100) {
          u.rot = aimAngle;
          castSuperAbility(state, u, aimAngle);
        } else if (pi.fire) {
          u.rot = aimAngle;
          firePrimaryWeapon(state, u, aimAngle);
        }
      } else if (u.id === 'prac_shooter') {
        if (state.tick % 36 === 0 && player.alive && !player.inBush && player.stealthTimer <= 0) {
          const ang = Math.atan2(player.x - u.x, player.z - u.z);
          u.rot = ang;
          firePrimaryWeapon(state, u, ang);
        }
      } else if (u.isSummon && u.team === 0) {
        const bCfg = state.gameData.balance.botBrackets[2];
        const cmd = BotAI.computeBotInput(u, state, bCfg, dt, state.rng);
        if (cmd.fire) firePrimaryWeapon(state, u, cmd.aimAngle);
      }
    }

    // Update barriers, zones, and projectiles in practice mode
    for (let i = state.barriers.length - 1; i >= 0; i--) {
      state.barriers[i].timer -= dt;
      if (state.barriers[i].timer <= 0) state.barriers.splice(i, 1);
    }
    if (state.destroyedWalls) updateDestroyedWalls(state, dt);
    for (let i = state.zones.length - 1; i >= 0; i--) {
      const z = state.zones[i];
      z.timer -= dt;
      if (z.armTimer > 0) z.armTimer -= dt;
      const owner = state.units.find(x => x.id === z.ownerId) || player;
      if (z.kind === 'heal') {
        for (const u of state.units) {
          if (u.alive && u.team === z.team && Physics.dist(z.x, z.z, u.x, u.z) <= z.radius) {
            u.hp = Math.min(u.maxHp, u.hp + (z.healPerSec || 500) * dt);
          }
        }
      } else if (z.kind === 'hazard' && state.tick % 5 === 0) {
        for (const u of state.units) {
          if (u.alive && u.team !== z.team && Physics.dist(z.x, z.z, u.x, u.z) <= z.radius) {
            applyDamageToUnit(state, owner, u, (z.dps || 400) * 0.25, true);
          }
        }
      } else if (z.kind === 'mine' && z.armTimer <= 0) {
        for (const u of state.units) {
          if (u.alive && u.team !== z.team && Physics.dist(z.x, z.z, u.x, u.z) <= z.radius) {
            applyDamageToUnit(state, owner, u, z.damage || 850, true);
            z.timer = 0;
            break;
          }
        }
      }
      if (z.timer <= 0) state.zones.splice(i, 1);
    }

    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.prevX = p.x; p.prevZ = p.z;
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.traveled += p.speed * dt;
      let rem = p.traveled >= p.maxDist;
      if (!p.overWalls && Physics.pointHitsWall(p.x, p.z, p.radius * 0.6, state.map.walls, state.barriers)) {
        rem = true;
      }
      const attacker = state.units.find(x => x.id === p.ownerId) || null;
      if (!rem) {
        for (const t of state.units) {
          if (!t.alive || t.team === p.team || (p.hitIds && p.hitIds.includes(t.id))) continue;
          if (Physics.dist(p.x, p.z, t.x, t.z) <= p.radius + t.radius) {
            applyDamageToUnit(state, attacker, t, p.damage, p.isSuper);
            if (p.pierce) {
              p.hitIds = p.hitIds || [];
              p.hitIds.push(t.id);
            } else {
              rem = true;
              break;
            }
          }
        }
        if (!rem && state.barrels) {
          for (const br of state.barrels) {
            if (br.hp <= 0) continue;
            if (Physics.dist(p.x, p.z, br.x, br.z) <= p.radius + br.radius) {
              br.hp -= Math.round(p.damage);
              if (br.hp <= 0) detonateBarrel(state, br, attacker);
              rem = true;
              break;
            }
          }
        }
      }
      if (rem) state.projectiles.splice(i, 1);
    }

    stepArenaInteractables(state, dt);
  }

  function computeStarPlayer(state) {
    const fighters = state.units.filter(u => !u.isSummon);
    if (!fighters.length) return null;
    let best = fighters[0];
    let bestScore = -1;
    for (const u of fighters) {
      let sc = (u.kills || 0) * 1400 + (u.damageDealt || 0) + (u.crystals || 0) * 600;
      if (state.winnerTeam !== null && u.team === state.winnerTeam) sc += 1500;
      if (sc > bestScore) {
        bestScore = sc;
        best = u;
      }
    }
    return best;
  }

  const api = {
    FIXED_DT,
    getActiveMapsForMode,
    computeAutoAimAngle,
    createMatchState,
    stepMatchTick,
    computeStarPlayer
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.MatchSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
