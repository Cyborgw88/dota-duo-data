import fs from 'node:fs/promises';

const report = JSON.parse(await fs.readFile('data/report.json', 'utf8'));
const matches = Array.isArray(report.matches) ? report.matches : [];

const indexMatches = matches.map(m => ({
  match_id: m.match_id,
  start_time: m.start_time,
  start_iso: m.start_iso,
  duration_sec: m.duration_sec,
  duration_min: m.duration_min,
  lobby_type: m.lobby_type,
  game_mode: m.game_mode,
  radiant_win: m.radiant_win,
  parsed: m.parsed,
  parse_version: m.parse_version,
  same_team: m.same_team,
  cyborg: m.cyborg,
  goddess: m.goddess,
  objective_count: Array.isArray(m.objectives) ? m.objectives.length : 0,
  teamfight_count: Array.isArray(m.teamfights) ? m.teamfights.length : 0
}));

const index = {
  generated_at: report.generated_at,
  source: report.source,
  players: report.players,
  filters: report.filters,
  count: report.count,
  parsing: report.parsing,
  note: report.note,
  matches: indexMatches
};

await fs.mkdir('data/matches', { recursive: true });
await fs.writeFile('data/index.json', JSON.stringify(index, null, 2) + '\n');

for (const m of matches) {
  await fs.writeFile(`data/matches/${m.match_id}.json`, JSON.stringify(m, null, 2) + '\n');
}

console.log(`Saved compact index and ${matches.length} per-match report files`);
