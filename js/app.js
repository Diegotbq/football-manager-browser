
const state = {
  db: null,
  day: new Date("2026-07-01T12:00:00"),
  view: "club-selection",
  selectedClubId: null,
  match: null,
  matchTimer: null
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
  const rows = state.db.teams.map(t => ({
    t,
    pts: 0,
    j: 0,
    v: 0,
    e: 0,
    d: 0,
    gp: 0,
    gc: 0
  }));

  setPage("Tabela", `
    <p class="view-intro">
      Classificação de demonstração.
      Os resultados serão preenchidos pelo motor de partidas.
    </p>

    <div class="card">
      <div class="section-head">
        <h2>Clubes cadastrados</h2>
        <span class="tag">Pré-temporada</span>
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
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td class="positive">0</td>
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
  const windows =
    state.db.calendar?.transferWindows || [];

  setPage("Calendário", `
    <p class="view-intro">
      Temporada ${state.db.meta.season}
      · Avance o dia pelo botão no topo.
    </p>

    <div class="grid">

      <article class="card span-5">
        <div class="section-head">
          <h2>Janelas de transferências</h2>
        </div>

        ${
          windows.length
            ? windows.map(w => `
                <div class="fixture">
                  <div>
                    <strong>${w.name}</strong>
                    <div class="subtle">
                      ${w.start} até ${w.end}
                    </div>
                  </div>
                  <span class="tag">Planejada</span>
                </div>
              `).join("")
            : `<div class="empty">Nenhuma janela cadastrada.</div>`
        }
      </article>

      <article class="card span-7">
        <div class="section-head">
          <h2>Agenda</h2>
          <span class="tag">${dateLabel(state.day)}</span>
        </div>

        <div class="empty">
          Nenhum evento cadastrado para esta data.
          As rodadas, convocações e lesões serão
          integradas ao calendário.
        </div>
      </article>

    </div>
  `);
}

// INICIAR JOGO

init();
