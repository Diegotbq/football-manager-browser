
const state = {
  db: null,
  day: new Date("2026-07-01T12:00:00"),
  view: "club-selection",
  selectedClubId: null,
  match: null,
  matchTimer: null,
  matchHistory: []
};

const $ = selector => document.querySelector(selector);

const money = n =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(n || 0);

const dateLabel = d =>
  d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).replace(".", "").toUpperCase();

async function init() {
  try {
    const response = await fetch("database.json");

    if (!response.ok) {
      throw new Error("Não foi possível abrir database.json");
    }

    state.db = await response.json();
    try { state.matchHistory = JSON.parse(localStorage.getItem("fmb-match-history") || "[]"); } catch (_) { state.matchHistory = []; }

    const seasonLabel = document.querySelector(".club-chip small");
    if (seasonLabel) seasonLabel.textContent = `Temporada ${state.db.meta?.season || "2026/27"}`;

    const seasonStart = state.db.calendar?.seasonStart;
    if (seasonStart) state.day = new Date(`${seasonStart}T12:00:00`);

    if (!Array.isArray(state.db.teams) || !state.db.teams.length) {
      throw new Error("Nenhum clube encontrado no banco de dados.");
    }

    if (!Array.isArray(state.db.players)) {
      throw new Error("Lista de jogadores não encontrada.");
    }

    const advanceButton = $("#advance-day");

    if (advanceButton) {
      advanceButton.addEventListener("click", advanceDay);
    }

    const nav = $("#main-nav");

    if (nav) {
      nav.addEventListener("click", e => {
        const button = e.target.closest("[data-view]");
        if (!button) return;

        if (!state.selectedClubId) {
          renderClubSelection();
          return;
        }

        state.view = button.dataset.view;

        document.querySelectorAll(".nav-item").forEach(b => {
          b.classList.toggle("active", b === button);
        });

        render();
      });
    }

    state.view = "club-selection";
    renderClubSelection();

  } catch (error) {
    const root = $("#view-root");

    if (root) {
      root.innerHTML = `
        <div class="notice">
          Erro ao carregar o jogo: ${error.message}
          <br>
          Confira se o arquivo database.json existe.
        </div>
      `;
    }

    console.error(error);
  }
}

// ESCOLHA DO CLUBE

function selectClub(clubId) {
  const club = state.db.teams.find(
    t => String(t.id) === String(clubId)
  );

  if (!club) {
    alert("Clube não encontrado!");
    return;
  }

  state.selectedClubId = club.id;
  state.db.userClubId = club.id;
  state.view = "dashboard";

  const clubName = $("#club-name");

  if (clubName) {
    clubName.textContent = club.name;
  }

  document.querySelectorAll(".nav-item").forEach(b => {
    b.classList.toggle(
      "active",
      b.dataset.view === "dashboard"
    );
  });

  render();
}

function randomClub() {
  const teams = state.db.teams;

  const club = teams[
    Math.floor(Math.random() * teams.length)
  ];

  selectClub(club.id);
}

function renderClubSelection() {
  const teams = state.db.teams;

  setPage(
    "Escolha seu clube",
    `
    <div class="grid">
      <article class="card span-12">
        <div class="section-head">
          <h2>⚽ Comece sua carreira!</h2>
          <span class="tag">Nova carreira</span>
        </div>

        <p class="view-intro">
          Escolha qualquer clube do banco de dados
          ou deixe o destino decidir seu próximo desafio.
        </p>

        <button
          onclick="randomClub()"
          class="primary-button"
          style="width:100%;padding:16px;margin-bottom:24px"
        >
          🎲 SORTEAR CLUBE ALEATÓRIO
        </button>

        <div class="section-head">
          <h2>Escolha seu time</h2>
        </div>

        <select
          id="club-choice"
          style="width:100%;padding:14px;margin-bottom:16px"
        >
          ${teams.map(t => `
            <option value="${t.id}">
              ${t.name}
            </option>
          `).join("")}
        </select>

        <button
          onclick="selectClub(document.getElementById('club-choice').value)"
          class="primary-button"
          style="width:100%;padding:16px"
        >
          CONFIRMAR CLUBE E COMEÇAR CARREIRA
        </button>
      </article>

      <article class="card span-12">
        <h2>Seu desafio começa agora!</h2>
        <p class="subtle">
          Construa seu elenco, contrate jogadores,
          dispute campeonatos e leve seu clube ao topo.
        </p>
      </article>
    </div>
    `
  );
}

// FUNÇÕES PRINCIPAIS

function advanceDay() {
  state.day.setDate(state.day.getDate() + 1);

  const currentDate = $("#current-date");

  if (currentDate) {
    currentDate.textContent = dateLabel(state.day);
  }

  render();
}

function userClub() {
  return state.db.teams.find(
    t => String(t.id) === String(state.db.userClubId)
  );
}

function clubPlayers() {
  return state.db.players.filter(
    p => String(p.teamId) === String(state.db.userClubId)
  );
}

function setPage(title, html) {
  $("#page-title").textContent = title;
  $("#view-root").innerHTML = html;
}

// NAVEGAÇÃO

function render() {
  if (!state.db) return;

  const currentDate = $("#current-date");

  if (currentDate) {
    currentDate.textContent = dateLabel(state.day);
  }

  if (!state.selectedClubId) {
    renderClubSelection();
    return;
  }

  const pages = {
    dashboard: renderDashboard,
    squad: renderSquad,
    market: renderMarket,
    table: renderTable,
    calendar: renderCalendar,
    match: renderMatch
  };

  const page = pages[state.view] || renderDashboard;
  page();
}

// PAINEL DO TREINADOR

function renderDashboard() {
  const club = userClub();
  const roster = clubPlayers();

  if (!club) {
    renderClubSelection();
    return;
  }

  const avg = roster.length
    ? Math.round(
        roster.reduce((s, p) => s + p.overall, 0) / roster.length
      )
    : 0;

  setPage("Dashboard", `
    <div class="grid">

      <article class="card span-3">
        <div class="card-label">Orçamento disponível</div>
        <div class="metric">${money(club.budget)}</div>
        <div class="metric-note">Verba para contratações</div>
      </article>

      <article class="card span-3">
        <div class="card-label">Tamanho do elenco</div>
        <div class="metric">${roster.length}</div>
        <div class="metric-note">Jogadores cadastrados</div>
      </article>

      <article class="card span-3">
        <div class="card-label">Overall médio</div>
        <div class="metric">${avg}<span class="positive"> / 100</span></div>
        <div class="metric-note">Força geral do elenco</div>
      </article>

      <article class="card span-3">
        <div class="card-label">Reputação do clube</div>
        <div class="metric">${club.reputation || 0}<span class="positive"> / 100</span></div>
        <div class="metric-note">Prestígio internacional</div>
      </article>

      <article class="card span-7">
        <div class="section-head">
          <h2>Próximos compromissos</h2>
          <span class="tag">Pré-temporada</span>
        </div>

        <div class="fixture">
          <div>
            <strong>${club.name}</strong>
            <div class="subtle">Amistoso · A definir</div>
          </div>
          <span class="fixture-time">EM BREVE</span>
        </div>

        <div class="fixture">
          <div>
            <strong>Início do campeonato</strong>
            <div class="subtle">Calendário oficial será integrado</div>
          </div>
          <span class="fixture-time">—</span>
        </div>

        <p class="subtle">
          Os jogos e as rodadas serão integrados
          ao motor de partidas.
        </p>
      </article>

      <article class="card span-5">
        <div class="section-head">
          <h2>Destaques do elenco</h2>
          <span class="subtle">Top 4</span>
        </div>

        ${
          [...roster]
            .sort((a, b) => b.overall - a.overall)
            .slice(0, 4)
            .map(playerRow)
            .join("")
        }
      </article>

      <article class="card span-12">
        <div class="section-head">
          <h2>Central do treinador</h2>
          <span class="tag">Visão geral</span>
        </div>

        <div class="notice">
          Bem-vindo ao seu centro de comando!
          Seu clube é ${club.name}.
          Gerencie seu elenco, explore o mercado,
          acompanhe a classificação e avance o calendário.
        </div>
      </article>

    </div>
  `);
}

// LINHA DE JOGADOR

function playerRow(p) {
  return `
    <div class="player-row">
      <div>
        <strong>${p.name}</strong>
        <small>${p.position} · ${p.age == null ? "idade não informada" : p.age + " anos"}</small>
      </div>
      <span class="rating">${p.overall}</span>
      <span class="subtle">${money(p.marketValue)}</span>
    </div>
  `;
}

// ELENCO

function renderSquad() {
  const roster = [...clubPlayers()].sort(
    (a, b) => b.overall - a.overall
  );

  setPage("Elenco / Táticas", `
    <p class="view-intro">
      Jogadores do ${userClub().name}.
    </p>

    <div class="card">
      <div class="section-head">
        <h2>Elenco principal</h2>
        <span class="tag">${roster.length} jogadores</span>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Jogador</th>
            <th>POS</th>
            <th>IDADE</th>
            <th>OVR</th>
            <th>VALOR</th>
          </tr>
        </thead>

        <tbody>
          ${
            roster.map(p => `
              <tr>
                <td class="club-name">${p.name}</td>
                <td>${p.position}</td>
                <td>${p.age == null ? "—" : p.age}</td>
                <td class="positive">${p.overall}</td>
                <td>${money(p.marketValue)}</td>
              </tr>
            `).join("")
          }
        </tbody>
      </table>
    </div>
  `);
}

// MERCADO DE TRANSFERÊNCIAS

function renderMarket() {
  const others = state.db.players
    .filter(p => String(p.teamId) !== String(state.db.userClubId))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 12);

  setPage("Mercado de Transferências", `
    <p class="view-intro">
      Jogadores de outros clubes disponíveis
      para observação.
    </p>

    <div class="card">
      <div class="section-head">
        <h2>Jogadores observados</h2>
        <span class="tag">Demonstração</span>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Jogador</th>
            <th>CLUBE</th>
            <th>POS</th>
            <th>OVR</th>
            <th>VALOR ESTIMADO</th>
          </tr>
        </thead>

        <tbody>
          ${
            others.map(p => {
              const team = state.db.teams.find(
                t => String(t.id) === String(p.teamId)
              );

              return `
                <tr>
                  <td class="club-name">${p.name}</td>
                  <td>${team ? team.shortName : "—"}</td>
                  <td>${p.position}</td>
                  <td class="positive">${p.overall}</td>
                  <td>${money(p.marketValue)}</td>
                </tr>
              `;
            }).join("")
          }
        </tbody>
      </table>
    </div>
  `);
}

// CLASSIFICAÇÃO

function renderTable() {
  const rows = state.db.teams.map(t => ({t,pts:0,j:0,v:0,e:0,d:0,gp:0,gc:0}));
  state.matchHistory.forEach(m => {
    const home=rows.find(r=>String(r.t.id)===String(m.homeId));
    const away=rows.find(r=>String(r.t.id)===String(m.awayId));
    if(!home||!away)return;
    home.j++;away.j++;home.gp+=m.homeScore;home.gc+=m.awayScore;away.gp+=m.awayScore;away.gc+=m.homeScore;
    if(m.homeScore>m.awayScore){home.v++;away.d++;home.pts+=3;}
    else if(m.homeScore<m.awayScore){away.v++;home.d++;away.pts+=3;}
    else {home.e++;away.e++;home.pts++;away.pts++;}
  });
  rows.sort((a,b)=>b.pts-a.pts||(b.gp-b.gc)-(a.gp-a.gc)||b.gp-a.gp||a.t.name.localeCompare(b.t.name,"pt-BR"));

  setPage("Tabela", `
    <p class="view-intro">
      Classificação atualizada com os resultados das partidas disputadas nesta carreira.
    </p>

    <div class="card">
      <div class="section-head">
        <h2>Classificação da carreira</h2>
        <span class="tag">${state.matchHistory.length} partidas registradas</span>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>CLUBE</th>
            <th>J</th>
            <th>V</th>
            <th>E</th>
            <th>D</th>
            <th>SG</th>
            <th>PTS</th>
          </tr>
        </thead>

        <tbody>
          ${
            rows.map((r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td class="club-name">${r.t.name}</td>
                <td>${r.j}</td>
                <td>${r.v}</td>
                <td>${r.e}</td>
                <td>${r.d}</td>
                <td>${r.gp-r.gc}</td>
                <td class="positive">${r.pts}</td>
              </tr>
            `).join("")
          }
        </tbody>
      </table>
    </div>
  `);
}

// CALENDÁRIO

function renderCalendar() {
  const windows = state.db.calendar?.transferWindows || [];
  const fixtures = (state.db.calendar?.events || [])
    .filter(e => e.competition === "Campeonato Brasileiro Série A")
    .sort((a,b) => (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31"));
  const teamName = id => state.db.teams.find(t => String(t.id) === String(id))?.name || "Clube";
  const fixtureDate = f => f.date
    ? new Date(`${f.date}T12:00:00`).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})
    : (f.dateRange ? "Data a confirmar (28–29 nov.)" : "Data a confirmar");
  setPage("Calendário", `
    <p class="view-intro">
      Temporada ${state.db.meta.season}
      · Calendário brasileiro separado do calendário europeu.
    </p>
    <div class="grid">
      <article class="card span-5">
        <div class="section-head"><h2>Janelas de transferências</h2></div>
        ${
          windows.length ? windows.map(w => `
            <div class="fixture"><div><strong>${w.name}</strong><div class="subtle">${w.start} até ${w.end}</div></div><span class="tag">Planejada</span></div>
          `).join("") : `<div class="empty">Nenhuma janela cadastrada.</div>`
        }
      </article>
      <article class="card span-7">
        <div class="section-head"><h2>Próximos jogos oficiais</h2><span class="tag">Brasileirão 2026</span></div>
        <p class="subtle">Rodadas finais conforme tabela da CBF. Campos sem confirmação oficial ficam como “a confirmar”.</p>
        ${
          fixtures.length ? fixtures.map(f => `
            <div class="fixture">
              <div>
                <strong>${teamName(f.homeTeamId)} × ${teamName(f.awayTeamId)}</strong>
                <div class="subtle">${f.round}ª rodada · ${fixtureDate(f)}${f.time ? " · " + f.time : ""}${f.stadium ? " · " + f.stadium : ""}</div>
              </div>
              <span class="tag">${f.status === "scheduled" ? "Agendado" : "A confirmar"}</span>
            </div>
          `).join("") : `<div class="empty">Nenhum jogo cadastrado.</div>`
        }
      </article>
    </div>
  `);
}

// CENTRAL DE PARTIDAS — SIMULAÇÃO MINUTO A MINUTO
function teamStrength(teamId) {
  const players = state.db.players.filter(p => String(p.teamId) === String(teamId));
  if (!players.length) {
    const team = state.db.teams.find(t => String(t.id) === String(teamId));
    return Number(team?.reputation || 55);
  }
  const top = [...players].sort((a,b) => Number(b.overall||0)-Number(a.overall||0)).slice(0,11);
  return top.reduce((sum,p)=>sum+Number(p.overall||55),0)/top.length;
}
function startMatch() {
  const opponentId = $("#match-opponent")?.value;
  if (!opponentId || String(opponentId) === String(state.db.userClubId)) return;
  const home = userClub();
  const away = state.db.teams.find(t=>String(t.id)===String(opponentId));
  state.match = {homeId:home.id,awayId:away.id,homeName:home.name,awayName:away.name,homeScore:0,awayScore:0,minute:0,speed:1,paused:false,finished:false,events:[{minute:0,text:"O árbitro autoriza o início da partida!"}]};
  runMatchClock();
  renderMatch();
}
function runMatchClock() {
  if(state.matchTimer) clearInterval(state.matchTimer);
  if(!state.match||state.match.paused||state.match.finished)return;
  state.matchTimer=setInterval(tickMatch,Math.max(120,1000/state.match.speed));
}
function tickMatch() {
  const m=state.match;if(!m||m.paused||m.finished)return;
  m.minute++;
  const hs=teamStrength(m.homeId),as=teamStrength(m.awayId),total=Math.max(1,hs+as);
  if(Math.random()<0.018+(hs/total)*0.018){m.homeScore++;m.events.unshift({minute:m.minute,text:"⚽ GOL do "+m.homeName+"!"});}
  else if(Math.random()<0.018+(as/total)*0.018){m.awayScore++;m.events.unshift({minute:m.minute,text:"⚽ GOL do "+m.awayName+"!"});}
  else if(Math.random()<0.11){const notes=["Boa chegada ao ataque.","Finalização defendida pelo goleiro.","A defesa afasta o perigo.","Bola recuperada no meio-campo.","Cobrança de falta para a área."];m.events.unshift({minute:m.minute,text:notes[Math.floor(Math.random()*notes.length)]});}
  if(m.minute===45)m.events.unshift({minute:45,text:"Intervalo! Fim do primeiro tempo."});
  if(m.minute>=90){m.minute=90;m.finished=true;m.events.unshift({minute:90,text:"Fim de jogo! Partida encerrada."});if(!m.saved){state.matchHistory.push({homeId:m.homeId,awayId:m.awayId,homeScore:m.homeScore,awayScore:m.awayScore,date:dateLabel(state.day)});m.saved=true;try{localStorage.setItem("fmb-match-history",JSON.stringify(state.matchHistory));}catch(_){}}clearInterval(state.matchTimer);state.matchTimer=null;}
  if(state.view === "match") renderMatch();
}
function pauseMatch() {
  if(!state.match||state.match.finished)return;
  state.match.paused=!state.match.paused;
  if(state.match.paused){clearInterval(state.matchTimer);state.matchTimer=null;}else runMatchClock();
  renderMatch();
}
function setMatchSpeed(speed) {
  if(!state.match||state.match.finished)return;
  state.match.speed=Number(speed);if(!state.match.paused)runMatchClock();renderMatch();
}
function newMatch() { if(state.matchTimer) clearInterval(state.matchTimer); state.matchTimer=null; state.match=null; renderMatch(); }\n\nfunction renderMatch() {
  const m=state.match;
  if(!m){
    const opponents=state.db.teams.filter(t=>String(t.id)!==String(state.db.userClubId));
    setPage("Central de Partidas",`<p class="view-intro">Escolha um adversário e acompanhe a partida minuto a minuto.</p><article class="card match-setup"><div class="section-head"><h2>Preparar partida</h2><span class="tag">Simulação ao vivo</span></div><label for="match-opponent">Adversário</label><select id="match-opponent">${opponents.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select><button class="primary-btn" onclick="startMatch()">⚽ INICIAR PARTIDA</button><p class="subtle">A simulação usa a força estimada dos elencos cadastrados. Os eventos são gerados pelo jogo, não são resultados oficiais.</p></article>`);
    return;
  }
  setPage("Central de Partidas",`<article class="card live-match"><div class="match-status">${m.finished?"TEMPO INTEGRAL":m.paused?"PARTIDA PAUSADA":"PARTIDA AO VIVO"}</div><div class="scoreboard"><div class="score-team"><strong>${m.homeName}</strong><span>${m.homeScore}</span></div><div class="score-clock">${String(m.minute).padStart(2,"0")}’</div><div class="score-team"><strong>${m.awayName}</strong><span>${m.awayScore}</span></div></div><div class="match-controls"><button class="primary-btn" onclick="pauseMatch()" ${m.finished?"disabled":""}>${m.paused?"▶ Continuar":"Ⅱ Pausar"}</button><button class="speed-btn ${m.speed===1?"selected":""}" onclick="setMatchSpeed(1)">1x</button><button class="speed-btn ${m.speed===2?"selected":""}" onclick="setMatchSpeed(2)">2x</button><button class="speed-btn ${m.speed===4?"selected":""}" onclick="setMatchSpeed(4)">4x</button><button class="speed-btn" onclick="newMatch()">Nova partida</button></div></article><article class="card events-card"><div class="section-head"><h2>Relato da partida</h2><span class="tag">${m.events.length} eventos</span></div><div class="match-events">${m.events.map(e=>`<div class="match-event"><strong>${String(e.minute).padStart(2,"0")}’</strong><span>${e.text}</span></div>`).join("")}</div></article>`);
}

// INICIAR JOGO

init();
