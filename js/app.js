const state = {
  db:null,
  day:new Date("2025-07-01T12:00:00"),
  view:"dashboard",
  selectedClubId:null
};
const $ = (selector) => document.querySelector(selector);
const money = (n) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);
const dateLabel = (d) => d.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}).replace(".","").toUpperCase();
async function init(){
  try{
    const response = await fetch("data/database.json");
    if(!response.ok) throw new Error("Não foi possível abrir data/database.json");
    state.db = await response.json();
  
    $("#advance-day").addEventListener("click",advanceDay);
    $("#main-nav").addEventListener("click",e=>{
      const button=e.target.closest("[data-view]");
      if(!button)return;
      state.view=button.dataset.view;
      document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b===button));
      render();
    });
    render();
  }catch(error){$("#view-root").innerHTML=`<div class="notice">Erro ao carregar os dados: ${error.message}<br>Abra o projeto usando um servidor local (por exemplo, Live Server), pois o navegador pode bloquear fetch em arquivos abertos diretamente.</div>`;}
}
function selectClub(clubId){
  state.selectedClubId = clubId;
  state.db.userClubId = clubId;
  state.view = "dashboard";

  const club = userClub();
  $("#club-name").textContent = club.name;

  document.querySelectorAll(".nav-item").forEach(b=>{
    b.classList.toggle("active",b.dataset.view==="dashboard");
  });

  render();
}
  state.selectedClubId = clubId;
  state.db.userClubId = clubId;

  const club = userClub();
  $("#club-name").textContent = club.name;

  state.view = "club-selection";
renderClubSelection();
}

function randomClub(){
  const teams = state.db.teams;
  const club = teams[Math.floor(Math.random()*teams.length)];
  selectClub(club.id);
}

function renderClubSelection(){
  const teams = state.db.teams;

  setPage("Escolha seu clube",`
    <div class="card">
      <h2>Comece sua carreira!</h2>
      <p>Escolha qualquer clube ou deixe o destino decidir.</p>

      <button onclick="randomClub()">
        🎲 Sortear clube aleatório
      </button>

      <h3>Escolha seu time</h3>

      <select id="club-choice">
        ${teams.map(t=>`
          <option value="${t.id}">${t.name}</option>
        `).join("")}
      </select>

      <button onclick="selectClub(document.getElementById('club-choice').value)">
        Confirmar clube
      </button>
    </div>
  `);
}
function advanceDay(){state.day.setDate(state.day.getDate()+1);$("#current-date").textContent=dateLabel(state.day);render();}
function userClub(){return state.db.teams.find(t=>t.id===state.db.userClubId);}
function clubPlayers(){return state.db.players.filter(p=>p.teamId===state.db.userClubId);}
function setPage(title,html){$("#page-title").textContent=title;$("#view-root").innerHTML=html;}
function render(){
  $("#current-date").textContent=dateLabel(state.day);
  const pages={
  "club-selection":renderClubSelection,
  dashboard:renderDashboard,
  squad:renderSquad,
  market:renderMarket,
  table:renderTable,
  calendar:renderCalendar
};
}
function renderDashboard(){
 const club=userClub(), roster=clubPlayers(), avg=Math.round(roster.reduce((s,p)=>s+p.overall,0)/roster.length);
 setPage("Dashboard",`<div class="grid">
  <article class="card span-3"><div class="card-label">Orçamento disponível</div><div class="metric">${money(club.budget)}</div><div class="metric-note">Verba para contratações</div></article>
  <article class="card span-3"><div class="card-label">Tamanho do elenco</div><div class="metric">${roster.length}</div><div class="metric-note">Jogadores cadastrados</div></article>
  <article class="card span-3"><div class="card-label">Overall médio</div><div class="metric">${avg}<span class="positive"> / 100</span></div><div class="metric-note">Força geral do elenco</div></article>
  <article class="card span-3"><div class="card-label">Reputação do clube</div><div class="metric">${club.reputation}<span class="positive"> / 100</span></div><div class="metric-note">Prestígio internacional</div></article>
  <article class="card span-7"><div class="section-head"><h2>Próximos compromissos</h2><span class="tag">Pré-temporada</span></div>
   <div class="fixture"><div><strong>${club.name}</strong><div class="subtle">Amistoso · A definir</div></div><span class="fixture-time">EM BREVE</span></div>
   <div class="fixture"><div><strong>Início do Brasileirão</strong><div class="subtle">Calendário oficial será integrado</div></div><span class="fixture-time">—</span></div>
   <p class="subtle">Os jogos reais e a geração automática de rodadas entram na próxima etapa.</p></article>
  <article class="card span-5"><div class="section-head"><h2>Destaques do elenco</h2><span class="subtle">Top 4</span></div>
   ${[...roster].sort((a,b)=>b.overall-a.overall).slice(0,4).map(playerRow).join("")}</article>
  <article class="card span-12"><div class="section-head"><h2>Central do treinador</h2><span class="tag">Visão geral</span></div><div class="notice">Bem-vindo ao seu centro de comando. Use o menu lateral para consultar o elenco, explorar o mercado, acompanhar a classificação e avançar o calendário. Nesta versão inicial, os dados são carregados de <b>data/database.json</b>.</div></article>
 </div>`);
}
function playerRow(p){return `<div class="player-row"><div><strong>${p.name}</strong><small>${p.position} · ${p.age} anos</small></div><span class="rating">${p.overall}</span><span class="subtle">${money(p.marketValue)}</span></div>`;}
function renderSquad(){
 const roster=clubPlayers().sort((a,b)=>b.overall-a.overall);
 setPage("Elenco / Táticas",`<p class="view-intro">Jogadores do ${userClub().name}. A edição de formação e instruções táticas será adicionada em uma próxima etapa.</p><div class="card"><div class="section-head"><h2>Elenco principal</h2><span class="tag">${roster.length} jogadores</span></div><table class="table"><thead><tr><th>Jogador</th><th>POS</th><th>IDADE</th><th>OVR</th><th>VALOR</th></tr></thead><tbody>${roster.map(p=>`<tr><td class="club-name">${p.name}</td><td>${p.position}</td><td>${p.age}</td><td class="positive">${p.overall}</td><td>${money(p.marketValue)}</td></tr>`).join("")}</tbody></table></div>`);
}
function renderMarket(){
 const others=state.db.players.filter(p=>p.teamId!==state.db.userClubId).sort((a,b)=>b.overall-a.overall).slice(0,12);
 setPage("Mercado de Transferências",`<p class="view-intro">Alvos sugeridos de outros clubes do banco de demonstração. Negociações ainda não estão habilitadas.</p><div class="card"><div class="section-head"><h2>Jogadores observados</h2><span class="tag">Demonstração</span></div><table class="table"><thead><tr><th>Jogador</th><th>CLUBE</th><th>POS</th><th>OVR</th><th>VALOR ESTIMADO</th></tr></thead><tbody>${others.map(p=>`<tr><td class="club-name">${p.name}</td><td>${state.db.teams.find(t=>t.id===p.teamId).shortName}</td><td>${p.position}</td><td class="positive">${p.overall}</td><td>${money(p.marketValue)}</td></tr>`).join("")}</tbody></table></div>`);
}
function renderTable(){
 const rows=state.db.teams.map((t,i)=>({t,pts:0,j:0,v:0,e:0,d:0,gp:0,gc:0})).sort((a,b)=>b.pts-a.pts);
 setPage("Tabela",`<p class="view-intro">Classificação de demonstração. A tabela será preenchida pelo motor de partidas quando as ligas completas forem cadastradas.</p><div class="card"><div class="section-head"><h2>Clubes cadastrados</h2><span class="tag">Pré-temporada</span></div><table class="table"><thead><tr><th>#</th><th>CLUBE</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>PTS</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td class="club-name">${r.t.name}</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td class="positive">0</td></tr>`).join("")}</tbody></table></div>`);
}
function renderCalendar(){
 const windows=state.db.calendar.transferWindows;
 setPage("Calendário",`<p class="view-intro">Temporada ${state.db.meta.season} · avance o dia pelo botão no topo.</p><div class="grid"><article class="card span-5"><div class="section-head"><h2>Janelas de transferências</h2></div>${windows.map(w=>`<div class="fixture"><div><strong>${w.name}</strong><div class="subtle">${w.start} até ${w.end}</div></div><span class="tag">Planejada</span></div>`).join("")}</article><article class="card span-7"><div class="section-head"><h2>Agenda</h2><span class="tag">${dateLabel(state.day)}</span></div><div class="empty">Nenhum evento cadastrado para esta data. As rodadas, convocações e lesões serão geradas pelo motor de calendário nas próximas etapas.</div></article></div>`);
}
init();
