/**
 * Star Arena: Squad («Звёздная Арена: Отряд»)
 * Single-key Save System ('sa_save') + Migration + Case Economy + Friend Ghost Codec
 */
(function (root) {
  'use strict';

  const SAVE_VERSION = 2;
  const TACTIC_MILESTONES = [
    { wins: 3, id: 'dash_cancel', nameRu: 'Отмена рывка', nameEn: 'Dash cancel', descRu: 'Прерви рывок вторым тапом', descEn: 'Cancel dash with second tap' },
    { wins: 6, id: 'wall_bounce', nameRu: 'Рикошет', nameEn: 'Wall bounce', descRu: 'Projectiles bounce once', descEn: 'Projectiles bounce once' },
    { wins: 9, id: 'heal_orb', nameRu: 'Сфера лечения', nameEn: 'Heal orb', descRu: 'Pickup orb +15% HP', descEn: 'Pickup orb +15% HP' },
    { wins: 12, id: 'super_chain', nameRu: 'Chain supers', nameEn: 'Super chain', descRu: 'Super hastes ally', descEn: 'Super hastes ally' },
  ];
  function getTacticMilestones(){ return TACTIC_MILESTONES.slice(); }
  function pushBestMoment(save, entry){ if(!save.bestMoments) save.bestMoments=[]; save.bestMoments.unshift(entry); if(save.bestMoments.length>6) save.bestMoments.length=6; }
  function addTacticWin(save){ if(!save.tacticPass) save.tacticPass={wins:0,unlocked:[]}; save.tacticPass.wins+=1; let newly=null; for(const m of TACTIC_MILESTONES){ if(save.tacticPass.wins>=m.wins && !save.tacticPass.unlocked.includes(m.id)){ save.tacticPass.unlocked.push(m.id); newly=m.id; } } return newly; }



  function todayKey(nowMs) {
    const d = new Date(nowMs || Date.now());
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function safeInt(v, fallback, min = 0, max = 9999999) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function createDefaultSave(gameData, nowMs) {
    const starterHero = (gameData && gameData.heroes && gameData.heroes.find(h => h.starter))
      || (gameData && gameData.heroes && gameData.heroes[0])
      || { id: 'blaster_fire' };

    const day = todayKey(nowMs);
    const quests = buildDailyQuestsForDay(day, gameData);

    const bracketWinrate = {};
    if (gameData && gameData.balance && Array.isArray(gameData.balance.botBrackets)) {
      for (const b of gameData.balance.botBrackets) {
        bracketWinrate[b.id] = { matches: 0, wins: 0 };
      }
    }

    return {
      v: SAVE_VERSION,
      ts: nowMs || Date.now(),
      playerName: 'Звёздный Боец',
      avatarId: 'crown',
      tutorialDone: false,
      coins: 180,
      pp: 45,
      tacticPass: { wins: 0, unlocked: [] },
      bestMoments: [],
      cases: 1, // 1 welcome Star Case from gameplay onboarding
      casesWithoutHero: 0, // Pity counter: 10 without hero -> 11th guarantees hero
      totalCasesOpened: 0,
      selectedHeroId: starterHero.id,
      selectedModeId: 'crystal_rush',
      selectedModifierId: 'none',
      bossTier: 1,
      bossMaxCleared: 0,
      hardcoreEnabled: false,
      mastery: {},
      claimedMastery: [],
      equippedTitleArchId: '',
      party: {
        code: '',
        slots: [null, null]
      },
      heroes: {
        [starterHero.id]: {
          unlocked: true,
          level: 1,
          trophies: 0,
          skinId: null
        }
      },
      unlockedSkins: [],
      claimedRoad: [],
      seasonTokens: 0,
      claimedSeason: [],
      claimedAchievements: [],
      daily: {
        dayKey: day,
        streak: 1,
        streakClaimed: false,
        streakWeekClaimed: [],
        rewardedCaseClaimed: false,
        rewardedCasesCount: 0,
        rewardedPpCount: 0,
        chainBonusClaimed: false,
        inviteCaseClaimed: false,
        wheelSpinsToday: 0,
        shopFreeClaimsToday: 0,
        shopSlotsSeed: day,
        giftNextAt: (nowMs || Date.now()) + 4 * 3600 * 1000,
        giftStreak: 0,
        quests
      },
      club: {
        id: '',
        name: '',
        joinedAt: 0,
        contrib: 0
      },
      wheelTotalSpins: 0,
      activeFriendGhost: null,
      settings: {
        sound: true,
        music: true,
        quality: 'auto', // 'auto' | 'high' | 'low' | '2d'
        lang: null       // null = auto-detect, or 'en' | 'ru'
      },
      stats: {
        matches: 0,
        wins: 0,
        losses: 0,
        takedowns: 0,
        crystalsGrabbed: 0,
        supersUsed: 0,
        hardcoreWins: 0,
        ghostMatches: 0,
        overdrivesUsed: 0,
        bossesDefeated: 0,
        maxWinStreak: 0,
        consecutiveLosses: 0,
        consecutiveWins: 0,
        bracketWinrate
      },
      ledger: []
    };
  }

  function buildDailyQuestsForDay(dayStr, gameData) {
    const pool = (gameData && gameData.meta && gameData.meta.dailyQuestTemplates) || [];
    if (!pool.length) return [];
    let hash = 0;
    for (let i = 0; i < dayStr.length; i++) {
      hash = (hash * 31 + dayStr.charCodeAt(i)) >>> 0;
    }
    const chosen = [];
    const used = new Set();
    for (let i = 0; i < Math.min(3, pool.length); i++) {
      let idx = (hash + i * 7) % pool.length;
      while (used.has(idx)) idx = (idx + 1) % pool.length;
      used.add(idx);
      const tpl = pool[idx];
      chosen.push({
        id: tpl.id,
        metric: tpl.metric,
        target: tpl.target,
        progress: 0,
        claimed: false
      });
    }
    return chosen;
  }

  /**
   * Migrates & repairs ANY raw save input (null, corrupted JSON, v0, v1, compact cloud payload)
   * without throwing!
   */
  function migrateAndValidateSave(rawInput, gameData, nowMs) {
    const base = createDefaultSave(gameData, nowMs);
    if (!rawInput) return base;

    let parsed = null;
    if (typeof rawInput === 'string') {
      try {
        parsed = JSON.parse(rawInput);
      } catch (_) {
        // Corrupted JSON -> gracefully recover clean default save without crashing
        return base;
      }
    } else if (typeof rawInput === 'object' && !Array.isArray(rawInput)) {
      parsed = rawInput;
    } else {
      return base;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return base;
    }

    // Support v0/v1 legacy field names AND compact VK cloud mirror keys
    base.coins = safeInt(parsed.coins !== undefined ? parsed.coins : parsed.gold, base.coins);
    base.pp = safeInt(parsed.pp !== undefined ? parsed.pp : parsed.powerPoints, base.pp);
    base.cases = safeInt(parsed.cases !== undefined ? parsed.cases : parsed.boxes, base.cases, 0, 999);
    base.casesWithoutHero = safeInt(
      parsed.casesWithoutHero !== undefined ? parsed.casesWithoutHero : parsed.pity,
      0,
      0,
      10
    );
    base.totalCasesOpened = safeInt(parsed.totalCasesOpened, 0);
    base.tutorialDone = Boolean(parsed.tutorialDone);
    if (typeof parsed.playerName === 'string' && parsed.playerName.trim()) {
      base.playerName = parsed.playerName.trim().slice(0, 20);
    }
    if (typeof parsed.avatarId === 'string' && parsed.avatarId.trim()) {
      base.avatarId = parsed.avatarId.trim().slice(0, 16);
    }

    // Migrate heroes map (supports parsed.heroes or compact parsed.h)
    const rawHeroes = parsed.heroes || parsed.h;
    const validHeroIds = new Set(
      (gameData && gameData.heroes ? gameData.heroes.map(h => h.id) : ['blaster_fire'])
    );
    if (rawHeroes && typeof rawHeroes === 'object' && !Array.isArray(rawHeroes)) {
      for (const [hId, hVal] of Object.entries(rawHeroes)) {
        if (!validHeroIds.has(hId) || !hVal || typeof hVal !== 'object') continue;
        base.heroes[hId] = {
          unlocked: Boolean(hVal.unlocked !== false),
          level: safeInt(hVal.level, 1, 1, 9),
          trophies: safeInt(hVal.trophies, 0, 0, 50000),
          skinId: typeof hVal.skinId === 'string' ? hVal.skinId : null
        };
      }
    }

    // Guarantee at least starter hero is unlocked
    const starterId = Object.keys(base.heroes).find(k => base.heroes[k] && base.heroes[k].unlocked);
    if (!starterId) {
      const fallbackHeroId = (gameData && gameData.heroes && gameData.heroes[0] && gameData.heroes[0].id) || 'blaster_fire';
      base.heroes[fallbackHeroId] = { unlocked: true, level: 1, trophies: 0, skinId: null };
    }

    const sel = parsed.selectedHeroId || parsed.sel;
    if (typeof sel === 'string' && base.heroes[sel] && base.heroes[sel].unlocked) {
      base.selectedHeroId = sel;
    } else {
      base.selectedHeroId = Object.keys(base.heroes).find(k => base.heroes[k].unlocked);
    }

    if (typeof parsed.selectedModeId === 'string') {
      base.selectedModeId = parsed.selectedModeId;
    }
    if (typeof parsed.selectedModifierId === 'string' && ['none', 'meteor_shower', 'energy_drink', 'ultra_charge'].includes(parsed.selectedModifierId)) {
      base.selectedModifierId = parsed.selectedModifierId;
    }
    base.bossTier = safeInt(parsed.bossTier, 1, 1, 4);
    base.bossMaxCleared = safeInt(parsed.bossMaxCleared, 0, 0, 4);
    base.hardcoreEnabled = Boolean(parsed.hardcoreEnabled);

    if (parsed.mastery && typeof parsed.mastery === 'object' && !Array.isArray(parsed.mastery)) {
      for (const [hId, mPts] of Object.entries(parsed.mastery)) {
        if (validHeroIds.has(hId)) base.mastery[hId] = safeInt(mPts, 0, 0, 999999);
      }
    }
    if (Array.isArray(parsed.claimedMastery)) {
      base.claimedMastery = parsed.claimedMastery.filter(x => typeof x === 'string').slice(0, 300);
    } else if (parsed.claimedMastery && typeof parsed.claimedMastery === 'object') {
      for (const [hId, arr] of Object.entries(parsed.claimedMastery)) {
        if (validHeroIds.has(hId) && Array.isArray(arr)) {
          for (const t of arr) {
            if (t >= 1 && t <= 3) base.claimedMastery.push(`${hId}:${t}`);
          }
        }
      }
    }
    if (typeof parsed.equippedTitleArchId === 'string') {
      base.equippedTitleArchId = parsed.equippedTitleArchId.slice(0, 32);
    }
    if (parsed.party && typeof parsed.party === 'object' && !Array.isArray(parsed.party)) {
      const pCode = parsed.party.code || parsed.party.roomCode;
      if (typeof pCode === 'string' && pCode.trim()) {
        base.party.code = pCode.trim().slice(0, 12);
      }
      if (Array.isArray(parsed.party.slots)) {
        base.party.slots = [
          parsed.party.slots[0] && parsed.party.slots[0].heroId ? parsed.party.slots[0] : null,
          parsed.party.slots[1] && parsed.party.slots[1].heroId ? parsed.party.slots[1] : null
        ];
      } else {
        if (parsed.party.slot1 && parsed.party.slot1.heroId) base.party.slots[0] = parsed.party.slot1;
        if (parsed.party.slot2 && parsed.party.slot2.heroId) base.party.slots[1] = parsed.party.slot2;
      }
    }

    const sk = parsed.unlockedSkins || parsed.sk;
    if (Array.isArray(sk)) {
      base.unlockedSkins = Array.from(new Set(sk.filter(x => typeof x === 'string')));
    }

    const rd = parsed.claimedRoad || parsed.rd;
    if (Array.isArray(rd)) {
      base.claimedRoad = Array.from(new Set(rd.map(x => safeInt(x, -1)).filter(x => x > 0)));
    }

    base.seasonTokens = safeInt(parsed.seasonTokens !== undefined ? parsed.seasonTokens : parsed.st, 0);
    const sc = parsed.claimedSeason || parsed.sc;
    if (Array.isArray(sc)) {
      base.claimedSeason = Array.from(new Set(sc.map(x => safeInt(x, -1)).filter(x => x > 0)));
    }

    const ac = parsed.claimedAchievements || parsed.ac;
    if (Array.isArray(ac)) {
      base.claimedAchievements = Array.from(new Set(ac.filter(x => typeof x === 'string')));
    }

    const rawStats = parsed.stats || parsed.st_w;
    if (rawStats && typeof rawStats === 'object') {
      for (const k of [
        'matches', 'wins', 'losses', 'takedowns', 'crystalsGrabbed',
        'supersUsed', 'hardcoreWins', 'ghostMatches', 'overdrivesUsed',
        'bossesDefeated', 'maxWinStreak', 'consecutiveLosses', 'consecutiveWins'
      ]) {
        base.stats[k] = safeInt(rawStats[k], base.stats[k]);
      }
      if (rawStats.bracketWinrate && typeof rawStats.bracketWinrate === 'object') {
        for (const [bId, bObj] of Object.entries(rawStats.bracketWinrate)) {
          if (bObj && typeof bObj === 'object') {
            base.stats.bracketWinrate[bId] = {
              matches: safeInt(bObj.matches, 0),
              wins: safeInt(bObj.wins, 0)
            };
          }
        }
      }
    }

    if (parsed.settings && typeof parsed.settings === 'object') {
      base.settings.sound = parsed.settings.sound !== false;
      base.settings.music = parsed.settings.music !== false;
      if (['auto', 'high', 'low', '2d'].includes(parsed.settings.quality)) {
        base.settings.quality = parsed.settings.quality;
      }
      if (parsed.settings.lang === 'en' || parsed.settings.lang === 'ru') {
        base.settings.lang = parsed.settings.lang;
      }
    }

    if (parsed.activeFriendGhost && typeof parsed.activeFriendGhost === 'object' && parsed.activeFriendGhost.heroId) {
      base.activeFriendGhost = parsed.activeFriendGhost;
    }

    // Daily rollover check
    const currentDay = todayKey(nowMs);
    if (parsed.daily && typeof parsed.daily === 'object') {
      if (parsed.daily.dayKey === currentDay) {
        base.daily.dayKey = currentDay;
        base.daily.streak = safeInt(parsed.daily.streak, 1, 1, 9999);
        base.daily.streakClaimed = Boolean(parsed.daily.streakClaimed);
        const migratedCasesCount = safeInt(
          parsed.daily.rewardedCasesCount !== undefined
            ? parsed.daily.rewardedCasesCount
            : (parsed.daily.rewardedCaseClaimed ? 3 : 0),
          0,
          0,
          3
        );
        base.daily.rewardedCasesCount = migratedCasesCount;
        base.daily.rewardedCaseClaimed = migratedCasesCount >= 3;
        base.daily.rewardedPpCount = safeInt(parsed.daily.rewardedPpCount, 0, 0, 2);
        base.daily.chainBonusClaimed = Boolean(parsed.daily.chainBonusClaimed);
        base.daily.inviteCaseClaimed = Boolean(parsed.daily.inviteCaseClaimed);
        base.daily.wheelSpinsToday = safeInt(parsed.daily.wheelSpinsToday, 0, 0, 5);
        base.daily.shopFreeClaimsToday = safeInt(parsed.daily.shopFreeClaimsToday, 0, 0, 3);
        base.daily.giftNextAt = safeInt(parsed.daily.giftNextAt, base.daily.giftNextAt, 0, 9999999999999);
        base.daily.giftStreak = safeInt(parsed.daily.giftStreak, 0, 0, 999);
        base.daily.shopSlotsSeed = typeof parsed.daily.shopSlotsSeed === 'string' ? parsed.daily.shopSlotsSeed : base.daily.shopSlotsSeed;
        if (Array.isArray(parsed.daily.streakWeekClaimed)) {
          base.daily.streakWeekClaimed = parsed.daily.streakWeekClaimed.filter(x => typeof x === 'number').slice(0, 7);
        }
        if (Array.isArray(parsed.daily.quests) && parsed.daily.quests.length === 3) {
          base.daily.quests = parsed.daily.quests.map(q => ({
            id: String(q.id || ''),
            metric: String(q.metric || 'matches'),
            target: safeInt(q.target, 1, 1, 100),
            progress: safeInt(q.progress, 0, 0, 100),
            claimed: Boolean(q.claimed)
          }));
        }
      } else {
        // New day! Check if yesterday for streak increment
        const prevDate = new Date((parsed.daily.dayKey || currentDay) + 'T00:00:00Z');
        const curDate = new Date(currentDay + 'T00:00:00Z');
        const diffDays = Math.round((curDate - prevDate) / 86400000);
        base.daily.streak = diffDays === 1 ? safeInt(parsed.daily.streak, 1) + 1 : 1;
        base.daily.inviteCaseClaimed = Boolean(parsed.daily.inviteCaseClaimed);
        base.daily.wheelSpinsToday = 0;
        base.daily.shopFreeClaimsToday = 0;
        base.daily.shopSlotsSeed = currentDay;
      }
    }
    if (parsed.club && typeof parsed.club === 'object') {
      base.club.id = typeof parsed.club.id === 'string' ? parsed.club.id.slice(0, 16) : '';
      base.club.name = typeof parsed.club.name === 'string' ? parsed.club.name.slice(0, 20) : '';
      base.club.joinedAt = safeInt(parsed.club.joinedAt, 0);
      base.club.contrib = safeInt(parsed.club.contrib, 0);
    }
    if (parsed.wheelTotalSpins !== undefined) base.wheelTotalSpins = safeInt(parsed.wheelTotalSpins, 0);

    if (Array.isArray(parsed.ledger)) {
      base.ledger = parsed.ledger.slice(-20);
    }

    base.v = SAVE_VERSION;
    base.ts = nowMs || Date.now();
    return base;
  }

  function getTotalTrophies(save) {
    let sum = 0;
    for (const h of Object.values(save.heroes || {})) {
      if (h && h.unlocked) sum += safeInt(h.trophies, 0);
    }
    return sum;
  }

  function getUnlockedHeroCount(save) {
    return Object.values(save.heroes || {}).filter(h => h && h.unlocked).length;
  }

  function getMaxHeroLevel(save) {
    let m = 1;
    for (const h of Object.values(save.heroes || {})) {
      if (h && h.unlocked && h.level > m) m = h.level;
    }
    return m;
  }

  function recordLedger(save, currency, delta, reason) {
    if (!Array.isArray(save.ledger)) save.ledger = [];
    save.ledger.push({
      ts: Date.now(),
      currency,
      delta,
      reason: String(reason || 'Gameplay')
    });
    if (save.ledger.length > 25) {
      save.ledger.splice(0, save.ledger.length - 25);
    }
  }

  function addCurrency(save, type, amount, reason) {
    const amt = Math.max(0, Math.floor(amount || 0));
    if (amt <= 0) return;
    if (type === 'coins') {
      save.coins += amt;
    } else if (type === 'power_points' || type === 'pp') {
      save.pp += amt;
    } else if (type === 'cases' || type === 'case') {
      save.cases += amt;
    }
    recordLedger(save, type, +amt, reason);
  }

  function upgradeHero(save, heroId, gameData, reasonLabel) {
    const entry = save.heroes[heroId];
    if (!entry || !entry.unlocked) return { ok: false, reason: 'locked' };
    if (entry.level >= 9) return { ok: false, reason: 'max_level' };

    const nextLv = entry.level + 1;
    const curve = gameData.balance.levelCurve.find(c => c.level === nextLv);
    if (!curve) return { ok: false, reason: 'no_curve' };
    if (save.coins < curve.coins || save.pp < curve.powerPoints) {
      return { ok: false, reason: 'insufficient_resources', neededCoins: curve.coins, neededPp: curve.powerPoints };
    }

    save.coins -= curve.coins;
    save.pp -= curve.powerPoints;
    entry.level = nextLv;
    recordLedger(save, 'coins', -curve.coins, reasonLabel || `Upgrade ${heroId} Lv.${nextLv}`);
    recordLedger(save, 'pp', -curve.powerPoints, reasonLabel || `Upgrade ${heroId} Lv.${nextLv}`);
    return { ok: true, newLevel: nextLv, unlockedPerk: curve.unlocks || null };
  }

  /**
   * Star Case Opening with Exact Disclosed Odds & 10-Case Pity System:
   * - Odds: coins 55%, power_points 25%, skin 12%, hero 7%, mythic_skin 1%
   * - Pity: 10 cases without hero -> 11th case (casesWithoutHero >= 10) GUARANTEES hero!
   * - Strictly zero real-money purchase paths.
   */
  function rollStarCase(save, gameData, rngFn = Math.random) {
    if (save.cases <= 0) {
      return { ok: false, reason: 'no_cases' };
    }
    save.cases -= 1;
    save.totalCasesOpened = (save.totalCasesOpened || 0) + 1;

    const cfg = gameData.balance.cases;
    const pityTriggered = save.casesWithoutHero >= cfg.pityThresholdWithoutHero;

    let chosenCategory = 'coins';
    if (pityTriggered) {
      chosenCategory = 'hero';
    } else {
      const r = rngFn();
      let acc = 0;
      for (const item of cfg.odds) {
        acc += item.chance;
        if (r < acc) {
          chosenCategory = item.type;
          break;
        }
      }
    }

    // Update pity counter BEFORE resolving duplicates:
    // Any 'hero' category roll (natural 7% or 11th-case pity) resets pity to 0;
    // any non-hero roll increments pity by 1.
    if (chosenCategory === 'hero') {
      save.casesWithoutHero = 0;
    } else {
      save.casesWithoutHero += 1;
    }

    let result = {
      ok: true,
      category: chosenCategory,
      pityTriggered,
      duplicateConverted: false
    };

    if (chosenCategory === 'coins') {
      const odd = cfg.odds.find(o => o.type === 'coins');
      const amount = odd.min + Math.floor(rngFn() * (odd.max - odd.min + 1));
      addCurrency(save, 'coins', amount, 'Star Case drop');
      result.amount = amount;
    } else if (chosenCategory === 'power_points') {
      const odd = cfg.odds.find(o => o.type === 'power_points');
      const amount = odd.min + Math.floor(rngFn() * (odd.max - odd.min + 1));
      addCurrency(save, 'pp', amount, 'Star Case drop');
      result.amount = amount;
    } else if (chosenCategory === 'hero') {
      const lockedHeroes = gameData.heroes.filter(h => !(save.heroes[h.id] && save.heroes[h.id].unlocked));
      if (lockedHeroes.length > 0) {
        // Weight slightly toward common/rare/epic while allowing legendary/mythic excitement
        const pick = lockedHeroes[Math.floor(rngFn() * lockedHeroes.length)];
        save.heroes[pick.id] = { unlocked: true, level: 1, trophies: 0, skinId: null };
        result.hero = pick;
        recordLedger(save, 'hero', 1, `Unlocked hero ${pick.nameEn}`);
      } else {
        // All 72 heroes already owned -> duplicate conversion
        result.duplicateConverted = true;
        result.amount = cfg.duplicateFallback.heroCoins;
        result.bonusPp = cfg.duplicateFallback.heroPowerPoints;
        addCurrency(save, 'coins', result.amount, 'Duplicate Hero compensation');
        addCurrency(save, 'pp', result.bonusPp, 'Duplicate Hero compensation');
      }
    } else if (chosenCategory === 'mythic_skin') {
      const mythicPool = gameData.skins.filter(s => s.rarity === 'mythic' && !save.unlockedSkins.includes(s.id));
      if (mythicPool.length > 0) {
        const pick = mythicPool[Math.floor(rngFn() * mythicPool.length)];
        save.unlockedSkins.push(pick.id);
        result.skin = pick;
        recordLedger(save, 'mythic_skin', 1, `Unlocked Mythic Skin ${pick.nameEn}`);
      } else {
        result.duplicateConverted = true;
        result.amount = cfg.duplicateFallback.skinCoins * 2;
        addCurrency(save, 'coins', result.amount, 'Duplicate Mythic Skin compensation');
      }
    } else if (chosenCategory === 'skin') {
      const skinPool = gameData.skins.filter(s => s.rarity !== 'mythic' && !save.unlockedSkins.includes(s.id));
      if (skinPool.length > 0) {
        const pick = skinPool[Math.floor(rngFn() * skinPool.length)];
        save.unlockedSkins.push(pick.id);
        result.skin = pick;
        recordLedger(save, 'skin', 1, `Unlocked Skin ${pick.nameEn}`);
      } else {
        result.duplicateConverted = true;
        result.amount = cfg.duplicateFallback.skinCoins;
        addCurrency(save, 'coins', result.amount, 'Duplicate Skin compensation');
      }
    }

    return result;
  }

  // Friend Ghost Shareable Code Encoder / Decoder (Async Co-op Ally without server)
  function encodeFriendGhost(save, gameData) {
    const heroId = save.selectedHeroId || 'blaster_fire';
    const hState = save.heroes[heroId] || { level: 1, skinId: null };
    const trophies = getTotalTrophies(save);
    const cleanName = (save.playerName || 'Captain').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_]/g, '').slice(0, 12) || 'Captain';
    const skinIdx = hState.skinId ? gameData.skins.findIndex(s => s.id === hState.skinId) : -1;
    const heroIdx = Math.max(0, gameData.heroes.findIndex(h => h.id === heroId));
    return `GHOST-${cleanName}-${heroIdx}-${hState.level}-${skinIdx + 1}-${trophies}`;
  }

  function decodeFriendGhost(codeStr, gameData) {
    if (typeof codeStr !== 'string') return null;
    const trimmed = codeStr.trim();
    // Check preset codes first
    if (gameData && gameData.meta && Array.isArray(gameData.meta.presetFriendGhosts)) {
      const preset = gameData.meta.presetFriendGhosts.find(g => g.code.toUpperCase() === trimmed.toUpperCase());
      if (preset) return Object.assign({}, preset);
    }
    const parts = trimmed.split('-');
    if (parts.length < 5 || parts[0].toUpperCase() !== 'GHOST') return null;
    const name = parts[1].slice(0, 14) || 'Friend';
    const heroIdx = safeInt(parts[2], 0, 0, gameData.heroes.length - 1);
    const level = safeInt(parts[3], 3, 1, 9);
    const skinIdx = safeInt(parts[4], 0, 0, gameData.skins.length) - 1;
    const trophies = safeInt(parts[5], 300, 0, 15000);
    const hero = gameData.heroes[heroIdx] || gameData.heroes[0];
    const skin = skinIdx >= 0 ? gameData.skins[skinIdx] : null;
    const personalities = ['aggressor', 'cautious', 'greedy'];
    return {
      code: trimmed,
      nameRu: name,
      nameEn: name,
      trophies,
      heroId: hero.id,
      skinId: skin ? skin.id : null,
      level,
      personality: personalities[heroIdx % 3]
    };
  }

  const MASTERY_THRESHOLDS = [
    { tier: 1, pts: 80, key: 'bronze', reward: { type: 'coins', amount: 150 } },
    { tier: 2, pts: 220, key: 'silver', reward: { type: 'power_points', amount: 65 } },
    { tier: 3, pts: 450, key: 'gold', reward: { type: 'title', coins: 250 } }
  ];

  function computeWinStreakBonus(consecutiveWins) {
    const w = safeInt(consecutiveWins, 0);
    if (w < 2) return 0;
    return Math.min(5, w - 1);
  }

  function getMasteryState(save, heroId) {
    const pts = safeInt(save && save.mastery && save.mastery[heroId], 0);
    const claimedList = (save && Array.isArray(save.claimedMastery)) ? save.claimedMastery : [];
    let tier = 0;
    let tierKey = 'none';
    for (const m of MASTERY_THRESHOLDS) {
      if (pts >= m.pts) {
        tier = m.tier;
        tierKey = m.key;
      }
    }
    const nextNode = MASTERY_THRESHOLDS.find(m => pts < m.pts) || MASTERY_THRESHOLDS[MASTERY_THRESHOLDS.length - 1];
    const pct = Math.min(100, Math.round((pts / nextNode.pts) * 100));
    const claimableTiers = MASTERY_THRESHOLDS.filter(m => pts >= m.pts && !claimedList.includes(`${heroId}:${m.tier}`));
    return {
      pts,
      tier,
      tierKey,
      nextPts: nextNode.pts,
      nextTarget: nextNode.pts,
      pct,
      titleUnlocked: pts >= 450,
      claimableTiers,
      thresholds: MASTERY_THRESHOLDS
    };
  }

  function getUnlockedTitles(save, gameData) {
    const out = [];
    if (!save || !gameData) return out;
    const seenArch = new Set();
    for (const h of gameData.heroes || []) {
      const pts = (save.mastery && save.mastery[h.id]) || 0;
      if (pts >= 450 && !seenArch.has(h.archetypeId)) {
        seenArch.add(h.archetypeId);
        const arch = (gameData.balance.archetypes || []).find(a => a.id === h.archetypeId);
        if (arch) {
          out.push({ id: arch.id, archId: arch.id, titleRu: arch.titleRu, titleEn: arch.titleEn });
        }
      }
    }
    if ((save.stats && save.stats.bossesDefeated > 0) || save.bossMaxCleared >= 1) {
      out.push({ id: 'titan_slayer', archId: 'titan_slayer', titleRu: 'Гроза Титана', titleEn: 'Titan Slayer' });
    }
    return out;
  }

  const STREAK_WEEK_REWARDS = [
    { day: 1, coins: 40, pp: 10, labelRu: 'День 1: 40 монет + 10 ОС', labelEn: 'Day 1: 40 coins + 10 PP' },
    { day: 2, coins: 60, pp: 15, labelRu: 'День 2: 60 монет + 15 ОС', labelEn: 'Day 2: 60 coins + 15 PP' },
    { day: 3, coins: 80, pp: 20, labelRu: 'День 3: 80 монет + кейс', labelEn: 'Day 3: 80 coins + case', caseReward: 1 },
    { day: 4, coins: 100, pp: 25, labelRu: 'День 4: 100 монет', labelEn: 'Day 4: 100 coins' },
    { day: 5, coins: 120, pp: 30, labelRu: 'День 5: 120 монет + 30 ОС', labelEn: 'Day 5: 120 coins + 30 PP' },
    { day: 6, coins: 150, pp: 35, labelRu: 'День 6: 150 монет + кейс', labelEn: 'Day 6: 150 coins + case', caseReward: 1 },
    { day: 7, coins: 250, pp: 60, labelRu: 'День 7: МЕГА-НАБОР!', labelEn: 'Day 7: MEGA PACK!', caseReward: 1, jackpot: true }
  ];

  const WHEEL_REWARDS = [
    { id: 'w_coins_50', labelRu: '50 монет', labelEn: '50 Coins', type: 'coins', amount: 50, weight: 22, color: '#f59e0b' },
    { id: 'w_coins_120', labelRu: '120 монет', labelEn: '120 Coins', type: 'coins', amount: 120, weight: 18, color: '#ffb700' },
    { id: 'w_pp_30', labelRu: '30 Очков силы', labelEn: '30 Power Pts', type: 'pp', amount: 30, weight: 18, color: '#a855f7' },
    { id: 'w_pp_60', labelRu: '60 Очков силы', labelEn: '60 Power Pts', type: 'pp', amount: 60, weight: 10, color: '#c084fc' },
    { id: 'w_case_1', labelRu: 'Звёздный кейс', labelEn: 'Star Case', type: 'case', amount: 1, weight: 12, color: '#00e5ff' },
    { id: 'w_tokens_40', labelRu: '40 Жетонов', labelEn: '40 Tokens', type: 'tokens', amount: 40, weight: 12, color: '#00e676' },
    { id: 'w_jackpot', labelRu: 'ДЖЕКПОТ!', labelEn: 'JACKPOT!', type: 'jackpot', amount: 1, weight: 8, color: '#ff1744' }
  ];

  const CLUB_PRESETS = [
    { id: 'club_nova', nameRu: 'Нова Прайм', nameEn: 'Nova Prime', emblem: 'star', color: '#38bdf8' },
    { id: 'club_titan', nameRu: 'Гвардия Титана', nameEn: 'Titan Guard', emblem: 'shield', color: '#ff9100' },
    { id: 'club_comet', nameRu: 'Комета', nameEn: 'Comet', emblem: 'bolt', color: '#e040fb' },
    { id: 'club_forge', nameRu: 'Кузня Звёзд', nameEn: 'Star Forge', emblem: 'hammer', color: '#00e676' }
  ];

  function getStreakWeekDay(save) {
    const s = safeInt(save && save.daily && save.daily.streak, 1);
    return ((s - 1) % 7) + 1;
  }

  function getStreakCalendar(save) {
    const curDay = getStreakWeekDay(save);
    const claimed = (save && save.daily && Array.isArray(save.daily.streakWeekClaimed)) ? save.daily.streakWeekClaimed : [];
    return STREAK_WEEK_REWARDS.map(r => ({
      day: r.day,
      reward: r,
      isPast: r.day < curDay,
      isToday: r.day === curDay,
      isFuture: r.day > curDay,
      claimed: claimed.includes(r.day) || r.day < curDay,
      canClaim: r.day === curDay && !claimed.includes(r.day)
    }));
  }

  function claimStreakDay(save, gameData) {
    const cal = getStreakCalendar(save);
    const today = cal.find(c => c.isToday && c.canClaim);
    if (!today) return { ok: false };
    const r = today.reward;
    save.daily.streakWeekClaimed = save.daily.streakWeekClaimed || [];
    if (!save.daily.streakWeekClaimed.includes(r.day)) save.daily.streakWeekClaimed.push(r.day);
    addCurrency(save, 'coins', r.coins, 'Streak Week Day ' + r.day);
    addCurrency(save, 'pp', r.pp, 'Streak Week Day ' + r.day);
    if (r.caseReward) addCurrency(save, 'cases', r.caseReward, 'Streak Week Day ' + r.day);
    if (r.day === 7) {
      // week complete - reset for next week cycle
      save.daily.streakWeekClaimed = [];
    }
    return { ok: true, reward: r };
  }

  function spinWheel(save, gameData, rngFn) {
    const rng = rngFn || Math.random;
    const totalW = WHEEL_REWARDS.reduce((a, b) => a + b.weight, 0);
    let r = rng() * totalW;
    let chosen = WHEEL_REWARDS[0];
    for (const rw of WHEEL_REWARDS) {
      if (r < rw.weight) { chosen = rw; break; }
      r -= rw.weight;
    }
    let bonus = null;
    if (chosen.type === 'coins') addCurrency(save, 'coins', chosen.amount, 'Wheel ' + chosen.id);
    else if (chosen.type === 'pp') addCurrency(save, 'pp', chosen.amount, 'Wheel ' + chosen.id);
    else if (chosen.type === 'case') addCurrency(save, 'cases', chosen.amount, 'Wheel ' + chosen.id);
    else if (chosen.type === 'tokens') { save.seasonTokens += chosen.amount; recordLedger(save, 'tokens', chosen.amount, 'Wheel ' + chosen.id); }
    else if (chosen.type === 'jackpot') {
      addCurrency(save, 'coins', 300, 'Wheel Jackpot');
      addCurrency(save, 'cases', 1, 'Wheel Jackpot');
      save.seasonTokens += 60;
      bonus = { coins: 300, cases: 1, tokens: 60 };
    }
    save.wheelTotalSpins = (save.wheelTotalSpins || 0) + 1;
    if (save.daily) save.daily.wheelSpinsToday = (save.daily.wheelSpinsToday || 0) + 1;
    return { ok: true, reward: chosen, bonus };
  }

  function getDailyShopOffers(save, gameData) {
    const dayKey = (save && save.daily && save.daily.shopSlotsSeed) || todayKey();
    let hash = 0;
    for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0;
    const offers = [];
    const templates = [
      { type: 'pp', amount: 30, labelRu: '30 Очков силы', labelEn: '30 Power Pts', icon: 'bolt' },
      { type: 'coins', amount: 100, labelRu: '100 Монет', labelEn: '100 Coins', icon: 'coin' },
      { type: 'tokens', amount: 25, labelRu: '25 Жетонов', labelEn: '25 Tokens', icon: 'star' },
      { type: 'pp', amount: 45, labelRu: '45 Очков силы', labelEn: '45 Power Pts', icon: 'bolt' },
      { type: 'coins', amount: 80, labelRu: '80 Монет', labelEn: '80 Coins', icon: 'coin' },
      { type: 'case', amount: 1, labelRu: 'Кейс дня', labelEn: 'Daily Case', icon: 'case' }
    ];
    for (let k = 0; k < 3; k++) {
      const idx = (hash + k * 13 + k) % templates.length;
      const t = templates[idx];
      offers.push({ slot: k, type: t.type, amount: t.amount, labelRu: t.labelRu, labelEn: t.labelEn, icon: t.icon });
    }
    return offers;
  }

  function claimShopSlot(save, slotIdx) {
    if ((save.daily.shopFreeClaimsToday || 0) >= 3) return { ok: false };
    const offers = getDailyShopOffers(save);
    const offer = offers[slotIdx];
    if (!offer) return { ok: false };
    if (offer.type === 'coins') addCurrency(save, 'coins', offer.amount, 'Daily Shop slot ' + slotIdx);
    else if (offer.type === 'pp') addCurrency(save, 'pp', offer.amount, 'Daily Shop slot ' + slotIdx);
    else if (offer.type === 'tokens') { save.seasonTokens += offer.amount; recordLedger(save, 'tokens', offer.amount, 'Daily Shop slot ' + slotIdx); }
    else if (offer.type === 'case') addCurrency(save, 'cases', offer.amount, 'Daily Shop slot ' + slotIdx);
    save.daily.shopFreeClaimsToday = (save.daily.shopFreeClaimsToday || 0) + 1;
    return { ok: true, offer };
  }

  function canClaimTimedGift(save, nowMs) {
    const now = nowMs || Date.now();
    if (!save.daily.giftNextAt) return true;
    return now >= save.daily.giftNextAt;
  }

  function claimTimedGift(save, nowMs) {
    if (!canClaimTimedGift(save, nowMs)) return { ok: false };
    const now = nowMs || Date.now();
    const baseCoins = 25 + Math.min(80, (save.daily.giftStreak || 0) * 8);
    addCurrency(save, 'coins', baseCoins, 'Timed Gift');
    addCurrency(save, 'pp', 6, 'Timed Gift');
    save.daily.giftNextAt = now + 4 * 3600 * 1000;
    save.daily.giftStreak = (save.daily.giftStreak || 0) + 1;
    return { ok: true, coins: baseCoins };
  }

  function getGiftCountdownMs(save, nowMs) {
    const now = nowMs || Date.now();
    const nxt = save.daily.giftNextAt || (now + 4 * 3600 * 1000);
    return Math.max(0, nxt - now);
  }

  function getMapRotationInfo(nowMs) {
    const now = nowMs || Date.now();
    const msInWeek = 7 * 24 * 3600 * 1000;
    const remMs = msInWeek - (now % msInWeek);
    const rotDays = Math.floor(remMs / 86400000);
    const rotHours = Math.floor((remMs % 86400000) / 3600000);
    const rotMins = Math.floor((remMs % 3600000) / 60000);
    return { remMs, rotDays, rotHours, rotMins };
  }

  function getWeekendEventInfo(nowMs) {
    const d = new Date(nowMs || Date.now());
    const day = d.getUTCDay(); // 0 sun, 6 sat
    const isWeekend = day === 0 || day === 6 || day === 5; // fri-sat-sun
    const events = [
      { id: 'turbo_weekend', nameRu: 'Турбо-выходные', nameEn: 'Turbo Weekend', descRu: 'Скорость +25% всем!', descEn: '+25% Speed for all!', mod: 'energy_drink', color: '#00e676' },
      { id: 'meteor_madness', nameRu: 'Метеоритный ад', nameEn: 'Meteor Madness', descRu: 'Метеоры каждые 6с!', descEn: 'Meteors every 6s!', mod: 'meteor_shower', color: '#ff1744' },
      { id: 'overdrive_fest', nameRu: 'Фест Овердрайва', nameEn: 'Overdrive Fest', descRu: 'Овердрайв x2 заряд!', descEn: 'Overdrive x2 charge!', mod: 'ultra_charge', color: '#e040fb' }
    ];
    let hash = d.getUTCFullYear() * 100 + d.getUTCMonth();
    for (let i = 0; i < 3; i++) hash = (hash * 31) >>> 0;
    const chosen = events[hash % events.length];
    return { isWeekend, event: chosen, events };
  }

  const api = { getTacticMilestones, addTacticWin, pushBestMoment,
    SAVE_VERSION,
    MASTERY_THRESHOLDS,
    STREAK_WEEK_REWARDS,
    WHEEL_REWARDS,
    CLUB_PRESETS,
    todayKey,
    createDefaultSave,
    migrateAndValidateSave,
    getTotalTrophies,
    getUnlockedHeroCount,
    getMaxHeroLevel,
    addCurrency,
    upgradeHero,
    rollStarCase,
    encodeFriendGhost,
    decodeFriendGhost,
    computeWinStreakBonus,
    getMasteryState,
    getUnlockedTitles,
    getStreakWeekDay,
    getStreakCalendar,
    claimStreakDay,
    spinWheel,
    getDailyShopOffers,
    claimShopSlot,
    canClaimTimedGift,
    claimTimedGift,
    getGiftCountdownMs,
    getMapRotationInfo,
    getWeekendEventInfo
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SA = root.SA || {};
  root.SA.Save = api;
})(typeof window !== 'undefined' ? window : globalThis);
