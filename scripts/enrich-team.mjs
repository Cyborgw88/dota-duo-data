import fs from 'node:fs/promises';

const BASE = 'https://api.opendota.com/api';
const A = 206620580;
const B = 160810596;
const isRadiant = slot => Number(slot) < 128;
const laneName = role => ({0:'unknown',1:'safe',2:'mid',3:'off',4:'jungle'})[role ?? 0] ?? 'unknown';

async function get(path) {
  const url = new URL(BASE + path);
  if (process.env.OPENDOTA_API_KEY) url.searchParams.set('api_key', process.env.OPENDOTA_API_KEY);
  const r = await fetch(url, { headers: {'user-agent':'dota-duo-data/2.0-team-coach'} });
  if (!r.ok) throw new Error(`OpenDota ${r.status}: ${(await r.text()).slice(0,300)}`);
  return r.json();
}

const heroesRaw = await get('/constants/heroes');
const heroes = new Map(Object.entries(heroesRaw).map(([id,h]) => [Number(id), h.localized_name || h.name || id]));
const index = JSON.parse(await fs.readFile('data/index.json', 'utf8'));
const ids = (index.matches || []).map(m => Number(m.match_id));

function playerSummary(p) {
  return {
    account_id: p.account_id ?? null,
    personaname: p.personaname ?? null,
    hero_id: p.hero_id,
    hero: heroes.get(Number(p.hero_id)) || String(p.hero_id),
    player_slot: p.player_slot,
    team: isRadiant(p.player_slot) ? 'Radiant' : 'Dire',
    kills: p.kills, deaths: p.deaths, assists: p.assists,
    last_hits: p.last_hits, denies: p.denies,
    gold_per_min: p.gold_per_min, xp_per_min: p.xp_per_min,
    net_worth: p.net_worth ?? null,
    hero_damage: p.hero_damage, tower_damage: p.tower_damage, hero_healing: p.hero_healing,
    lane_role: p.lane_role, lane: laneName(p.lane_role), is_roaming: p.is_roaming,
    wards_observer: p.purchase_ward_observer, wards_sentry: p.purchase_ward_sentry,
    stuns: p.stuns ?? null,
    level: p.level ?? null,
    item_0: p.item_0 ?? null, item_1: p.item_1 ?? null, item_2: p.item_2 ?? null,
    item_3: p.item_3 ?? null, item_4: p.item_4 ?? null, item_5: p.item_5 ?? null,
    backpack_0: p.backpack_0 ?? null, backpack_1: p.backpack_1 ?? null, backpack_2: p.backpack_2 ?? null,
    aghanims_scepter: p.aghanims_scepter ?? null, aghanims_shard: p.aghanims_shard ?? null,
    buyback_count: p.buyback_count ?? null,
    teamfight_participation: p.teamfight_participation ?? null,
    kills_per_min: p.kills_per_min ?? null
  };
}

function tfPlayer(tf, players, idx) {
  const x = Array.isArray(tf.players) ? tf.players[idx] : null;
  const p = players[idx];
  if (!x || !p) return null;
  return {
    account_id: p.account_id ?? null,
    personaname: p.personaname ?? null,
    hero: heroes.get(Number(p.hero_id)) || String(p.hero_id),
    team: isRadiant(p.player_slot) ? 'Radiant' : 'Dire',
    deaths: x.deaths ?? 0, buybacks: x.buybacks ?? 0,
    damage: x.damage ?? 0, healing: x.healing ?? 0,
    gold_delta: x.gold_delta ?? 0, xp_delta: x.xp_delta ?? 0,
    killed: x.killed ?? {}, ability_uses: x.ability_uses ?? {}, item_uses: x.item_uses ?? {}
  };
}

for (let i = 0; i < ids.length; i += 5) {
  const batch = ids.slice(i, i + 5);
  const raws = await Promise.all(batch.map(id => get(`/matches/${id}`)));
  for (const m of raws) {
    const path = `data/matches/${m.match_id}.json`;
    let report;
    try { report = JSON.parse(await fs.readFile(path, 'utf8')); } catch { continue; }
    const players = Array.isArray(m.players) ? m.players : [];
    const a = players.find(p => Number(p.account_id) === A);
    const duoTeam = a ? (isRadiant(a.player_slot) ? 'Radiant' : 'Dire') : null;
    const all = players.map(playerSummary);
    const allies = all.filter(p => p.team === duoTeam);
    const enemies = all.filter(p => p.team !== duoTeam);

    report.team_context = {
      duo_team: duoTeam,
      radiant_win: !!m.radiant_win,
      allies,
      enemies,
      radiant_heroes: all.filter(p => p.team === 'Radiant').map(p => p.hero),
      dire_heroes: all.filter(p => p.team === 'Dire').map(p => p.hero),
      picks_bans: Array.isArray(m.picks_bans) ? m.picks_bans : [],
      draft_note: 'For ranked games picks_bans may be absent; use the final 5v5 hero lineups for composition analysis.'
    };

    report.team_teamfights = (Array.isArray(m.teamfights) ? m.teamfights : []).map(tf => ({
      start: tf.start, end: tf.end, last_death: tf.last_death, deaths: tf.deaths,
      players: players.map((_, idx) => tfPlayer(tf, players, idx)).filter(Boolean)
    }));

    report.team_analysis_capabilities = {
      full_lineups: all.length === 10,
      all_player_summaries: all.length === 10,
      teamfights_available: Array.isArray(m.teamfights) && m.teamfights.length > 0,
      objectives_available: Array.isArray(m.objectives) && m.objectives.length > 0,
      picks_bans_available: Array.isArray(m.picks_bans) && m.picks_bans.length > 0
    };

    await fs.writeFile(path, JSON.stringify(report, null, 2) + '\n');
  }
  if (i + 5 < ids.length) await new Promise(r => setTimeout(r, 500));
}

console.log(`Enriched ${ids.length} per-match files with full 5v5 team context for coaching.`);
