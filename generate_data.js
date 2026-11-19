#!/usr/bin/env node
/**
 * Deterministic Data Generator for «Звёздная Арена: Отряд» (Star Arena: Squad)
 * Produces:
 *  - data/balance.json (combat balance, levels 1-9, elements, bot AI brackets, cases, trophies)
 *  - data/heroes.json  (72 modular heroes = 12 archetypes x 6 elements + 40 original skins)
 *  - data/maps.json    (8 release symmetric maps + 4 live-ops M1 symmetric maps + weekly rotation)
 *  - data/meta.json    (trophy road to 1500, 30-tier 8-week season pass, 14 achievements, quests, ghosts)
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────
// 1. ARCHETYPES (12 combat kits)
// ─────────────────────────────────────────────────────────────
const ARCHETYPES = [
  {
    id: 'blaster',
    nameRu: 'Стрелок',
    nameEn: 'Blaster',
    roleRu: 'Урон',
    roleEn: 'Damage',
    weaponNameRu: '3 выстрела веером',
    weaponNameEn: '3-Shot Pulse Fan',
    superNameRu: 'Залп из 5',
    superNameEn: '5-Star Volley',
    talent7NameRu: 'Фокус-ствол',
    talent7DescRu: '+12% к скорости снарядов и кучности веера',
    talent7NameEn: 'Focused Barrel',
    talent7DescEn: '+12% projectile speed and tighter fan spread',
    super9NameRu: 'Сверхзалп из 7',
    super9DescRu: 'Супер выпускает 7 пробивающих звёздных импульсов',
    super9NameEn: '7-Star Piercing Volley',
    super9DescEn: 'Super fires 7 piercing star pulses',
    baseHp: 3200,
    moveSpeed: 7.4,
    reloadSec: 1.25,
    maxAmmo: 3,
    superHitsNeeded: 9,
    silhouette: 'visor_dual',
    weapon: {
      pattern: 'fan',
      projectiles: 3,
      spreadDeg: 14,
      damagePerHit: 420,
      range: 10.5,
      projSpeed: 21.0,
      projRadius: 0.34
    },
    super: {
      pattern: 'barrage',
      projectiles: 5,
      projectilesLv9: 7,
      spreadDeg: 20,
      damagePerHit: 520,
      range: 12.5,
      projSpeed: 24.0,
      pierce: true
    }
  },
  {
    id: 'shotgun',
    nameRu: 'Дробовик',
    nameEn: 'Scattergun',
    roleRu: 'Ближний урон',
    roleEn: 'Close Damage',
    weaponNameRu: '5 дроби в упор',
    weaponNameEn: '5-Shard Buckshot',
    superNameRu: 'Отброс-волна',
    superNameEn: 'Shockwave Push',
    talent7NameRu: 'Адреналин',
    talent7DescRu: '+15% к скорости движения на 2 сек после попадания',
    talent7NameEn: 'Adrenaline Rush',
    talent7DescEn: '+15% move speed for 2s after landing a hit',
    super9NameRu: 'Мега-импульс',
    super9DescRu: 'Волна шире на 25% и оглушает на 0.6 сек',
    super9NameEn: 'Mega Shockwave',
    super9DescEn: '+25% wave radius and 0.6s micro-stun',
    baseHp: 4000,
    moveSpeed: 7.7,
    reloadSec: 1.4,
    maxAmmo: 3,
    superHitsNeeded: 10,
    silhouette: 'broad_cannon',
    weapon: {
      pattern: 'fan',
      projectiles: 5,
      spreadDeg: 32,
      damagePerHit: 310,
      range: 6.2,
      projSpeed: 20.0,
      projRadius: 0.32
    },
    super: {
      pattern: 'shockwave',
      radius: 4.6,
      radiusLv9: 5.75,
      damagePerHit: 1250,
      knockback: 4.5,
      stunSecLv9: 0.6
    }
  },
  {
    id: 'tank',
    nameRu: 'Танк',
    nameEn: 'Vanguard',
    roleRu: 'Фронт',
    roleEn: 'Frontline',
    weaponNameRu: 'Кулак-удар',
    weaponNameEn: 'Titan Gauntlet',
    superNameRu: 'Щит 3 сек',
    superNameEn: 'Aegis Dome (3s)',
    talent7NameRu: 'Титановая броня',
    talent7DescRu: '+12% к максимальному здоровью',
    talent7NameEn: 'Titan Plating',
    talent7DescEn: '+12% maximum HP',
    super9NameRu: 'Эгида импульса',
    super9DescRu: 'Щит длится 4 сек и наносит урон вокруг',
    super9NameEn: 'Pulse Aegis',
    super9DescEn: 'Shield lasts 4s and emits damaging shock pulses',
    baseHp: 5200,
    moveSpeed: 7.5,
    reloadSec: 0.95,
    maxAmmo: 3,
    superHitsNeeded: 6,
    silhouette: 'hulking_paladin',
    weapon: {
      pattern: 'melee_cleave',
      projectiles: 2,
      spreadDeg: 18,
      damagePerHit: 620,
      range: 3.9,
      projSpeed: 18.0,
      projRadius: 0.55
    },
    super: {
      pattern: 'shield',
      durationSec: 3.0,
      durationSecLv9: 4.0,
      damageReduction: 0.65,
      auraDpsLv9: 380,
      auraRadius: 3.4
    }
  },
  {
    id: 'sniper',
    nameRu: 'Снайпер',
    nameEn: 'Marksman',
    roleRu: 'Дальний',
    roleEn: 'Long Range',
    weaponNameRu: 'Заряд (дальше — больнее)',
    weaponNameEn: 'Prism Rail (Distance Scaling)',
    superNameRu: 'Сквозной луч',
    superNameEn: 'Piercing Starbeam',
    talent7NameRu: 'Оптика сокола',
    talent7DescRu: '+15% к урону на дальней дистанции',
    talent7NameEn: 'Falcon Optics',
    talent7DescEn: '+15% bonus damage at long range',
    super9NameRu: 'Призма-луч',
    super9DescRu: 'Сквозной луч шире и замедляет цели на 30%',
    super9NameEn: 'Prism Overbeam',
    super9DescEn: 'Wider piercing beam that slows targets by 30%',
    baseHp: 2600,
    moveSpeed: 7.2,
    reloadSec: 1.55,
    maxAmmo: 3,
    superHitsNeeded: 4,
    silhouette: 'hawk_sniper',
    weapon: {
      pattern: 'sniper_scale',
      projectiles: 1,
      spreadDeg: 0,
      damagePerHit: 760,
      minScale: 0.65,
      maxScale: 1.75,
      range: 14.0,
      projSpeed: 28.0,
      projRadius: 0.30
    },
    super: {
      pattern: 'laser_beam',
      range: 16.5,
      width: 1.0,
      widthLv9: 1.55,
      damagePerHit: 1550,
      pierceWalls: true,
      slowLv9: 0.30
    }
  },
  {
    id: 'healer',
    nameRu: 'Лекарь',
    nameEn: 'Medic',
    roleRu: 'Поддержка',
    roleEn: 'Support',
    weaponNameRu: 'Аура-импульс',
    weaponNameEn: 'Harmonic Wave',
    superNameRu: 'Лечение зоны',
    superNameEn: 'Sanctuary Zone',
    talent7NameRu: 'Резонанс жизни',
    talent7DescRu: '+20% к силе исцеления союзников',
    talent7NameEn: 'Life Resonance',
    talent7DescEn: '+20% healing output to allies and self',
    super9NameRu: 'Зона ускорения',
    super9DescRu: 'Лечебная зона также ускоряет союзников на 18%',
    super9NameEn: 'Haste Sanctuary',
    super9DescEn: 'Healing zone also grants +18% ally move speed',
    baseHp: 3600,
    moveSpeed: 7.35,
    reloadSec: 1.3,
    maxAmmo: 3,
    superHitsNeeded: 5,
    silhouette: 'seraph_halo',
    weapon: {
      pattern: 'heal_wave',
      projectiles: 3,
      spreadDeg: 24,
      damagePerHit: 360,
      allyHealPerHit: 260,
      range: 8.8,
      projSpeed: 19.0,
      projRadius: 0.45
    },
    super: {
      pattern: 'heal_zone',
      radius: 4.5,
      durationSec: 5.0,
      healPerSec: 520,
      speedBoostLv9: 0.18
    }
  },
  {
    id: 'thrower',
    nameRu: 'Метатель',
    nameEn: 'Alchemist',
    roleRu: 'Контроль',
    roleEn: 'Control',
    weaponNameRu: 'Навесная колба',
    weaponNameEn: 'Lobbed Star-Flask',
    superNameRu: 'Лужа-зона',
    superNameEn: 'Catalyst Pool',
    talent7NameRu: 'Летучая смесь',
    talent7DescRu: '+15% к радиусу взрыва колбы',
    talent7NameEn: 'Volatile Flask',
    talent7DescEn: '+15% splash radius on lobbed flasks',
    super9NameRu: 'Большой реактор',
    super9DescRu: 'Лужа-зона шире на 25% и замедляет врагов',
    super9NameEn: 'Reactor Pool',
    super9DescEn: '+25% pool radius and slows enemies inside',
    baseHp: 2800,
    moveSpeed: 7.3,
    reloadSec: 1.45,
    maxAmmo: 3,
    superHitsNeeded: 5,
    silhouette: 'alchemist_pack',
    weapon: {
      pattern: 'lob',
      projectiles: 1,
      damagePerHit: 1080,
      splashRadius: 2.1,
      range: 9.8,
      projSpeed: 13.5,
      overWalls: true
    },
    super: {
      pattern: 'hazard_zone',
      radius: 4.0,
      radiusLv9: 5.0,
      durationSec: 5.0,
      dps: 460,
      range: 10.5,
      slowLv9: 0.22
    }
  },
  {
    id: 'assassin',
    nameRu: 'Убийца',
    nameEn: 'Striker',
    roleRu: 'Бурст',
    roleEn: 'Burst',
    weaponNameRu: 'Рывок-клинок',
    weaponNameEn: 'Dash Twin-Blade',
    superNameRu: 'Телепорт за спину',
    superNameEn: 'Shadowstep Blink',
    talent7NameRu: 'Шаг ветра',
    talent7DescRu: '+20% к скорости перезарядки после нокаута',
    talent7NameEn: 'Wind Step',
    talent7DescEn: '+20% faster reload for 4s after a takedown',
    super9NameRu: 'Фантомный щит',
    super9DescRu: 'Телепорт даёт щит 40% на 1.8 сек',
    super9NameEn: 'Phantom Blink',
    super9DescEn: 'Teleport grants a 40% shield for 1.8s',
    baseHp: 3300,
    moveSpeed: 8.2,
    reloadSec: 1.2,
    maxAmmo: 3,
    superHitsNeeded: 5,
    silhouette: 'cyber_fox',
    weapon: {
      pattern: 'dash_slash',
      projectiles: 1,
      damagePerHit: 1120,
      dashDist: 2.3,
      range: 4.3,
      projSpeed: 22.0,
      projRadius: 0.75
    },
    super: {
      pattern: 'blink_strike',
      range: 9.5,
      damagePerHit: 1380,
      shieldLv9: 0.40,
      shieldSecLv9: 1.8
    }
  },
  {
    id: 'controller',
    nameRu: 'Контролёр',
    nameEn: 'Warden',
    roleRu: 'Контроль',
    roleEn: 'Control',
    weaponNameRu: 'Замедляющий луч',
    weaponNameEn: 'Cryo-Prism Bolt',
    superNameRu: 'Стена-барьер',
    superNameEn: 'Crystal Barrier',
    talent7NameRu: 'Глубокий холод',
    talent7DescRu: '+10% к силе замедления от атак',
    talent7NameEn: 'Deep Chill',
    talent7DescEn: '+10% stronger slow on primary attacks',
    super9NameRu: 'Крепость-барьер',
    super9DescRu: 'Барьер шире и наносит урон при появлении',
    super9NameEn: 'Bastion Barrier',
    super9DescEn: 'Wider crystal wall that bursts on deployment',
    baseHp: 3400,
    moveSpeed: 7.3,
    reloadSec: 1.25,
    maxAmmo: 3,
    superHitsNeeded: 5,
    silhouette: 'prism_mage',
    weapon: {
      pattern: 'slow_bolt',
      projectiles: 1,
      damagePerHit: 960,
      slowAmount: 0.20,
      slowSec: 1.6,
      range: 9.8,
      projSpeed: 21.5,
      projRadius: 0.40
    },
    super: {
      pattern: 'wall_barrier',
      range: 7.5,
      width: 3.8,
      widthLv9: 5.2,
      durationSec: 5.0,
      spawnDamageLv9: 850
    }
  },
  {
    id: 'summoner',
    nameRu: 'Призыватель',
    nameEn: 'Engineer',
    roleRu: 'Давление',
    roleEn: 'Pressure',
    weaponNameRu: 'Турель-дрон',
    weaponNameEn: 'Pulse & Micro-Drone',
    superNameRu: '2 дрона',
    superNameEn: 'Twin Hunter Drones',
    talent7NameRu: 'Усиленные сервоприводы',
    talent7DescRu: '+35% к прочности и времени жизни дронов',
    talent7NameEn: 'Reinforced Servos',
    talent7DescEn: '+35% drone HP and duration',
    super9NameRu: 'Эскадрилья (3 дрона)',
    super9DescRu: 'Супер призывает сразу 3 боевых дрона',
    super9NameEn: 'Tri-Squadron',
    super9DescEn: 'Super deploys 3 rapid-fire combat drones',
    baseHp: 3300,
    moveSpeed: 7.35,
    reloadSec: 1.25,
    maxAmmo: 3,
    superHitsNeeded: 6,
    silhouette: 'dome_inventor',
    weapon: {
      pattern: 'single_bolt',
      projectiles: 2,
      spreadDeg: 8,
      damagePerHit: 510,
      range: 9.6,
      projSpeed: 21.0,
      projRadius: 0.34
    },
    super: {
      pattern: 'summon_drones',
      count: 2,
      countLv9: 3,
      droneHp: 1500,
      droneDps: 420,
      durationSec: 8.0
    }
  },
  {
    id: 'fighter',
    nameRu: 'Боец',
    nameEn: 'Champion',
    roleRu: 'Ближний',
    roleEn: 'Melee',
    weaponNameRu: 'Серия из 4 ударов',
    weaponNameEn: '4-Hit Star Combo',
    superNameRu: 'Апперкот-подброс',
    superNameEn: 'Sky Uppercut',
    talent7NameRu: 'Финальный аккорд',
    talent7DescRu: '4-й удар серии наносит +25% урона',
    talent7NameEn: 'Combo Finisher',
    talent7DescEn: '4th strike of each combo deals +25% damage',
    super9NameRu: 'Метеор-апперкот',
    super9DescRu: 'Дальше рывок и мощная ударная волна при приземлении',
    super9NameEn: 'Meteor Uppercut',
    super9DescEn: 'Longer leap and larger landing shockwave',
    baseHp: 4500,
    moveSpeed: 7.85,
    reloadSec: 1.05,
    maxAmmo: 3,
    superHitsNeeded: 8,
    silhouette: 'martial_champ',
    weapon: {
      pattern: 'combo_flurry',
      projectiles: 4,
      spreadDeg: 14,
      damagePerHit: 340,
      range: 4.4,
      projSpeed: 20.0,
      projRadius: 0.48
    },
    super: {
      pattern: 'uppercut_leap',
      range: 6.5,
      rangeLv9: 8.2,
      radius: 2.8,
      damagePerHit: 1350,
      knockupSec: 0.75
    }
  },
  {
    id: 'trickster',
    nameRu: 'Трикстер',
    nameEn: 'Trickster',
    roleRu: 'Хаос',
    roleEn: 'Chaos',
    weaponNameRu: 'Карты-рикошет',
    weaponNameEn: 'Ricochet Holo-Cards',
    superNameRu: 'Клон-обманка',
    superNameEn: 'Holo-Decoy Clone',
    talent7NameRu: 'Козырной отскок',
    talent7DescRu: '+20% к урону карт после отскока от стены',
    talent7NameEn: 'Ace Ricochet',
    talent7DescEn: '+20% card damage after bouncing off a wall',
    super9NameRu: 'Двойная иллюзия',
    super9DescRu: 'Призывает 2 клонов-обманок со звёздным хлопком',
    super9NameEn: 'Twin Illusion',
    super9DescEn: 'Spawns 2 decoy clones that pop in star bursts',
    baseHp: 3000,
    moveSpeed: 7.65,
    reloadSec: 1.2,
    maxAmmo: 3,
    superHitsNeeded: 7,
    silhouette: 'cosmic_jester',
    weapon: {
      pattern: 'ricochet',
      projectiles: 2,
      spreadDeg: 10,
      bounces: 2,
      damagePerHit: 540,
      range: 11.0,
      projSpeed: 22.5,
      projRadius: 0.34
    },
    super: {
      pattern: 'decoy_clone',
      count: 1,
      countLv9: 2,
      cloneHp: 1600,
      popDamage: 980,
      stealthSec: 1.5,
      durationSec: 6.5
    }
  },
  {
    id: 'demolisher',
    nameRu: 'Подрывник',
    nameEn: 'Demolisher',
    roleRu: 'Зона',
    roleEn: 'Zone',
    weaponNameRu: 'Граната-отскок',
    weaponNameEn: 'Bounce Star-Bomb',
    superNameRu: 'Минное поле',
    superNameEn: 'Star-Mine Cluster',
    talent7NameRu: 'Взрывная волна',
    talent7DescRu: '+15% к радиусу взрыва гранат',
    talent7NameEn: 'Blast Radius',
    talent7DescEn: '+15% grenade explosion radius',
    super9NameRu: 'Кассетное поле (6 мин)',
    super9DescRu: 'Разбрасывает 6 мин вместо 4 с увеличенным уроном',
    super9NameEn: 'Mega Minefield (6 Mines)',
    super9DescEn: 'Deploys 6 proximity star-mines with boosted blast',
    baseHp: 3100,
    moveSpeed: 7.35,
    reloadSec: 1.4,
    maxAmmo: 3,
    superHitsNeeded: 5,
    silhouette: 'bomb_grenadier',
    weapon: {
      pattern: 'bounce_bomb',
      projectiles: 1,
      bounces: 1,
      damagePerHit: 1100,
      splashRadius: 2.2,
      range: 9.4,
      projSpeed: 16.5,
      projRadius: 0.38
    },
    super: {
      pattern: 'minefield',
      mines: 4,
      minesLv9: 6,
      mineDamage: 920,
      triggerRadius: 1.9,
      durationSec: 12.0,
      range: 8.0
    }
  }
];

const ARCHETYPE_GADGETS = {
  blaster: {
    gadgetNameRu: 'Турбо-обойма',
    gadgetDescRu: 'Мгновенно восполняет 2 заряда атаки и даёт +22% скорости на 2.5 сек (3 заряда)',
    gadgetNameEn: 'Turbo Mag',
    gadgetDescEn: 'Instantly restores 2 ammo and grants +22% move speed for 2.5s (3 charges)'
  },
  shotgun: {
    gadgetNameRu: 'Штурмовой рывок',
    gadgetDescRu: 'Стремительный рывок вперёд и энергетический щит 30% на 2 сек (3 заряда)',
    gadgetNameEn: 'Breach Dash',
    gadgetDescEn: 'Dashes forward and grants a 30% damage shield for 2s (3 charges)'
  },
  tank: {
    gadgetNameRu: 'Второе дыхание',
    gadgetDescRu: 'Восстанавливает 1250 ОЗ и выпускает отталкивающую волну вокруг (3 заряда)',
    gadgetNameEn: 'Second Wind',
    gadgetDescEn: 'Restores 1250 HP and emits a knockback pulse nearby (3 charges)'
  },
  sniper: {
    gadgetNameRu: 'Импульсный радар',
    gadgetDescRu: 'Раскрывает соперников в кустах на 9 м и даёт +25% скорости на 3 сек (3 заряда)',
    gadgetNameEn: 'Pulse Radar',
    gadgetDescEn: 'Reveals hidden foes within 9m and grants +25% speed for 3s (3 charges)'
  },
  healer: {
    gadgetNameRu: 'Аура бодрости',
    gadgetDescRu: 'Мгновенно исцеляет себя и союзников рядом на 900 ОЗ (3 заряда)',
    gadgetNameEn: 'Vitality Burst',
    gadgetDescEn: 'Instantly heals self and nearby allies for 900 HP (3 charges)'
  },
  thrower: {
    gadgetNameRu: 'Аварийная мина',
    gadgetDescRu: 'Оставляет под ногами энерго-мину и ускоряет отход на 2 сек (3 заряда)',
    gadgetNameEn: 'Escape Mine',
    gadgetDescEn: 'Drops an energy mine at feet and boosts retreat speed for 2s (3 charges)'
  },
  assassin: {
    gadgetNameRu: 'Теневой покров',
    gadgetDescRu: 'Уходит в невидимость на 1.8 сек и снимает замедление (3 заряда)',
    gadgetNameEn: 'Shadow Veil',
    gadgetDescEn: 'Enters stealth for 1.8s and cleanses slow effects (3 charges)'
  },
  controller: {
    gadgetNameRu: 'Крио-всплеск',
    gadgetDescRu: 'Замедляет всех соперников в радиусе 4.6 м на 35% на 2.5 сек (3 заряда)',
    gadgetNameEn: 'Cryo Nova',
    gadgetDescEn: 'Slows all rivals within 4.6m by 35% for 2.5s (3 charges)'
  },
  summoner: {
    gadgetNameRu: 'Аварийный дрон',
    gadgetDescRu: 'Призывает дополнительного мини-дрона поддержки и лечит 450 ОЗ (3 заряда)',
    gadgetNameEn: 'Backup Drone',
    gadgetDescEn: 'Summons an extra support mini-drone and heals 450 HP (3 charges)'
  },
  fighter: {
    gadgetNameRu: 'Боевой заряд',
    gadgetDescRu: 'Мгновенно заряжает +35% Супера и восстанавливает 650 ОЗ (3 заряда)',
    gadgetNameEn: 'Battle Surge',
    gadgetDescEn: 'Instantly charges +35% Super and restores 650 HP (3 charges)'
  },
  trickster: {
    gadgetNameRu: 'Фазовый скачок',
    gadgetDescRu: 'Телепортируется на 3.8 м вперёд и восстанавливает 550 ОЗ (3 заряда)',
    gadgetNameEn: 'Phase Blink',
    gadgetDescEn: 'Teleports 3.8m forward and restores 550 HP (3 charges)'
  },
  demolisher: {
    gadgetNameRu: 'Реактивный прыжок',
    gadgetDescRu: 'Подпрыгивает вперёд, оставляя взрывную волну позади (3 заряда)',
    gadgetNameEn: 'Rocket Hop',
    gadgetDescEn: 'Hops forward while triggering a blast wave behind (3 charges)'
  }
};
const ARCHETYPE_OVERDRIVES = {
  blaster: {
    overdriveNameRu: 'Сверхновая веера',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Супер выпускает 9 плазменных зарядов с поджогом!',
    overdriveNameEn: 'Supernova Fan',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super fires 9 burning plasma bolts!',
    titleRu: 'Повелитель Пламени',
    titleEn: 'Flame Sovereign'
  },
  shotgun: {
    overdriveNameRu: 'Тройной катаклизм',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Супер бьёт шире на 40% и оглушает на 0.8 сек!',
    overdriveNameEn: 'Triple Cataclysm',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super wave is 40% wider and stuns 0.8s!',
    titleRu: 'Гром Ближнего Боя',
    titleEn: 'Close-Quarters Thunder'
  },
  tank: {
    overdriveNameRu: 'Несокрушимый колосс',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Супер-щит отражает импульсы и исцеляет 900 ОЗ!',
    overdriveNameEn: 'Unbreakable Colossus',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super dome pulses shockwaves and heals 900 HP!',
    titleRu: 'Железный Бастион',
    titleEn: 'Iron Bastion'
  },
  sniper: {
    overdriveNameRu: 'Фантомный калибр',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Супер-луч шире в 1.8 раза и наносит +35% урона!',
    overdriveNameEn: 'Phantom Caliber',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super beam is 1.8x wider with +35% damage!',
    titleRu: 'Глаз Космоса',
    titleEn: 'Eye of Cosmos'
  },
  healer: {
    overdriveNameRu: 'Небесный бастион',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Супер мгновенно даёт отряду щит и +40% лечения!',
    overdriveNameEn: 'Celestial Sanctuary',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super grants squad shield and +40% healing!',
    titleRu: 'Хранитель Света',
    titleEn: 'Light Guardian'
  },
  thrower: {
    overdriveNameRu: 'Ковровый звездопад',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Супер обрушивает 2 гигантских вихревых поля!',
    overdriveNameEn: 'Starfall Carpet',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super drops a massive supercharged hazard zone!',
    titleRu: 'Алхимик Звёзд',
    titleEn: 'Star Alchemist'
  },
  assassin: {
    overdriveNameRu: 'Теневой вихрь',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Прыжок Супера возвращает 50% заряда и бьёт вокруг!',
    overdriveNameEn: 'Shadow Maelstrom',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super blink refunds 50% charge and slashes nearby!',
    titleRu: 'Ночной Призрак',
    titleEn: 'Night Phantom'
  },
  controller: {
    overdriveNameRu: 'Горизонт событий',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Сингулярность Супера шире на 35% и сильнее тянет!',
    overdriveNameEn: 'Event Horizon',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super vortex is 35% wider with stronger pull!',
    titleRu: 'Владыка Вихря',
    titleEn: 'Vortex Lord'
  },
  summoner: {
    overdriveNameRu: 'Омега-протокол',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Призывает усиленную Омега-турель (+60% ОЗ и урона)!',
    overdriveNameEn: 'Omega Protocol',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Deploys an armored Omega Turret (+60% HP & dmg)!',
    titleRu: 'Архитектор Дронов',
    titleEn: 'Drone Architect'
  },
  fighter: {
    overdriveNameRu: 'Громовой натиск',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Рывок Супера восполняет всю обойму и оглушает!',
    overdriveNameEn: 'Thunder Onslaught',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super dash refills full ammo and stuns foes!',
    titleRu: 'Чемпион Арены',
    titleEn: 'Arena Champion'
  },
  trickster: {
    overdriveNameRu: 'Квантовый парадокс',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Супер создаёт сразу 2 боевых двойника!',
    overdriveNameEn: 'Quantum Paradox',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super spawns 2 combat decoys at once!',
    titleRu: 'Мастер Иллюзий',
    titleEn: 'Master of Mirage'
  },
  demolisher: {
    overdriveNameRu: 'Сверхновая мина',
    overdriveDescRu: '5 сек: +22% скорости, +18% урона, щит 20%. Супер разбрасывает 8 усиленных звёздных мин!',
    overdriveNameEn: 'Supernova Cluster',
    overdriveDescEn: '5s: +22% speed, +18% dmg, 20% shield. Super deploys 8 supercharged star-mines!',
    titleRu: 'Подрывник Галактики',
    titleEn: 'Galaxy Demolisher'
  }
};

for (const arch of ARCHETYPES) {
  Object.assign(
    arch,
    ARCHETYPE_GADGETS[arch.id] || ARCHETYPE_GADGETS.blaster,
    ARCHETYPE_OVERDRIVES[arch.id] || ARCHETYPE_OVERDRIVES.blaster
  );
}

// ─────────────────────────────────────────────────────────────
// 2. ELEMENTS (6 minor combat modifiers + visual palettes)
// ─────────────────────────────────────────────────────────────
const ELEMENTS = [
  {
    id: 'fire',
    nameRu: 'Огонь',
    nameEn: 'Fire',
    bonusDescRu: '+10% периодического урона (DoT) за 2 сек',
    bonusDescEn: '+10% burn damage over 2s',
    modifier: { type: 'dot', value: 0.10, durationSec: 2.0 },
    palette: { primary: '#FF5722', secondary: '#FFB300', glow: '#FF8A50', dark: '#5D1908' }
  },
  {
    id: 'ice',
    nameRu: 'Лёд',
    nameEn: 'Ice',
    bonusDescRu: 'Замедление цели на 8% (1.8 сек)',
    bonusDescEn: '8% target slow for 1.8s',
    modifier: { type: 'slow', value: 0.08, durationSec: 1.8 },
    palette: { primary: '#00BCD4', secondary: '#E0F7FA', glow: '#4DD0E1', dark: '#083A4B' }
  },
  {
    id: 'storm',
    nameRu: 'Гроза',
    nameEn: 'Storm',
    bonusDescRu: '+5% к скорости движения',
    bonusDescEn: '+5% movement speed',
    modifier: { type: 'speed', value: 0.05 },
    palette: { primary: '#7C4DFF', secondary: '#FFEA00', glow: '#B388FF', dark: '#27125E' }
  },
  {
    id: 'nature',
    nameRu: 'Природа',
    nameEn: 'Nature',
    bonusDescRu: '+2%/сек регенерации HP вне боя',
    bonusDescEn: '+2%/s HP regeneration out of combat',
    modifier: { type: 'ooc_regen', value: 0.02, oocDelaySec: 3.0 },
    palette: { primary: '#2ECC71', secondary: '#C8F7C5', glow: '#69F0AE', dark: '#0E4424' }
  },
  {
    id: 'shadow',
    nameRu: 'Тьма',
    nameEn: 'Shadow',
    bonusDescRu: '5% вампиризма от нанесённого урона',
    bonusDescEn: '5% lifesteal from damage dealt',
    modifier: { type: 'lifesteal', value: 0.05 },
    palette: { primary: '#9C27B0', secondary: '#FF4081', glow: '#EA80FC', dark: '#240935' }
  },
  {
    id: 'light',
    nameRu: 'Свет',
    nameEn: 'Light',
    bonusDescRu: '+5% к скорости заряда Супера',
    bonusDescEn: '+5% bonus Super charge rate',
    modifier: { type: 'super_charge', value: 0.05 },
    palette: { primary: '#FFD54F', secondary: '#FFFFFF', glow: '#FFF59D', dark: '#543E06' }
  }
];

// ─────────────────────────────────────────────────────────────
// 3. GENERATE 72 HEROES WITH EXACT RARITY COUNTS:
//    common(30), rare(24), epic(12), legendary(4), mythic(2) = 72
// ─────────────────────────────────────────────────────────────
const RARITY_POOL = [
  ...Array(30).fill('common'),
  ...Array(24).fill('rare'),
  ...Array(12).fill('epic'),
  ...Array(4).fill('legendary'),
  ...Array(2).fill('mythic')
];

// Deterministic curated ordering so starter & trophy road heroes feel great
const HERO_TITLES_RU = {
  blaster: ['Вулкан', 'Иней', 'Импульс', 'Росток', 'Фантом', 'Луч'],
  shotgun: ['Рокот', 'Айсберг', 'Разряд', 'Терновник', 'Сумрак', 'Ореол'],
  tank: ['Бастион', 'Мороз', 'Титан', 'Кедр', 'Монолит', 'Паладин'],
  sniper: ['Комета', 'Аврора', 'Зенит', 'Сокол', 'Затмение', 'Звезда'],
  healer: ['Феникс', 'Роса', 'Нимб', 'Лотос', 'Венера', 'Серафим'],
  thrower: ['Пиромант', 'Крионик', 'Вольт', 'Нектар', 'Алхимик', 'Эликсир'],
  assassin: ['Искра', 'Осколок', 'Молния', 'Рысь', 'Мираж', 'Блик'],
  controller: ['Магма', 'Кристалл', 'Шторм', 'Плющ', 'Обелиск', 'Призма'],
  summoner: ['Горн', 'Полюс', 'Тесла', 'Улей', 'Спутник', 'Маяк'],
  fighter: ['Марс', 'Борей', 'Гром', 'Атлант', 'Ноктюрн', 'Гелиос'],
  trickster: ['Джокер', 'Зеркало', 'Неон', 'Лист', 'Арлекин', 'Иллюзия'],
  demolisher: ['Фугас', 'Град', 'Рокот-М', 'Кокос', 'Метеор', 'Нова']
};

const HERO_TITLES_EN = {
  blaster: ['Vulcan', 'Rime', 'Pulse', 'Sprout', 'Specter', 'Ray'],
  shotgun: ['Rumble', 'Glacier', 'Surge', 'Bramble', 'Dusk', 'Halo'],
  tank: ['Bastion', 'Frostguard', 'Titan', 'Cedar', 'Monolith', 'Paladin'],
  sniper: ['Comet', 'Aurora', 'Zenith', 'Falcon', 'Eclipse', 'Polaris'],
  healer: ['Phoenix', 'Dewdrop', 'Nimbus', 'Lotus', 'Vesper', 'Seraph'],
  thrower: ['Pyroflask', 'Cryonic', 'Volt', 'Nectar', 'Umbra', 'Elixir'],
  assassin: ['Cinder', 'Shard', 'Blitz', 'Lynx', 'Mirage', 'Gleam'],
  controller: ['Magma', 'Crystal', 'Tempest', 'Ivy', 'Obelisk', 'Prism'],
  summoner: ['Forge', 'Polar', 'Tesla', 'Hive', 'Sputnik', 'Beacon'],
  fighter: ['Mars', 'Boreas', 'Thunder', 'Atlas', 'Nocturne', 'Helios'],
  trickster: ['Jester', 'Mirror', 'Neon', 'Clover', 'Harlequin', 'Lumen'],
  demolisher: ['Salvo', 'Hail', 'Boomer', 'Bramblebomb', 'Meteor', 'Supernova']
};

// Distribute rarities evenly across archetypes & elements while preserving exact 30/24/12/4/2 counts
const rawPairs = [];
for (let aIdx = 0; aIdx < ARCHETYPES.length; aIdx++) {
  for (let eIdx = 0; eIdx < ELEMENTS.length; eIdx++) {
    // Score index so mythic/legendary land on cool distinct combinations, starter index 0 is common
    const score = (aIdx * 7 + eIdx * 13) % 72;
    rawPairs.push({ aIdx, eIdx, score });
  }
}
// Ensure starter hero (blaster + fire) is index 0 ('common'), trophy road 200/500/900 are distinct archetypes
rawPairs.sort((x, y) => {
  if (x.aIdx === 0 && x.eIdx === 0) return -1;
  if (y.aIdx === 0 && y.eIdx === 0) return 1;
  return x.score - y.score;
});

const heroes = rawPairs.map((pair, idx) => {
  const arch = ARCHETYPES[pair.aIdx];
  const elem = ELEMENTS[pair.eIdx];
  const rarity = RARITY_POOL[idx];
  const callsignRu = HERO_TITLES_RU[arch.id][pair.eIdx];
  const callsignEn = HERO_TITLES_EN[arch.id][pair.eIdx];
  return {
    id: `${arch.id}_${elem.id}`,
    index: idx,
    archetypeId: arch.id,
    elementId: elem.id,
    rarity,
    starter: idx === 0,
    trophyRoadUnlock: idx === 5 ? 200 : idx === 18 ? 500 : idx === 38 ? 900 : null,
    nameRu: `${callsignRu}`,
    subtitleRu: `${arch.nameRu} · ${elem.nameRu}`,
    nameEn: `${callsignEn}`,
    subtitleEn: `${arch.nameEn} · ${elem.nameEn}`,
    palette: elem.palette,
    silhouette: arch.silhouette
  };
});

// Sort back into clean catalog order (starter first, then by rarity & archetype)
const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
heroes.sort((a, b) => {
  if (a.starter !== b.starter) return a.starter ? -1 : 1;
  if (RARITY_ORDER[a.rarity] !== RARITY_ORDER[b.rarity]) {
    return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
  }
  return a.id.localeCompare(b.id);
});

// Verify exact rarity counts
const counts = heroes.reduce((acc, h) => {
  acc[h.rarity] = (acc[h.rarity] || 0) + 1;
  return acc;
}, {});
if (
  counts.common !== 30 ||
  counts.rare !== 24 ||
  counts.epic !== 12 ||
  counts.legendary !== 4 ||
  counts.mythic !== 2 ||
  heroes.length !== 72
) {
  throw new Error('Hero rarity distribution mismatch: ' + JSON.stringify(counts));
}

// ─────────────────────────────────────────────────────────────
// 4. GENERATE 40 ORIGINAL SKINS (including 6 Mythic Skins for 1% drop)
// ─────────────────────────────────────────────────────────────
const SKIN_THEMES = [
  { prefixRu: 'Неоновый', prefixEn: 'Neon', trim: '#00E5FF', body: '#1A237E', aura: '#18FFFF', tier: 'rare' },
  { prefixRu: 'Космо-Гвардия', prefixEn: 'Star-Guard', trim: '#FFD700', body: '#283593', aura: '#FFF176', tier: 'rare' },
  { prefixRu: 'Кибер-Самурай', prefixEn: 'Cyber-Ronin', trim: '#FF1744', body: '#212121', aura: '#FF5252', tier: 'epic' },
  { prefixRu: 'Изумрудный', prefixEn: 'Emerald', trim: '#69F0AE', body: '#004D40', aura: '#B9F6CA', tier: 'rare' },
  { prefixRu: 'Хромированный', prefixEn: 'Chrome', trim: '#ECEFF1', body: '#455A64', aura: '#90CAF9', tier: 'common' },
  { prefixRu: 'Галактический', prefixEn: 'Galactic', trim: '#E040FB', body: '#311B92', aura: '#EA80FC', tier: 'mythic' }
];

const skins = [];
for (let i = 0; i < 40; i++) {
  const arch = ARCHETYPES[i % ARCHETYPES.length];
  // First 6 with index 34..39 are Mythic Skins (for the 1% case drop!)
  const isMythic = i >= 34;
  const theme = isMythic ? SKIN_THEMES[5] : SKIN_THEMES[i % 5];
  skins.push({
    id: `skin_${String(i + 1).padStart(2, '0')}_${arch.id}`,
    archetypeId: arch.id,
    rarity: isMythic ? 'mythic' : theme.tier,
    nameRu: `${theme.prefixRu} ${arch.nameRu} ${Math.floor(i / 12) + 1}`,
    nameEn: `${theme.prefixEn} ${arch.nameEn} Mk.${Math.floor(i / 12) + 1}`,
    colors: {
      body: theme.body,
      trim: theme.trim,
      aura: theme.aura
    },
    crestStyle: (i % 4) + 1
  });
}

// ─────────────────────────────────────────────────────────────
// 5. BALANCE TABLE (Levels 1-9, Bot AI Brackets, Cases, Trophies)
// ─────────────────────────────────────────────────────────────
const LEVEL_CURVE = [
  { level: 1, statMult: 1.00, powerPoints: 0, coins: 0 },
  { level: 2, statMult: 1.05, powerPoints: 20, coins: 30 },
  { level: 3, statMult: 1.10, powerPoints: 35, coins: 60 },
  { level: 4, statMult: 1.15, powerPoints: 55, coins: 110 },
  { level: 5, statMult: 1.20, powerPoints: 80, coins: 180 },
  { level: 6, statMult: 1.25, powerPoints: 120, coins: 280 },
  { level: 7, statMult: 1.30, powerPoints: 180, coins: 420, unlocks: 'passive_talent' },
  { level: 8, statMult: 1.35, powerPoints: 260, coins: 600 },
  { level: 9, statMult: 1.42, powerPoints: 380, coins: 900, unlocks: 'enhanced_super' }
];

const BOT_BRACKETS = [
  {
    id: 'b0_99',
    minTrophies: 0,
    maxTrophies: 99,
    aimErrorDeg: 25,
    reactionMs: 900,
    aggression: 0.30,
    superUseChance: 0.0,
    predictiveAim: false,
    retreatHpRatio: 0.0,
    useBushes: false,
    kiteRange: false,
    checkBushes: false,
    focusFire: false,
    spawnDeny: false,
    tacticsRu: 'Блуждание, редкие выстрелы (онбординг)',
    tacticsEn: 'Wandering, occasional shots (onboarding)'
  },
  {
    id: 'b100_299',
    minTrophies: 100,
    maxTrophies: 299,
    aimErrorDeg: 19,
    reactionMs: 725,
    aggression: 0.44,
    superUseChance: 0.26,
    predictiveAim: false,
    retreatHpRatio: 0.20,
    useBushes: false,
    kiteRange: false,
    checkBushes: false,
    focusFire: false,
    spawnDeny: false,
    tacticsRu: 'Держат цель режима',
    tacticsEn: 'Hold mode objective'
  },
  {
    id: 'b300_499',
    minTrophies: 300,
    maxTrophies: 499,
    aimErrorDeg: 12,
    reactionMs: 500,
    aggression: 0.60,
    superUseChance: 0.60,
    predictiveAim: false,
    retreatHpRatio: 0.35,
    useBushes: true,
    kiteRange: false,
    checkBushes: false,
    focusFire: false,
    spawnDeny: false,
    tacticsRu: 'Отход при низком HP, засады в кустах',
    tacticsEn: 'Retreat at low HP, bush ambushes'
  },
  {
    id: 'b500_799',
    minTrophies: 500,
    maxTrophies: 799,
    aimErrorDeg: 8,
    reactionMs: 350,
    aggression: 0.75,
    superUseChance: 0.85,
    predictiveAim: false,
    retreatHpRatio: 0.38,
    useBushes: true,
    kiteRange: true,
    checkBushes: true,
    focusFire: false,
    spawnDeny: false,
    tacticsRu: 'Кайт на дистанции, фокус слабых, проверка кустов',
    tacticsEn: 'Kiting, focus weak targets, bush checking'
  },
  {
    id: 'b800_1199',
    minTrophies: 800,
    maxTrophies: 1199,
    aimErrorDeg: 5,
    reactionMs: 250,
    aggression: 0.85,
    superUseChance: 1.0,
    predictiveAim: false,
    retreatHpRatio: 0.40,
    useBushes: true,
    kiteRange: true,
    checkBushes: true,
    focusFire: true,
    spawnDeny: false,
    tacticsRu: 'Фокус-огонь, сплит-пуш, ротации по флангам',
    tacticsEn: 'Focus-fire, split-push, lane rotations'
  },
  {
    id: 'b1200_plus',
    minTrophies: 1200,
    maxTrophies: 999999,
    aimErrorDeg: 3,
    reactionMs: 180,
    aggression: 0.95,
    superUseChance: 1.0,
    predictiveAim: true,
    retreatHpRatio: 0.42,
    useBushes: true,
    kiteRange: true,
    checkBushes: true,
    focusFire: true,
    spawnDeny: true,
    tacticsRu: 'Предиктивный прицел, контроль и deny спавна',
    tacticsEn: 'Predictive lead aiming, spawn-zone deny'
  }
];

const MODES = [
  {
    id: 'crystal_rush',
    status: 'release',
    unlockTrophies: 0,
    teamSize: 3,
    totalPlayers: 6,
    durationSec: 95,
    nameRu: 'Кристальная Гонка',
    nameEn: 'Crystal Rush',
    descRu: '3v3: Собери и удержи 10 кристаллов из центральной шахты 15 секунд!',
    descEn: '3v3: Collect and hold 10 crystals from the central mine for 15 seconds!',
    trophyWin: 10,
    trophyLoss: -5,
    coinsWin: 32,
    coinsLoss: 14
  },
  {
    id: 'star_hunt',
    status: 'release',
    unlockTrophies: 30,
    teamSize: 3,
    totalPlayers: 6,
    durationSec: 90,
    nameRu: 'Звёздная Охота',
    nameEn: 'Star Hunt',
    descRu: '3v3: Звёзды за выбивание соперников. Чем больше твоя серия — тем выше награда!',
    descEn: '3v3: Earn stars for takedowns. Bigger streaks make your bounty worth more!',
    trophyWin: 10,
    trophyLoss: -5,
    coinsWin: 34,
    coinsLoss: 14
  },
  {
    id: 'last_hero',
    status: 'release',
    unlockTrophies: 80,
    teamSize: 1,
    totalPlayers: 6,
    durationSec: 100,
    nameRu: 'Последний Герой',
    nameEn: 'Last Hero',
    descRu: 'FFA (ты + 5 ботов): Каждый сам за себя внутри сужающегося звёздного кольца!',
    descEn: 'FFA (You + 5 bots): Free-for-all survival inside a shrinking cosmic ring!',
    trophyRanks: [12, 8, 4, -2, -4, -6],
    coinsWin: 38,
    coinsLoss: 15
  },
  {
    id: 'vault_breach',
    status: 'liveops_m1',
    unlockTrophies: 150,
    teamSize: 3,
    totalPlayers: 6,
    durationSec: 95,
    nameRu: 'Взлом Хранилища',
    nameEn: 'Vault Breach',
    descRu: 'Live-Ops М1 (3v3): Защищай своё хранилище и расколи вражеский сейф первым!',
    descEn: 'Live-Ops M1 (3v3): Defend your team vault while cracking the enemy safe!',
    trophyWin: 11,
    trophyLoss: -5,
    coinsWin: 36,
    coinsLoss: 15
  },
  {
    id: 'star_ball',
    status: 'liveops_m1',
    unlockTrophies: 250,
    teamSize: 3,
    totalPlayers: 6,
    durationSec: 90,
    nameRu: 'Звёздный Мяч',
    nameEn: 'Star Ball',
    descRu: '3v3: Захвати энерго-мяч и забей 2 гола в ворота соперника!',
    descEn: '3v3: Grab the energy orb and score 2 goals in the rival net!',
    trophyWin: 11,
    trophyLoss: -5,
    coinsWin: 36,
    coinsLoss: 15
  },
  {
    id: 'hot_zone',
    status: 'liveops_m1',
    unlockTrophies: 120,
    teamSize: 3,
    totalPlayers: 6,
    durationSec: 90,
    nameRu: 'Горячая Зона',
    nameEn: 'Hot Zone',
    descRu: '3v3: Удерживай центральное энергетическое кольцо до 100% раньше соперников!',
    descEn: '3v3: Control the central energy ring to reach 100% before the enemy squad!',
    trophyWin: 11,
    trophyLoss: -5,
    coinsWin: 36,
    coinsLoss: 15
  },
  {
    id: 'boss_siege',
    status: 'liveops_m1',
    unlockTrophies: 0,
    teamSize: 3,
    totalPlayers: 4,
    durationSec: 120,
    nameRu: 'Осада Титана',
    nameEn: 'Titan Siege',
    descRu: 'Кооп PvE (3 против Босса): Победи гигантского Мега-Титана и волны его дронов!',
    descEn: 'Co-op PvE (3 vs Boss): Defeat the giant Mega-Titan and waves of assault drones!',
    trophyWin: 12,
    trophyLoss: -2,
    coinsWin: 48,
    coinsLoss: 18
  }
];

const ARENA_MODIFIERS = [
  {
    id: 'none',
    nameRu: 'Классика',
    nameEn: 'Standard',
    descRu: 'Чистые турнирные правила без случайных аномалий',
    descEn: 'Pure competitive rules with no random anomalies'
  },
  {
    id: 'meteor_shower',
    nameRu: 'Метеоритный шторм',
    nameEn: 'Meteor Shower',
    descRu: 'Космические метеориты падают с предупреждением и сжигают кусты!',
    descEn: 'Telegraphed cosmic meteors crash down and clear bushes!'
  },
  {
    id: 'energy_drink',
    nameRu: 'Энерго-коктейль',
    nameEn: 'Energy Surge',
    descRu: 'На арене появляются энерго-кубы: +30% к урону и скорости на 7.5 сек!',
    descEn: 'Energy cubes spawn in the arena: +30% damage & speed for 7.5s!'
  },
  {
    id: 'ultra_charge',
    nameRu: 'Ультра-заряд',
    nameEn: 'Ultra Charge',
    descRu: 'Супер и Овердрайв заряжаются в 1.8 раза быстрее у всех бойцов!',
    descEn: 'Super and Overdrive charge 1.8x faster for all fighters!'
  }
];

const BOSS_TIERS = [
  { tier: 1, nameRu: 'Обычный I', nameEn: 'Normal I', hp: 36000, dmgMult: 1.0, bonusCoins: 0 },
  { tier: 2, nameRu: 'Ветеран II', nameEn: 'Veteran II', hp: 52000, dmgMult: 1.18, bonusCoins: 20 },
  { tier: 3, nameRu: 'Эксперт III', nameEn: 'Expert III', hp: 72000, dmgMult: 1.35, bonusCoins: 40 },
  { tier: 4, nameRu: 'Безумие IV', nameEn: 'Insane IV', hp: 96000, dmgMult: 1.55, bonusCoins: 70 }
];

const CASE_CONFIG = {
  noRealMoneyPurchase: true,
  dailyRewardedLimit: 1,
  pityThresholdWithoutHero: 10, // 10 cases without hero -> 11th guarantees hero!
  odds: [
    { type: 'coins', chance: 0.55, min: 70, max: 160, labelRu: 'Монеты (70–160)', labelEn: 'Coins (70–160)' },
    { type: 'power_points', chance: 0.25, min: 25, max: 65, labelRu: 'Очки силы (25–65)', labelEn: 'Power Points (25–65)' },
    { type: 'skin', chance: 0.12, labelRu: 'Скин героя', labelEn: 'Hero Skin' },
    { type: 'hero', chance: 0.07, labelRu: 'Новый Герой', labelEn: 'New Hero' },
    { type: 'mythic_skin', chance: 0.01, labelRu: 'Мифик-скин', labelEn: 'Mythic Skin' }
  ],
  duplicateFallback: {
    heroCoins: 220,
    heroPowerPoints: 60,
    skinCoins: 140
  }
};

// ─────────────────────────────────────────────────────────────
// 6. SYMMETRIC MAPS (8 Release + 4 Live-Ops M1 = 12 total)
//    Helper mirrors obstacles across (0,0) so every map is 100% symmetric!
// ─────────────────────────────────────────────────────────────
function makeSymmetricMap({
  id,
  modeId,
  status,
  nameRu,
  nameEn,
  theme,
  width = 24,
  height = 32,
  halfWalls = [],
  halfBushes = [],
  centerWalls = [],
  centerBushes = [],
  includeGadgets = true
}) {
  const walls = [...centerWalls];
  for (const w of halfWalls) {
    walls.push({ x: w.x, z: w.z, w: w.w, d: w.d, kind: w.kind || 'wall' });
    walls.push({ x: -w.x, z: -w.z, w: w.w, d: w.d, kind: w.kind || 'wall' });
  }
  const bushes = [...centerBushes];
  for (const b of halfBushes) {
    bushes.push({ x: b.x, z: b.z, r: b.r || 1.5 });
    bushes.push({ x: -b.x, z: -b.z, r: b.r || 1.5 });
  }
  // Symmetric flank Spring Jump-Pads, Linked Teleporters & Destructible Plasma Barrels
  const jumpPads = includeGadgets
    ? [
        { id: 'jp_0', x: -(width / 2 - 2.3), z: height / 2 - 5.2, tx: -(width / 2 - 3.6), tz: 1.5 },
        { id: 'jp_1', x: width / 2 - 2.3, z: -(height / 2 - 5.2), tx: width / 2 - 3.6, tz: -1.5 }
      ]
    : [];
  const teleporters = includeGadgets
    ? [
        { id: 'tp_a', pairId: 'tp_b', x: width / 2 - 2.2, z: height / 2 - 6.8, color: '#00e5ff' },
        { id: 'tp_b', pairId: 'tp_a', x: -(width / 2 - 2.2), z: -(height / 2 - 6.8), color: '#00e5ff' }
      ]
    : [];
  const barrels = includeGadgets
    ? [
        { id: 'brl_0', x: -(width / 2 - 3.2), z: 0 },
        { id: 'brl_1', x: width / 2 - 3.2, z: 0 }
      ]
    : [];
  const spawnsTeam0 = [
    { x: -3.5, z: height / 2 - 2.6 },
    { x: 0, z: height / 2 - 2.2 },
    { x: 3.5, z: height / 2 - 2.6 }
  ];
  const spawnsTeam1 = [
    { x: 3.5, z: -(height / 2 - 2.6) },
    { x: 0, z: -(height / 2 - 2.2) },
    { x: -3.5, z: -(height / 2 - 2.6) }
  ];
  const spawnsFfa = [
    { x: 0, z: height / 2 - 3.2 },
    { x: 0, z: -(height / 2 - 3.2) },
    { x: -(width / 2 - 3.0), z: 6.5 },
    { x: width / 2 - 3.0, z: -6.5 },
    { x: -(width / 2 - 3.0), z: -6.5 },
    { x: width / 2 - 3.0, z: 6.5 }
  ];
  return {
    id,
    modeId,
    status,
    nameRu,
    nameEn,
    theme,
    width,
    height,
    walls,
    bushes,
    jumpPads,
    teleporters,
    barrels,
    spawnsTeam0,
    spawnsTeam1,
    spawnsFfa
  };
}

const MAPS = [
  // === RELEASE MAPS (8 exact!) ===
  // Crystal Rush (3 maps)
  makeSymmetricMap({
    id: 'map_cr_nebula_mine',
    modeId: 'crystal_rush',
    status: 'release',
    nameRu: 'Туманная Шахта',
    nameEn: 'Nebula Mine',
    theme: 'cosmic_station',
    halfWalls: [
      { x: -4.5, z: 5.2, w: 3.2, d: 1.4 },
      { x: 4.5, z: 5.2, w: 3.2, d: 1.4 },
      { x: 0, z: 9.2, w: 3.6, d: 1.3 },
      { x: -7.5, z: 10.0, w: 1.6, d: 3.0 }
    ],
    halfBushes: [
      { x: -6.5, z: 3.0, r: 1.7 },
      { x: -6.5, z: 5.2, r: 1.7 },
      { x: 6.2, z: 2.2, r: 1.6 },
      { x: -2.8, z: 7.4, r: 1.5 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_cr_prism_cross',
    modeId: 'crystal_rush',
    status: 'release',
    nameRu: 'Призменный Перекрёсток',
    nameEn: 'Prism Crossroads',
    theme: 'crystal_canyon',
    halfWalls: [
      { x: -3.2, z: 3.8, w: 1.6, d: 2.8 },
      { x: 5.4, z: 4.5, w: 2.8, d: 1.5 },
      { x: -5.6, z: 8.8, w: 3.0, d: 1.5 },
      { x: 2.6, z: 9.8, w: 2.2, d: 1.4 }
    ],
    halfBushes: [
      { x: 0, z: 4.4, r: 1.55 },
      { x: -7.8, z: 4.0, r: 1.75 },
      { x: 7.8, z: 4.0, r: 1.75 },
      { x: 4.8, z: 7.6, r: 1.6 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_cr_orbital_garden',
    modeId: 'crystal_rush',
    status: 'release',
    nameRu: 'Орбитальный Сад',
    nameEn: 'Orbital Garden',
    theme: 'bio_dome',
    halfWalls: [
      { x: 0, z: 5.8, w: 4.2, d: 1.3 },
      { x: -5.8, z: 3.2, w: 1.6, d: 3.2 },
      { x: 5.8, z: 7.5, w: 2.6, d: 1.6 }
    ],
    halfBushes: [
      { x: -3.6, z: 2.4, r: 1.8 },
      { x: 3.6, z: 2.4, r: 1.8 },
      { x: -7.2, z: 7.2, r: 1.75 },
      { x: 0, z: 8.6, r: 1.6 }
    ]
  }),

  // Star Hunt (3 maps)
  makeSymmetricMap({
    id: 'map_sh_shooting_gallery',
    modeId: 'star_hunt',
    status: 'release',
    nameRu: 'Звёздный Полигон',
    nameEn: 'Starlight Plaza',
    theme: 'solar_plaza',
    halfWalls: [
      { x: -3.8, z: 4.4, w: 2.6, d: 1.4 },
      { x: 3.8, z: 4.4, w: 2.6, d: 1.4 },
      { x: -6.8, z: 8.5, w: 1.8, d: 2.8 },
      { x: 2.4, z: 9.6, w: 3.0, d: 1.3 }
    ],
    halfBushes: [
      { x: -7.5, z: 2.0, r: 1.8 },
      { x: -7.5, z: 4.2, r: 1.8 },
      { x: 0, z: 6.8, r: 1.7 },
      { x: 5.8, z: 7.2, r: 1.65 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_sh_emerald_canopy',
    modeId: 'star_hunt',
    status: 'release',
    nameRu: 'Изумрудный Купол',
    nameEn: 'Emerald Canopy',
    theme: 'bio_dome',
    halfWalls: [
      { x: -2.6, z: 3.2, w: 1.5, d: 2.2 },
      { x: 5.0, z: 5.4, w: 3.2, d: 1.4 },
      { x: -4.8, z: 9.0, w: 3.2, d: 1.4 }
    ],
    halfBushes: [
      { x: -5.4, z: 2.2, r: 1.85 },
      { x: -3.4, z: 5.8, r: 1.8 },
      { x: 3.2, z: 2.6, r: 1.8 },
      { x: 7.2, z: 8.0, r: 1.75 },
      { x: 0, z: 10.2, r: 1.6 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_sh_comet_ridge',
    modeId: 'star_hunt',
    status: 'release',
    nameRu: 'Хребет Кометы',
    nameEn: 'Comet Ridge',
    theme: 'cosmic_station',
    halfWalls: [
      { x: 0, z: 4.8, w: 3.0, d: 1.4 },
      { x: -6.0, z: 4.8, w: 2.4, d: 1.5 },
      { x: 6.0, z: 4.8, w: 2.4, d: 1.5 },
      { x: -3.4, z: 9.4, w: 2.4, d: 1.4 }
    ],
    halfBushes: [
      { x: -3.2, z: 2.0, r: 1.65 },
      { x: 3.2, z: 2.0, r: 1.65 },
      { x: -7.6, z: 8.2, r: 1.7 },
      { x: 6.6, z: 8.2, r: 1.7 }
    ]
  }),

  // Last Hero FFA (2 maps -> 3 + 3 + 2 = 8 Release Maps!)
  makeSymmetricMap({
    id: 'map_lh_meteor_crater',
    modeId: 'last_hero',
    status: 'release',
    nameRu: 'Кратер Метеора',
    nameEn: 'Meteor Crater',
    theme: 'crystal_canyon',
    width: 28,
    height: 28,
    halfWalls: [
      { x: -3.4, z: 3.4, w: 2.2, d: 1.6 },
      { x: 3.4, z: 3.4, w: 1.6, d: 2.2 },
      { x: -7.8, z: 2.5, w: 2.4, d: 1.6 },
      { x: 6.8, z: 7.8, w: 2.8, d: 1.6 },
      { x: -2.5, z: 8.8, w: 2.6, d: 1.5 }
    ],
    halfBushes: [
      { x: 0, z: 3.2, r: 1.7 },
      { x: -5.8, z: 5.8, r: 1.85 },
      { x: 5.8, z: 2.0, r: 1.75 },
      { x: -8.6, z: 8.0, r: 1.8 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_lh_ring_of_titans',
    modeId: 'last_hero',
    status: 'release',
    nameRu: 'Кольцо Титанов',
    nameEn: 'Ring of Titans',
    theme: 'solar_plaza',
    width: 28,
    height: 28,
    halfWalls: [
      { x: 0, z: 4.2, w: 3.2, d: 1.4 },
      { x: -4.8, z: 1.8, w: 1.5, d: 3.0 },
      { x: -6.4, z: 7.6, w: 2.8, d: 1.6 },
      { x: 5.8, z: 7.2, w: 2.4, d: 1.6 }
    ],
    halfBushes: [
      { x: -2.4, z: 2.0, r: 1.7 },
      { x: 2.4, z: 2.0, r: 1.7 },
      { x: -8.2, z: 4.5, r: 1.85 },
      { x: 8.2, z: 4.5, r: 1.85 },
      { x: 0, z: 8.6, r: 1.75 }
    ]
  }),

  // === LIVE-OPS MONTH 1 MAPS (4 symmetric maps for Vault Breach & Star Ball) ===
  makeSymmetricMap({
    id: 'map_vb_citadel_locks',
    modeId: 'vault_breach',
    status: 'liveops_m1',
    nameRu: 'Шлюзы Цитадели',
    nameEn: 'Citadel Airlocks',
    theme: 'cosmic_station',
    halfWalls: [
      { x: 0, z: 8.4, w: 3.6, d: 1.2 },
      { x: -5.2, z: 4.6, w: 2.6, d: 1.5 },
      { x: 5.2, z: 4.6, w: 2.6, d: 1.5 }
    ],
    halfBushes: [
      { x: -7.4, z: 3.2, r: 1.75 },
      { x: 7.4, z: 3.2, r: 1.75 },
      { x: -4.2, z: 7.8, r: 1.6 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_vb_laser_corridor',
    modeId: 'vault_breach',
    status: 'liveops_m1',
    nameRu: 'Лазерный Коридор',
    nameEn: 'Laser Corridor',
    theme: 'crystal_canyon',
    halfWalls: [
      { x: -3.2, z: 7.8, w: 2.4, d: 1.3 },
      { x: 3.2, z: 7.8, w: 2.4, d: 1.3 },
      { x: 0, z: 3.6, w: 2.8, d: 1.4 }
    ],
    halfBushes: [
      { x: -6.8, z: 5.5, r: 1.8 },
      { x: 6.8, z: 5.5, r: 1.8 },
      { x: 0, z: 6.2, r: 1.5 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_sb_astro_stadium',
    modeId: 'star_ball',
    status: 'liveops_m1',
    nameRu: 'Астро-Стадион',
    nameEn: 'Astro Stadium',
    theme: 'solar_plaza',
    halfWalls: [
      { x: 0, z: 9.8, w: 3.8, d: 1.1 },
      { x: -4.8, z: 4.8, w: 2.4, d: 1.4 },
      { x: 4.8, z: 4.8, w: 2.4, d: 1.4 }
    ],
    halfBushes: [
      { x: -7.6, z: 2.8, r: 1.75 },
      { x: 7.6, z: 2.8, r: 1.75 },
      { x: -5.4, z: 8.2, r: 1.6 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_sb_neon_pitch',
    modeId: 'star_ball',
    status: 'liveops_m1',
    nameRu: 'Неоновое Поле',
    nameEn: 'Neon Pitch',
    theme: 'bio_dome',
    halfWalls: [
      { x: -2.8, z: 9.6, w: 2.2, d: 1.2 },
      { x: 2.8, z: 9.6, w: 2.2, d: 1.2 },
      { x: -5.8, z: 3.4, w: 1.6, d: 2.6 }
    ],
    halfBushes: [
      { x: -3.2, z: 5.2, r: 1.65 },
      { x: 3.2, z: 5.2, r: 1.65 },
      { x: 7.4, z: 6.8, r: 1.75 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_hz_solar_ring',
    modeId: 'hot_zone',
    status: 'liveops_m1',
    nameRu: 'Солнечное Кольцо',
    nameEn: 'Solar Ring',
    theme: 'solar_plaza',
    halfWalls: [
      { x: -4.2, z: 4.8, w: 2.8, d: 1.4 },
      { x: 4.2, z: 4.8, w: 2.8, d: 1.4 },
      { x: 0, z: 9.0, w: 3.4, d: 1.3 }
    ],
    halfBushes: [
      { x: -6.8, z: 2.6, r: 1.8 },
      { x: 6.8, z: 2.6, r: 1.8 },
      { x: -3.6, z: 8.0, r: 1.65 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_hz_plasma_nexus',
    modeId: 'hot_zone',
    status: 'liveops_m1',
    nameRu: 'Плазменный Узел',
    nameEn: 'Plasma Nexus',
    theme: 'cosmic_station',
    halfWalls: [
      { x: -5.2, z: 3.4, w: 1.6, d: 2.8 },
      { x: 5.2, z: 3.4, w: 1.6, d: 2.8 },
      { x: -2.8, z: 8.6, w: 2.6, d: 1.4 }
    ],
    halfBushes: [
      { x: 0, z: 4.8, r: 1.6 },
      { x: -7.4, z: 6.6, r: 1.75 },
      { x: 7.4, z: 6.6, r: 1.75 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_bs_titan_core',
    modeId: 'boss_siege',
    status: 'liveops_m1',
    nameRu: 'Реактор Титана',
    nameEn: 'Titan Reactor',
    theme: 'cosmic_station',
    halfWalls: [
      { x: -5.4, z: 5.8, w: 2.6, d: 1.5 },
      { x: 5.4, z: 5.8, w: 2.6, d: 1.5 }
    ],
    halfBushes: [
      { x: -7.6, z: 8.6, r: 1.7 },
      { x: 7.6, z: 8.6, r: 1.7 }
    ]
  }),
  makeSymmetricMap({
    id: 'map_bs_omega_forge',
    modeId: 'boss_siege',
    status: 'liveops_m1',
    nameRu: 'Кузня Омеги',
    nameEn: 'Omega Forge',
    theme: 'solar_plaza',
    halfWalls: [
      { x: -4.8, z: 6.4, w: 2.4, d: 1.5 },
      { x: 4.8, z: 6.4, w: 2.4, d: 1.5 }
    ],
    halfBushes: [
      { x: -7.2, z: 3.2, r: 1.7 },
      { x: 7.2, z: 3.2, r: 1.7 }
    ]
  })
];

// ─────────────────────────────────────────────────────────────
// 7. META PROGRESSION: Trophy Road (0..1500 by 50), 8-Week Season (30 tiers),
//    14 Achievements, Daily Quests, Friend Ghosts
// ─────────────────────────────────────────────────────────────
const trophyRoad = [];
for (let t = 50; t <= 1500; t += 50) {
  let reward;
  if (t === 200) {
    const h = heroes.find(x => x.trophyRoadUnlock === 200) || heroes[4];
    reward = { type: 'hero', heroId: h.id, labelRu: `Герой: ${h.nameRu}`, labelEn: `Hero: ${h.nameEn}` };
  } else if (t === 500) {
    const h = heroes.find(x => x.trophyRoadUnlock === 500) || heroes[32];
    reward = { type: 'hero', heroId: h.id, labelRu: `Герой: ${h.nameRu}`, labelEn: `Hero: ${h.nameEn}` };
  } else if (t === 900) {
    const h = heroes.find(x => x.trophyRoadUnlock === 900) || heroes[56];
    reward = { type: 'hero', heroId: h.id, labelRu: `Герой: ${h.nameRu}`, labelEn: `Hero: ${h.nameEn}` };
  } else if (t % 150 === 0) {
    reward = { type: 'case', count: 1, labelRu: 'Звёздный Кейс', labelEn: 'Star Case' };
  } else if (t % 100 === 0) {
    const pp = 40 + Math.floor(t / 50) * 5;
    reward = { type: 'power_points', amount: pp, labelRu: `${pp} Очков силы`, labelEn: `${pp} Power Points` };
  } else {
    const coins = 80 + Math.floor(t / 50) * 12;
    reward = { type: 'coins', amount: coins, labelRu: `${coins} Монет`, labelEn: `${coins} Coins` };
  }
  trophyRoad.push({ trophies: t, reward });
}

const seasonTiers = [];
for (let tier = 1; tier <= 30; tier++) {
  let reward;
  if (tier % 5 === 0) {
    reward = { type: 'case', count: 1, labelRu: 'Звёздный Кейс', labelEn: 'Star Case' };
  } else if (tier === 28) {
    reward = { type: 'skin', skinId: skins[2].id, labelRu: `Скин: ${skins[2].nameRu}`, labelEn: `Skin: ${skins[2].nameEn}` };
  } else if (tier % 2 === 0) {
    const pp = 30 + tier * 3;
    reward = { type: 'power_points', amount: pp, labelRu: `${pp} Очков силы`, labelEn: `${pp} Power Points` };
  } else {
    const coins = 65 + tier * 8;
    reward = { type: 'coins', amount: coins, labelRu: `${coins} Монет`, labelEn: `${coins} Coins` };
  }
  seasonTiers.push({
    tier,
    tokensRequired: tier * 40,
    reward
  });
}

const achievements = [
  { id: 'ach_first_win', target: 1, metric: 'wins', nameRu: 'Первая Звезда', nameEn: 'First Star', descRu: 'Победи в 1 матче', descEn: 'Win 1 match', reward: { type: 'coins', amount: 100 } },
  { id: 'ach_wins_10', target: 10, metric: 'wins', nameRu: 'Ударный Отряд', nameEn: 'Strike Squad', descRu: 'Одержи 10 побед', descEn: 'Win 10 matches', reward: { type: 'case', count: 1 } },
  { id: 'ach_wins_50', target: 50, metric: 'wins', nameRu: 'Капитан Галактики', nameEn: 'Galaxy Captain', descRu: 'Одержи 50 побед', descEn: 'Win 50 matches', reward: { type: 'case', count: 1 } },
  { id: 'ach_takedowns_25', target: 25, metric: 'takedowns', nameRu: 'Звездопад', nameEn: 'Starfall', descRu: 'Соверши 25 нокаутов', descEn: 'Score 25 takedowns', reward: { type: 'power_points', amount: 60 } },
  { id: 'ach_takedowns_100', target: 100, metric: 'takedowns', nameRu: 'Сверхновая', nameEn: 'Supernova', descRu: 'Соверши 100 нокаутов', descEn: 'Score 100 takedowns', reward: { type: 'case', count: 1 } },
  { id: 'ach_crystals_30', target: 30, metric: 'crystalsGrabbed', nameRu: 'Искатель Кристаллов', nameEn: 'Crystal Seeker', descRu: 'Подбери 30 кристаллов в матчах', descEn: 'Collect 30 crystals in matches', reward: { type: 'coins', amount: 150 } },
  { id: 'ach_supers_15', target: 15, metric: 'supersUsed', nameRu: 'Полный Заряд', nameEn: 'Full Charge', descRu: 'Примени СУПЕР 15 раз', descEn: 'Unleash SUPER 15 times', reward: { type: 'power_points', amount: 50 } },
  { id: 'ach_heroes_5', target: 5, metric: 'heroesUnlocked', nameRu: 'Сбор Отряда', nameEn: 'Squad Assembly', descRu: 'Открой 5 героев', descEn: 'Unlock 5 heroes', reward: { type: 'coins', amount: 180 } },
  { id: 'ach_heroes_15', target: 15, metric: 'heroesUnlocked', nameRu: 'Коллекционер', nameEn: 'Star Collector', descRu: 'Открой 15 героев', descEn: 'Unlock 15 heroes', reward: { type: 'case', count: 1 } },
  { id: 'ach_upgrade_lv7', target: 7, metric: 'maxHeroLevel', nameRu: 'Пробуждение Таланта', nameEn: 'Talent Awakened', descRu: 'Прокачай героя до 7 уровня', descEn: 'Upgrade a hero to Level 7', reward: { type: 'coins', amount: 250 } },
  { id: 'ach_upgrade_lv9', target: 9, metric: 'maxHeroLevel', nameRu: 'Пик Мощи', nameEn: 'Peak Power', descRu: 'Прокачай героя до 9 уровня', descEn: 'Upgrade a hero to Level 9', reward: { type: 'case', count: 1 } },
  { id: 'ach_hardcore_win', target: 1, metric: 'hardcoreWins', nameRu: 'Испытание Огнём', nameEn: 'Trial by Starfire', descRu: 'Победи с модификатором Хардкор', descEn: 'Win a match with Hardcore modifier', reward: { type: 'case', count: 1 } },
  { id: 'ach_ghost_ally', target: 1, metric: 'ghostMatches', nameRu: 'Плечом к Плечу', nameEn: 'Side by Side', descRu: 'Сыграй матч с Призраком друга', descEn: 'Play a match with a Friend Ghost ally', reward: { type: 'coins', amount: 150 } },
  { id: 'ach_trophies_500', target: 500, metric: 'totalTrophies', nameRu: 'Восходящая Легенда', nameEn: 'Rising Legend', descRu: 'Набери 500 кубков', descEn: 'Reach 500 total trophies', reward: { type: 'case', count: 1 } },
  { id: 'ach_boss_win', target: 1, metric: 'bossesDefeated', nameRu: 'Гроза Титана', nameEn: 'Titan Slayer', descRu: 'Победи Мега-Титана в режиме Осады', descEn: 'Defeat the Mega-Titan in Titan Siege', reward: { type: 'case', count: 1 } },
  { id: 'ach_overdrive_10', target: 10, metric: 'overdrivesUsed', nameRu: 'Гиперпульс', nameEn: 'Overdrive Master', descRu: 'Активируй Овердрайв 10 раз', descEn: 'Activate Overdrive 10 times', reward: { type: 'power_points', amount: 75 } }
];

const dailyQuestTemplates = [
  { id: 'dq_matches_3', metric: 'matches', target: 3, nameRu: 'Сыграй 3 матча на арене', nameEn: 'Play 3 arena matches', rewardCoins: 90, seasonTokens: 30 },
  { id: 'dq_wins_2', metric: 'wins', target: 2, nameRu: 'Одержи 2 победы в любом режиме', nameEn: 'Win 2 matches in any mode', rewardCoins: 110, seasonTokens: 35 },
  { id: 'dq_takedowns_6', metric: 'takedowns', target: 6, nameRu: 'Выбей 6 соперников', nameEn: 'Score 6 takedowns', rewardPowerPoints: 35, seasonTokens: 30 },
  { id: 'dq_supers_3', metric: 'supersUsed', target: 3, nameRu: 'Используй СУПЕР 3 раза', nameEn: 'Activate SUPER 3 times', rewardCoins: 85, seasonTokens: 25 },
  { id: 'dq_crystals_8', metric: 'crystalsGrabbed', target: 8, nameRu: 'Подбери 8 кристаллов в Гонке', nameEn: 'Grab 8 crystals in Crystal Rush', rewardPowerPoints: 30, seasonTokens: 30 }
];

const presetFriendGhosts = [
  {
    code: 'GHOST-MAX-770',
    nameRu: 'Макс_Космос',
    nameEn: 'Max_Cosmos',
    trophies: 770,
    heroId: 'assassin_storm',
    skinId: 'skin_07_assassin',
    level: 6,
    personality: 'aggressor'
  },
  {
    code: 'GHOST-ALISA-540',
    nameRu: 'Алиса_Нова',
    nameEn: 'Alisa_Nova',
    trophies: 540,
    heroId: 'healer_light',
    skinId: 'skin_05_healer',
    level: 5,
    personality: 'cautious'
  },
  {
    code: 'GHOST-ARTEM-920',
    nameRu: 'Артём_Титан',
    nameEn: 'Artem_Titan',
    trophies: 920,
    heroId: 'tank_fire',
    skinId: 'skin_03_tank',
    level: 7,
    personality: 'greedy'
  }
];

// Write JSON files
fs.writeFileSync(
  path.join(OUT_DIR, 'balance.json'),
  JSON.stringify(
    {
      version: '1.0.0',
      tickRateHz: 20,
      autoAimConeDeg: 25,
      archetypes: ARCHETYPES,
      elements: ELEMENTS,
      levelCurve: LEVEL_CURVE,
      botBrackets: BOT_BRACKETS,
      rubberbanding: {
        minTrophies: 300,
        lossStreakTrigger: 3,
        aiStepDeltaOnLossStreak: -1,
        aiStepDeltaOnWinStreak: 0
      },
      hardcoreModifier: {
        coinsMultiplier: 2.0,
        enemyAiStepDelta: 1
      },
      alliedBotStepDelta: -1,
      modes: MODES,
      modifiers: ARENA_MODIFIERS,
      bossTiers: BOSS_TIERS,
      cases: CASE_CONFIG
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(OUT_DIR, 'heroes.json'),
  JSON.stringify({ version: '1.0.0', totalHeroes: heroes.length, rarityCounts: counts, heroes, skins }, null, 2)
);

fs.writeFileSync(
  path.join(OUT_DIR, 'maps.json'),
  JSON.stringify(
    {
      version: '1.0.0',
      rotationPerModePerWeek: 2,
      releaseMapCount: MAPS.filter(m => m.status === 'release').length,
      liveOpsMapCount: MAPS.filter(m => m.status === 'liveops_m1').length,
      maps: MAPS
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(OUT_DIR, 'meta.json'),
  JSON.stringify(
    {
      version: '1.0.0',
      season: {
        id: 's1_cosmic_vortex',
        durationWeeks: 8,
        nameRu: 'Сезон 1: Звёздный Вихрь',
        nameEn: 'Season 1: Star Vortex',
        tiers: seasonTiers
      },
      trophyRoad,
      achievements,
      dailyQuestTemplates,
      dailyChainBonus: { type: 'case', count: 1 },
      presetFriendGhosts
    },
    null,
    2
  )
);

console.log('Generated data files successfully:', {
  heroes: heroes.length,
  rarityCounts: counts,
  skins: skins.length,
  releaseMaps: MAPS.filter(m => m.status === 'release').length,
  liveOpsMaps: MAPS.filter(m => m.status === 'liveops_m1').length,
  trophyRoadMilestones: trophyRoad.length,
  seasonTiers: seasonTiers.length,
  achievements: achievements.length
});
