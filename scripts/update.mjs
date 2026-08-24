import fs from 'node:fs/promises';

const A = 206620580;
const B = 160810596;
const BASE = 'https://api.opendota.com/api';
const DAYS = 30;
const LIMIT = 30;

const isRadiant = slot => Number(slot) < 128;
const won = (p, radiantWin) => isRadiant(p.player_slot) ? !!radiantWin : !radiantWin;
const laneName = role => ({0:'unknown',1:'safe',2:'mid',3:'off',4:'jungle'})[role ?? 0] ?? 'unknown';

async function get(path) {
  const url = new URL(BASE + path);
  if (process.env.OPENDOTA_API_KEY) url.searchParams.set('api_key', process.env.OPENDOTA_API_KEY);
  const r = await fetch(url, { headers: {'user-agent':'dota-duo-data/1.0'} });
  if (!r.ok) throw new Error(`OpenDota ${r.status}: ${(await r.text()).slice(0,300)}`);
  return r.json();
}

function inferPositions(players) {
  const out = new Map();
  for (const team of [players.filter(p=>isRadiant(p.player_slot)), players.filter(p=>!isRadiant(p.player_slot))]) {
    const lanes = new Map();
    for (const p of team) {
      const lr = p.lane_role ?? 0;
      if (!lanes.has(lr)) lanes.set(lr, []);
      lanes.get(lr).push(p);
    }
    for (const p of lanes.get(2) || []) out.set(p.account_id,{position:2,confidence:'high',reason:'lane_role=mid'});
    const score = p => (p.gold_per_min||0)+(p.xp_per_min||0)*.35+(p.last_hits||0)*1.5-((p.purchase_ward_observer||0)+(p.purchase_ward_sentry||0))*8;
    const split=(lr,core,support)=>{
      const g=[...(lanes.get(lr)||[])].filter(p=>!out.has(p.account_id));
      if(g.length===1) out.set(g[0].account_id,{position:core,confidence:'medium',reason:`single ${laneName(lr)}-lane player`});
      else if(g.length>=2){
        g.sort((x,y)=>score(y)-score(x));
        out.set(g[0].account_id,{position:core,confidence:'medium',reason:`${laneName(lr)} lane + higher farm/economy`});
        for(const p of g.slice(1)) out.set(p.account_id,{position:support,confidence:'medium',reason:`${laneName(lr)} lane + lower farm/economy`});
      }
    };
    split(1,1,5); split(3,3,4);
    const rest=team.filter(p=>!out.has(p.account_id)).sort((x,y)=>score(y)-score(x));
    const used=new Set([...out.values()].map(x=>x.position));
    const avail=[1,3,4,5].filter(x=>!used.has(x));
    rest.forEach((p,i)=>out.set(p.account_id,{position:avail[i]??null,confidence:'low',reason:'fallback by farm/economy'}));
  }
  return out;
}

const heroesRaw = await get('/constants/heroes');
const heroes = new Map(Object.entries(heroesRaw).map(([id,h])=>[Number(id),h.localized_name||h.name||id]));
const list = await get(`/players/${A}/matches?included_account_id=${B}&lobby_type=7&date=${DAYS}&limit=${LIMIT}`);
const details=[];
for(let i=0;i<list.length;i+=5){
  details.push(...await Promise.all(list.slice(i,i+5).map(m=>get(`/matches/${m.match_id}`))));
  if(i+5<list.length) await new Promise(r=>setTimeout(r,500));
}

function slim(p, role, radiantWin){
  return {
    account_id:p.account_id, hero_id:p.hero_id, hero:heroes.get(Number(p.hero_id))||String(p.hero_id),
    team:isRadiant(p.player_slot)?'Radiant':'Dire', won:won(p,radiantWin), kills:p.kills,deaths:p.deaths,assists:p.assists,
    last_hits:p.last_hits,denies:p.denies,gold_per_min:p.gold_per_min,xp_per_min:p.xp_per_min,
    hero_damage:p.hero_damage,tower_damage:p.tower_damage,hero_healing:p.hero_healing,
    lane_role:p.lane_role,lane:laneName(p.lane_role),is_roaming:p.is_roaming,
    wards_observer:p.purchase_ward_observer,wards_sentry:p.purchase_ward_sentry,
    position_guess:role?.position??null,position_confidence:role?.confidence??'unknown',position_reason:role?.reason??null
  };
}

const matches=details.map(m=>{
  const ps=Array.isArray(m.players)?m.players:[]; const roles=inferPositions(ps);
  const a=ps.find(p=>Number(p.account_id)===A), b=ps.find(p=>Number(p.account_id)===B);
  return {
    match_id:m.match_id,start_time:m.start_time,start_iso:m.start_time?new Date(m.start_time*1000).toISOString():null,
    duration_sec:m.duration,duration_min:m.duration?Math.round(m.duration/6)/10:null,lobby_type:m.lobby_type,game_mode:m.game_mode,
    radiant_win:m.radiant_win,parsed:!!m.version,same_team:a&&b?isRadiant(a.player_slot)===isRadiant(b.player_slot):null,
    cyborg:a?slim(a,roles.get(A),m.radiant_win):null,goddess:b?slim(b,roles.get(B),m.radiant_win):null,
    objectives:Array.isArray(m.objectives)?m.objectives:[],teamfights:Array.isArray(m.teamfights)?m.teamfights:[]
  };
}).filter(m=>m.cyborg&&m.goddess&&m.same_team).sort((x,y)=>y.start_time-x.start_time);

await fs.mkdir('data',{recursive:true});
await fs.writeFile('data/latest.json',JSON.stringify({generated_at:new Date().toISOString(),source:'OpenDota',players:{cyborg:A,goddess:B},filters:{ranked_only:true,days:DAYS,limit:LIMIT},count:matches.length,note:'position_guess is heuristic; use position_confidence.',matches},null,2)+'\n');
console.log(`Saved ${matches.length} joint ranked matches`);
