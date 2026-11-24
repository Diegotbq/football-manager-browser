
const state = {
  db: null,
  day: new Date("2026-07-01T12:00:00"),
  view: "club-selection",
  selectedClubId: null,
  match: null,
  matchTimer: null,
  matchHistory: [],
  transferHistory: []
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
    loadTransferCareer();
    try { state.matchHistory = JSON.parse(localStorage.getItem("fmb-match-history") || "[]"); } catch (_) { state.matchHistory = []; }

    const seasonLabel = document.querySelector(".club-chip small");
    if (seasonLabel) seasonLabel.textContent = `Temporada ${state.db.meta?.season || "2026/27"}`;

    const seasonStart = state.db.calendar?.seasonStart;
    if (seasonStart) state.day = new Date(`${seasonStart}T12:00:00`);
    try {
      const savedDay = localStorage.getItem("fmb-current-day");
      if (savedDay && !Number.isNaN(new Date(`${savedDay}T12:00:00`).getTime())) {
        state.day = new Date(`${savedDay}T12:00:00`);
      }
    } catch (_) {}

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

    let savedClubId = null;
    try { savedClubId = localStorage.getItem("fmb-selected-club"); } catch (_) {}
    const savedClub = savedClubId
      ? state.db.teams.find(t => String(t.id) === String(savedClubId))
      : null;

    if (savedClub) {
      state.selectedClubId = savedClub.id;
      state.db.userClubId = savedClub.id;
      const clubName = $("#club-name");
      if (clubName) clubName.textContent = savedClub.name;
      state.view = "dashboard";
      render();
    } else {
      state.view = "club-selection";
      renderClubSelection();
    }

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
  try { localStorage.setItem("fmb-selected-club", String(club.id)); } catch (_) {}
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
  const countries = [...new Set(teams.map(t => t.country).filter(Boolean))].sort();

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
          Escolha um clube disponível no banco de dados ou deixe o destino decidir seu próximo desafio.
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
          <span class="tag">${teams.length} clubes</span>
        </div>

        <label for="club-country" class="subtle">País</label>
        <select
          id="club-country"
          onchange="filterClubChoices()"
          style="width:100%;padding:14px;margin:8px 0 14px"
        >
          <option value="">Todos os países</option>
          ${countries.map(country => `<option value="${country}">${country}</option>`).join("")}
        </select>

        <label for="club-search" class="subtle">Buscar clube</label>
        <input
          id="club-search"
          type="search"
          placeholder="Digite o nome do clube..."
          oninput="filterClubChoices()"
          style="width:100%;padding:14px;margin:8px 0 14px"
        >

        <select
          id="club-choice"
          size="7"
          style="width:100%;padding:10px;margin-bottom:16px"
        >
          ${teams.map(t => `
            <option value="${t.id}" data-country="${t.country || ""}">
              ${t.name} · ${t.country || "País não informado"} · ${t.stadium || "Estádio não informado"}
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
          Construa seu elenco, contrate jogadores, dispute campeonatos e leve seu clube ao topo.
        </p>
      </article>
    </div>
    `
  );
}

function filterClubChoices() {
  const countrySelect = $("#club-country");
  const searchInput = $("#club-search");
  const clubSelect = $("#club-choice");
  if (!countrySelect || !searchInput || !clubSelect) return;

  const country = countrySelect.value;
  const term = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  let firstVisible = null;

  [...clubSelect.options].forEach(option => {
    const club = state.db.teams.find(t => String(t.id) === String(option.value));
    const matchesCountry = !country || option.dataset.country === country;
    const matchesName = !term || club?.name?.toLocaleLowerCase("pt-BR").includes(term);
    option.hidden = !(matchesCountry && matchesName);
    if (!option.hidden && firstVisible === null) firstVisible = option;
  });

  const selectedVisible = clubSelect.selectedOptions[0] && !clubSelect.selectedOptions[0].hidden;
  if (!selectedVisible && firstVisible) firstVisible.selected = true;
}

// FUNÇÕES PRINCIPAIS

function advanceDay() {
  state.day.setDate(state.day.getDate() + 1);
  try {
    localStorage.setItem("fmb-current-day", state.day.toISOString().slice(0, 10));
  } catch (_) {}

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

  const squadContent = roster.length
    ? `
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
            ${roster.map(p => `
              <tr>
                <td class="club-name">${p.name}</td>
                <td>${p.position}</td>
                <td>${p.age == null ? "—" : p.age}</td>
                <td class="positive">${p.overall}</td>
                <td>${money(p.marketValue)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    : `
      <div class="card">
        <div class="section-head">
          <h2>Elenco em atualização</h2>
          <span class="tag">Dados pendentes</span>
        </div>
        <p class="view-intro">
          Ainda não cadastramos jogadores confirmados para este clube.
          Estamos preparando a base de elencos reais. Nenhum jogador
          fictício será apresentado como se fosse real.
        </p>
      </div>
    `;

  setPage("Elenco / Táticas", `
    <p class="view-intro">
      Jogadores do ${userClub().name}.
    </p>
    ${squadContent}
  `);
}

// MERCADO DE TRANSFERÊNCIAS

function renderMarket(searchTerm) {
  const club = userClub();
  if (!club) return renderClubSelection();
  const term = String(searchTerm || "").trim().toLocaleLowerCase("pt-BR");
  const others = state.db.players
    .filter(p => String(p.teamId) !== String(club.id))
    .filter(p => {
      const team = state.db.teams.find(t => String(t.id) === String(p.teamId));
      return !term || p.name.toLocaleLowerCase("pt-BR").includes(term) ||
        team?.name?.toLocaleLowerCase("pt-BR").includes(term) ||
        p.position?.toLocaleLowerCase("pt-BR").includes(term);
    })
    .sort((a, b) => Number(b.overall || 0) - Number(a.overall || 0));
  const recentTransfers = state.transferHistory.slice(-5).reverse();

  setPage("Mercado de Transferências", `
    <p class="view-intro">Observe jogadores, faça propostas e monte seu elenco. Valores são estimativas internas do jogo.</p>
    <div class="grid">
      <article class="card span-4">
        <div class="card-label">Orçamento disponível</div>
        <div class="metric">${money(club.budget)}</div>
        <div class="metric-note">Seu clube: ${club.name}</div>
      </article>
      <article class="card span-4">
        <div class="card-label">Jogadores no mercado</div>
        <div class="metric">${others.length}</div>
        <div class="metric-note">Atletas de outros clubes cadastrados</div>
      </article>
      <article class="card span-4">
        <div class="card-label">Contratações realizadas</div>
        <div class="metric">${state.transferHistory.filter(t => String(t.toTeamId) === String(club.id)).length}</div>
        <div class="metric-note">Nesta carreira neste dispositivo</div>
      </article>
      <article class="card span-12">
        <div class="section-head">
          <h2>Buscar jogadores</h2>
          <span class="tag">${others.length} disponíveis</span>
        </div>
        <input id="market-search" type="search" value="${String(searchTerm || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;")}" placeholder="Nome, clube ou posição..." oninput="filterMarketPlayers(this.value)" style="width:100%;padding:14px;margin:8px 0 14px">
        ${others.length ? `
          <table class="table">
            <thead><tr><th>JOGADOR</th><th>CLUBE</th><th>POS</th><th>OVR</th><th>VALOR ESTIMADO</th><th>PROPOSTA</th></tr></thead>
            <tbody>
              ${others.map(p => {
                const team = state.db.teams.find(t => String(t.id) === String(p.teamId));
                const searchData = (p.name + " " + (team?.name || "") + " " + (p.position || "")).toLocaleLowerCase("pt-BR").replace(/"/g, "&quot;");
                return `<tr data-market-player data-market-search="${searchData}">
                  <td class="club-name">${p.name}</td><td>${team ? team.shortName || team.name : "—"}</td>
                  <td>${p.position || "—"}</td><td class="positive">${p.overall || "—"}</td>
                  <td>${money(p.marketValue)}</td>
                  <td><button class="primary-btn" onclick="makeTransferOffer('${p.id}')">FAZER PROPOSTA</button></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        ` : '<p class="subtle">Nenhum jogador encontrado com esse filtro.</p>'}
      </article>
      <article class="card span-12">
        <div class="section-head"><h2>Últimas movimentações</h2><span class="tag">${recentTransfers.length} recentes</span></div>
        ${recentTransfers.length ? recentTransfers.map(t => `
          <div class="fixture"><div><strong>${t.playerName}</strong><div class="subtle">${t.fromName} → ${t.toName}</div></div><span class="fixture-time">${money(t.fee)}</span></div>
        `).join("") : '<p class="subtle">Suas contratações aparecerão aqui.</p>'}
      </article>
    </div>
  `);
}

function filterMarketPlayers(value) {
  const term = String(value || "").trim().toLocaleLowerCase("pt-BR");
  document.querySelectorAll("[data-market-player]").forEach(row => {
    row.hidden = !String(row.dataset.marketSearch || "").includes(term);
  });
}

function saveTransferCareer() {
  try {
    localStorage.setItem("fmb-transfer-save", JSON.stringify({
      playerTeams: state.db.players.map(p => [p.id, p.teamId]),
      budgets: state.db.teams.map(t => [t.id, t.budget]),
      history: state.transferHistory
    }));
  } catch (_) {
    alert("Não foi possível salvar a transferência neste dispositivo. Verifique o espaço disponível.");
  }
}

function loadTransferCareer() {
  try {
    const saved = JSON.parse(localStorage.getItem("fmb-transfer-save") || "null");
    if (!saved) return;
    const teamById = new Map(state.db.teams.map(t => [String(t.id), t]));
    (saved.playerTeams || []).forEach(([playerId, teamId]) => {
      const player = state.db.players.find(p => String(p.id) === String(playerId));
      if (player && teamById.has(String(teamId))) player.teamId = teamId;
    });
    (saved.budgets || []).forEach(([teamId, budget]) => {
      const team = teamById.get(String(teamId));
      if (team && Number.isFinite(Number(budget))) team.budget = Number(budget);
    });
    state.transferHistory = Array.isArray(saved.history) ? saved.history : [];
  } catch (_) {
    state.transferHistory = [];
  }
}

function makeTransferOffer(playerId) {
  const buyer = userClub();
  const player = state.db.players.find(p => String(p.id) === String(playerId));
  if (!buyer || !player || String(player.teamId) === String(buyer.id)) {
    alert("Este jogador não está disponível para negociação.");
    return;
  }
  const seller = state.db.teams.find(t => String(t.id) === String(player.teamId));
  if (!seller) {
    alert("Não foi possível identificar o clube atual do jogador.");
    return;
  }
  const askingPrice = Math.max(1, Number(player.marketValue) || 100000);
  const rawOffer = prompt(
    "Proposta por " + player.name + "\nClube: " + seller.name +
    "\nValor estimado: " + money(askingPrice) +
    "\nSeu orçamento: " + money(buyer.budget) +
    "\n\nDigite o valor da proposta em euros:"
  );
  if (rawOffer === null) return;
  const offer = Number(rawOffer.replace(/[€.\s]/g, "").replace(/,/g, "."));
  if (!Number.isFinite(offer) || offer <= 0) {
    alert("Digite um valor válido.");
    return;
  }
  if (offer > Number(buyer.budget || 0)) {
    alert("Proposta cancelada: seu orçamento é insuficiente.");
    return;
  }
  if (offer < askingPrice * 0.95) {
    alert("Proposta recusada! " + seller.name + " exige pelo menos " + money(Math.ceil(askingPrice * 0.95)) + " neste momento.");
    return;
  }
  if (!confirm(seller.name + " aceitou a proposta de " + money(offer) +
    " por " + player.name + ".\n\nConfirmar contratação?")) return;

  buyer.budget = Number(buyer.budget || 0) - offer;
  seller.budget = Number(seller.budget || 0) + offer;
  const previousTeamId = player.teamId;
  player.teamId = buyer.id;
  state.db.teams.forEach(team => {
    if (!Array.isArray(team.players)) return;
    team.players = team.players.filter(p => String(p.id) !== String(player.id));
    if (String(team.id) === String(buyer.id)) team.players.push(player);
  });
  state.transferHistory.push({
    playerId: player.id, playerName: player.name,
    fromTeamId: previousTeamId, fromName: seller.name,
    toTeamId: buyer.id, toName: buyer.name,
    fee: offer, date: state.day.toISOString().slice(0, 10)
  });
  saveTransferCareer();
  alert("Contratação concluída! " + player.name + " agora faz parte do " + buyer.name + ".");
  renderMarket();
}

// CLASSIFICAÇÃO

function renderTable(leagueFilter) {
  const leagues = state.db.leagues || [];
  const currentClub = userClub();
  const defaultLeague = currentClub?.leagueId || leagues[0]?.id || "";
  const selectedLeagueId = leagues.some(l => l.id === leagueFilter)
    ? leagueFilter
    : defaultLeague;
  const selectedLeague = leagues.find(l => l.id === selectedLeagueId);
  const leagueTeams = selectedLeague
    ? state.db.teams.filter(t => t.leagueId === selectedLeagueId)
    : state.db.teams;
  const leagueTeamIds = new Set(leagueTeams.map(t => String(t.id)));
  const rows = leagueTeams.map(t => ({t,pts:0,j:0,v:0,e:0,d:0,gp:0,gc:0}));
  const relevantMatches = state.matchHistory.filter(m =>
    leagueTeamIds.has(String(m.homeId)) && leagueTeamIds.has(String(m.awayId))
  );
  relevantMatches.forEach(m => {
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
      Classificação calculada a partir dos resultados disputados nesta carreira. Cada competição possui sua própria tabela.
    </p>
    <div class="card">
      <div class="section-head">
        <h2>Competição</h2>
        <span class="tag">${leagues.length} cadastradas</span>
      </div>
      <label for="table-league">Escolha o campeonato</label>
      <select id="table-league" onchange="renderTable(this.value)">
        ${leagues.map(l => `<option value="${l.id}" ${l.id === selectedLeagueId ? "selected" : ""}>${l.name}</option>`).join("")}
      </select>
      <div class="section-head">
        <h2>${selectedLeague?.name || "Classificação"}</h2>
        <span class="tag">${relevantMatches.length} partidas computadas</span>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>#</th><th>CLUBE</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>PTS</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="club-name">${r.t.name}</td>
              <td>${r.j}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td>
              <td>${r.gp-r.gc}</td><td class="positive">${r.pts}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <p class="subtle">Clubes sem partidas disputadas começam com zero pontos. Os resultados simulados atualizam esta tabela automaticamente.</p>
    </div>
  `);
}

// CALENDÁRIO

function renderCalendar(competitionFilter) {
  const windows = state.db.calendar?.transferWindows || [];
  const allFixtures = state.db.calendar?.events || [];
  const competitions = [...new Set(allFixtures.map(e => e.competition).filter(Boolean))].sort();
  const selectedCompetition = competitions.includes(competitionFilter)
    ? competitionFilter
    : (competitions[0] || "");
  const fixtures = allFixtures
    .filter(e => !selectedCompetition || e.competition === selectedCompetition)
    .sort((a,b) => (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31") || a.round-b.round);
  const teamName = id => state.db.teams.find(t => String(t.id) === String(id))?.name || "Clube";
  const teamId = String(state.db.userClubId || state.selectedClubId || "");
  const teamFixtures = fixtures.filter(f => String(f.homeTeamId) === teamId || String(f.awayTeamId) === teamId);
  const played = id => state.matchHistory.find(m => m.fixtureId === id);
  const fixtureDate = f => f.date
    ? new Date(`${f.date}T12:00:00`).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})
    : "Data a confirmar";
  setPage("Calendário", `
    <p class="view-intro">Calendário da carreira · escolha uma competição para consultar os confrontos cadastrados e disputar os jogos do seu clube.</p>
    <div class="grid">
      <article class="card span-5">
        <div class="section-head"><h2>Competições</h2><span class="tag">${competitions.length} cadastradas</span></div>
        <label for="calendar-competition">Campeonato</label>
        <select id="calendar-competition" onchange="renderCalendar(this.value)">
          ${competitions.map(name => `<option value="${name.replace(/&/g,"&amp;").replace(/"/g,"&quot;")}" ${name === selectedCompetition ? "selected" : ""}>${name}</option>`).join("")}
        </select>
        <div class="section-head"><h2>Janelas de transferências</h2></div>
        ${windows.length ? windows.map(w => `
          <div class="fixture"><div><strong>${w.name}</strong><div class="subtle">${w.start} até ${w.end}</div></div><span class="tag">Planejada</span></div>
        `).join("") : `<div class="empty">Nenhuma janela cadastrada.</div>`}
        <div class="section-head"><h2>Jogos do seu clube</h2><span class="tag">${teamFixtures.length} partidas</span></div>
        ${teamFixtures.length ? teamFixtures.map(f => {
          const result = played(f.id);
          return `<div class="fixture"><div><strong>${teamName(f.homeTeamId)} × ${teamName(f.awayTeamId)}</strong><div class="subtle">${f.round}ª rodada · ${fixtureDate(f)}</div></div><span class="tag">${result ? result.homeScore + " × " + result.awayScore : "Pendente"}</span></div>`;
        }).join("") : `<p class="subtle">Não há partidas cadastradas desta competição para o clube escolhido.</p>`}
      </article>
      <article class="card span-7">
        <div class="section-head"><h2>${selectedCompetition || "Programação"}</h2><span class="tag">${fixtures.length} jogos</span></div>
        <p class="subtle">Somente partidas presentes no banco de dados são exibidas. Jogos do seu clube podem ser disputados no simulador.</p>
        ${fixtures.length ? fixtures.map(f => {
          const result = played(f.id);
          const mine = String(f.homeTeamId) === teamId || String(f.awayTeamId) === teamId;
          return `<div class="fixture">
            <div><strong>${teamName(f.homeTeamId)} × ${teamName(f.awayTeamId)}</strong>
              <div class="subtle">${f.round}ª rodada · ${fixtureDate(f)} · ${f.time || "horário a confirmar"} · ${f.stadium || "estádio a confirmar"}</div>
              ${result ? `<div class="positive">Resultado da sua carreira: ${result.homeScore} × ${result.awayScore}</div>` : ""}
            </div>
            ${result ? `<span class="tag">Concluído</span>` : mine ? `<button class="primary-btn" onclick="startFixture('${f.id}')">JOGAR</button>` : `<span class="tag">Programado</span>`}
          </div>`;
        }).join("") : `<div class="empty">Ainda não há partidas cadastradas para esta competição.</div>`}
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

function getLineup(teamId) {
  const players=state.db.players.filter(p=>String(p.teamId)===String(teamId)).sort((a,b)=>Number(b.overall||0)-Number(a.overall||0));
  const groups=[["GK",1],["DEF",4],["MID",3],["ATT",3]];
  const roles={GK:["GK","GOL"],DEF:["CB","LB","RB","FB","WB","LWB","RWB"],MID:["DM","CDM","CM","AM","CAM","LM","RM"],ATT:["ST","CF","LW","RW","SS"]};
  const starters=[],used=new Set();
  groups.forEach(([group,count])=>players.filter(p=>roles[group].includes(String(p.position||"").toUpperCase())&&!used.has(p.id)).slice(0,count).forEach(p=>{starters.push(p.id);used.add(p.id);}));
  players.filter(p=>!used.has(p.id)).slice(0,Math.max(0,11-starters.length)).forEach(p=>{starters.push(p.id);used.add(p.id);});
  return {starters:starters.slice(0,11),bench:players.filter(p=>!used.has(p.id)).slice(0,7).map(p=>p.id)};
}
function startMatch() {
  const opponentId=$("#match-opponent")?.value;
  if(!opponentId||String(opponentId)===String(state.db.userClubId))return;
  const home=userClub(),away=state.db.teams.find(t=>String(t.id)===String(opponentId));
  prepareMatch({homeId:home.id,awayId:away.id,homeName:home.name,awayName:away.name});
}
function startFixture(fixtureId) {
  const f=(state.db.calendar?.events||[]).find(x=>x.id===fixtureId);
  if(!f)return;
  const clubId=String(state.db.userClubId||state.selectedClubId||"");
  if(String(f.homeTeamId)!==clubId&&String(f.awayTeamId)!==clubId){alert("Este jogo não envolve seu clube.");return;}
  if(state.matchHistory.some(x=>x.fixtureId===fixtureId)){alert("Esta partida já foi disputada.");return;}
  const home=state.db.teams.find(t=>String(t.id)===String(f.homeTeamId)),away=state.db.teams.find(t=>String(t.id)===String(f.awayTeamId));
  prepareMatch({homeId:home.id,awayId:away.id,homeName:home.name,awayName:away.name,fixtureId:f.id,competition:f.competition,round:f.round,fixtureDate:f.date});
}
function prepareMatch(details) {
  if(state.matchTimer)clearInterval(state.matchTimer);
  const lineup=getLineup(state.db.userClubId||state.selectedClubId);
  state.match={...details,setup:true,lineup:lineup.starters,bench:lineup.bench,substitutions:[],homeScore:0,awayScore:0,minute:0,speed:1,paused:true,finished:false,saved:false,events:[{minute:0,text:"Escalação pronta. Confira os titulares e reservas."}]};
  state.view="match";renderMatch();
}
function kickoffMatch() {
  const m=state.match;if(!m||!m.setup)return;
  const starters=[...document.querySelectorAll("[data-xi]")].map(x=>x.value).filter(Boolean);
  const available=state.db.players.filter(p=>String(p.teamId)===String(state.db.userClubId||state.selectedClubId)).length;
  const required=Math.min(11,available);
  if(required===0){alert("Este clube ainda não tem jogadores cadastrados no banco de dados.");return;}
  if(starters.length!==required||new Set(starters).size!==required){alert("Selecione "+required+" titulares diferentes.");return;}
  const bench=[...document.querySelectorAll("[data-sub]")].map(x=>x.value).filter(Boolean).filter(id=>!starters.includes(id));
  m.lineup=starters;m.bench=[...new Set(bench)].slice(0,7);m.setup=false;m.paused=false;
  m.events.unshift({minute:0,text:"Escalação confirmada. Começa a partida!"});runMatchClock();renderMatch();
}
function makeSubstitution() {
  const m=state.match;if(!m||m.setup||m.finished||m.substitutions.length>=5)return;
  const out=$("#sub-out")?.value,inside=$("#sub-in")?.value;
  if(!out||!inside||!m.lineup.includes(out)||!m.bench.includes(inside))return;
  const old=state.db.players.find(p=>String(p.id)===String(out)),fresh=state.db.players.find(p=>String(p.id)===String(inside));
  m.lineup=m.lineup.map(id=>id===out?inside:id);m.bench=m.bench.map(id=>id===inside?out:id);
  m.substitutions.push({minute:m.minute,out,in:inside});
  m.events.unshift({minute:m.minute,text:"🔄 "+fresh.name+" entrou no lugar de "+old.name+"."});renderMatch();
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
  if(m.minute>=90){m.minute=90;m.finished=true;m.events.unshift({minute:90,text:"Fim de jogo! Partida encerrada."});if(!m.saved){state.matchHistory.push({homeId:m.homeId,awayId:m.awayId,homeScore:m.homeScore,awayScore:m.awayScore,date:m.fixtureDate || dateLabel(state.day),fixtureId:m.fixtureId || null,competition:m.competition || "Amistoso",round:m.round || null});m.saved=true;try{localStorage.setItem("fmb-match-history",JSON.stringify(state.matchHistory));}catch(_){}}clearInterval(state.matchTimer);state.matchTimer=null;}
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
function newMatch() { if(state.matchTimer) clearInterval(state.matchTimer); state.matchTimer=null; state.match=null; renderMatch(); }


function renderMatch() {
  const m=state.match;
  if(!m){
    const opponents=state.db.teams.filter(t=>String(t.id)!==String(state.db.userClubId));
    setPage("Central de Partidas",`<p class="view-intro">Escolha um adversário e prepare sua equipe.</p><article class="card match-setup"><div class="section-head"><h2>Preparar partida</h2><span class="tag">Simulação</span></div><label for="match-opponent">Adversário</label><select id="match-opponent">${opponents.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select><button class="primary-btn" onclick="startMatch()">PREPARAR PARTIDA</button></article>`);
    return;
  }
  const roster=state.db.players.filter(p=>String(p.teamId)===String(state.db.userClubId||state.selectedClubId)).sort((a,b)=>Number(b.overall||0)-Number(a.overall||0));
  const byId=id=>state.db.players.find(p=>String(p.id)===String(id));
  if(m.setup){
    const names=["Goleiro","Defensor 1","Defensor 2","Defensor 3","Defensor 4","Meio 1","Meio 2","Meio 3","Atacante 1","Atacante 2","Atacante 3"].slice(0,Math.min(11,roster.length));
    const chosen=new Set(m.lineup),reserves=roster.filter(p=>!chosen.has(p.id));
    const opts=id=>roster.map(p=>`<option value="${p.id}" ${String(id)===String(p.id)?"selected":""}>${p.name} · ${p.position} · ${p.overall}</option>`).join("");
    setPage("Escalação",`<p class="view-intro">Escolha seus titulares e até 7 reservas antes de iniciar. Elenco cadastrado: ${roster.length} jogadores.</p><article class="card"><div class="section-head"><h2>${m.homeName} × ${m.awayName}</h2><span class="tag">4-3-3</span></div><div class="lineup-grid">${names.map((n,i)=>`<label class="lineup-slot"><span>${i+1}. ${n}</span><select data-xi>${opts(m.lineup[i])}</select></label>`).join("")}</div><div class="section-head"><h2>Banco de reservas</h2><span class="tag">7 vagas</span></div><div class="bench-grid">${Array.from({length:7},(_,i)=>`<label class="lineup-slot"><span>Reserva ${i+1}</span><select data-sub><option value="">— Vazio —</option>${reserves.map(p=>`<option value="${p.id}" ${String(m.bench[i]||"")===String(p.id)?"selected":""}>${p.name} · ${p.position}</option>`).join("")}</select></label>`).join("")}</div><button class="primary-btn" onclick="kickoffMatch()">⚽ CONFIRMAR ESCALAÇÃO E JOGAR</button></article>`);
    return;
  }
  const starters=m.lineup.map(byId).filter(Boolean),bench=m.bench.map(byId).filter(Boolean);
  const sub=!m.finished&&m.substitutions.length<5&&bench.length?`<article class="card substitution-card"><div class="section-head"><h2>Substituições</h2><span class="tag">${m.substitutions.length}/5</span></div><div class="substitution-controls"><label>Sai<select id="sub-out">${starters.map(p=>`<option value="${p.id}">${p.name}</option>`).join("")}</select></label><label>Entra<select id="sub-in">${bench.map(p=>`<option value="${p.id}">${p.name}</option>`).join("")}</select></label><button class="primary-btn" onclick="makeSubstitution()">CONFIRMAR</button></div></article>`:"";
  setPage("Central de Partidas",`<article class="card live-match"><div class="match-status">${m.finished?"TEMPO INTEGRAL":m.paused?"PARTIDA PAUSADA":"PARTIDA AO VIVO"}</div><div class="scoreboard"><div class="score-team"><strong>${m.homeName}</strong><span>${m.homeScore}</span></div><div class="score-clock">${String(m.minute).padStart(2,"0")}’</div><div class="score-team"><strong>${m.awayName}</strong><span>${m.awayScore}</span></div></div><div class="match-controls"><button class="primary-btn" onclick="pauseMatch()" ${m.finished?"disabled":""}>${m.paused?"▶ Continuar":"Ⅱ Pausar"}</button><button class="speed-btn" onclick="setMatchSpeed(1)">1x</button><button class="speed-btn" onclick="setMatchSpeed(2)">2x</button><button class="speed-btn" onclick="setMatchSpeed(4)">4x</button><button class="speed-btn" onclick="newMatch()">Nova partida</button></div></article><div class="grid match-squads"><article class="card span-6"><h2>Titulares · ${starters.length}/11</h2>${starters.map(p=>`<div class="player-row"><div><strong>${p.name}</strong><small>${p.position}</small></div><span class="rating">${p.overall}</span></div>`).join("")}</article><article class="card span-6"><h2>Reservas · ${bench.length}/7</h2>${bench.map(p=>`<div class="player-row"><div><strong>${p.name}</strong><small>${p.position}</small></div><span class="rating">${p.overall}</span></div>`).join("")}</article></div>${sub}<article class="card events-card"><div class="section-head"><h2>Relato da partida</h2><span class="tag">${m.events.length} eventos</span></div><div class="match-events">${m.events.map(e=>`<div class="match-event"><strong>${String(e.minute).padStart(2,"0")}’</strong><span>${e.text}</span></div>`).join("")}</div></article>`);
}


// INICIAR JOGO

init();
