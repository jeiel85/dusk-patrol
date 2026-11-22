/* DUSK PATROL — campaign.js
   Wave composition, spawn pacing, the upgrade pool and the run's
   difficulty curve. Loaded as a classic script in order (see index.html). */
'use strict';

/* ---------- upgrade cards ---------- */
// `apply` mutates game.mods; `max` caps how many times a card can be taken.
const UPGRADES = [
  {
    id: 'dmg', name: 'HEAVY ROUNDS', desc: 'CANNON DAMAGE +25%', max: 4,
    apply: m => { m.dmgMult += 0.25; }
  },
  {
    id: 'rate', name: 'FEED BOOST', desc: 'CANNON FIRE RATE +18%', max: 3,
    apply: m => { m.fireRate += 0.18; }
  },
  {
    id: 'heat', name: 'COOLANT LOOP', desc: 'HEAT CAPACITY +40%', max: 2,
    apply: m => { m.heatCap += 0.4; }
  },
  {
    id: 'hull', name: 'HULL PLATE', desc: 'MAX HULL +25 AND REPAIR', max: 3,
    apply: m => { m.hullMax += 25; game.hull = Math.min(m.hullMax, game.hull + 25); }
  },
  {
    id: 'shield', name: 'DEFLECTOR', desc: 'MAX SHIELD +20', max: 3,
    apply: m => { m.shieldMax += 20; game.shield = m.shieldMax; }
  },
  {
    id: 'pod', name: 'MISSILE POD', desc: 'MISSILE CAPACITY +2', max: 2,
    apply: m => { m.missileMax += 2; weapons.ammo = m.missileMax; }
  },
  {
    id: 'flare', name: 'FLARE RACK', desc: 'FLARES +1, FASTER RELOAD', max: 2,
    apply: m => { m.flareMax += 1; m.flareCd *= 0.8; weapons.flares = m.flareMax; }
  },
  {
    id: 'engine', name: 'TUNED ENGINES', desc: 'SPEED +12%, TURN +12%', max: 3,
    apply: m => { m.speedMult += 0.12; m.turnMult += 0.12; }
  },
  {
    id: 'aim', name: 'TARGETING AI', desc: 'CRITICAL HIT CHANCE +12%', max: 3,
    apply: m => { m.crit += 0.12; }
  },
  {
    id: 'repair', name: 'NANO REPAIR', desc: 'EACH KILL REPAIRS 4 HULL', max: 2,
    apply: m => { m.healPerKill += 4; }
  },
  {
    id: 'frame', name: 'G-FRAME', desc: 'BARREL ROLL RECHARGE -35%', max: 2,
    apply: m => { m.rollCd *= 0.65; }
  }
];

function defaultMods() {
  return {
    dmgMult: 1, fireRate: 1, heatCap: 1,
    hullMax: 100, shieldMax: 40,
    missileMax: 4, flareMax: 3, flareCd: 16,
    speedMult: 1, turnMult: 1,
    crit: 0.06, healPerKill: 0, rollCd: 4.0
  };
}

/* ---------- campaign state ---------- */
const campaign = {
  wave: 0, phase: 'idle', queue: [], spawnT: 0, interT: 0,
  offers: [], picks: {}, bossWave: false, boss: null,
  bestWave: 0, cleared: 0
};
try { campaign.bestWave = parseInt(localStorage.getItem('duskPatrolBestWave') || '0', 10) || 0; } catch (e) { }

// Every 5th wave is a carrier boss with an escort. Otherwise the mix of
// drones, interceptors and gunships grows with the wave number.
function waveComposition(n) {
  if (n % 5 === 0) {
    return {
      boss: true,
      list: [{ type: 'carrier', count: 1 }, { type: 'interceptor', count: 2 + Math.floor(n / 5) }]
    };
  }
  const list = [{ type: 'drone', count: 3 + n }];
  if (n >= 2) list.push({ type: 'interceptor', count: Math.min(7, n - 1) });
  if (n >= 4) list.push({ type: 'gunship', count: Math.min(4, Math.floor((n - 2) / 2)) });
  return { boss: false, list };
}

function maxAlive(n) { return Math.min(13, 5 + Math.floor(n * 0.8)); }

function startWave(n) {
  campaign.wave = n;
  campaign.picks = campaign.picks || {};
  const comp = waveComposition(n);
  campaign.bossWave = comp.boss;
  campaign.boss = null;
  campaign.queue = [];
  for (const group of comp.list) {
    for (let i = 0; i < group.count; i++) campaign.queue.push(group.type);
  }
  // Interleave the queue so a wave does not arrive as one solid block of type.
  for (let i = campaign.queue.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = campaign.queue[i]; campaign.queue[i] = campaign.queue[j]; campaign.queue[j] = t;
  }
  campaign.phase = 'fight';
  campaign.spawnT = 0.5;
  campaign.interT = 0;
  enemies.length = 0;
  game.waveBanner = 2.6;
  game.waveBonus = 0;
  audio.beep(comp.boss ? 300 : 760);
}

function aliveEnemies() {
  let n = 0;
  for (const e of enemies) if (e.alive) n++;
  return n;
}

function updateCampaign(dt) {
  if (game.state !== 'play') return;
  if (campaign.phase === 'fight') {
    campaign.spawnT -= dt;
    if (campaign.queue.length && campaign.spawnT <= 0 && aliveEnemies() < maxAlive(campaign.wave)) {
      spawnEnemy(campaign.queue.shift());
      campaign.spawnT = Math.max(0.3, 0.9 - campaign.wave * 0.035);
    }
    if (!campaign.queue.length && aliveEnemies() === 0) {
      campaign.phase = 'clear';
      campaign.interT = 1.9;
      game.waveBonus = 500 * campaign.wave;
      game.score += game.waveBonus;
      campaign.cleared = campaign.wave;
      if (campaign.wave > campaign.bestWave) {
        campaign.bestWave = campaign.wave;
        try { localStorage.setItem('duskPatrolBestWave', String(campaign.bestWave)); } catch (e) { }
      }
      game.shake = Math.max(game.shake, 0.18);
      audio.waveClear();
    }
  } else if (campaign.phase === 'clear') {
    campaign.interT -= dt;
    if (campaign.interT <= 0) openUpgrades();
  }
}

function pickOffers() {
  const bag = UPGRADES.filter(u => (campaign.picks[u.id] || 0) < u.max);
  const offers = [];
  while (offers.length < 3 && bag.length) {
    offers.push(bag.splice((Math.random() * bag.length) | 0, 1)[0]);
  }
  return offers;
}

function openUpgrades() {
  if (campaign.phase !== 'clear') return;
  campaign.offers = pickOffers();
  if (!campaign.offers.length) { startWave(campaign.wave + 1); return; }
  campaign.phase = 'upgrade';
  game.state = 'upgrade';
  audio.beep(660);
}

function chooseUpgrade(i) {
  if (game.state !== 'upgrade') return;
  const u = campaign.offers[i];
  if (!u) return;
  campaign.picks[u.id] = (campaign.picks[u.id] || 0) + 1;
  u.apply(game.mods);
  game.hull = Math.min(game.hull, game.mods.hullMax);
  game.shield = Math.min(game.shield, game.mods.shieldMax);
  audio.upgrade();
  game.state = 'play';
  campaign.phase = 'clear';
  startWave(campaign.wave + 1);
}

/* ---------- run grading ---------- */
function runGrade() {
  const wave = Math.max(1, campaign.wave);
  const acc = game.missilesFired ? game.missileHits / game.missilesFired : 0;
  let pts = Math.min(4, wave / 2.6);
  pts += Math.min(3, game.score / (wave * 900));
  pts += Math.min(2, game.bestCombo / 8);
  pts += acc > 0.5 ? 1 : acc > 0.25 ? 0.5 : 0;
  if (pts >= 8.6) return 'S';
  if (pts >= 7.1) return 'A';
  if (pts >= 5.6) return 'B';
  if (pts >= 4.0) return 'C';
  return 'D';
}
