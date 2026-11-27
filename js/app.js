
const state = {
  db: null,
  day: new Date("2026-07-01T12:00:00"),
  view: "club-selection",
  selectedClubId: null,
  match: null,
  matchTimer: null,
  matchHistory: [],
  transferHistory: [],
  pendingOffers: [],
  playerMorale: {},
  playerPromises: [],
  playerRequests: [],
  playerAgentDemands: [],
  boardCareer: null,
  managerOffers: [],
  contracts: {},
  loanRecords: [],
  trainingRecords: {},
  academyProspects: [],
  scoutingReports: [],
  playerAttributes: {},
  savedLineups: {},
  playerConditions: {},
  generatedFixtures: [],
  cupCompetitions: [],
  continentalQualifiers: {},
  seasonHistory: [],
  selectedPlayerId: null,
  inbox: []
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
    ensureGeneratedFixtures();
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
    const advanceNextButton = $("#advance-next-match");
    if (advanceNextButton) advanceNextButton.addEventListener("click", advanceToNextMatch);

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
      initializeBoardCareer(savedClub);
      ensureCupCompetitions();
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

function generateManagerOffers(club){
  const board=state.boardCareer;if(!club||!board||board.fired||board.confidence<75)return;
  const existing=state.managerOffers.filter(o=>o.status==="pending");if(existing.length)return;
  const candidates=state.db.teams.filter(t=>String(t.id)!==String(club.id)&&Number(t.reputation||0)>=Math.max(20,Number(club.reputation||0)-12)&&Number(t.reputation||0)<=Number(club.reputation||0)+22)
    .sort((a,b)=>Number(b.reputation||0)-Number(a.reputation||0)).slice(0,3);
  candidates.forEach((team,index)=>state.managerOffers.push({id:"manager-"+team.id+"-"+Date.now()+"-"+index,clubId:team.id,clubName:team.name,reputation:Number(team.reputation||0),status:"pending",date:state.day.toISOString().slice(0,10)}));
  if(candidates.length)saveTransferCareer();
}
function acceptManagerOffer(offerId){
  const offer=state.managerOffers.find(o=>o.id===offerId&&o.status==="pending");if(!offer)return;
  const club=state.db.teams.find(t=>String(t.id)===String(offer.clubId));if(!club)return;
  if(!confirm("Aceitar a proposta do "+club.name+"? Você deixará seu clube atual e assumirá uma nova carreira neste time."))return;
  offer.status="accepted";state.managerOffers.filter(o=>o.id!==offer.id&&o.status==="pending").forEach(o=>o.status="declined");
  saveTransferCareer();selectClub(club.id);
}
function declineManagerOffer(offerId){
  const offer=state.managerOffers.find(o=>o.id===offerId&&o.status==="pending");if(!offer)return;
  offer.status="declined";saveTransferCareer();renderDashboard();
}
function renderManagerOffersPanel(){
  const offers=state.managerOffers.filter(o=>o.status==="pending");if(!offers.length)return "";
  return '<article class="card span-12"><div class="section-head"><h2>📨 Propostas de outros clubes</h2><span class="tag">'+offers.length+' oferta(s)</span></div><p class="subtle">Seu desempenho chamou a atenção de outras equipes. As propostas são eventos simulados da carreira.</p>'+
    offers.map(o=>'<div class="fixture"><div><strong>'+o.clubName+'</strong><div class="subtle">Reputação do clube: '+o.reputation+'/100 · Proposta recebida em '+o.date+'</div></div><div><button class="primary-btn" onclick="acceptManagerOffer(&quot;'+o.id+'&quot;)">ACEITAR</button><button class="secondary-btn" onclick="declineManagerOffer(&quot;'+o.id+'&quot;)">RECUSAR</button></div></div>').join("")+'</article>';
}
function initializeBoardCareer(club){
  if(!club)return;
  if(state.boardCareer&&String(state.boardCareer.clubId)===String(club.id)&&!state.boardCareer.fired)return;
  const league=(state.db.leagues||[]).find(l=>l.id===club.leagueId&&l.type==="league");
  const teams=league?(league.teams||[]).map(id=>state.db.teams.find(t=>String(t.id)===String(id))).filter(Boolean):[club];
  const ranked=[...teams].sort((a,b)=>Number(b.reputation||0)-Number(a.reputation||0));
  const reputationRank=Math.max(1,ranked.findIndex(t=>String(t.id)===String(club.id))+1);
  const count=Math.max(1,teams.length);
  const target=reputationRank<=2?Math.min(3,count):reputationRank<=Math.ceil(count*.35)?Math.max(3,Math.ceil(count*.3)):Math.max(1,Math.ceil(count*.65));
  state.boardCareer={clubId:club.id,leagueId:league?.id||null,leagueName:league?.name||"Campeonato",targetPosition:target,confidence:65,fanSupport:65,lastConferenceDate:null,fired:false,review:"A diretoria espera uma temporada consistente."};
  saveTransferCareer();
}
function getBoardLeaguePosition(){
  const board=state.boardCareer,league=(state.db.leagues||[]).find(l=>l.id===board?.leagueId);
  if(!league)return null;
  const table=seasonStandings(league),index=table.findIndex(r=>String(r.id)===String(userClub()?.id));
  return index<0?null:{position:index+1,total:table.length,points:table[index].pts};
}
function applyBoardMatchReview(match){
  const board=state.boardCareer,club=userClub();if(!board||!club||String(board.clubId)!==String(club.id)||board.fired)return;
  if(match.competition!==board.leagueName)return;
  const isHome=String(match.homeId)===String(club.id),scored=Number(isHome?match.homeScore:match.awayScore),conceded=Number(isHome?match.awayScore:match.homeScore);
  const opponent=state.db.teams.find(t=>String(t.id)===String(isHome?match.awayId:match.homeId));
  const stronger=Number(opponent?.reputation||50)>Number(club.reputation||50)+8;
  const change=scored>conceded?(stronger?5:3):scored===conceded?(stronger?2:-1):(stronger?-2:-5);
  board.confidence=Math.max(0,Math.min(100,board.confidence+change));
  board.fanSupport=Math.max(0,Math.min(100,board.fanSupport+(scored>conceded?4:scored===conceded?0:-4)));
  board.review=scored>conceded?"A diretoria ficou satisfeita com a vitória.":scored===conceded?"A diretoria considerou o resultado apenas razoável.":"A diretoria está decepcionada com a derrota.";
  if(board.confidence===0){board.fired=true;board.review="Você foi demitido após uma sequência de resultados abaixo das expectativas.";}
  saveTransferCareer();
}
function holdPressConference(){
  const board=state.boardCareer;if(!board||board.fired)return;
  const today=state.day.toISOString().slice(0,10);
  if(board.lastConferenceDate){
    const elapsed=Math.floor((new Date(today+"T12:00:00")-new Date(board.lastConferenceDate+"T12:00:00"))/86400000);
    if(elapsed<7){alert("Você já concedeu uma coletiva recentemente. Volte em "+(7-elapsed)+" dia(s).");return;}
  }
  const answer=prompt("COLETIVA DE IMPRENSA\n1 - Assumir a responsabilidade e prometer reação\n2 - Defender o elenco e pedir união\n3 - Cobrar publicamente uma resposta dos jogadores","1");
  if(answer===null)return;
  if(!["1","2","3"].includes(answer)){alert("Escolha 1, 2 ou 3.");return;}
  if(answer==="1"){board.confidence=Math.min(100,board.confidence+3);board.fanSupport=Math.min(100,board.fanSupport+5);board.review="Você assumiu a responsabilidade e prometeu uma reação.";}
  else if(answer==="2"){board.confidence=Math.min(100,board.confidence+2);board.fanSupport=Math.min(100,board.fanSupport+2);state.db.players.filter(p=>String(p.teamId)===String(userClub().id)).forEach(p=>state.playerMorale[p.id]=Math.min(100,getPlayerMorale(p)+3));board.review="Você protegeu o elenco e reforçou a união do grupo.";}
  else{board.confidence=Math.max(0,board.confidence-2);board.fanSupport=Math.min(100,board.fanSupport+4);state.db.players.filter(p=>String(p.teamId)===String(userClub().id)).forEach(p=>state.playerMorale[p.id]=Math.max(0,getPlayerMorale(p)-2));board.review="A cobrança agradou parte da torcida, mas aumentou a pressão no vestiário.";}
  board.lastConferenceDate=today;
  if(board.confidence===0){board.fired=true;board.review="A diretoria encerrou seu trabalho após a coletiva.";}
  saveTransferCareer();renderDashboard();
}
function returnToClubMarket(){
  state.selectedClubId=null;state.db.userClubId=null;state.boardCareer=null;
  try{localStorage.removeItem("fmb-selected-club");}catch(_){}
  state.view="club-selection";renderClubSelection();
}
function renderBoardCareerPanel(){
  const board=state.boardCareer;if(!board)return "";
  const position=getBoardLeaguePosition();
  if(board.fired)return '<article class="card span-12"><div class="section-head"><h2>📋 Fim de trabalho</h2><span class="tag">Demitido</span></div><p>'+board.review+'</p><button class="primary-btn" onclick="returnToClubMarket()">PROCURAR NOVO CLUBE</button></article>';
  const confidence=Number(board.confidence||0),fans=Number(board.fanSupport||0);
  const mood=value=>value>=75?"Excelente":value>=55?"Boa":value>=35?"Em alerta":"Crítica";
  return '<article class="card span-12"><div class="section-head"><h2>🏛️ Diretoria e torcida</h2><span class="tag">'+mood(confidence)+' · '+confidence+'%</span></div>'+
    '<div class="grid"><div class="card span-6"><div class="card-label">Confiança da diretoria</div><div class="metric">'+confidence+'%</div><div class="subtle">A confiança reage aos resultados do campeonato.</div></div>'+
    '<div class="card span-6"><div class="card-label">Apoio da torcida</div><div class="metric">'+fans+'%</div><div class="subtle">'+mood(fans)+' · sentimento dos torcedores.</div></div></div>'+
    '<div class="fixture"><div><strong>Objetivo da temporada</strong><div class="subtle">'+board.leagueName+': terminar entre os '+board.targetPosition+' primeiros</div></div><span class="tag">'+(position?"Atual: "+position.position+"º / "+position.total:"Sem jogos")+'</span></div>'+
    '<p class="subtle">'+board.review+'</p><button class="primary-btn" onclick="holdPressConference()">🎙️ CONCEDER COLETIVA</button><p class="subtle">Coletivas disponíveis a cada 7 dias. Suas respostas afetam a confiança, a torcida e a moral do elenco.</p></article>';
}
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
  initializeBoardCareer(club);
  ensureCupCompetitions();
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

// MERCADO MUNDIAL — negociações automáticas entre clubes controlados pela IA
function processAITransfers() {
  const today=state.day.toISOString().slice(0,10);
  const windows=state.db.calendar?.transferWindows||[];
  if(!windows.some(w=>today>=w.start&&today<=w.end))return;
  if(Math.random()>0.42)return;
  const userId=String(state.db.userClubId||state.selectedClubId||"");
  const squads=state.db.teams.map(team=>({
    team,
    players:state.db.players.filter(p=>String(p.teamId)===String(team.id))
  })).filter(x=>x.players.length>0&&String(x.team.id)!==userId);
  const buyers=squads.filter(x=>x.players.length<26&&Number(x.team.budget||0)>500000);
  const sellers=squads.filter(x=>x.players.length>15);
  if(!buyers.length||!sellers.length)return;
  const options=[];
  buyers.forEach(buyer=>{
    const average=buyer.players.reduce((n,p)=>n+Number(p.overall||0),0)/buyer.players.length;
    const positions=["GK","CB","LB","RB","DM","CM","AM","LW","RW","ST","DF","MF","FW"];
    const counts=positions.map(pos=>({pos,count:buyer.players.filter(p=>p.position===pos).length}));
    const need=counts.sort((a,b)=>a.count-b.count)[0]?.pos;
    sellers.forEach(seller=>{
      if(String(seller.team.id)===String(buyer.team.id))return;
      seller.players.forEach(player=>{
        if(player.position!==need||player.injured)return;
        const value=Number(player.marketValue)||0;
        const fee=Math.round(value*(1.02+Math.random()*0.22));
        if(Number(buyer.team.budget||0)<fee)return;
        const sellerAtPosition=seller.players.filter(p=>p.position===player.position).length;
        if(sellerAtPosition<=1||seller.players.length<=16)return;
        if(Number(player.overall||0)<average-4)return;
        options.push({buyer,seller,player,fee,score:Number(player.overall||0)+Math.random()*8});
      });
    });
  });
  if(!options.length)return;
  options.sort((a,b)=>b.score-a.score);
  const shortlist=options.slice(0,Math.min(12,options.length));
  const deal=shortlist[Math.floor(Math.random()*shortlist.length)];
  const {buyer,seller,player,fee}=deal;
  buyer.team.budget=Number(buyer.team.budget||0)-fee;
  seller.team.budget=Number(seller.team.budget||0)+fee;
  player.teamId=buyer.team.id;
  state.db.teams.forEach(team=>{
    if(!Array.isArray(team.players))return;
    team.players=team.players.filter(p=>String(p.id)!==String(player.id));
    if(String(team.id)===String(buyer.team.id))team.players.push(player);
  });
  state.transferHistory.push({
    playerId:player.id,playerName:player.name,fromTeamId:seller.team.id,fromName:seller.team.name,
    toTeamId:buyer.team.id,toName:buyer.team.name,fee,date:today,aiTransfer:true
  });
  if(state.transferHistory.length>250)state.transferHistory=state.transferHistory.slice(-250);
  saveTransferCareer();
}

// PROPOSTAS DA IA PELOS JOGADORES DO CLUBE DO TREINADOR
function processAIPlayerOffers() {
  const club=userClub();if(!club)return;
  const today=state.day.toISOString().slice(0,10);
  const windows=state.db.calendar?.transferWindows||[];
  if(!windows.some(w=>today>=w.start&&today<=w.end))return;
  state.pendingOffers=state.pendingOffers.filter(o=>o.status==="pending"&&o.expires>=today);
  if(Math.random()>0.48)return;
  const roster=state.db.players.filter(p=>String(p.teamId)===String(club.id));
  const buyers=state.db.teams.filter(t=>String(t.id)!==String(club.id)&&Number(t.budget||0)>750000);
  if(!roster.length||!buyers.length)return;
  const available=roster.filter(p=>!state.pendingOffers.some(o=>String(o.playerId)===String(p.id)&&o.status==="pending")&&!state.loanRecords.some(r=>String(r.playerId)===String(p.id)&&!r.returned));
  if(!available.length)return;
  const listed=available.filter(p=>state.playerRequests.some(r=>String(r.playerId)===String(p.id)&&r.status==="listed"));
  const targets=listed.length?listed:available.filter(p=>Number(p.overall||0)>=68||Number(p.age||30)<=22);
  const player=(targets.length?targets:available)[Math.floor(Math.random()*(targets.length?targets:available).length)];
  const value=Math.max(100000,Number(player.marketValue)||100000);
  const candidates=buyers.filter(t=>Number(t.reputation||0)>=Math.max(20,Number(club.reputation||0)-22)&&Number(t.budget||0)>=value*.85);
  if(!candidates.length)return;
  candidates.sort((a,b)=>Number(b.reputation||0)-Number(a.reputation||0));
  const interested=candidates.slice(0,Math.min(3,candidates.length)).sort(()=>Math.random()-.5);
  interested.slice(0,Math.random()<.3?Math.min(2,interested.length):1).forEach(buyer=>{
    const fee=Math.round(value*(.92+Math.random()*.28));if(fee>Number(buyer.budget||0))return;
    const expires=new Date(state.day);expires.setDate(expires.getDate()+10);
    state.pendingOffers.push({id:"offer-"+String(player.id)+"-"+String(buyer.id)+"-"+Date.now()+"-"+Math.floor(Math.random()*10000),playerId:player.id,playerName:player.name,fromTeamId:buyer.id,fromName:buyer.name,toTeamId:club.id,toName:club.name,fee,date:today,expires:expires.toISOString().slice(0,10),status:"pending",aiOffer:true});
  });
  if(state.pendingOffers.length>100)state.pendingOffers=state.pendingOffers.slice(-100);
  saveTransferCareer();
}

function resolveAIPlayerOffer(offerId,action) {
  const offer=state.pendingOffers.find(o=>o.id===offerId&&o.status==="pending");if(!offer)return;
  const today=state.day.toISOString().slice(0,10);
  if(offer.expires<today){offer.status="expired";saveTransferCareer();renderMarket();return;}
  const player=state.db.players.find(p=>String(p.id)===String(offer.playerId)),seller=userClub(),buyer=state.db.teams.find(t=>String(t.id)===String(offer.fromTeamId));
  if(!player||!seller||!buyer||String(player.teamId)!==String(seller.id)){offer.status="withdrawn";saveTransferCareer();renderMarket();return;}
  if(action==="reject"){offer.status="rejected";saveTransferCareer();renderMarket();return;}
  let fee=Number(offer.fee||0);
  if(action==="counter"){
    const raw=prompt("Contraproposta por "+player.name+"\nOferta atual: "+money(fee)+"\nDigite o valor desejado em euros:",String(Math.round(fee*1.2)));
    if(raw===null)return;fee=Number(String(raw).replace(/[€.\s]/g,"").replace(/,/g,"."));
    if(!Number.isFinite(fee)||fee<=0){alert("Digite um valor válido.");return;}
    if(fee>Number(buyer.budget||0)){alert("O clube interessado não tem orçamento suficiente.");return;}
    if(fee>Number(offer.fee)*1.35){alert("O clube recusou a contraproposta.");offer.status="rejected";saveTransferCareer();renderMarket();return;}
  }
  if(fee>Number(buyer.budget||0)){alert("O clube não tem orçamento suficiente.");return;}
  if(!confirm("Aceitar a proposta de "+buyer.name+" por "+player.name+" no valor de "+money(fee)+"? O jogador deixará seu elenco."))return;
  buyer.budget=Number(buyer.budget||0)-fee;seller.budget=Number(seller.budget||0)+fee;
  const fromId=player.teamId;player.teamId=buyer.id;
  state.db.teams.forEach(team=>{if(!Array.isArray(team.players))return;team.players=team.players.filter(p=>String(p.id)!==String(player.id));if(String(team.id)===String(buyer.id))team.players.push(player);});
  offer.status="accepted";offer.agreedFee=fee;
  state.pendingOffers.filter(o=>String(o.playerId)===String(player.id)&&o.status==="pending").forEach(o=>o.status="withdrawn");
  state.playerRequests.filter(r=>String(r.playerId)===String(player.id)&&r.status==="listed").forEach(r=>r.status="sold");
  state.transferHistory.push({playerId:player.id,playerName:player.name,fromTeamId:fromId,fromName:seller.name,toTeamId:buyer.id,toName:buyer.name,fee,date:today,userSale:true});
  saveTransferCareer();alert("Venda concluída! "+player.name+" foi transferido para "+buyer.name+".");renderMarket();
}

function getPlayerMorale(playerOrId){
  const id=typeof playerOrId==="object"?playerOrId?.id:playerOrId;
  if(id==null)return 70;
  if(!Number.isFinite(Number(state.playerMorale[id])))state.playerMorale[id]=70;
  state.playerMorale[id]=Math.max(0,Math.min(100,Number(state.playerMorale[id])));
  return state.playerMorale[id];
}
function moraleLabel(value){
  if(value>=85)return "Muito feliz";if(value>=70)return "Feliz";if(value>=50)return "Neutro";if(value>=30)return "Insatisfeito";return "Muito insatisfeito";
}
function talkToPlayer(playerId){
  const player=state.db.players.find(p=>String(p.id)===String(playerId));
  if(!player||String(player.teamId)!==String(userClub()?.id))return;
  const morale=getPlayerMorale(player),pending=state.playerPromises.find(p=>String(p.playerId)===String(player.id)&&p.status==="pending");
  const choice=prompt("CONVERSA COM "+player.name+"\nMoral: "+moraleLabel(morale)+" ("+morale+"/100)"+(pending?"\nPromessa ativa: "+pending.label:"")+"\n\n1 - Conversa motivacional\n2 - Prometer mais oportunidades como titular\n3 - Explicar o planejamento esportivo");
  if(choice===null)return;
  if(choice==="1"){state.playerMorale[player.id]=Math.min(100,morale+7);alert(player.name+" agradeceu a conversa. Moral: "+getPlayerMorale(player)+"/100.");}
  else if(choice==="2"){
    if(pending){alert("Você já tem uma promessa ativa para este jogador.");return;}
    state.playerMorale[player.id]=Math.min(100,morale+10);
    const clubMatches=state.matchHistory.filter(m=>String(m.homeId)===String(userClub().id)||String(m.awayId)===String(userClub().id));
    state.playerPromises.push({playerId:player.id,playerName:player.name,clubId:userClub().id,label:"Mais oportunidades como titular",startMatchCount:clubMatches.length,targetMatchCount:clubMatches.length+3,status:"pending",date:state.day.toISOString().slice(0,10)});
    alert("Promessa registrada! Nas próximas três partidas do clube, tente escalar "+player.name+" em pelo menos duas.");
  }else if(choice==="3"){state.playerMorale[player.id]=Math.min(100,morale+3);alert("Você explicou o planejamento ao jogador. A conversa ajudou a tranquilizá-lo.");}
  else{alert("Escolha uma opção de 1 a 3.");return;}
  saveTransferCareer();renderSquad();
}
function handlePlayerRequest(playerId,action){
 const request=state.playerRequests.find(r=>String(r.playerId)===String(playerId)&&r.status==="pending"),player=state.db.players.find(p=>String(p.id)===String(playerId));
 if(!request||!player||String(player.teamId)!==String(userClub()?.id))return;
 if(action==="convince"){state.playerMorale[player.id]=Math.min(100,getPlayerMorale(player)+20);request.status="convinced";request.resolvedDate=state.day.toISOString().slice(0,10);alert("Você conversou com "+player.name+" e conseguiu acalmá-lo por enquanto. A moral melhorou.");}
 else if(action==="list"){request.status="listed";request.resolvedDate=state.day.toISOString().slice(0,10);alert(player.name+" foi colocado na lista de transferências. Clubes interessados poderão apresentar propostas.");}
 saveTransferCareer();renderSquad();
}
function processPlayerAgentDemands(){
  const club=userClub();if(!club)return;
  const today=state.day.toISOString().slice(0,10);
  state.db.players.filter(p=>String(p.teamId)===String(club.id)).forEach(player=>{
    const contract=getPlayerContract(player);
    const expiryDays=Math.floor((new Date(contract.expiresAt+"T12:00:00")-new Date(today+"T12:00:00"))/86400000);
    const wage=Math.max(0,Number(contract.weeklyWage)||0);
    const marketWage=Math.max(500,Math.round(((Number(player.marketValue)||50000)*0.00042)/50)*50);
    const underpaid=wage<marketWage*0.86;
    const expiring=expiryDays<=365;
    const unhappy=getPlayerMorale(player)<42;
    if(!underpaid&&!expiring&&!unhappy)return;
    const active=state.playerAgentDemands.some(d=>String(d.playerId)===String(player.id)&&d.status==="pending");
    if(active)return;
    const previous=state.playerAgentDemands.filter(d=>String(d.playerId)===String(player.id)).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
    if(previous&&Math.floor((new Date(today+"T12:00:00")-new Date(previous.date+"T12:00:00"))/86400000)<60)return;
    if(Math.random()>(unhappy?0.42:expiring?0.3:0.18))return;
    const demandedWage=Math.max(wage+Math.max(250,Math.round(wage*0.12/50)*50),Math.round(marketWage*1.08/50)*50);
    const demandedYears=2+Math.floor(Math.random()*3);
    state.playerAgentDemands.push({id:"agent-"+player.id+"-"+Date.now(),playerId:player.id,playerName:player.name,clubId:club.id,currentWage:wage,demandedWage,years:demandedYears,reason:underpaid&&expiring?"Salário abaixo do mercado e contrato perto do fim":underpaid?"O agente considera o salário abaixo do mercado":expiring?"Contrato perto do fim":"O jogador quer melhores condições",date:today,status:"pending"});
  });
  saveTransferCareer();
}
function resolvePlayerAgentDemand(playerId,action){
  const demand=state.playerAgentDemands.find(d=>String(d.playerId)===String(playerId)&&d.status==="pending");
  const player=state.db.players.find(p=>String(p.id)===String(playerId));
  if(!demand||!player||String(player.teamId)!==String(userClub()?.id))return;
  const current=getPlayerContract(player);
  if(action==="accept"){
    if(!confirm("Aceitar a exigência do agente de "+player.name+"? Novo salário: "+money(demand.demandedWage)+" por semana, por "+demand.years+" anos."))return;
    const expiry=new Date(state.day);expiry.setFullYear(expiry.getFullYear()+demand.years);
    state.contracts[player.id]={weeklyWage:demand.demandedWage,expiresAt:expiry.toISOString().slice(0,10)};
    state.playerMorale[player.id]=Math.min(100,getPlayerMorale(player)+12);
    demand.status="accepted";demand.resolvedDate=state.day.toISOString().slice(0,10);
    alert("Acordo fechado! O agente confirmou a renovação.");
  }else if(action==="counter"){
    const raw=prompt("Contraproposta salarial para "+player.name+".\nPedido: "+money(demand.demandedWage)+" por semana.\nSalário atual: "+money(current.weeklyWage)+".\nDigite sua oferta semanal:",String(Math.round((current.weeklyWage+demand.demandedWage)/2)));
    if(raw===null)return;
    const offer=Number(String(raw).replace(/[€.\x20]/g,"").replace(/,/g,"."));
    if(!Number.isFinite(offer)||offer<=0){alert("Digite um salário válido.");return;}
    if(offer>=demand.demandedWage*0.94){
      const years=new Date(state.day);years.setFullYear(years.getFullYear()+demand.years);
      state.contracts[player.id]={weeklyWage:offer,expiresAt:years.toISOString().slice(0,10)};
      state.playerMorale[player.id]=Math.min(100,getPlayerMorale(player)+8);
      demand.status="accepted";demand.agreedWage=offer;demand.resolvedDate=state.day.toISOString().slice(0,10);
      alert("O agente aceitou a contraproposta!");
    }else{
      demand.status="rejected";demand.resolvedDate=state.day.toISOString().slice(0,10);
      state.playerMorale[player.id]=Math.max(0,getPlayerMorale(player)-10);
      alert("O agente recusou. O jogador ficou frustrado com a negociação.");
    }
  }else if(action==="reject"){
    demand.status="rejected";demand.resolvedDate=state.day.toISOString().slice(0,10);
    state.playerMorale[player.id]=Math.max(0,getPlayerMorale(player)-14);
    alert("Você recusou as exigências. A insatisfação do jogador aumentou.");
  }else return;
  saveTransferCareer();renderSquad();
}
function renderPlayerAgentPanel(){
  const demands=state.playerAgentDemands.filter(d=>String(d.clubId)===String(userClub().id)&&d.status==="pending").slice(-8).reverse();
  return '<div class="card"><div class="section-head"><h2>🤵 Agentes e renovações</h2><span class="tag">'+demands.length+' negociação(ões)</span></div>'+
    '<p class="subtle">Agentes podem procurar o clube quando o salário está abaixo do mercado, o contrato se aproxima do fim ou a moral cai. Aceitar ou negociar altera a folha salarial e a satisfação do atleta.</p>'+
    (demands.length?demands.map(d=>'<div class="fixture"><div><strong>'+d.playerName+'</strong><div class="subtle">'+d.reason+' · Atual: '+money(d.currentWage)+'/sem. · Pedido: '+money(d.demandedWage)+'/sem. · '+d.years+' anos</div></div><div><button class="primary-btn" onclick="resolvePlayerAgentDemand(&quot;'+d.playerId+'&quot;,&quot;accept&quot;)">ACEITAR</button><button class="secondary-btn" onclick="resolvePlayerAgentDemand(&quot;'+d.playerId+'&quot;,&quot;counter&quot;)">CONTRAPROPOSTA</button><button class="secondary-btn" onclick="resolvePlayerAgentDemand(&quot;'+d.playerId+'&quot;,&quot;reject&quot;)">RECUSAR</button></div></div>').join(""):'<p class="subtle">Nenhum agente solicitou reunião no momento.</p>')+'</div>';
}
function updateSquadMorale(){
  const club=userClub();if(!club)return;
  const today=state.day.toISOString().slice(0,10);
  const recent=state.matchHistory.filter(m=>String(m.homeId)===String(club.id)||String(m.awayId)===String(club.id)).slice(-5);
  state.db.players.filter(p=>String(p.teamId)===String(club.id)).forEach(player=>{
    const morale=getPlayerMorale(player),appearances=recent.filter(m=>(m.playerIds||[]).some(id=>String(id)===String(player.id))).length;
    const unused=Math.max(0,recent.length-appearances);let change=appearances?Math.min(5,appearances*2):0;
    if(unused>=3)change-=Math.min(6,unused*2);
    if(getPlayerCondition(player).injuryDays>0)change-=1;
    const contract=state.contracts[player.id];
    if(contract&&new Date(contract.expiresAt+"T12:00:00")-new Date(today+"T12:00:00")<180*86400000)change-=1;
    state.playerMorale[player.id]=Math.max(0,Math.min(100,morale+change));
    const recentRequest=state.playerRequests.some(r=>String(r.playerId)===String(player.id)&&((r.status==="pending"||r.status==="listed")||(r.date&&((new Date(today+"T12:00:00")-new Date(r.date+"T12:00:00"))/86400000)<30)));
    if(state.playerMorale[player.id]<=28&&unused>=3&&!recentRequest)state.playerRequests.push({playerId:player.id,playerName:player.name,clubId:club.id,status:"pending",reason:"Poucas oportunidades em campo e moral muito baixa",date:today});
  });
  state.playerPromises.filter(p=>p.status==="pending").forEach(p=>{
    const clubMatches=state.matchHistory.filter(m=>String(m.homeId)===String(p.clubId)&&String(m.awayId)!==String(p.clubId)||String(m.awayId)===String(p.clubId)&&String(m.homeId)!==String(p.clubId));
    if(clubMatches.length<p.targetMatchCount)return;
    const played=clubMatches.slice(p.startMatchCount,p.targetMatchCount).filter(m=>(m.playerIds||[]).some(id=>String(id)===String(p.playerId))).length;
    p.status=played>=2?"fulfilled":"broken";const current=state.playerMorale[p.playerId]??70;
    state.playerMorale[p.playerId]=Math.max(0,Math.min(100,current+(p.status==="fulfilled"?8:-18)));
    p.resolvedDate=today;p.appearances=played;
  });
  saveTransferCareer();
}

function addInboxItem(type,title,message,important=false){
  state.inbox=Array.isArray(state.inbox)?state.inbox:[];
  state.inbox.unshift({id:'inbox-'+Date.now()+'-'+Math.floor(Math.random()*100000),type,title,message,date:state.day.toISOString().slice(0,10),important,read:false});
  state.inbox=state.inbox.slice(0,100);
}
function hasPendingCareerDecision(){
  return state.pendingOffers.some(o=>o.status==='pending')||state.playerAgentDemands.some(d=>d.status==='pending')||state.managerOffers.some(o=>o.status==='pending');
}
function simulateScheduledAILeagueFixtures(today){
  const managedId=String(state.db.userClubId||state.selectedClubId||"");
  const fixtures=[...(state.db.calendar?.events||[]),...(state.generatedFixtures||[])];
  const played=new Set(state.matchHistory.filter(m=>m.fixtureId).map(m=>String(m.fixtureId)));
  let simulated=0;
  fixtures.forEach(f=>{
    if(!f||f.date!==today||f.isCup||!f.competition||!f.id||played.has(String(f.id)))return;
    const league=(state.db.leagues||[]).find(l=>l.type==="league"&&l.name===f.competition);
    if(!league)return;
    const homeId=String(f.homeTeamId),awayId=String(f.awayTeamId);
    if(!homeId||!awayId||homeId===managedId||awayId===managedId)return;
    const home=state.db.teams.find(t=>String(t.id)===homeId);
    const away=state.db.teams.find(t=>String(t.id)===awayId);
    if(!home||!away)return;
    const homeStrength=teamCupStrength(home),awayStrength=teamCupStrength(away);
    const homeScore=Math.max(0,Math.min(7,Math.round(Math.random()*2+(homeStrength-awayStrength)/24)));
    const awayScore=Math.max(0,Math.min(7,Math.round(Math.random()*2+(awayStrength-homeStrength)/24)));
    state.matchHistory.push({
      homeId:home.id,awayId:away.id,homeScore,awayScore,date:today,
      fixtureId:f.id,competition:f.competition,round:f.round??null,
      playerIds:[],appearances:[],scorers:[],autoSimulated:true
    });
    played.add(String(f.id));
    simulated++;
  });
  if(simulated){
    try{localStorage.setItem("fmb-match-history",JSON.stringify(state.matchHistory));}catch(_){}
  }
  return simulated;
}

function processCareerDay(){
  const todayBefore=state.day.toISOString().slice(0,10);
  const beforeOffers=new Set(state.pendingOffers.filter(o=>o.status==="pending").map(o=>o.id));
  const beforeDemands=new Set(state.playerAgentDemands.filter(d=>d.status==="pending").map(d=>d.id));
  const beforeManagers=new Set(state.managerOffers.filter(o=>o.status==="pending").map(o=>o.id));
  const transferCount=state.transferHistory.length;
  const scoutingBefore=new Set(state.scoutingReports.filter(r=>!r.completed).map(r=>r.id));
  const loansBefore=new Set(state.loanRecords.filter(r=>!r.returned).map(r=>r.id));
  state.day.setDate(state.day.getDate()+1);
  recoverPlayerConditions();processLoanReturns();processScouting();
  if(state.day.getDay()===1){
    processAITransfers();processAIPlayerOffers();updateSquadMorale();processPlayerAgentDemands();
    const club=userClub();
    if(club){const weeklyPayroll=state.db.players.filter(p=>String(p.teamId)===String(club.id)).reduce((sum,p)=>sum+Number(getPlayerContract(p).weeklyWage||0),0);club.budget=Number(club.budget||0)-weeklyPayroll;}
  }
  state.pendingOffers.filter(o=>o.status==="pending"&&!beforeOffers.has(o.id)).forEach(o=>addInboxItem("transfer","Proposta de transferência",o.fromName+" ofereceu "+money(o.fee)+" por "+o.playerName+".",true));
  state.playerAgentDemands.filter(d=>d.status==="pending"&&!beforeDemands.has(d.id)).forEach(d=>addInboxItem("contract","Pedido de renovação",d.playerName+" solicitou revisão do contrato.",true));
  state.managerOffers.filter(o=>o.status==="pending"&&!beforeManagers.has(o.id)).forEach(o=>addInboxItem("manager","Proposta para treinar outro clube",o.clubName+" deseja contratar você.",true));
  const newTransfers=state.transferHistory.slice(transferCount).filter(t=>t.aiTransfer);
  newTransfers.forEach(t=>addInboxItem("news","Movimentação no mercado",t.playerName+" foi transferido do "+t.fromName+" para "+t.toName+".",false));
  state.scoutingReports.filter(r=>r.completed&&!scoutingBefore.has(r.id)).forEach(r=>addInboxItem("scouting","Relatório de observação concluído","O relatório de "+(state.db.players.find(p=>String(p.id)===String(r.playerId))?.name||"jogador observado")+" está disponível no mercado.",false));
  state.loanRecords.filter(r=>r.returned&&!loansBefore.has(r.id)).forEach(r=>addInboxItem("loan","Retorno de empréstimo","Um jogador retornou ao clube após o fim do empréstimo.",false));
  const squad=clubPlayers().filter(p=>!playerUnavailable(p));
  if(squad.length&&Math.random()<0.012){
    const player=squad[Math.floor(Math.random()*squad.length)],days=2+Math.floor(Math.random()*13);
    getPlayerCondition(player).injuryDays=Math.max(getPlayerCondition(player).injuryDays||0,days);
    addInboxItem("injury","Lesão durante o treinamento",player.name+" sofreu uma lesão no treino e ficará afastado por "+days+" dias.",true);
  }
  if(Math.random()<0.28)addInboxItem("training","Relatório de condição física","A condição física do elenco foi atualizada após a rotina diária.",false);
  try{localStorage.setItem("fmb-current-day",state.day.toISOString().slice(0,10));}catch(_){}
  saveTransferCareer();
  return state.inbox.some(item=>item.important&&item.date===state.day.toISOString().slice(0,10))||hasPendingCareerDecision();
}
function updateCalendarHeader(){const el=$('#current-date');if(el)el.textContent=dateLabel(state.day);}
function advanceDay(){
  if(hasPendingCareerDecision()){alert('Você tem uma decisão importante pendente. Resolva-a antes de avançar o calendário.');return;}
  const interrupted=processCareerDay();updateCalendarHeader();render();
  if(interrupted)alert('A simulação foi pausada: há um acontecimento importante aguardando sua decisão. Confira a caixa de entrada.');
}
function nextUserFixture(){
  const id=String(state.db.userClubId||state.selectedClubId||'');
  return [...(state.db.calendar?.events||[]),...(state.generatedFixtures||[])].filter(f=>(String(f.homeTeamId)===id||String(f.awayTeamId)===id)&&!state.matchHistory.some(m=>String(m.fixtureId)===String(f.id))&&f.date&&f.date>state.day.toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
}
function advanceToNextMatch(){
  if(hasPendingCareerDecision()){alert('Resolva primeiro a decisão pendente na caixa de entrada.');return;}
  const fixture=nextUserFixture();if(!fixture){alert('Não há próximo jogo futuro cadastrado para seu clube. Consulte o calendário.');return;}
  let days=0,interrupted=false;const target=fixture.date;
  while(state.day.toISOString().slice(0,10)<target&&days<120){interrupted=processCareerDay();days++;if(interrupted)break;}
  updateCalendarHeader();render();
  if(interrupted)alert('Avanço interrompido por um acontecimento importante. Resolva-o na caixa de entrada para continuar.');
  else if(state.day.toISOString().slice(0,10)>=target)alert('Você chegou ao dia do próximo jogo! Prepare sua equipe na área Partidas.');
}
function markInboxItemRead(id){const item=state.inbox.find(x=>x.id===id);if(item)item.read=true;saveTransferCareer();render();}
function markInboxAllRead(){state.inbox.forEach(x=>x.read=true);saveTransferCareer();render();}
function openInboxItem(id){const item=state.inbox.find(x=>x.id===id);if(!item)return;item.read=true;saveTransferCareer();if(item.type==="transfer"||item.type==="contract")state.view="market";else if(item.type==="injury"||item.type==="training"||item.type==="scouting")state.view="squad";else state.view="dashboard";render();}
function renderInboxPanel(){
  const items=(state.inbox||[]).slice(0,5),unread=(state.inbox||[]).filter(x=>!x.read).length;
  return '<article class="card span-12"><div class="section-head"><h2>📥 Caixa de entrada</h2><span class="tag">'+unread+' não lido(s)</span></div>'+(items.length?items.map(x=>'<div class="fixture inbox-item '+(x.important?'inbox-important':'')+'"><div><strong>'+(x.read?'':'● ')+(x.important?'⚠️ ':'')+x.title+'</strong><div class="subtle">'+x.message+'</div></div><span class="tag">'+x.date+'</span></div>').join(''):'<p class="empty">Ainda não há mensagens. Notícias e relatórios aparecerão aqui durante a temporada.</p>')+'<button class="secondary-btn" onclick="state.view=\'inbox\';render()">ABRIR CAIXA DE ENTRADA</button></article>';
}
function renderInboxPage(){
  const items=state.inbox||[],unread=items.filter(x=>!x.read).length;
  const ordered=items.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  setPage("Caixa de entrada",'<div class="grid"><article class="card span-12"><div class="section-head"><div><h2>📥 Central de mensagens</h2><p class="subtle">Decisões importantes, notícias e relatórios da sua carreira.</p></div><span class="tag">'+unread+' não lido(s)</span></div><div class="inbox-filters"><span class="tag inbox-important-tag">Atenção: '+items.filter(x=>x.important).length+'</span><span class="tag">Notícias e relatórios: '+items.filter(x=>!x.important).length+'</span><button class="secondary-btn" onclick="markInboxAllRead()">MARCAR TODAS COMO LIDAS</button></div>'+(ordered.length?ordered.map(x=>'<div class="inbox-message '+(x.important?'inbox-important':'')+' '+(x.read?'is-read':'')+'"><div class="inbox-message-top"><div><strong>'+(x.important?'⚠️ ':'')+x.title+'</strong><span class="tag">'+(x.important?'DECISÃO IMPORTANTE':x.type.toUpperCase())+'</span></div><small>'+x.date+'</small></div><p>'+x.message+'</p><div class="inbox-message-actions"><button class="secondary-btn" onclick="openInboxItem(\''+x.id+'\')">'+(x.important?'ANALISAR ACONTECIMENTO':'ABRIR')+'</button>'+(x.read?'':'<button class="text-link" onclick="markInboxItemRead(\''+x.id+'\')">Marcar como lida</button>')+'</div></div>').join(''):'<p class="empty">Sua caixa de entrada está vazia. Notícias e relatórios aparecerão conforme os dias forem simulados.</p>')+'</article></div>');
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

  if (currentDate) currentDate.textContent = dateLabel(state.day);
  document.querySelectorAll(".nav-item").forEach(button => {
    const activeView = state.view === "player-profile" ? "squad" : state.view;
    button.classList.toggle("active", button.dataset.view === activeView);
  });
  const inboxCount = $("#inbox-unread-count");
  if (inboxCount) {
    const unread = (state.inbox || []).filter(item => !item.read).length;
    inboxCount.textContent = unread > 99 ? "99+" : String(unread);
    inboxCount.hidden = unread === 0;
  }

  if (!state.selectedClubId) {
    renderClubSelection();
    return;
  }

  const pages = {
    dashboard: renderDashboard,
    inbox: renderInboxPage,
    squad: renderSquad,
    market: renderMarket,
    table: renderTable,
    calendar: renderCalendar,
    match: renderMatch,
    "player-profile": renderPlayerProfile
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
      ${renderBoardCareerPanel()}
      ${renderManagerOffersPanel()}
      ${renderInboxPanel()}

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


function openPlayerProfile(id) {
  state.selectedPlayerId = id;
  state.view = "player-profile";
  render();
}
function renderPlayerProfile() {
  const p = state.db.players.find(x => String(x.id) === String(state.selectedPlayerId));
  if (!p) { state.view = "squad"; renderSquad(); return; }
  const team = state.db.teams.find(x => String(x.id) === String(p.teamId));
  const archivedGames = (state.seasonHistory || []).flatMap(season => (season.matches || []).map(match => ({...match, season: season.season})));
  const currentGames = state.matchHistory.map(match => ({...match, season: state.db.meta?.season || "Temporada atual"}));
  const games = [...archivedGames, ...currentGames].filter(m =>
    (m.appearances || m.playerIds || []).some(id => String(id) === String(p.id)) ||
    (m.scorers || []).some(goal => String(goal.playerId) === String(p.id) || String(goal.assistPlayerId) === String(p.id))
  );

  let goals = 0, assists = 0;
  games.forEach(m => (m.scorers || []).forEach(g => { if (String(g.playerId) === String(p.id)) goals++; if (String(g.assistPlayerId) === String(p.id)) assists++; }));
  const attrs = getPlayerAttributes(p);
  const seasonRows = [...new Set(games.map(match => match.season || "Temporada atual"))].map(season => {
    const seasonGames = games.filter(match => (match.season || "Temporada atual") === season);
    let seasonGoals = 0, seasonAssists = 0;
    seasonGames.forEach(match => (match.scorers || []).forEach(goal => {
      if (String(goal.playerId) === String(p.id)) seasonGoals++;
      if (String(goal.assistPlayerId) === String(p.id)) seasonAssists++;
    }));
    const appearances = seasonGames.filter(match => (match.appearances || match.playerIds || []).some(id => String(id) === String(p.id))).length;
    return "<tr><td>" + season + "</td><td>" + appearances + "</td><td>" + seasonGoals + "</td><td>" + seasonAssists + "</td></tr>";
  }).reverse().join("") || '<tr><td colspan="4">As estatísticas serão registradas ao longo da carreira.</td></tr>';
  const recent = games.slice(-8).reverse().map(m => {
    const home = state.db.teams.find(t => String(t.id) === String(m.homeId));
    const away = state.db.teams.find(t => String(t.id) === String(m.awayId));
    const isHome = String(m.homeId) === String(p.teamId);
    return "<tr><td>" + (m.date || "—") + "</td><td>" + (m.competition || "Partida") + "</td><td>" + ((isHome ? away : home)?.name || "Adversário") + "</td><td>" + (isHome ? m.homeScore + "–" + m.awayScore : m.awayScore + "–" + m.homeScore) + "</td></tr>";
  }).join("") || '<tr><td colspan="4">Nenhuma partida registrada para este jogador.</td></tr>';
  setPage("Perfil do jogador", '<div class="card"><h2>' + p.name + '</h2><p class="subtle">' + (team?.name || "Sem clube") + ' · ' + (p.positionName || p.position || "—") + ' · ' + (p.age ?? "—") + ' anos · ' + (p.nationality || "—") + '</p><div class="grid"><article class="card span-3"><div class="card-label">Jogos</div><div class="metric">' + games.length + '</div></article><article class="card span-3"><div class="card-label">Gols</div><div class="metric">' + goals + '</div></article><article class="card span-3"><div class="card-label">Assistências</div><div class="metric">' + assists + '</div></article><article class="card span-3"><div class="card-label">Overall</div><div class="metric">' + p.overall + '</div></article></div></div>' +
  '<div class="card"><h2>Atributos</h2><p>' + Object.entries(attrs).map(([k,v]) => k + ': ' + v).join(' · ') + '</p></div>' +
  '<div class="card"><h2>Estatísticas por temporada</h2><table class="table"><thead><tr><th>TEMPORADA</th><th>JOGOS</th><th>GOLS</th><th>ASSIST.</th></tr></thead><tbody>' + seasonRows + '</tbody></table></div>' +
  '<div class="card"><h2>Últimas partidas</h2><table class="table"><thead><tr><th>DATA</th><th>COMPETIÇÃO</th><th>ADVERSÁRIO</th><th>PLACAR</th></tr></thead><tbody>' + recent + '</tbody></table></div>' +
  '<button class="secondary-btn" onclick="state.view=\'squad\';render()">VOLTAR AO ELENCO</button>');
}

// LINHA DE JOGADOR

function playerRow(p) {
  return `
    <div class="player-row">
      <div>
        <strong>${p.name}</strong>
        <small>${p.positionName||p.position} · ${p.age == null ? "idade não informada" : p.age + " anos"}</small>
      </div>
      <span class="rating">${p.overall}</span>
      <span class="subtle">${money(p.marketValue)}</span>
    </div>
  `;
}

// ELENCO

function renderSquad() {
  const roster = [...clubPlayers()].sort((a,b)=>Number(b.overall||0)-Number(a.overall||0));
  const totalWage = roster.reduce((sum,p)=>sum+Number(getPlayerContract(p).weeklyWage||0),0);
  const squadContent = roster.length ? `
    <div class="card">
      <div class="section-head"><h2>Elenco principal</h2><span class="tag">${roster.length} jogadores</span></div>
      <p class="subtle">Folha salarial estimada: ${money(totalWage)} por semana. Os seis atributos são estimativas de jogo, distribuídas conforme a posição — não são estatísticas oficiais. Treinos podem melhorá-los.</p>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>JOGADOR</th><th>POS</th><th>IDADE</th><th>OVR</th><th>CONDIÇÃO</th><th>AMARELOS</th><th>VELOC.</th><th>FINAL.</th><th>PASSE</th><th>DRIBLE</th><th>DEFESA</th><th>FÍSICO</th><th>SALÁRIO/SEM.</th><th>CONTRATO ATÉ</th><th>TREINO</th><th>AÇÃO</th></tr></thead>
          <tbody>
            ${roster.map(p=>{
              const c=getPlayerContract(p);
              const a=getPlayerAttributes(p);
              const condition=getPlayerCondition(p);
              return `<tr>
                <td class="club-name">${p.name}<div class="subtle">${moraleLabel(getPlayerMorale(p))} · Moral ${getPlayerMorale(p)}/100</div></td><td>${p.positionName||p.position||"—"}</td>
                <td>${p.age==null?"—":p.age}</td><td class="positive">${p.overall||"—"}</td><td>${conditionLabel(p)} · ${condition.fitness}%</td><td>${condition.yellowCards}/5</td>
                <td>${a.pace}</td><td>${a.shooting}</td><td>${a.passing}</td><td>${a.dribbling}</td><td>${a.defending}</td><td>${a.physical}</td>
                <td>${money(c.weeklyWage)}</td><td>${new Date(c.expiresAt+"T12:00:00").toLocaleDateString("pt-BR")}</td>
                <td><button class="secondary-btn" onclick="trainPlayer('${p.id}')">TREINAR</button></td>
                <td><button class="secondary-btn" onclick="openPlayerProfile('${p.id}')">PERFIL</button><button class="secondary-btn" onclick="talkToPlayer('${p.id}')">CONVERSAR</button><button class="primary-btn" onclick="renewPlayerContract('${p.id}')">RENOVAR</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>` : `
    <div class="card"><div class="section-head"><h2>Elenco em atualização</h2><span class="tag">Dados pendentes</span></div>
    <p class="view-intro">Ainda não cadastramos jogadores confirmados para este clube. Nenhum jogador fictício será apresentado como real.</p></div>`;
  const promiseUpdates=state.playerPromises.filter(p=>String(p.clubId)===String(userClub().id)).slice(-5).reverse();
  setPage("Elenco / Contratos", `
    <p class="view-intro">Gerencie os jogadores, acompanhe os salários e renove contratos do ${userClub().name}.</p>
    ${squadContent}
    <div class="card"><div class="section-head"><h2>🤝 Promessas do treinador</h2><span class="tag">${promiseUpdates.filter(p=>p.status==="pending").length} ativa(s)</span></div>
      ${promiseUpdates.length?promiseUpdates.map(p=>`<div class="fixture"><div><strong>${p.playerName}</strong><div class="subtle">${p.label} · ${p.status==="pending"?"Aguardando 3 partidas":p.status==="fulfilled"?"Promessa cumprida":"Promessa não cumprida"}${p.status!=="pending"?" · "+(p.appearances||0)+" escalação(ões)":""}</div></div><span class="tag">${p.status==="pending"?"Ativa":p.status==="fulfilled"?"Cumprida":"Quebrada"}</span></div>`).join(""):'<p class="subtle">Ainda não há promessas registradas.</p>'}
    </div>
    ${renderPlayerRequestsPanel()}
    ${renderPlayerAgentPanel()}
    ${renderYouthAcademy()}
  `);
}

function renderPlayerRequestsPanel(){
 const requests=state.playerRequests.filter(r=>String(r.clubId)===String(userClub().id)&&["pending","listed"].includes(r.status)).slice(-8).reverse();
 return '<div class="card"><div class="section-head"><h2>🚨 Pedidos de transferência</h2><span class="tag">'+requests.filter(r=>r.status==="pending").length+' pendente(s)</span></div>'+
 '<p class="subtle">Jogadores com moral muito baixa podem pedir para sair. Você pode tentar convencê-los ou aceitar o pedido e colocá-los no mercado.</p>'+
 (requests.length?requests.map(r=>{const p=state.db.players.find(x=>String(x.id)===String(r.playerId));return '<div class="fixture"><div><strong>'+r.playerName+'</strong><div class="subtle">'+(r.status==="listed"?"Na lista de transferências":r.reason)+' · Moral '+(p?getPlayerMorale(p):"—")+'/100</div></div>'+(r.status==="pending"?'<div><button class="primary-btn" onclick="handlePlayerRequest(&quot;'+r.playerId+'&quot;,&quot;convince&quot;)">TENTAR CONVENCER</button><button class="secondary-btn" onclick="handlePlayerRequest(&quot;'+r.playerId+'&quot;,&quot;list&quot;)">ACEITAR PEDIDO</button></div>':'<span class="tag">No mercado</span>')+'</div>';}).join(""):'<p class="subtle">Nenhum jogador pediu transferência. Mantenha o elenco motivado!</p>')+'</div>';
}

function renderYouthAcademy() {
  const prospects = state.academyProspects.filter(p => String(p.teamId) === String(userClub().id));
  return `
    <div class="card">
      <div class="section-head"><h2>Academia de jovens</h2><span class="tag">${prospects.length} promessa(s)</span></div>
      <p class="subtle">Gere jovens fictícios para desenvolver no seu clube. Nomes, atributos e potencial são criados pelo jogo e não representam atletas reais.</p>
      <button class="primary-btn" onclick="generateAcademyProspects()">OBSERVAR NOVA GERAÇÃO · ${money(250000)}</button>
      ${prospects.length ? prospects.map(p=>`
        <div class="fixture">
          <div><strong>${p.name}</strong><div class="subtle">${p.positionName||p.position} · ${p.age} anos · Potencial ${p.potential}/100</div></div>
          <span class="rating">${p.overall}</span>
        </div>`).join("") : '<p class="subtle">Ainda não há jovens gerados nesta carreira.</p>'}
    </div>`;
}

function generateAcademyProspects() {
  const club=userClub();
  const cost=250000;
  if(!club)return;
  if(Number(club.budget||0)<cost){alert("Orçamento insuficiente para observar a nova geração.");return;}
  if(!confirm("Investir "+money(cost)+" na observação de três jovens? Os atletas gerados serão fictícios."))return;
  const first=["Lucas","Gabriel","Matheus","João","Pedro","Rafael","Enzo","Caio","Miguel","Davi","Arthur","Bruno"];
  const last=["Silva","Santos","Oliveira","Costa","Pereira","Almeida","Ferreira","Souza","Ribeiro","Carvalho"];
  const positions=["GK","CB","LB","RB","DM","CM","AM","LW","RW","ST"];
  const positionNames={GK:"Goleiro",CB:"Zagueiro",LB:"Lateral-esquerdo",RB:"Lateral-direito",DM:"Volante",CM:"Meio-campista",AM:"Meia-atacante",LW:"Ponta-esquerda",RW:"Ponta-direita",ST:"Atacante"};
  const generated=[];
  for(let i=0;i<3;i++){
    const position=positions[Math.floor(Math.random()*positions.length)];
    const age=16+Math.floor(Math.random()*3);
    const overall=46+Math.floor(Math.random()*15)+Math.round((Number(club.reputation||50)-50)*0.08);
    const player={id:"academy-"+club.id+"-"+Date.now()+"-"+i,name:first[Math.floor(Math.random()*first.length)]+" "+last[Math.floor(Math.random()*last.length)],position,positionName:positionNames[position],age,overall:Math.max(42,Math.min(65,overall)),potential:Math.min(92,Math.max(58,overall+12+Math.floor(Math.random()*19))),marketValue:100000+Math.floor(Math.random()*250000),teamId:club.id,nationality:"Brasil",injured:false,isAcademyGenerated:true};
    generated.push(player);
  }
  club.budget=Number(club.budget||0)-cost;
  state.academyProspects.push(...generated);
  state.db.players.push(...generated);
  if(!Array.isArray(club.players))club.players=[];
  club.players.push(...generated);
  saveTransferCareer();
  alert("Três jovens chegaram à academia! Confira o elenco para começar a treiná-los.");
  renderSquad();
}

function getPlayerContract(player) {
  if (!state.contracts[player.id]) {
    const wage = Math.max(500, Math.round((Number(player.marketValue)||50000)*0.00035/50)*50);
    const expiry = new Date(state.day);
    expiry.setFullYear(expiry.getFullYear()+2);
    state.contracts[player.id] = {weeklyWage:wage,expiresAt:expiry.toISOString().slice(0,10)};
    saveTransferCareer();
  }
  return state.contracts[player.id];
}

function trainPlayer(playerId) {
  const player = state.db.players.find(p => String(p.id) === String(playerId));
  if (!player || String(player.teamId) !== String(userClub()?.id)) return;
  const previous = state.trainingRecords[player.id];
  const today = state.day.toISOString().slice(0, 10);
  if (previous?.date) {
    const elapsed = Math.floor((new Date(today + "T12:00:00") - new Date(previous.date + "T12:00:00")) / 86400000);
    if (elapsed < 7) { alert("Este jogador já treinou recentemente. Próximo treino em " + (7 - elapsed) + " dia(s)."); return; }
  }
  const choices = ["Finalização", "Passe", "Defesa", "Físico", "Controle de bola", "Velocidade"];
  const choice = prompt("Escolha o foco: 1 Finalização, 2 Passe, 3 Defesa, 4 Físico, 5 Controle de bola, 6 Velocidade", "1");
  if (choice === null) return;
  const index = Number(choice) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= choices.length) { alert("Escolha uma opção de 1 a 5."); return; }
  const age = Number(player.age) || 25, rating = Number(player.overall) || 50;
  const chance = Math.max(0.12, Math.min(0.72, 0.68 - Math.max(0, age - 21) * 0.025 - Math.max(0, rating - 75) * 0.012));
  const improved = Math.random() < chance;
  const attributeKey = ["shooting","passing","defending","physical","dribbling","pace"][index];
  const attributes = getPlayerAttributes(player);
  const attributeImproved = improved && attributes[attributeKey] < 99;
  if (attributeImproved) {
    attributes[attributeKey] = Math.min(99, attributes[attributeKey] + 2);
    if (rating < 99) player.overall = Math.min(99, rating + 1);
    player.marketValue = Math.round((Number(player.marketValue) || 50000) * 1.08);
  }
  condition.fitness=Math.max(0,condition.fitness-8);
  state.trainingRecords[player.id] = { date: today, focus: choices[index], improved: attributeImproved };
  saveTransferCareer();
  alert(attributeImproved ? player.name + " melhorou " + choices[index] + "! Novo atributo: " + attributes[attributeKey] + "/100" + (player.overall > rating ? " · Overall " + player.overall : "") : "Treino concluído! " + player.name + " trabalhou " + choices[index] + ", mas não evoluiu desta vez.");
  renderSquad();
}

function renewPlayerContract(playerId) {
  const player=state.db.players.find(p=>String(p.id)===String(playerId));
  if(!player||String(player.teamId)!==String(userClub()?.id))return;
  const current=getPlayerContract(player);
  const wageInput=prompt("Renovação de "+player.name+"\\nSalário semanal atual: "+money(current.weeklyWage)+"\\nDigite o novo salário semanal em euros:",String(current.weeklyWage));
  if(wageInput===null)return;
  const wage=Number(wageInput.replace(/[€.\\s]/g,"").replace(/,/g,"."));
  if(!Number.isFinite(wage)||wage<=0){alert("Informe um salário válido.");return;}
  const yearsInput=prompt("Duração do novo contrato (1 a 5 anos):","3");
  if(yearsInput===null)return;
  const years=Number(yearsInput);
  if(!Number.isInteger(years)||years<1||years>5){alert("Escolha uma duração entre 1 e 5 anos.");return;}
  const expiry=new Date(state.day);expiry.setFullYear(expiry.getFullYear()+years);
  if(!confirm("Confirmar renovação de "+player.name+" por "+years+" ano(s), com salário semanal de "+money(wage)+"?"))return;
  state.contracts[player.id]={weeklyWage:wage,expiresAt:expiry.toISOString().slice(0,10)};
  saveTransferCareer();
  alert("Contrato renovado com sucesso!");
  renderSquad();
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
  const incomingOffers=state.pendingOffers.filter(o=>o.status==="pending"&&String(o.toTeamId)===String(club.id)).sort((a,b)=>b.date.localeCompare(a.date));
  const promiseUpdates=state.playerPromises.filter(p=>String(state.db.players.find(x=>String(x.id)===String(p.playerId))?.teamId)===String(club.id)).slice(-5).reverse();
  const recentTransfers = state.transferHistory.slice(-5).reverse();

  setPage("Mercado de Transferências", `
    <p class="view-intro">Mercado mundial ativo: os clubes controlados pela IA negociam entre si durante as janelas de transferências. Faça suas propostas, observe talentos e acompanhe as movimentações. Valores são estimativas internas do jogo.</p>
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
        <div class="section-head"><h2>📩 Propostas recebidas</h2><span class="tag">${incomingOffers.length} pendente(s)</span></div>
        <p class="subtle">Clubes controlados pela IA podem apresentar ofertas pelos seus jogadores durante as janelas de transferências. Você decide se aceita, recusa ou apresenta uma contraproposta.</p>
        ${incomingOffers.length ? incomingOffers.map(o=>`<div class="fixture"><div><strong>${o.playerName}</strong><div class="subtle">${o.fromName} oferece ${money(o.fee)} · expira em ${new Date(o.expires+"T12:00:00").toLocaleDateString("pt-BR")}</div></div><div><button class="primary-btn" onclick="resolveAIPlayerOffer('${o.id}','accept')">ACEITAR</button><button class="secondary-btn" onclick="resolveAIPlayerOffer('${o.id}','counter')">CONTRAOFERTA</button><button class="secondary-btn" onclick="resolveAIPlayerOffer('${o.id}','reject')">RECUSAR</button></div></div>`).join("") : '<p class="subtle">Nenhuma proposta recebida no momento. Avance os dias durante uma janela de transferências para receber ofertas.</p>'}
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
                const report = state.scoutingReports.find(r => String(r.playerId) === String(p.id));
                const scoutAction = report
                  ? (report.completed ? '<span class="tag">OBSERVADO</span>' : '<span class="tag">EM OBSERVAÇÃO</span>')
                  : `<button class="secondary-btn" onclick="scoutPlayer('${p.id}')">OBSERVAR</button>`;
                return `<tr data-market-player data-market-search="${searchData}">
                  <td class="club-name">${p.name}</td><td>${team ? team.shortName || team.name : "—"}</td>
                  <td>${p.positionName||p.position||"—"}</td><td class="positive">${p.overall || "—"}</td>
                  <td>${money(p.marketValue)}</td>
                  <td>${scoutAction}<button class="primary-btn" onclick="makeTransferOffer('${p.id}')">COMPRAR</button><button class="secondary-btn" onclick="makeLoanOffer('${p.id}')">EMPRÉSTIMO</button></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        ` : '<p class="subtle">Nenhum jogador encontrado com esse filtro.</p>'}
      </article>
      <article class="card span-12">
        <div class="section-head"><h2>Central de observação</h2><span class="tag">${state.scoutingReports.length} relatório(s)</span></div>
        <p class="subtle">Envie olheiros para acompanhar um jogador por 7 dias. Cada observação custa ${money(75000)}. O potencial apresentado é uma estimativa de jogo, não um dado oficial.</p>
        ${state.scoutingReports.length ? state.scoutingReports.slice().reverse().map(r => {
          const player = state.db.players.find(p => String(p.id) === String(r.playerId));
          const remaining = Math.max(0, Math.ceil((new Date(r.dueDate + "T12:00:00") - new Date(state.day.toISOString().slice(0,10) + "T12:00:00")) / 86400000));
          return `<div class="fixture"><div><strong>${r.playerName}</strong><div class="subtle">${r.completed ? "Relatório concluído · " + r.recommendation : "Em observação · conclusão em " + remaining + " dia(s)"}</div>${r.completed ? `<div class="subtle">Overall observado: ${r.overall} · Potencial estimado: ${r.potentialMin}–${r.potentialMax}</div>` : ""}</div><span class="tag">${r.completed ? "Concluído" : "Em andamento"}</span></div>`;
        }).join("") : '<p class="subtle">Nenhum olheiro enviado. Escolha um jogador na lista e clique em OBSERVAR.</p>'}
      </article>
      <article class="card span-12">
        <div class="section-head"><h2>Últimas movimentações</h2><span class="tag">${recentTransfers.length} recentes</span></div>
        ${recentTransfers.length ? recentTransfers.map(t => `
          <div class="fixture"><div><strong>${t.playerName} ${t.aiTransfer ? '<span class="tag">IA</span>' : ""}</strong><div class="subtle">${t.fromName} → ${t.toName}${t.aiTransfer ? " · Negociação entre clubes" : ""}</div></div><span class="fixture-time">${money(t.fee)}</span></div>
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
      history: state.transferHistory,
      pendingOffers: state.pendingOffers,
      playerMorale: state.playerMorale,
      playerPromises: state.playerPromises,
      playerRequests: state.playerRequests,
      playerAgentDemands: state.playerAgentDemands,
      boardCareer: state.boardCareer,
      managerOffers: state.managerOffers,
      contracts: state.contracts,
      loanRecords: state.loanRecords,
      trainingRecords: state.trainingRecords,
      academyProspects: state.academyProspects,
      scoutingReports: state.scoutingReports,
      playerAttributes: state.playerAttributes,
      savedLineups: state.savedLineups,
      playerConditions: state.playerConditions,
      generatedFixtures: state.generatedFixtures,
      cupCompetitions: state.cupCompetitions,
      continentalQualifiers: state.continentalQualifiers,
      seasonHistory: state.seasonHistory,
      inbox: state.inbox,
      seasonMeta: {season:state.db.meta?.season,seasonStart:state.db.calendar?.seasonStart,leagueTeams:(state.db.leagues||[]).map(l=>[l.id,[...(l.teams||[])]])}
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
    state.pendingOffers = Array.isArray(saved.pendingOffers) ? saved.pendingOffers : [];
    state.playerMorale = saved.playerMorale && typeof saved.playerMorale === "object" ? saved.playerMorale : {};
    state.playerPromises = Array.isArray(saved.playerPromises) ? saved.playerPromises : [];
    state.playerRequests = Array.isArray(saved.playerRequests) ? saved.playerRequests : [];
    state.playerAgentDemands = Array.isArray(saved.playerAgentDemands) ? saved.playerAgentDemands : [];
    state.boardCareer = saved.boardCareer && typeof saved.boardCareer === "object" ? saved.boardCareer : null;
    state.managerOffers = Array.isArray(saved.managerOffers) ? saved.managerOffers : [];
    state.contracts = saved.contracts && typeof saved.contracts === "object" ? saved.contracts : {};
    state.loanRecords = Array.isArray(saved.loanRecords) ? saved.loanRecords : [];
    state.trainingRecords = saved.trainingRecords && typeof saved.trainingRecords === "object" ? saved.trainingRecords : {};
    state.academyProspects = Array.isArray(saved.academyProspects) ? saved.academyProspects : [];
    state.scoutingReports = Array.isArray(saved.scoutingReports) ? saved.scoutingReports : [];
    state.playerAttributes = saved.playerAttributes && typeof saved.playerAttributes === "object" ? saved.playerAttributes : {};
    state.savedLineups = saved.savedLineups && typeof saved.savedLineups === "object" ? saved.savedLineups : {};
    state.playerConditions = saved.playerConditions && typeof saved.playerConditions === "object" ? saved.playerConditions : {};
    state.generatedFixtures = Array.isArray(saved.generatedFixtures) ? saved.generatedFixtures : [];
    state.cupCompetitions = Array.isArray(saved.cupCompetitions) ? saved.cupCompetitions : [];
    state.continentalQualifiers = saved.continentalQualifiers && typeof saved.continentalQualifiers === "object" ? saved.continentalQualifiers : {};
    state.seasonHistory = Array.isArray(saved.seasonHistory) ? saved.seasonHistory : [];
    state.inbox = Array.isArray(saved.inbox) ? saved.inbox : [];
    if(saved.seasonMeta){
      if(saved.seasonMeta.season)state.db.meta.season=saved.seasonMeta.season;
      if(saved.seasonMeta.seasonStart){state.db.calendar=state.db.calendar||{};state.db.calendar.seasonStart=saved.seasonMeta.seasonStart;}
      (saved.seasonMeta.leagueTeams||[]).forEach(([id,teams])=>{const l=state.db.leagues.find(x=>x.id===id);if(l)l.teams=[...teams];});
      state.db.teams.forEach(t=>{const l=state.db.leagues.find(x=>x.teams.some(id=>String(id)===String(t.id)));if(l)t.leagueId=l.id;});
    }
    state.academyProspects.forEach(p => {
      if (!state.db.players.some(existing => String(existing.id) === String(p.id))) state.db.players.push(p);
      const team = state.db.teams.find(t => String(t.id) === String(p.teamId));
      if (team && Array.isArray(team.players) && !team.players.some(existing => String(existing.id) === String(p.id))) team.players.push(p);
    });
  } catch (_) {
    state.transferHistory = [];
    state.contracts = {};
    state.loanRecords = [];
    state.trainingRecords = {};
    state.academyProspects = [];
    state.scoutingReports = [];
    state.playerAttributes = {};
    state.savedLineups = {};
    state.playerConditions = {};
    state.generatedFixtures = [];
    state.cupCompetitions = [];
  }
}

function getPlayerCondition(playerOrId) {
  const id=typeof playerOrId==="object"?playerOrId?.id:playerOrId;
  if(id==null)return {fitness:100,injuryDays:0,yellowCards:0,suspendedMatches:0};
  if(!state.playerConditions[id])state.playerConditions[id]={fitness:100,injuryDays:0,yellowCards:0,suspendedMatches:0};
  const c=state.playerConditions[id];c.fitness=Math.max(0,Math.min(100,Number(c.fitness??100)));c.injuryDays=Math.max(0,Number(c.injuryDays)||0);c.yellowCards=Math.max(0,Number(c.yellowCards)||0);c.suspendedMatches=Math.max(0,Number(c.suspendedMatches)||0);
  return c;
}
function playerUnavailable(player) { const c=getPlayerCondition(player);return c.injuryDays>0||c.suspendedMatches>0; }
function conditionLabel(player) { const c=getPlayerCondition(player);if(c.injuryDays>0)return "Lesionado · "+c.injuryDays+" dia(s)";if(c.suspendedMatches>0)return "Suspenso · "+c.suspendedMatches+" jogo(s)";if(c.fitness<45)return "Muito cansado";if(c.fitness<70)return "Cansado";return "Disponível"; }
function recoverPlayerConditions() {
  state.db.players.forEach(p=>{const c=getPlayerCondition(p);if(c.injuryDays>0)c.injuryDays--;else c.fitness=Math.min(100,c.fitness+4);});
  saveTransferCareer();
}
function applyMatchConditionEffects(m) {
  if(m.minute%5===0){
    const managed=String(state.db.userClubId||state.selectedClubId),homeManaged=String(m.homeId)===managed;
    const ids=[{teamId:m.homeId,lineup:homeManaged?m.lineup:m.aiLineup,tactics:homeManaged?m.instructions:m.aiTactics},{teamId:m.awayId,lineup:homeManaged?m.aiLineup:m.lineup,tactics:homeManaged?m.aiTactics:m.instructions}];
    ids.forEach(side=>(side.lineup||[]).forEach(id=>{const c=getPlayerCondition(id),t=side.tactics||{};c.fitness=Math.max(5,c.fitness-(t.tempo==="fast"?3:2)-(t.pressing==="high"?1:0));}));
  }
  const managed=String(state.db.userClubId||state.selectedClubId),sides=[{teamId:m.homeId,ids:String(m.homeId)===managed?m.lineup:m.aiLineup},{teamId:m.awayId,ids:String(m.awayId)===managed?m.lineup:m.aiLineup}];
  sides.forEach(side=>{const ids=side.ids||[];if(!ids.length)return;
    if(Math.random()<0.00045){const id=ids[Math.floor(Math.random()*ids.length)],p=state.db.players.find(x=>String(x.id)===String(id));if(p){const days=3+Math.floor(Math.random()*19);getPlayerCondition(p).injuryDays=days;const isHome=String(side.teamId)===String(m.homeId),lineup=isHome?m.lineup:m.aiLineup;if(Array.isArray(lineup)){const index=lineup.findIndex(x=>String(x)===String(p.id));if(index>=0)lineup.splice(index,1);}m.events.unshift({minute:m.minute,text:"🚑 "+p.name+" sente uma lesão e ficará fora por "+days+" dias. Precisa ser substituído!"});}}
    if(Math.random()<0.008){const id=ids[Math.floor(Math.random()*ids.length)],p=state.db.players.find(x=>String(x.id)===String(id));if(p){const condition=getPlayerCondition(p);condition.yellowCards++;m.events.unshift({minute:m.minute,text:"🟨 Cartão amarelo para "+p.name+"."});if(condition.yellowCards>=5){condition.yellowCards=0;condition.suspendedMatches=Math.max(condition.suspendedMatches,1);m.events.unshift({minute:m.minute,text:"⛔ "+p.name+" atingiu cinco amarelos e está suspenso por uma partida."});}}}
    if(Math.random()<0.00025){const id=ids[Math.floor(Math.random()*ids.length)],p=state.db.players.find(x=>String(x.id)===String(id));if(p){getPlayerCondition(p).suspendedMatches=Math.max(getPlayerCondition(p).suspendedMatches,2);m.sentOffIds=m.sentOffIds||[];m.sentOffIds.push(String(p.id));const isHome=String(side.teamId)===String(m.homeId),lineup=isHome?m.lineup:m.aiLineup;if(Array.isArray(lineup)){const index=lineup.findIndex(x=>String(x)===String(p.id));if(index>=0)lineup.splice(index,1);}m.events.unshift({minute:m.minute,text:"🟥 Cartão vermelho! "+p.name+" expulso e suspenso por dois jogos."});}}
  });
}
function finishMatchSuspensions(m) {
  const teams=[m.homeId,m.awayId];
  teams.forEach(teamId=>state.db.players.filter(p=>String(p.teamId)===String(teamId)).forEach(p=>{const c=getPlayerCondition(p);if(c.suspendedMatches>0&&m.suspensionsAtKickoff?.includes(String(p.id)))c.suspendedMatches=Math.max(0,c.suspendedMatches-1);}));
}
function getPlayerAttributes(player) {
  if (!player) return {pace:50,shooting:50,passing:50,dribbling:50,defending:50,physical:50};
  if (state.playerAttributes[player.id]) {
    const cached=state.playerAttributes[player.id];
    if (!Number.isFinite(Number(cached.goalkeeping))) cached.goalkeeping=Math.max(25,Math.min(99,Math.round((Number(player.overall)||50)+(String(player.position||"").toUpperCase()==="GK"?22:-18))));
    return cached;
  }
  const overall = Math.max(25, Math.min(90, Number(player.overall) || 50));
  const position = String(player.position || "").toUpperCase();
  const boosts = {
    pace: ["LW","RW","LB","RB","FW"].includes(position) ? 13 : ["CB","DM","DF"].includes(position) ? -3 : 3,
    shooting: ["ST","CF","LW","RW","AM","FW"].includes(position) ? 13 : ["GK","CB","LB","RB","DF"].includes(position) ? -10 : 0,
    passing: ["CM","AM","DM","MF"].includes(position) ? 11 : position === "GK" ? -8 : 0,
    dribbling: ["LW","RW","AM","FW"].includes(position) ? 12 : ["CB","GK","DF"].includes(position) ? -8 : 0,
    defending: ["CB","LB","RB","DM","DF"].includes(position) ? 14 : ["ST","LW","RW","FW"].includes(position) ? -12 : 0,
    physical: ["CB","ST","DM","DF","FW"].includes(position) ? 9 : 2,
    goalkeeping: position === "GK" ? 22 : -18
  };
  const seed = String(player.id).split("").reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
  const keys = ["pace","shooting","passing","dribbling","defending","physical","goalkeeping"];
  const attrs = {};
  keys.forEach((key,index) => {
    const variation = ((seed + index * 7) % 13) - 6;
    attrs[key] = Math.max(25, Math.min(99, Math.round(overall + boosts[key] + variation)));
  });
  state.playerAttributes[player.id] = attrs;
  return attrs;
}

function scoutPlayer(playerId) {
  const club = userClub();
  const player = state.db.players.find(p => String(p.id) === String(playerId));
  const cost = 75000;
  if (!club || !player || String(player.teamId) === String(club.id)) {
    alert("Este jogador não está disponível para observação.");
    return;
  }
  if (state.scoutingReports.some(r => String(r.playerId) === String(player.id))) {
    alert("Este jogador já possui uma observação iniciada ou concluída.");
    return;
  }
  if (Number(club.budget || 0) < cost) {
    alert("Orçamento insuficiente para contratar o serviço de observação.");
    return;
  }
  if (!confirm("Enviar um olheiro para observar " + player.name + " por 7 dias?\nCusto: " + money(cost))) return;
  club.budget = Number(club.budget || 0) - cost;
  const due = new Date(state.day);
  due.setDate(due.getDate() + 7);
  state.scoutingReports.push({
    playerId: player.id,
    playerName: player.name,
    startDate: state.day.toISOString().slice(0,10),
    dueDate: due.toISOString().slice(0,10),
    completed: false
  });
  saveTransferCareer();
  alert("Olheiro enviado! O relatório ficará pronto em 7 dias.");
  renderMarket();
}

function processScouting() {
  const today = state.day.toISOString().slice(0,10);
  let changed = false;
  state.scoutingReports.forEach(report => {
    if (report.completed || report.dueDate > today) return;
    const player = state.db.players.find(p => String(p.id) === String(report.playerId));
    if (!player) {
      report.completed = true;
      report.recommendation = "Jogador não encontrado no banco de dados";
      changed = true;
      return;
    }
    const overall = Math.max(1, Math.min(99, Number(player.overall) || 50));
    const age = Number(player.age) || 25;
    const growth = age <= 20 ? 18 : age <= 23 ? 13 : age <= 27 ? 8 : age <= 30 ? 4 : 1;
    const potential = Math.min(99, overall + growth + Math.floor(Math.random() * 9));
    report.completed = true;
    report.overall = overall;
    report.potentialMin = Math.max(overall, potential - 4);
    report.potentialMax = Math.min(99, potential + 4);
    report.recommendation = report.potentialMax - overall >= 20
      ? "Grande potencial de evolução"
      : report.potentialMax - overall >= 10
        ? "Boa oportunidade de desenvolvimento"
        : "Contratação para rendimento imediato";
    report.completedDate = today;
    changed = true;
  });
  if (changed) saveTransferCareer();
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


function makeLoanOffer(playerId) {
  const buyer = userClub();
  const player = state.db.players.find(p => String(p.id) === String(playerId));
  if (!buyer || !player || String(player.teamId) === String(buyer.id)) { alert('Jogador indisponível para empréstimo.'); return; }
  if (state.loanRecords.some(r => String(r.playerId) === String(player.id) && !r.returned)) { alert('Este jogador já está emprestado.'); return; }
  const seller = state.db.teams.find(t => String(t.id) === String(player.teamId));
  if (!seller) return;
  const monthsInput = prompt('Duração do empréstimo (1 a 24 meses):', '6');
  if (monthsInput === null) return;
  const months = Number(monthsInput);
  if (!Number.isInteger(months) || months < 1 || months > 24) { alert('Escolha entre 1 e 24 meses.'); return; }
  const fee = Math.max(0, Math.round((Number(player.marketValue) || 0) * 0.015 * months));
  if (fee > Number(buyer.budget || 0)) { alert('Orçamento insuficiente para a taxa estimada de ' + money(fee) + '.'); return; }
  if (!confirm('Solicitar empréstimo de ' + player.name + ' por ' + months + ' meses?\nTaxa estimada: ' + money(fee) + '. O jogador retornará automaticamente ao clube de origem.')) return;
  const originalTeamId = player.teamId;
  buyer.budget = Number(buyer.budget || 0) - fee;
  seller.budget = Number(seller.budget || 0) + fee;
  player.teamId = buyer.id;
  state.db.teams.forEach(team => { if (!Array.isArray(team.players)) return; team.players = team.players.filter(p => String(p.id) !== String(player.id)); if (String(team.id) === String(buyer.id)) team.players.push(player); });
  const end = new Date(state.day); end.setMonth(end.getMonth() + months);
  state.loanRecords.push({playerId:player.id,playerName:player.name,fromTeamId:originalTeamId,fromName:seller.name,toTeamId:buyer.id,toName:buyer.name,startDate:state.day.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),fee:fee});
  saveTransferCareer(); alert('Empréstimo concluído! Retorno previsto para ' + end.toLocaleDateString('pt-BR') + '.'); renderMarket();
}

function processLoanReturns() {
  const today = state.day.toISOString().slice(0,10); let changed = false;
  state.loanRecords.forEach(record => {
    if (record.returned || record.endDate > today) return;
    const player = state.db.players.find(p => String(p.id) === String(record.playerId));
    const original = state.db.teams.find(t => String(t.id) === String(record.fromTeamId));
    if (!player || !original) return;
    player.teamId = original.id;
    state.db.teams.forEach(team => { if (!Array.isArray(team.players)) return; team.players = team.players.filter(p => String(p.id) !== String(player.id)); if (String(team.id) === String(original.id)) team.players.push(player); });
    record.returned = true; record.returnedDate = today; changed = true;
  });
  if (changed) saveTransferCareer();
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
  const playerStats=new Map();
  relevantMatches.forEach(match=>{
    (match.appearances||match.playerIds||[]).forEach(id=>{
      const player=state.db.players.find(p=>String(p.id)===String(id));if(!player)return;
      const stat=playerStats.get(String(id))||{player,appearances:0,goals:0,assists:0};stat.appearances++;playerStats.set(String(id),stat);
    });
    (match.scorers||[]).forEach(goal=>{
      if(!goal.playerId)return;const player=state.db.players.find(p=>String(p.id)===String(goal.playerId));if(!player)return;
      const stat=playerStats.get(String(goal.playerId))||{player,appearances:0,goals:0,assists:0};stat.goals++;playerStats.set(String(goal.playerId),stat);
      if(goal.assistPlayerId){const assister=state.db.players.find(p=>String(p.id)===String(goal.assistPlayerId));if(assister){const assistStat=playerStats.get(String(assister.id))||{player:assister,appearances:0,goals:0,assists:0};assistStat.assists++;playerStats.set(String(assister.id),assistStat);}}
    });
  });
  const leaders=[...playerStats.values()].sort((a,b)=>b.goals-a.goals||b.assists-a.assists||b.appearances-a.appearances||a.player.name.localeCompare(b.player.name,"pt-BR")).slice(0,10);
  const assistLeaders=[...playerStats.values()].filter(x=>x.assists>0).sort((a,b)=>b.assists-a.assists||b.goals-a.goals).slice(0,5);

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
    <div class="grid">
      <article class="card span-6">
        <div class="section-head"><h2>⚽ Artilharia</h2><span class="tag">Top 10 · ${selectedLeague?.name||"Liga"}</span></div>
        ${leaders.length?leaders.map((s,i)=>'<div class="player-row"><div><strong>'+(i+1)+'. '+s.player.name+'</strong><small>'+((state.db.teams.find(t=>String(t.id)===String(s.player.teamId))||{}).name||"Clube")+' · '+s.appearances+' jogos</small></div><span class="rating">'+s.goals+' gols</span></div>').join(""):'<p class="subtle">A artilharia será preenchida conforme as partidas forem disputadas com escalações registradas.</p>'}
      </article>
      <article class="card span-6">
        <div class="section-head"><h2>🎯 Assistências</h2><span class="tag">Top 5</span></div>
        ${assistLeaders.length?assistLeaders.map((s,i)=>'<div class="player-row"><div><strong>'+(i+1)+'. '+s.player.name+'</strong><small>'+((state.db.teams.find(t=>String(t.id)===String(s.player.teamId))||{}).name||"Clube")+'</small></div><span class="rating">'+s.assists+' assist.</span></div>').join(""):'<p class="subtle">As assistências aparecerão quando houver gols com passe decisivo identificado.</p>'}
      </article>
    </div>
  `);
}


// TEMPORADAS: premiações, acesso e rebaixamento
function seasonStandings(league) {
  const ids=new Set((league.teams||[]).map(String));
  const rows=(league.teams||[]).map(id=>({id:String(id),pts:0,gf:0,ga:0}));
  state.matchHistory.filter(m=>ids.has(String(m.homeId))&&ids.has(String(m.awayId))&&m.competition===league.name).forEach(m=>{
    const h=rows.find(r=>r.id===String(m.homeId)),a=rows.find(r=>r.id===String(m.awayId));if(!h||!a)return;
    h.gf+=Number(m.homeScore);h.ga+=Number(m.awayScore);a.gf+=Number(m.awayScore);a.ga+=Number(m.homeScore);
    if(m.homeScore>m.awayScore)h.pts+=3;else if(m.homeScore<m.awayScore)a.pts+=3;else{h.pts++;a.pts++;}
  });
  return rows.sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf);
}
function buildEuropeanQualifiers() {
  const rules=[
    {id:"premier-league",champions:4,europa:2,conference:1},
    {id:"la-liga",champions:4,europa:2,conference:1},
    {id:"ligue-1",champions:3,europa:2,conference:1},
    {id:"eredivisie",champions:2,europa:1,conference:1},
    {id:"primeira-liga",champions:2,europa:1,conference:1},
    {id:"super-lig",champions:2,europa:1,conference:1},
    {id:"belgian-pro-league",champions:1,europa:1,conference:1},
    {id:"scottish-premiership",champions:1,europa:1,conference:1},
    {id:"swiss-super-league",champions:1,europa:1,conference:1},
    {id:"hnl-croatia",champions:1,europa:1,conference:1}
  ];
  const result={champions:[],europa:[],conference:[]};
  rules.forEach(rule=>{
    const league=state.db.leagues.find(item=>item.id===rule.id);
    if(!league)return;
    const table=seasonStandings(league).map(row=>row.id);
    result.champions.push(...table.slice(0,rule.champions));
    result.europa.push(...table.slice(rule.champions,rule.champions+rule.europa));
    result.conference.push(...table.slice(rule.champions+rule.europa,rule.champions+rule.europa+rule.conference));
  });
  const unique=list=>[...new Set(list)].filter(id=>state.db.teams.some(team=>String(team.id)===String(id)));
  result.champions=unique(result.champions);
  result.europa=unique(result.europa).filter(id=>!result.champions.includes(id));
  result.conference=unique(result.conference).filter(id=>!result.champions.includes(id)&&!result.europa.includes(id));
  return result;
}
function finishSeason() {
  if(!confirm("Encerrar a temporada? Os jogos de liga restantes serão simulados, as premiações pagas e uma nova temporada começará."))return;
  state.generatedFixtures.filter(f=>!f.isCup&&f.competitionId).forEach(f=>{
    if(state.matchHistory.some(m=>m.fixtureId===f.id))return;
    const home=state.db.teams.find(t=>String(t.id)===String(f.homeTeamId)),away=state.db.teams.find(t=>String(t.id)===String(f.awayTeamId));
    const hp=teamCupStrength(home),ap=teamCupStrength(away);
    const h=Math.max(0,Math.round(Math.random()*2+(hp-ap)/24)),a=Math.max(0,Math.round(Math.random()*2+(ap-hp)/24));
    state.matchHistory.push({homeId:f.homeTeamId,awayId:f.awayTeamId,homeScore:h,awayScore:a,date:f.date,fixtureId:f.id,competition:f.competition,round:f.round,autoSimulated:true});
  });
  const season=state.db.meta?.season||"2026/27",prizes=[];
  (state.db.leagues||[]).filter(l=>l.type==="league").forEach(league=>{
    seasonStandings(league).forEach((row,index)=>{
      const club=state.db.teams.find(t=>String(t.id)===row.id);if(!club)return;
      const award=Math.round(1800000*(league.teams.length-index)/league.teams.length);
      club.budget=Number(club.budget||0)+award;if(index===0)club.reputation=Math.min(99,Number(club.reputation||50)+2);
      prizes.push({clubId:club.id,clubName:club.name,competition:league.name,position:index+1,award});
    });
  });
  (state.cupCompetitions||[]).forEach(cup=>{if(!cup.champion)return;const club=state.db.teams.find(t=>String(t.id)===String(cup.champion));if(club){const award=cup.id==="champions-league"?20000000:cup.id==="libertadores"?12000000:cup.id==="sudamericana"?8000000:5000000;club.budget=Number(club.budget||0)+award;club.reputation=Math.min(99,Number(club.reputation||50)+2);prizes.push({clubId:club.id,clubName:club.name,competition:cup.name,position:1,award,trophy:true});}});
  const board=state.boardCareer,managedClub=userClub();
  if(board&&managedClub&&String(board.clubId)===String(managedClub.id)&&!board.fired){
    const league=(state.db.leagues||[]).find(l=>l.id===board.leagueId),table=league?seasonStandings(league):[],rank=table.findIndex(r=>String(r.id)===String(managedClub.id))+1;
    if(rank>0){
      if(rank<=board.targetPosition){board.confidence=Math.min(100,board.confidence+18);board.fanSupport=Math.min(100,board.fanSupport+12);board.review="Objetivo cumprido! A diretoria aprovou sua temporada, terminando em "+rank+"º lugar.";} 
      else{board.confidence=Math.max(0,board.confidence-22);board.fanSupport=Math.max(0,board.fanSupport-12);board.review="Objetivo não alcançado: "+rank+"º lugar, com meta de terminar entre os "+board.targetPosition+" primeiros.";} 
      if(board.confidence===0){board.fired=true;board.review+=" A diretoria decidiu encerrar seu trabalho.";}
      if(!board.fired&&rank<=board.targetPosition&&board.confidence>=75)generateManagerOffers(managedClub); 
    }
  }
  const brazilLeague=state.db.leagues.find(l=>l.id==="brasileirao");
  const englandLeague=state.db.leagues.find(l=>l.id==="premier-league");
  const spainLeague=state.db.leagues.find(l=>l.id==="la-liga");
  const brazilTable=brazilLeague?seasonStandings(brazilLeague):[];
  const englandTable=englandLeague?seasonStandings(englandLeague):[];
  const spainTable=spainLeague?seasonStandings(spainLeague):[];
  const european=buildEuropeanQualifiers();
  state.continentalQualifiers={libertadores:brazilTable.slice(0,8).map(r=>r.id),sudamericana:brazilTable.slice(8,16).map(r=>r.id),...european};
  let promoted=[],relegated=[];
  const top=brazilLeague,second=state.db.leagues.find(l=>l.id==="brasileirao-serie-b");
  if(top&&second){promoted=seasonStandings(second).slice(0,4).map(r=>r.id);relegated=seasonStandings(top).slice(-4).map(r=>r.id);
    top.teams=[...top.teams.filter(id=>!relegated.includes(String(id))),...promoted];
    second.teams=[...second.teams.filter(id=>!promoted.includes(String(id))),...relegated];
    state.db.teams.forEach(t=>{if(top.teams.some(id=>String(id)===String(t.id)))t.leagueId=top.id;else if(second.teams.some(id=>String(id)===String(t.id)))t.leagueId=second.id;});
  }
  if(board&&managedClub&&!board.fired){
    const nextLeague=(state.db.leagues||[]).find(l=>l.id===managedClub.leagueId&&l.type==="league");
    if(nextLeague){
      board.leagueId=nextLeague.id;board.leagueName=nextLeague.name;
      const teams=(nextLeague.teams||[]).map(id=>state.db.teams.find(t=>String(t.id)===String(id))).filter(Boolean);
      const ranked=[...teams].sort((a,b)=>Number(b.reputation||0)-Number(a.reputation||0));
      const rank=Math.max(1,ranked.findIndex(t=>String(t.id)===String(managedClub.id))+1),count=Math.max(1,teams.length);
      board.targetPosition=rank<=2?Math.min(3,count):rank<=Math.ceil(count*.35)?Math.max(3,Math.ceil(count*.3)):Math.max(1,Math.ceil(count*.65));
    }
  }
  state.seasonHistory.unshift({season,prizes,promoted,relegated,continentalQualifiers:JSON.parse(JSON.stringify(state.continentalQualifiers)),matches:JSON.parse(JSON.stringify(state.matchHistory))});
  const match=String(season).match(/(\d{4})\/(\d{2,4})/),year=match?Number(match[1])+1:state.day.getFullYear()+1;
  const nextSeason=year+"/"+String((year+1)%100).padStart(2,"0");
  state.db.meta.season=nextSeason;state.db.calendar=state.db.calendar||{};state.db.calendar.seasonStart=year+"-07-01";
  state.day=new Date(state.db.calendar.seasonStart+"T12:00:00");state.generatedFixtures=[];state.cupCompetitions=[];state.matchHistory=[];
  try{localStorage.setItem("fmb-match-history","[]");localStorage.setItem("fmb-current-day",state.db.calendar.seasonStart);}catch(_){}
  ensureGeneratedFixtures();ensureCupCompetitions();saveTransferCareer();
  alert("Temporada "+season+" encerrada! Premiações, acessos e rebaixamentos aplicados. Começou "+nextSeason+".");
  state.view="dashboard";render();
}
function renderContinentalQualificationPanel() {
  const q=state.continentalQualifiers||{};
  const label=ids=>(ids||[]).map(id=>state.db.teams.find(t=>String(t.id)===String(id))?.name||id).join(", ");
  if(!q.libertadores?.length&&!q.sudamericana?.length&&!q.champions?.length&&!q.europa?.length&&!q.conference?.length)return "";
  const row=(name,ids)=>`<div class="fixture"><div><strong>${name}</strong><div class="subtle">${label(ids)}</div></div><span class="tag">${ids?.length||0} vagas</span></div>`;
  return `<article class="card span-12"><div class="section-head"><h2>🌎 Classificação continental</h2><span class="tag">Vagas conquistadas</span></div><p class="subtle">As vagas europeias são distribuídas pelas posições finais das ligas cadastradas. As vagas brasileiras seguem a tabela do Brasileirão.</p>${row("🏆 CONMEBOL Libertadores",q.libertadores)}${row("🏆 CONMEBOL Sudamericana",q.sudamericana)}${row("🏆 UEFA Champions League",q.champions)}${row("🏆 UEFA Europa League",q.europa)}${row("🏆 UEFA Conference League",q.conference)}</article>`;
}
function renderSeasonPanel() {
  const last=state.seasonHistory[0];
  return `<article class="card span-12"><div class="section-head"><h2>🏆 Encerramento da temporada</h2><span class="tag">${state.db.meta?.season||"Temporada atual"}</span></div><p class="subtle">Simule os jogos restantes, distribua premiações por posição, reconheça campeões de copas e aplique acesso/rebaixamento entre as Séries A e B do Brasil.</p><button class="primary-btn" onclick="finishSeason()">ENCERRAR TEMPORADA E COMEÇAR OUTRA</button>${last?`<p class="subtle">Última temporada: ${last.season} · ${last.prizes.length} premiações · ${last.promoted.length} promovidos · ${last.relegated.length} rebaixados.</p>`:""}</article>`;
}

// GERAÇÃO DE CALENDÁRIOS DE LIGA (tabela fictícia de carreira, não calendário oficial)
function ensureGeneratedFixtures() {
  if (!state.db) return;
  const existingFixtureIds = new Set((state.generatedFixtures || []).map(f => String(f.id)));
  const seasonStart = state.db.calendar?.seasonStart || "2026-07-01";
  const baseDate = new Date(seasonStart + "T12:00:00");
  let added = false;

  // Recalcula a lista esperada por liga e completa apenas os jogos ausentes.
  // Assim, um save antigo ou parcialmente gerado não deixa uma temporada incompleta.
  (state.db.leagues || [])
    .filter(league => league.type === "league" && Array.isArray(league.teams) && league.teams.length >= 2)
    .forEach(league => {
      const ids = [...new Set(league.teams.map(String))];
      if (ids.length < 2) return;
      const rotationIds = ids.length % 2 ? [...ids, null] : [...ids];
      const roundsPerLeg = rotationIds.length - 1;
      const half = rotationIds.length / 2;
      let rotation = [...rotationIds];

      for (let round = 0; round < roundsPerLeg * 2; round++) {
        for (let match = 0; match < half; match++) {
          const first = rotation[match];
          const second = rotation[rotation.length - 1 - match];
          if (!first || !second) continue;

          const home = round < roundsPerLeg ? first : second;
          const away = round < roundsPerLeg ? second : first;
          const fixtureId = "career-" + league.id + "-" + (round + 1) + "-" + (match + 1);
          if (existingFixtureIds.has(fixtureId)) continue;

          const date = new Date(baseDate);
          date.setDate(date.getDate() + round * 7);
          state.generatedFixtures.push({
            id: fixtureId,
            competition: league.name,
            competitionId: league.id,
            round: round + 1,
            date: date.toISOString().slice(0, 10),
            homeTeamId: home,
            awayTeamId: away,
            generated: true
          });
          existingFixtureIds.add(fixtureId);
          added = true;
        }

        const fixed = rotation[0];
        const rest = rotation.slice(1);
        rest.unshift(rest.pop());
        rotation = [fixed, ...rest];
      }
    });

  if (added) saveTransferCareer();
}

// COPAS NACIONAIS — mata-mata com jogos do usuário e simulação dos demais confrontos
function getSouthAmericanCupPools() {
  const baseClubs = ["boca-juniors","river-plate","penarol","nacional-uru","independiente-del-valle"];
  const domesticIds = ["argentina","uruguay","ecuador","paraguay","chile","colombia"];
  const champions = [], secondary = [];
  domesticIds.forEach(id => {
    const league = state.db.leagues.find(item => item.id === id);
    if (!league) return;
    const ranked = (league.teams || []).map(teamId => state.db.teams.find(team => String(team.id) === String(teamId))).filter(Boolean).sort((a,b) => Number(b.reputation||0)-Number(a.reputation||0));
    champions.push(...ranked.slice(0,2).map(team => team.id));
    secondary.push(...ranked.slice(2,4).map(team => team.id));
  });
  return {
    libertadores: [...(state.db.leagues.find(l=>l.id==="brasileirao")?.teams||[]), ...baseClubs, ...champions],
    sudamericana: [...(state.db.leagues.find(l=>l.id==="brasileirao-serie-b")?.teams||[]), ...baseClubs, ...secondary]
  };
}
function buildUEFAPots(teamIds) {
  const ranked=[...teamIds].map(id=>state.db.teams.find(team=>String(team.id)===String(id))).filter(Boolean)
    .sort((a,b)=>teamCupStrength(b)-teamCupStrength(a)||Number(b.reputation||0)-Number(a.reputation||0)||String(a.name).localeCompare(String(b.name)));
  return Array.from({length:4},(_,index)=>ranked.slice(index*9,(index+1)*9).map(team=>team.id));
}
function getEuropeanChampionsPool() {
  const ids=["premier-league","la-liga","ligue-1","eredivisie","primeira-liga","belgian-pro-league","scottish-premiership","swiss-super-league","super-lig","hnl-croatia"];
  const clubs=ids.flatMap(id=>state.db.leagues.find(league=>league.id===id)?.teams||[])
    .filter((id,index,list)=>list.indexOf(id)===index)
    .map(id=>state.db.teams.find(team=>String(team.id)===String(id)))
    .filter(Boolean)
    .sort((a,b)=>Number(b.reputation||0)-Number(a.reputation||0)||String(a.name).localeCompare(String(b.name)));
  return clubs.slice(0,36).map(team=>team.id);
}
function getEuropeanSecondaryPools() {
  const champions=new Set(getEuropeanChampionsPool().map(String));
  const ids=["premier-league","la-liga","ligue-1","eredivisie","primeira-liga","belgian-pro-league","scottish-premiership","swiss-super-league","super-lig","hnl-croatia"];
  const candidates=ids.flatMap(id=>state.db.leagues.find(league=>league.id===id)?.teams||[])
    .filter((id,index,list)=>list.indexOf(id)===index&&!champions.has(String(id)))
    .map(id=>state.db.teams.find(team=>String(team.id)===String(id)))
    .filter(Boolean)
    .sort((a,b)=>Number(b.reputation||0)-Number(a.reputation||0)||String(a.name).localeCompare(String(b.name)));
  const europa=candidates.slice(0,16).map(team=>team.id);
  const europaSet=new Set(europa.map(String));
  const conference=candidates.filter(team=>!europaSet.has(String(team.id))).slice(0,16).map(team=>team.id);
  return {europa,conference};
}
function ensureCupCompetitions() {
  if (state.cupCompetitions.length) {
    const secondary=getEuropeanSecondaryPools();
    const missing=[
      {id:"europa-league",name:"UEFA Europa League",leagueId:"premier-league",teams:secondary.europa,format:"uefa-league"},
      {id:"conference-league",name:"UEFA Conference League",leagueId:"premier-league",teams:secondary.conference,format:"uefa-league"}
    ];
    const domesticCups=[
      {id:"coupe-de-france",name:"Coupe de France",leagueId:"ligue-1"},
      {id:"knvb-beker",name:"KNVB Beker",leagueId:"eredivisie"},
      {id:"taca-de-portugal",name:"Taça de Portugal",leagueId:"primeira-liga"},
      {id:"belgian-cup",name:"Belgian Cup",leagueId:"belgian-pro-league"},
      {id:"scottish-cup",name:"Scottish Cup",leagueId:"scottish-premiership"},
      {id:"swiss-cup",name:"Swiss Cup",leagueId:"swiss-super-league"},
      {id:"turkish-cup",name:"Turkish Cup",leagueId:"super-lig"},
      {id:"croatian-cup",name:"Croatian Cup",leagueId:"hnl-croatia"}
    ];
    missing.forEach(def=>{
      if(!state.cupCompetitions.some(cup=>cup.id===def.id)&&def.teams.length>=2){
        state.cupCompetitions.push({id:def.id,name:def.name,leagueId:def.leagueId,participants:[...def.teams],activeTeams:[...def.teams],round:0,finished:false,champion:null,byes:[],format:def.format||null,phase:def.format==="uefa-league"?"league":null,pots:def.format==="uefa-league"?buildUEFAPots(def.teams):null});
      }
    });
    domesticCups.forEach(def=>{
      const league=state.db.leagues.find(item=>item.id===def.leagueId);
      const teams=(league?.teams||[]).filter(id=>state.db.teams.some(team=>String(team.id)===String(id)));
      if(!state.cupCompetitions.some(cup=>cup.id===def.id)&&teams.length>=2){
        const seed=def.id.split("").reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
        const participants=[...teams].sort((a,b)=>cupSeed(a,seed)-cupSeed(b,seed));
        state.cupCompetitions.push({id:def.id,name:def.name,leagueId:def.leagueId,participants,activeTeams:[...participants],round:0,finished:false,champion:null,byes:[],format:def.format||null,phase:def.format==="uefa-league"?"league":null,pots:def.format==="uefa-league"?buildUEFAPots(participants):null});
      }
    });
    const pools=[
      {id:"champions-league",teams:getEuropeanChampionsPool(),format:"uefa-league"},
      {id:"europa-league",teams:secondary.europa,format:"uefa-league"},
      {id:"conference-league",teams:secondary.conference,format:"uefa-league"},
      {id:"libertadores",teams:getSouthAmericanCupPools().libertadores},
      {id:"sudamericana",teams:getSouthAmericanCupPools().sudamericana}
    ];
    pools.forEach(pool=>{
      const cup=state.cupCompetitions.find(item=>item.id===pool.id);
      const fixtures=state.generatedFixtures.filter(item=>item.cupId===pool.id);
      const hasPlayed=fixtures.some(item=>state.matchHistory.some(match=>match.fixtureId===item.id));
      const validTeams=pool.teams.filter(id=>state.db.teams.some(team=>String(team.id)===String(id)));
      if(cup&&validTeams.length>=2&&!hasPlayed&&Number(cup.round||0)===0){
        cup.participants=[...validTeams];cup.activeTeams=[...validTeams];cup.format=pool.format||null;cup.phase=pool.format==="uefa-league"?"league":null;cup.pots=pool.format==="uefa-league"?buildUEFAPots(validTeams):null;
        state.generatedFixtures=state.generatedFixtures.filter(item=>item.cupId!==pool.id);
      }
    });
    advanceCupTournaments();
    saveTransferCareer();
    return;
  }
  const definitions = [
    {id:"copa-do-brasil",name:"Copa do Brasil",leagueId:"brasileirao"},
    {id:"fa-cup",name:"FA Cup",leagueId:"premier-league"},
    {id:"copa-del-rey",name:"Copa del Rey",leagueId:"la-liga"},
    {id:"coupe-de-france",name:"Coupe de France",leagueId:"ligue-1"},
    {id:"knvb-beker",name:"KNVB Beker",leagueId:"eredivisie"},
    {id:"taca-de-portugal",name:"Taça de Portugal",leagueId:"primeira-liga"},
    {id:"belgian-cup",name:"Belgian Cup",leagueId:"belgian-pro-league"},
    {id:"scottish-cup",name:"Scottish Cup",leagueId:"scottish-premiership"},
    {id:"swiss-cup",name:"Swiss Cup",leagueId:"swiss-super-league"},
    {id:"turkish-cup",name:"Turkish Cup",leagueId:"super-lig"},
    {id:"croatian-cup",name:"Croatian Cup",leagueId:"hnl-croatia"}
  ];
  const qualified=state.continentalQualifiers||{};
  const europeanPool=state.db.leagues.find(l=>l.id==="champions-league");
  const regionalPools=getSouthAmericanCupPools();
  const libertadoresPool=regionalPools.libertadores;
  const sudamericanaPool=regionalPools.sudamericana;
  definitions.push(
    {id:"libertadores",name:"CONMEBOL Libertadores",leagueId:"brasileirao",teamIds:libertadoresPool,qualifiedTeams:qualified.libertadores||[]},
    {id:"sudamericana",name:"CONMEBOL Sudamericana",leagueId:"brasileirao",teamIds:sudamericanaPool,qualifiedTeams:qualified.sudamericana||[]},
    {id:"champions-league",name:"UEFA Champions League",leagueId:"premier-league",teamIds:getEuropeanChampionsPool(),qualifiedTeams:qualified.champions||[],format:"uefa-league"},
    {id:"europa-league",name:"UEFA Europa League",leagueId:"premier-league",teamIds:getEuropeanSecondaryPools().europa,qualifiedTeams:qualified.europa||[],format:"uefa-league"},
    {id:"conference-league",name:"UEFA Conference League",leagueId:"premier-league",teamIds:getEuropeanSecondaryPools().conference,qualifiedTeams:qualified.conference||[],format:"uefa-league"}
  );
  definitions.forEach(def => {
    const league = state.db.leagues.find(l => l.id === def.leagueId);
    if (!league || !Array.isArray(league.teams) || league.teams.length < 2) return;
    const participants = def.format==="uefa-league" ? [...new Set([...(def.qualifiedTeams||[]),...(def.teamIds||[])])].slice(0,36) : def.qualifiedTeams?.length ? [...def.qualifiedTeams] : def.teamIds?.length ? [...def.teamIds] : [...league.teams];
    if(Array.isArray(def.qualifiedTeams)&&def.qualifiedTeams.length>0&&def.qualifiedTeams.length<2)return;
    const seed = def.id.split("").reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
    participants.sort((a,b)=>cupSeed(a,seed)-cupSeed(b,seed));
    state.cupCompetitions.push({id:def.id,name:def.name,leagueId:def.leagueId,participants,activeTeams:[...participants],round:0,finished:false,champion:null,byes:[],format:def.format||null,phase:def.format==="uefa-league"?"league":null,pots:def.format==="uefa-league"?buildUEFAPots(participants):null});
  });
  advanceCupTournaments();
  saveTransferCareer();
}
function cupSeed(id,seed) { return String(id).split("").reduce((sum,ch)=>sum*31+ch.charCodeAt(0),seed) >>> 0; }
function cupRoundName(teamCount) {
  if(teamCount>16)return "Fase preliminar";
  if(teamCount===16)return "Oitavas de final";
  if(teamCount===8)return "Quartas de final";
  if(teamCount===4)return "Semifinal";
  return "Final";
}
function cupDate(round) {
  const date = new Date(state.db.calendar?.seasonStart || "2026-07-01");
  date.setDate(date.getDate()+35+round*14);
  return date.toISOString().slice(0,10);
}
function advanceCupTournaments() {
  if (!state.db || !Array.isArray(state.cupCompetitions)) return;
  const userId=String(state.db.userClubId||state.selectedClubId||"");
  state.cupCompetitions.forEach(cup=>{
    if(cup.format==="uefa-league"&&cup.phase==="league"){
      let guard=0;
      while(cup.phase==="league"&&cup.round<8&&guard++<8){
        let fixtures=state.generatedFixtures.filter(f=>f.cupId===cup.id&&f.cupRound===cup.round);
        if(!fixtures.length){
          const teams=[...cup.activeTeams];
          if(teams.length!==36){cup.activeTeams=teams.slice(0,36);cup.participants=[...cup.activeTeams];}
          const seed=cup.id.split("").reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
          if(!Array.isArray(cup.pots)||cup.pots.flat().length!==36)cup.pots=buildUEFAPots(cup.participants);
          const ordered=cup.pots.flat().map((id,index)=>({id,index}));
          const rotation=cup.pots.flatMap((pot,index)=>[...pot].sort((a,b)=>cupSeed(a,seed+index)-cupSeed(b,seed+index)));
          for(let turn=0;turn<cup.round;turn++){const fixed=rotation[0],last=rotation.pop();rotation.splice(1,0,last);rotation[0]=fixed;}
          const previous=state.generatedFixtures.filter(f=>f.cupId===cup.id&&f.phase==="league");
          const homeCounts=new Map(cup.participants.map(id=>[String(id),0]));
          previous.forEach(f=>homeCounts.set(String(f.homeTeamId),(homeCounts.get(String(f.homeTeamId))||0)+1));
          const potOf=new Map(cup.pots.flatMap((pot,index)=>pot.map(id=>[String(id),index+1])));
          for(let i=0;i<18;i++){
            const first=rotation[i],second=rotation[35-i];
            const firstHomes=homeCounts.get(String(first))||0,secondHomes=homeCounts.get(String(second))||0;
            const firstHosts=firstHomes<secondHomes||(firstHomes===secondHomes&&((i+cup.round)%2===0));
            const home=firstHosts?first:second,away=firstHosts?second:first;
            state.generatedFixtures.push({id:"cup-"+cup.id+"-league-"+cup.round+"-"+i,cupId:cup.id,cupRound:cup.round,competition:cup.name,round:"Fase de liga · rodada "+(cup.round+1),date:cupDate(cup.round),homeTeamId:home,awayTeamId:away,homePot:potOf.get(String(home)),awayPot:potOf.get(String(away)),generated:true,isCup:true,phase:"league"});
          }
          fixtures=state.generatedFixtures.filter(f=>f.cupId===cup.id&&f.cupRound===cup.round);
        }
        const playedIds=new Set(state.matchHistory.map(match=>match.fixtureId));
        const userFixture=fixtures.find(f=>String(f.homeTeamId)===userId||String(f.awayTeamId)===userId);
        fixtures.forEach(f=>{
          if(playedIds.has(f.id)||(userFixture&&f.id===userFixture.id))return;
          const home=state.db.teams.find(t=>String(t.id)===String(f.homeTeamId));
          const away=state.db.teams.find(t=>String(t.id)===String(f.awayTeamId));
          const hp=teamCupStrength(home),ap=teamCupStrength(away);
          const h=Math.max(0,Math.round(Math.random()*3+(hp-ap)/30));
          const a=Math.max(0,Math.round(Math.random()*3+(ap-hp)/30));
          state.matchHistory.push({homeId:f.homeTeamId,awayId:f.awayTeamId,homeScore:h,awayScore:a,date:f.date,fixtureId:f.id,competition:cup.name,round:f.round,autoSimulated:true});
        });
        if(!fixtures.every(f=>state.matchHistory.some(match=>match.fixtureId===f.id)))break;
        cup.round++;
      }
      if(cup.phase==="league"&&cup.round>=8){
        const rows=cup.participants.map(id=>({id:String(id),pts:0,gf:0,ga:0,w:0}));
        const rowMap=new Map(rows.map(row=>[row.id,row]));
        state.matchHistory.filter(match=>match.competition===cup.name&&String(match.fixtureId||"").includes("cup-"+cup.id+"-league-")).forEach(match=>{
          const home=rowMap.get(String(match.homeId)),away=rowMap.get(String(match.awayId));if(!home||!away)return;
          const hs=Number(match.homeScore||0),as=Number(match.awayScore||0);
          home.gf+=hs;home.ga+=as;away.gf+=as;away.ga+=hs;
          if(hs>as){home.pts+=3;home.w++;}else if(as>hs){away.pts+=3;away.w++;}else{home.pts++;away.pts++;}
        });
        rows.sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||b.w-a.w);
        cup.leagueTable=rows.map((row,index)=>({...row,position:index+1}));
        cup.byes=rows.slice(0,8).map(row=>row.id);
        cup.activeTeams=rows.slice(8,24).map(row=>row.id);
        cup.phase="knockout";cup.round=8;
      }
      if(cup.phase==="league")return;
    }
    let guard=0;
    while(!cup.finished&&guard++<8){
      let fixtures=state.generatedFixtures.filter(f=>f.cupId===cup.id&&f.cupRound===cup.round);
      if(!fixtures.length){
        const teams=[...cup.activeTeams];
        if(teams.length===1){cup.champion=teams[0];cup.finished=true;break;}
        const pairs=[];
        if(teams.length>16){cup.byes=teams.slice(8);for(let i=0;i<8;i+=2)pairs.push([teams[i],teams[i+1]]);}
        else{if(!Array.isArray(cup.byes)||!cup.byes.length)cup.byes=[];for(let i=0;i<teams.length;i+=2)pairs.push([teams[i],teams[i+1]]);}
        pairs.forEach((pair,index)=>state.generatedFixtures.push({id:"cup-"+cup.id+"-"+cup.round+"-"+index,cupId:cup.id,cupRound:cup.round,competition:cup.name,round:cup.format==="uefa-league"&&cup.round===8?"Playoffs da fase eliminatória":cupRoundName(teams.length),date:cupDate(cup.round),homeTeamId:pair[0],awayTeamId:pair[1],generated:true,isCup:true}));
        fixtures=state.generatedFixtures.filter(f=>f.cupId===cup.id&&f.cupRound===cup.round);
      }
      const playedIds=new Set(state.matchHistory.map(m=>m.fixtureId));
      const userFixture=fixtures.find(f=>String(f.homeTeamId)===userId||String(f.awayTeamId)===userId);
      fixtures.forEach(f=>{
        if(playedIds.has(f.id)||(userFixture&&f.id===userFixture.id))return;
        const home=state.db.teams.find(t=>String(t.id)===String(f.homeTeamId)),away=state.db.teams.find(t=>String(t.id)===String(f.awayTeamId));
        const hp=teamCupStrength(home),ap=teamCupStrength(away);
        let h=Math.max(0,Math.round(Math.random()*2+(hp-ap)/28)),a=Math.max(0,Math.round(Math.random()*2+(ap-hp)/28));
        if(h===a){if(Math.random()<0.5)h++;else a++;}
        state.matchHistory.push({homeId:f.homeTeamId,awayId:f.awayTeamId,homeScore:h,awayScore:a,date:f.date,fixtureId:f.id,competition:cup.name,round:f.round});
      });
      if(!fixtures.every(f=>state.matchHistory.some(m=>m.fixtureId===f.id)))break;
      const winners=fixtures.map(f=>{const result=state.matchHistory.find(m=>m.fixtureId===f.id);return result.homeScore>result.awayScore?f.homeTeamId:f.awayTeamId;});
      cup.activeTeams=[...(cup.byes||[]),...winners];cup.byes=[];cup.round++;
      if(cup.activeTeams.length===1){cup.champion=cup.activeTeams[0];cup.finished=true;}
    }
  });
  try{localStorage.setItem("fmb-match-history",JSON.stringify(state.matchHistory));}catch(_){}
  saveTransferCareer();
}
function teamCupStrength(team) {
  if(!team)return 50;
  const players=state.db.players.filter(p=>String(p.teamId)===String(team.id));
  return players.length?players.reduce((sum,p)=>sum+Number(p.overall||50),0)/players.length:Number(team.reputation||50);
}

// CALENDÁRIO

function renderCalendar(competitionFilter) {
  const windows = state.db.calendar?.transferWindows || [];
  const allFixtures = [...(state.db.calendar?.events || []), ...(state.generatedFixtures || [])];
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
  const stageLabel = f => f.isCup ? (f.phase==="league" ? `${f.round} · Pote ${f.homePot} × Pote ${f.awayPot}` : f.round) : `${f.round}ª rodada`;
  const cupSummary = (state.cupCompetitions || []).map(cup => {
    const champion = cup.champion ? teamName(cup.champion) : null;
    const stage = cup.finished ? "Campeão definido" : cup.phase==="league" ? "Fase de liga · rodada "+(cup.round+1)+"/8 · 36 clubes · 4 potes" : cup.format==="uefa-league"&&cup.round===8 ? "Playoffs eliminatórios" : cupRoundName(cup.activeTeams.length);
    return `<div class="fixture"><div><strong>🏆 ${cup.name}</strong><div class="subtle">${champion ? "Campeão: " + champion : "Fase atual: " + stage}</div></div><span class="tag">${cup.finished ? "Encerrada" : "Em disputa"}</span></div>`;
  }).join("");
  setPage("Calendário", `
    <p class="view-intro">Calendário da carreira · escolha uma competição para consultar os confrontos cadastrados e disputar os jogos do seu clube.</p>
    <div class="grid">
      <article class="card span-5">
        <div class="section-head"><h2>Competições</h2><span class="tag">${competitions.length} cadastradas</span></div>
        <label for="calendar-competition">Campeonato</label>
        <select id="calendar-competition" onchange="renderCalendar(this.value)">
          ${competitions.map(name => `<option value="${name.replace(/&/g,"&amp;").replace(/"/g,"&quot;")}" ${name === selectedCompetition ? "selected" : ""}>${name}</option>`).join("")}
        </select>
        ${renderContinentalQualificationPanel()}\n        ${renderSeasonPanel()}\n        <div class="section-head"><h2>Copas e troféus</h2><span class="tag">${state.cupCompetitions.length} competições</span></div>${cupSummary}<div class="section-head"><h2>Janelas de transferências</h2></div>
        ${windows.length ? windows.map(w => `
          <div class="fixture"><div><strong>${w.name}</strong><div class="subtle">${w.start} até ${w.end}</div></div><span class="tag">Planejada</span></div>
        `).join("") : `<div class="empty">Nenhuma janela cadastrada.</div>`}
        <div class="section-head"><h2>Jogos do seu clube</h2><span class="tag">${teamFixtures.length} partidas</span></div>
        ${teamFixtures.length ? teamFixtures.map(f => {
          const result = played(f.id);
          return `<div class="fixture"><div><strong>${teamName(f.homeTeamId)} × ${teamName(f.awayTeamId)}</strong><div class="subtle">${stageLabel(f)} · ${fixtureDate(f)}</div></div><span class="tag">${result ? result.homeScore + " × " + result.awayScore : "Pendente"}</span></div>`;
        }).join("") : `<p class="subtle">Não há partidas cadastradas desta competição para o clube escolhido.</p>`}
      </article>
      <article class="card span-7">
        <div class="section-head"><h2>${selectedCompetition || "Programação"}</h2><span class="tag">${fixtures.length} jogos</span></div>
        <p class="subtle">Partidas oficiais cadastradas e calendário gerado para a carreira são exibidos separadamente. Os confrontos gerados seguem turno e returno, mas não representam datas oficiais. Jogos do seu clube podem ser disputados no simulador.</p>
        ${fixtures.length ? fixtures.map(f => {
          const result = played(f.id);
          const mine = String(f.homeTeamId) === teamId || String(f.awayTeamId) === teamId;
          return `<div class="fixture">
            <div><strong>${teamName(f.homeTeamId)} × ${teamName(f.awayTeamId)}</strong>
              <div class="subtle">${stageLabel(f)} · ${fixtureDate(f)} · ${f.generated ? (f.isCup ? "Mata-mata de carreira" : "Calendário de carreira") : (f.time || "horário a confirmar") + " · " + (f.stadium || "estádio a confirmar")}</div>
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
const FORMATIONS = {
  "4-3-3": [
    ["Goleiro","GK"],["Lateral esquerdo","LB"],["Zagueiro","CB"],["Zagueiro","CB"],["Lateral direito","RB"],
    ["Meio-campista","CM"],["Volante","DM"],["Meio-campista","CM"],["Ponta esquerda","LW"],["Centroavante","ST"],["Ponta direita","RW"]
  ],
  "4-4-2": [
    ["Goleiro","GK"],["Lateral esquerdo","LB"],["Zagueiro","CB"],["Zagueiro","CB"],["Lateral direito","RB"],
    ["Meia esquerdo","LM"],["Volante","DM"],["Meio-campista","CM"],["Meia direito","RM"],["Atacante","ST"],["Atacante","ST"]
  ],
  "4-2-3-1": [
    ["Goleiro","GK"],["Lateral esquerdo","LB"],["Zagueiro","CB"],["Zagueiro","CB"],["Lateral direito","RB"],
    ["Volante","DM"],["Volante","DM"],["Ponta esquerda","LW"],["Meia ofensivo","AM"],["Ponta direita","RW"],["Centroavante","ST"]
  ],
  "3-5-2": [
    ["Goleiro","GK"],["Zagueiro","CB"],["Zagueiro","CB"],["Zagueiro","CB"],["Ala esquerdo","LB"],
    ["Volante","DM"],["Meio-campista","CM"],["Meia ofensivo","AM"],["Ala direito","RB"],["Atacante","ST"],["Atacante","ST"]
  ],
  "3-4-3": [
    ["Goleiro","GK"],["Zagueiro","CB"],["Zagueiro","CB"],["Zagueiro","CB"],["Ala esquerdo","LB"],
    ["Volante","DM"],["Meio-campista","CM"],["Ala direito","RB"],["Ponta esquerda","LW"],["Centroavante","ST"],["Ponta direita","RW"]
  ]
};
const POSITION_ALIASES = {
  GK:["GK","GOL"],LB:["LB","LWB","WB","FB","DF"],RB:["RB","RWB","WB","FB","DF"],CB:["CB","DEF","DF"],
  DM:["DM","CDM","VOL","MF"],CM:["CM","MC","LM","RM","MF"],AM:["AM","CAM","SS","MF"],LM:["LM","LW","MF"],RM:["RM","RW","MF"],
  LW:["LW","LM","WF","FW"],RW:["RW","RM","WF","FW"],ST:["ST","CF","ATA","SS","FW"]
};
function getLineupForFormation(teamId, formation) {
  const players=state.db.players.filter(p=>String(p.teamId)===String(teamId)&&!playerUnavailable(p)).sort((a,b)=>Number(b.overall||0)-Number(a.overall||0));
  const slots=FORMATIONS[formation]||FORMATIONS["4-3-3"],used=new Set(),starters=[];
  slots.forEach(([,role])=>{
    const aliases=POSITION_ALIASES[role]||[role];
    const player=players.find(p=>!used.has(String(p.id))&&aliases.includes(String(p.position||"").toUpperCase()));
    const fallback=player||players.find(p=>!used.has(String(p.id)));
    if(fallback){starters.push(fallback.id);used.add(String(fallback.id));}
  });
  return {starters,bench:players.filter(p=>!used.has(String(p.id))).slice(0,7).map(p=>p.id)};
}
function getLineup(teamId) {
  const saved=state.savedLineups[String(teamId)];
  const players=state.db.players.filter(p=>String(p.teamId)===String(teamId)&&!playerUnavailable(p));
  if(saved&&Array.isArray(saved.starters)){
    const valid=saved.starters.filter(id=>players.some(p=>String(p.id)===String(id)));
    if(valid.length===Math.min(11,players.length)){
      return {formation:FORMATIONS[saved.formation]?saved.formation:"4-3-3",instructions:{mentality:"balanced",pressing:"medium",defensiveLine:"standard",tempo:"normal",style:"balanced",...(saved.instructions||{})},starters:valid,bench:(saved.bench||[]).filter(id=>players.some(p=>String(p.id)===String(id))&&!valid.some(x=>String(x)===String(id))).slice(0,7)};
    }
  }
  const formation="4-3-3",lineup=getLineupForFormation(teamId,formation);
  return {formation,instructions:{mentality:"balanced",pressing:"medium",defensiveLine:"standard",tempo:"normal",style:"balanced"},...lineup};
}
let tacticalSelectedSlot = null;
const FORMATION_COORDS = {
  "4-3-3":[[50,91],[17,73],[39,77],[61,77],[83,73],[30,51],[50,56],[70,51],[20,25],[50,19],[80,25]],
  "4-4-2":[[50,91],[17,73],[39,77],[61,77],[83,73],[17,49],[39,55],[61,55],[83,49],[37,23],[63,23]],
  "4-2-3-1":[[50,91],[17,73],[39,77],[61,77],[83,73],[39,59],[61,59],[20,34],[50,39],[80,34],[50,18]],
  "3-5-2":[[50,91],[28,77],[50,79],[72,77],[12,49],[37,57],[50,62],[63,57],[88,49],[38,23],[62,23]],
  "3-4-3":[[50,91],[28,77],[50,79],[72,77],[15,52],[39,59],[61,59],[85,52],[20,25],[50,19],[80,25]]
};
function swapLineupSlots(first,second) {
  const m=state.match;if(!m||!m.setup||first===second)return;
  const a=m.lineup[first],b=m.lineup[second];
  if(a==null||b==null)return;
  m.lineup[first]=b;m.lineup[second]=a;tacticalSelectedSlot=null;renderMatch();
}
function selectLineupSlot(index) {
  if(tacticalSelectedSlot===null){tacticalSelectedSlot=index;renderMatch();return;}
  if(tacticalSelectedSlot===index){tacticalSelectedSlot=null;renderMatch();return;}
  swapLineupSlots(tacticalSelectedSlot,index);
}
function dragLineupSlot(event,index) {
  tacticalSelectedSlot=index;
  if(event.dataTransfer){event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",String(index));}
}
function dropLineupSlot(event,index) {
  event.preventDefault();
  const from=event.dataTransfer?Number(event.dataTransfer.getData("text/plain")):tacticalSelectedSlot;
  if(Number.isInteger(from)&&from>=0&&from<state.match.lineup.length)swapLineupSlots(from,index);
}
const TACTIC_OPTIONS = {
  mentality:{balanced:"Equilibrada",attacking:"Ofensiva",defensive:"Defensiva"},
  pressing:{low:"Baixa",medium:"Média",high:"Alta"},
  defensiveLine:{low:"Recuada",standard:"Normal",high:"Adiantada"},
  tempo:{slow:"Lento",normal:"Normal",fast:"Rápido"},
  style:{balanced:"Equilibrado",possession:"Posse de bola",direct:"Jogo direto",counter:"Contra-ataque"}
};
function renderTacticalInstructions(m) {
  const t=m.instructions||{};
  return '<section class="tactical-instructions"><div class="section-head"><h2>Instruções da equipe</h2><span class="tag">Plano de jogo</span></div><div class="instruction-grid">' + Object.entries({mentality:"Mentalidade",pressing:"Pressão",defensiveLine:"Linha defensiva",tempo:"Ritmo",style:"Estilo de jogo"}).map(([key,label])=>'<label class="lineup-slot"><span>'+label+'</span><select onchange="changeTacticalInstruction(\''+key+'\',this.value)">'+Object.entries(TACTIC_OPTIONS[key]).map(([value,name])=>'<option value="'+value+'" '+(t[key]===value?"selected":"")+'>'+name+'</option>').join("")+'</select></label>').join("") + '</div><p class="subtle">As escolhas alteram a força calculada e o comportamento da simulação. Pressão e linha altas podem trazer riscos defensivos.</p></section>';
};
function changeTacticalInstruction(key,value) {
  const m=state.match;if(!m||!m.setup||!TACTIC_OPTIONS[key]||!Object.prototype.hasOwnProperty.call(TACTIC_OPTIONS[key],value))return;
  if(!m.instructions)m.instructions={mentality:"balanced",pressing:"medium",defensiveLine:"standard",tempo:"normal",style:"balanced"};
  m.instructions[key]=value;
  state.savedLineups[String(state.db.userClubId||state.selectedClubId)]={formation:m.formation||"4-3-3",starters:[...m.lineup],bench:[...m.bench],instructions:{...m.instructions}};
  saveTransferCareer();
};
function tacticalModifier(t) {
  t=t||{};
  return ({balanced:0,attacking:2.2,defensive:-1.2}[t.mentality]||0)+({low:-0.8,medium:0,high:1.2}[t.pressing]||0)+({low:-0.6,standard:0,high:0.7}[t.defensiveLine]||0)+({slow:-0.3,normal:0,fast:0.7}[t.tempo]||0)+({balanced:0,possession:0.8,direct:0.5,counter:0.7}[t.style]||0);
};
function changeMatchFormation(formation) {
  const m=state.match;if(!m||!m.setup||!FORMATIONS[formation])return;
  const lineup=getLineupForFormation(state.db.userClubId||state.selectedClubId,formation);
  m.formation=formation;m.lineup=lineup.starters;m.bench=lineup.bench;
  renderMatch();
}
function teamStrength(teamId) {
  const players=state.db.players.filter(p=>String(p.teamId)===String(teamId));
  if(!players.length){const team=state.db.teams.find(t=>String(t.id)===String(teamId));return Number(team?.reputation||55);}
  const m=state.match;
  const isManaged=m&&String(teamId)===String(state.db.userClubId||state.selectedClubId);
  const aiLineup=m&&!isManaged&&Array.isArray(m.aiLineup)?m.aiLineup:null;
  const chosen=isManaged&&Array.isArray(m.lineup)?m.lineup.map(id=>players.find(p=>String(p.id)===String(id))).filter(Boolean):aiLineup?aiLineup.map(id=>players.find(p=>String(p.id)===String(id))).filter(Boolean):[...players].sort((a,b)=>Number(b.overall||0)-Number(a.overall||0)).slice(0,11);
  if(!chosen.length)return 50;
  const base=chosen.reduce((sum,p)=>sum+Number(p.overall||55),0)/chosen.length;
  const skills=chosen.reduce((sum,p)=>{const a=getPlayerAttributes(p);return sum+(a.passing+a.physical+a.defending+a.shooting+a.pace+a.dribbling)/6;},0)/chosen.length;
  const roles=chosen.filter(p=>String(p.position||"").toUpperCase()!=="").length;
  const tactical=isManaged?tacticalModifier(m.instructions):0;
  const fitness=chosen.reduce((sum,p)=>sum+getPlayerCondition(p).fitness,0)/chosen.length;
  return base*0.82+skills*0.15+(roles/chosen.length)*3+tactical+(fitness-100)*0.055;
}
function startMatch() {
  const opponentId=$("#match-opponent")?.value;
  if(!opponentId||String(opponentId)===String(state.db.userClubId))return;
  const home=userClub(),away=state.db.teams.find(t=>String(t.id)===String(opponentId));
  prepareMatch({homeId:home.id,awayId:away.id,homeName:home.name,awayName:away.name});
}
function startFixture(fixtureId) {
  const f=[...(state.db.calendar?.events||[]), ...(state.generatedFixtures||[])].find(x=>x.id===fixtureId);
  if(!f)return;
  const clubId=String(state.db.userClubId||state.selectedClubId||"");
  if(String(f.homeTeamId)!==clubId&&String(f.awayTeamId)!==clubId){alert("Este jogo não envolve seu clube.");return;}
  if(state.matchHistory.some(x=>x.fixtureId===fixtureId)){alert("Esta partida já foi disputada.");return;}
  const home=state.db.teams.find(t=>String(t.id)===String(f.homeTeamId)),away=state.db.teams.find(t=>String(t.id)===String(f.awayTeamId));
  prepareMatch({homeId:home.id,awayId:away.id,homeName:home.name,awayName:away.name,fixtureId:f.id,competition:f.competition,round:f.round,fixtureDate:f.date,isCup:!!f.isCup});
}
function prepareMatch(details) {
  if(state.matchTimer)clearInterval(state.matchTimer);
  const lineup=getLineup(state.db.userClubId||state.selectedClubId);
  state.match={...details,setup:true,formation:lineup.formation,instructions:{...(lineup.instructions||{})},lineup:lineup.starters,bench:lineup.bench,substitutions:[],homeScore:0,awayScore:0,minute:0,speed:1,paused:true,finished:false,saved:false,stats:{home:{shots:0,onTarget:0,saves:0},away:{shots:0,onTarget:0,saves:0}},events:[{minute:0,text:"Escalação pronta. Confira os titulares e reservas."}]};
  state.view="match";renderMatch();
}
function kickoffMatch() {
  const m=state.match;if(!m||!m.setup)return;
  const starters=[...document.querySelectorAll("[data-xi]")].map(x=>x.value).filter(Boolean);
  const available=state.db.players.filter(p=>String(p.teamId)===String(state.db.userClubId||state.selectedClubId)).length;
  const required=Math.min(11,state.db.players.filter(p=>String(p.teamId)===String(state.db.userClubId||state.selectedClubId)&&!playerUnavailable(p)).length);
  if(required===0){alert("Este clube ainda não tem jogadores cadastrados no banco de dados.");return;}
  if(starters.length!==required||new Set(starters).size!==required){alert("Selecione "+required+" titulares diferentes.");return;}
  const bench=[...document.querySelectorAll("[data-sub]")].map(x=>x.value).filter(Boolean).filter(id=>!starters.includes(id)&&!playerUnavailable(state.db.players.find(p=>String(p.id)===String(id))));
  m.lineup=starters;m.bench=[...new Set(bench)].slice(0,7);const opponentId=String(m.homeId)===String(state.db.userClubId||state.selectedClubId)?m.awayId:m.homeId;const opponentPlayers=state.db.players.filter(p=>String(p.teamId)===String(opponentId)).sort((a,b)=>Number(b.overall||0)-Number(a.overall||0));const eligibleOpponent=opponentPlayers.filter(p=>!playerUnavailable(p));m.aiLineup=eligibleOpponent.slice(0,11).map(p=>p.id);m.aiBench=eligibleOpponent.slice(11,18).map(p=>p.id);m.appearances=[...m.lineup,...m.aiLineup];m.scorers=[];m.aiSubstitutions=[];m.aiTactics={mentality:"balanced",pressing:"medium",defensiveLine:"standard",tempo:"normal",style:"balanced"};m.aiLastTacticChange=0;m.sentOffIds=[];m.suspensionsAtKickoff=state.db.players.filter(p=>[String(m.homeId),String(m.awayId)].includes(String(p.teamId))&&getPlayerCondition(p).suspendedMatches>0).map(p=>String(p.id));m.setup=false;m.paused=false;
  state.savedLineups[String(state.db.userClubId||state.selectedClubId)]={formation:m.formation||"4-3-3",starters:[...m.lineup],bench:[...m.bench],instructions:{...(m.instructions||{})}};saveTransferCareer();
  m.events.unshift({minute:0,text:"Escalação confirmada. Começa a partida!"});runMatchClock();renderMatch();
}
function makeSubstitution() {
  const m=state.match;if(!m||m.setup||m.finished||m.substitutions.length>=5||m.halfTime)return;
  const out=$("#sub-out")?.value,inside=$("#sub-in")?.value;
  if(!out||!inside||!m.lineup.includes(out)||!m.bench.includes(inside))return;
  const old=state.db.players.find(p=>String(p.id)===String(out)),fresh=state.db.players.find(p=>String(p.id)===String(inside));
  m.lineup=m.lineup.map(id=>id===out?inside:id);m.bench=m.bench.map(id=>id===inside?out:id);
  m.substitutions.push({minute:m.minute,out,in:inside});if(!Array.isArray(m.appearances))m.appearances=[...(m.lineup||[]),...(m.aiLineup||[])];if(!m.appearances.includes(inside))m.appearances.push(inside);
  m.events.unshift({minute:m.minute,text:"🔄 "+fresh.name+" entrou no lugar de "+old.name+"."});renderMatch();
}

function makeHalfTimeSubstitution() {
  const m=state.match;if(!m||!m.halfTime||m.finished||m.substitutions.length>=5)return;
  const out=$("#sub-out")?.value,inside=$("#sub-in")?.value;
  if(!out||!inside||!m.lineup.some(id=>String(id)===String(out))||!m.bench.some(id=>String(id)===String(inside)))return;
  const old=state.db.players.find(p=>String(p.id)===String(out)),fresh=state.db.players.find(p=>String(p.id)===String(inside));
  if(!old||!fresh)return;
  m.lineup=m.lineup.map(id=>String(id)===String(out)?inside:id);
  m.bench=m.bench.map(id=>String(id)===String(inside)?out:id);
  m.substitutions.push({minute:45,out,in:inside});
  if(!Array.isArray(m.appearances))m.appearances=[...(m.lineup||[]),...(m.aiLineup||[])];
  if(!m.appearances.some(id=>String(id)===String(inside)))m.appearances.push(inside);
  m.events.unshift({minute:45,text:"🔄 No intervalo: "+fresh.name+" entrou no lugar de "+old.name+"."});
  renderMatch();
}
function runOpponentAI() {
  const m=state.match;if(!m||m.setup||m.finished||!Array.isArray(m.aiLineup))return;
  const userId=String(state.db.userClubId||state.selectedClubId),opponentId=String(m.homeId)===userId?m.awayId:m.homeId;
  const aiIsHome=String(m.homeId)===String(opponentId),aiGoals=aiIsHome?m.homeScore:m.awayScore,userGoals=aiIsHome?m.awayScore:m.homeScore;
  if(m.minute>=55&&m.minute-m.aiLastTacticChange>=12){
    let next="balanced",message="O adversário mantém o equilíbrio tático.";
    if(aiGoals<userGoals){next="attacking";message="🧠 O adversário muda para uma postura ofensiva em busca do empate.";}
    else if(aiGoals>userGoals&&m.minute>=68){next="defensive";message="🧠 O adversário recua as linhas para proteger a vantagem.";}
    else if(aiGoals===userGoals&&m.minute>=76){next="attacking";message="🧠 O adversário aumenta a pressão para buscar a vitória.";}
    if(m.aiTactics.mentality!==next){m.aiTactics.mentality=next;m.aiTactics.pressing=next==="attacking"?"high":next==="defensive"?"low":"medium";m.aiLastTacticChange=m.minute;m.events.unshift({minute:m.minute,text:message});}
  }
  if(m.minute>=60&&m.minute%10===0&&m.aiSubstitutions.length<5&&m.aiBench.length){
    const players=state.db.players.filter(p=>String(p.teamId)===opponentId),available=m.aiBench.map(id=>players.find(p=>String(p.id)===String(id))).filter(Boolean);
    const role=p=>String(p.position||"").toUpperCase();
    const performance=p=>Number(p.overall||50)+(getPlayerCondition(p).fitness-70)*0.12;
    const current=m.aiLineup.map(id=>players.find(p=>String(p.id)===String(id))).filter(Boolean)
      .filter(p=>role(p)!=="GK"||available.some(x=>role(x)==="GK"))
      .sort((a,b)=>performance(a)-performance(b));
    const weakest=current[0];
    const compatible=weakest?available.filter(p=>role(p)===role(weakest)):[];
    const pool=compatible.length?compatible:available.filter(p=>role(p)!=="GK"&&role(weakest||{})!=="GK");
    const best=pool.sort((a,b)=>performance(b)-performance(a))[0];
    if(weakest&&best&&performance(best)>=performance(weakest)-1){
      m.aiLineup=m.aiLineup.map(id=>String(id)===String(weakest.id)?best.id:id);m.aiBench=m.aiBench.filter(id=>String(id)!==String(best.id));m.aiBench.push(weakest.id);m.aiSubstitutions.push({minute:m.minute,out:weakest.id,in:best.id});if(!Array.isArray(m.appearances))m.appearances=[...(m.lineup||[])];if(!m.appearances.includes(best.id))m.appearances.push(best.id);
      m.events.unshift({minute:m.minute,text:"🔄 "+best.name+" entra no adversário no lugar de "+weakest.name+" (ajuste por posição e condição física)."});
    }
  }
}
function runMatchClock() {
  if(state.matchTimer) clearInterval(state.matchTimer);
  if(!state.match||state.match.paused||state.match.finished)return;
  state.matchTimer=setInterval(tickMatch,Math.max(120,1000/state.match.speed));
}
function selectMatchPlayer(players,attribute) {
  if(!players.length)return null;
  const weights=players.map(p=>Math.max(1,Number(getPlayerAttributes(p)[attribute])||50));
  const total=weights.reduce((sum,n)=>sum+n,0);
  let roll=Math.random()*total;
  for(let i=0;i<players.length;i++){roll-=weights[i];if(roll<=0)return players[i];}
  return players[players.length-1];
}
function simulateMatchAttack(m,isHome,strength,bias) {
  if(!m.stats)m.stats={home:{shots:0,onTarget:0,saves:0},away:{shots:0,onTarget:0,saves:0}};
  const side=isHome?m.stats.home:m.stats.away;
  const opponent=isHome?m.stats.away:m.stats.home;
  const teamId=isHome?m.homeId:m.awayId;
  const opponentId=isHome?m.awayId:m.homeId;
  const teamName=isHome?m.homeName:m.awayName;
  const managed=String(state.db.userClubId||state.selectedClubId);
  const lineup=String(teamId)===managed?m.lineup:m.aiLineup;
  const opponentLineup=String(opponentId)===managed?m.lineup:m.aiLineup;
  const players=(lineup||[]).map(id=>state.db.players.find(p=>String(p.id)===String(id))).filter(Boolean);
  const opponents=(opponentLineup||[]).map(id=>state.db.players.find(p=>String(p.id)===String(id))).filter(Boolean);
  const attackers=players.filter(p=>["ST","CF","LW","RW","FW","AM"].includes(String(p.position||"").toUpperCase()));
  const shooterPool=attackers.length?attackers:players.filter(p=>String(p.position||"").toUpperCase()!=="GK");
  const shooter=selectMatchPlayer(shooterPool,"shooting");
  const keeper=opponents.find(p=>String(p.position||"").toUpperCase()==="GK");
  const shooterSkill=shooter?getPlayerAttributes(shooter).shooting:Math.max(40,strength);
  const keeperSkill=keeper?getPlayerAttributes(keeper).goalkeeping:48;
  const midfield=players.filter(p=>["CM","AM","DM","MF"].includes(String(p.position||"").toUpperCase()));
  const creator=selectMatchPlayer(midfield,"passing");
  const passingSkill=creator?getPlayerAttributes(creator).passing:50;
  const defenders=opponents.filter(p=>["CB","LB","RB","DM","DF"].includes(String(p.position||"").toUpperCase()));
  const defensiveSkill=defenders.length?defenders.reduce((sum,p)=>sum+getPlayerAttributes(p).defending,0)/defenders.length:48;
  const dribblingSkill=shooter?getPlayerAttributes(shooter).dribbling:50;
  const shotChance=Math.max(0.045,Math.min(0.16,0.105+(strength-60)*0.001+(bias||0)*0.002+(passingSkill-50)*0.0006+(dribblingSkill-50)*0.00035-(defensiveSkill-50)*0.00055));
  if(Math.random()>=shotChance)return;
  side.shots++;
  const shooterName=shooter?.name||teamName;
  const accuracy=Math.max(0.16,Math.min(0.58,0.31+(shooterSkill-60)*0.003+(passingSkill-50)*0.001+(dribblingSkill-50)*0.0005-(defensiveSkill-50)*0.00045));
  const setup=creator&&creator.id!==shooter?.id?" após passe de "+creator.name:"";
  if(Math.random()>=accuracy){m.events.unshift({minute:m.minute,text:"🎯 "+shooterName+" finaliza"+setup+", mas a bola vai para fora."});return;}
  side.onTarget++;
  const goalChance=Math.max(0.075,Math.min(0.4,0.22+(shooterSkill-60)*0.003-(keeperSkill-60)*0.003-(defensiveSkill-50)*0.0007+(bias||0)*0.003));
  if(Math.random()<goalChance){if(isHome)m.homeScore++;else m.awayScore++;if(!Array.isArray(m.scorers))m.scorers=[];m.scorers.push({playerId:shooter?.id||null,teamId,minute:m.minute,assistPlayerId:creator&&creator.id!==shooter?.id?creator.id:null});m.events.unshift({minute:m.minute,text:"⚽ GOL do "+teamName+"! "+shooterName+" marca"+setup+"!"});}
  else{opponent.saves++;m.events.unshift({minute:m.minute,text:"🧤 "+(keeper?.name||"O goleiro")+" defende! Finalização de "+shooterName+"."});}
}
function tickMatch() {
  const m=state.match;if(!m||m.paused||m.finished)return;
  m.minute++;
  runOpponentAI();
  applyMatchConditionEffects(m);
  const hs=teamStrength(m.homeId),as=teamStrength(m.awayId),total=Math.max(1,hs+as);
  const managedClub=String(state.db.userClubId||state.selectedClubId),tacticalBias=tacticalModifier(m.instructions);
  const homeBias=String(m.homeId)===managedClub?tacticalBias:tacticalModifier(m.aiTactics),awayBias=String(m.awayId)===managedClub?tacticalBias:tacticalModifier(m.aiTactics);
  simulateMatchAttack(m,true,hs,homeBias);
  simulateMatchAttack(m,false,as,awayBias);
  if(Math.random()<0.055){const notes=["A defesa afasta o perigo.","Bola recuperada no meio-campo.","Cobrança de falta para a área.","A equipe pressiona a saída de bola.","O time troca passes e controla o ritmo.","Contra-ataque em velocidade!"];m.events.unshift({minute:m.minute,text:notes[Math.floor(Math.random()*notes.length)]});}
  if(m.minute===45){m.paused=true;m.halfTime=true;m.events.unshift({minute:45,text:"Intervalo! Fim do primeiro tempo."});if(state.matchTimer){clearInterval(state.matchTimer);state.matchTimer=null;}renderMatch();return;}
  if(m.minute>=90){m.minute=90;m.finished=true;finishMatchSuspensions(m);saveTransferCareer();m.events.unshift({minute:90,text:"Fim de jogo! Partida encerrada."});if(!m.saved){state.matchHistory.push({homeId:m.homeId,awayId:m.awayId,homeScore:m.homeScore,awayScore:m.awayScore,date:m.fixtureDate || dateLabel(state.day),fixtureId:m.fixtureId || null,competition:m.competition || "Amistoso",round:m.round || null,playerIds:[...(m.lineup||[])],appearances:[...(m.appearances||m.lineup||[])],scorers:[...(m.scorers||[])],stats:JSON.parse(JSON.stringify(m.stats||{home:{shots:0,onTarget:0,saves:0},away:{shots:0,onTarget:0,saves:0}}))});m.saved=true;try{localStorage.setItem("fmb-match-history",JSON.stringify(state.matchHistory));}catch(_){}applyBoardMatchReview(state.matchHistory[state.matchHistory.length-1]);if(m.isCup)advanceCupTournaments();}clearInterval(state.matchTimer);state.matchTimer=null;}
  if(state.view === "match") renderMatch();
}
function resumeSecondHalf() {
  const m=state.match;if(!m||!m.halfTime||m.finished)return;
  m.halfTime=false;m.paused=false;m.events.unshift({minute:45,text:"Começa o segundo tempo!"});runMatchClock();renderMatch();
}
function pauseMatch() {
  if(!state.match||state.match.finished||state.match.halfTime)return;
  state.match.paused=!state.match.paused;
  if(state.match.paused){clearInterval(state.matchTimer);state.matchTimer=null;}else runMatchClock();
  renderMatch();
}
function setMatchSpeed(speed) {
  if(!state.match||state.match.finished)return;
  state.match.speed=Number(speed);if(!state.match.paused)runMatchClock();renderMatch();
}
function toggleMatchLineup() {
  if(!state.match||state.match.setup)return;
  state.match.showLineup=!state.match.showLineup;renderMatch();
}
function leaveMatch(destination) {
  if(state.matchTimer)clearInterval(state.matchTimer);
  state.matchTimer=null;state.match=null;state.view=destination==="calendar"?"calendar":"dashboard";render();
}
function newMatch() { if(state.matchTimer) clearInterval(state.matchTimer); state.matchTimer=null; state.match=null; state.view="match"; renderMatch(); }


function renderMatch() {
  const m=state.match;
  if(!m){
    const opponents=state.db.teams.filter(t=>String(t.id)!==String(state.db.userClubId));
    setPage("Central de Partidas",`<p class="view-intro">Escolha um adversário e prepare sua equipe.</p><article class="card match-setup"><div class="section-head"><h2>Preparar partida</h2><span class="tag">Simulação</span></div><label for="match-opponent">Adversário</label><select id="match-opponent">${opponents.map(t=>`<option value="${t.id}">${t.name}</option>`).join("")}</select><button class="primary-btn" onclick="startMatch()">PREPARAR PARTIDA</button></article>`);
    return;
  }
  const roster=state.db.players.filter(p=>String(p.teamId)===String(state.db.userClubId||state.selectedClubId)&&!playerUnavailable(p)).sort((a,b)=>Number(b.overall||0)-Number(a.overall||0));
  const byId=id=>state.db.players.find(p=>String(p.id)===String(id));
  if(m.setup){
    const slots=FORMATIONS[m.formation||"4-3-3"].slice(0,Math.min(11,roster.length));
    const chosen=new Set(m.lineup.map(String)),reserves=roster.filter(p=>!chosen.has(String(p.id)));
    const opts=id=>roster.map(p=>`<option value="${p.id}" ${String(id)===String(p.id)?"selected":""}>${p.name} · ${p.positionName||p.position} · OVR ${p.overall}</option>`).join("");
    const coords=FORMATION_COORDS[m.formation||"4-3-3"];
    const pitch=slots.map(([role],i)=>{const p=roster.find(x=>String(x.id)===String(m.lineup[i]));if(!p)return "";const [x,y]=coords[i];return `<button type="button" class="pitch-player ${tacticalSelectedSlot===i?"is-selected":""}" style="left:${x}%;top:${y}%" draggable="true" ondragstart="dragLineupSlot(event,${i})" ondragover="event.preventDefault()" ondrop="dropLineupSlot(event,${i})" onclick="selectLineupSlot(${i})" title="Toque em outro jogador para trocar de posição"><span class="pitch-number">${i+1}</span><strong>${p.name.split(" ")[0]}</strong><small>${role}</small></button>`;}).join("");
    setPage("Escalação e tática",`<p class="view-intro">Organize seu time no campo: arraste um jogador para a posição de outro ou toque em dois jogadores para trocar. A escalação será salva na carreira.</p><article class="card"><div class="section-head"><h2>${m.homeName} × ${m.awayName}</h2><span class="tag">Pré-jogo</span></div><label class="lineup-slot"><span>FORMAÇÃO TÁTICA</span><select id="match-formation" onchange="changeMatchFormation(this.value)">${Object.keys(FORMATIONS).map(f=>`<option value="${f}" ${f===(m.formation||"4-3-3")?"selected":""}>${f}</option>`).join("")}</select></label><div class="tactical-pitch" aria-label="Campo tático"><div class="pitch-half"></div><div class="pitch-circle"></div><div class="pitch-box pitch-box-top"></div><div class="pitch-box pitch-box-bottom"></div>${pitch}</div>${renderTacticalInstructions(m)}<p class="subtle tactical-hint">${tacticalSelectedSlot===null?"Arraste os jogadores ou toque em dois para trocar as posições.":"Agora escolha outro jogador para concluir a troca."}</p><h3>Escalação titular · ${slots.length}/11</h3><div class="lineup-grid">${slots.map(([n],i)=>`<label class="lineup-slot"><span>${i+1}. ${n}</span><select data-xi>${opts(m.lineup[i])}</select></label>`).join("")}</div><div class="section-head"><h2>Banco de reservas</h2><span class="tag">Até 7 vagas</span></div><div class="bench-grid">${Array.from({length:7},(_,i)=>`<label class="lineup-slot"><span>Reserva ${i+1}</span><select data-sub><option value="">— Vazio —</option>${roster.filter(p=>!chosen.has(String(p.id))||String(m.bench[i])===String(p.id)).map(p=>`<option value="${p.id}" ${String(m.bench[i]||"")===String(p.id)?"selected":""}>${p.name} · ${p.positionName||p.position}</option>`).join("")}</select></label>`).join("")}</div><button class="primary-btn" onclick="kickoffMatch()">⚽ CONFIRMAR ESCALAÇÃO E JOGAR</button></article>`);
    return;
  }
  const starters=m.lineup.map(byId).filter(Boolean),bench=m.bench.map(byId).filter(Boolean);
  if(m.halfTime){
    const coords=FORMATION_COORDS[m.formation||"4-3-3"]||FORMATION_COORDS["4-3-3"];
    const roles=FORMATIONS[m.formation||"4-3-3"]||FORMATIONS["4-3-3"];
    const pitch=starters.map((p,i)=>{const [x,y]=coords[i]||[50,50];const role=roles[i]?.[0]||p.position||"";return `<div class="pitch-player" style="left:${x}%;top:${y}%;pointer-events:none"><span class="pitch-number">${i+1}</span><strong>${p.name.split(" ")[0]}</strong><small>${role}</small></div>`;}).join("");
    const outOptions=starters.map(p=>`<option value="${p.id}">${p.name} · ${p.positionName||p.position}</option>`).join("");
    const inOptions=bench.map(p=>`<option value="${p.id}">${p.name} · ${p.positionName||p.position}</option>`).join("");
    setPage("Intervalo",`<article class="card live-match"><div class="match-status">INTERVALO · FIM DO PRIMEIRO TEMPO</div><div class="scoreboard"><div class="score-team"><strong>${m.homeName}</strong><span>${m.homeScore}</span></div><div class="score-clock">45’</div><div class="score-team"><strong>${m.awayName}</strong><span>${m.awayScore}</span></div></div><p class="view-intro">A partida está pausada. Faça suas alterações e prepare a equipe para o segundo tempo.</p></article><article class="card"><div class="section-head"><h2>Escalação · ${m.formation||"4-3-3"}</h2><span class="tag">Titulares</span></div><div class="tactical-pitch" aria-label="Formação da equipe no intervalo"><div class="pitch-half"></div><div class="pitch-circle"></div><div class="pitch-box pitch-box-top"></div><div class="pitch-box pitch-box-bottom"></div>${pitch}</div><h3>Substituições · ${m.substitutions.length}/5</h3>${m.substitutions.length<5&&bench.length?`<div class="substitution-controls"><label>Sai<select id="sub-out">${outOptions}</select></label><label>Entra<select id="sub-in">${inOptions}</select></label><button class="primary-btn" onclick="makeHalfTimeSubstitution()">CONFIRMAR ALTERAÇÃO</button></div>`:"<p class='subtle'>Limite de substituições atingido ou sem reservas disponíveis.</p>"}<div class="section-head"><h2>Banco de reservas</h2><span class="tag">${bench.length}/7</span></div>${bench.map(p=>`<div class="player-row"><div><strong>${p.name}</strong><small>${p.positionName||p.position}</small></div><span class="rating">${p.overall}</span></div>`).join("")}<button class="primary-btn" onclick="resumeSecondHalf()">⚽ COMEÇAR SEGUNDO TEMPO</button></article>`);
    return;
  }
  const matchPitch=(()=>{const coords=FORMATION_COORDS[m.formation||"4-3-3"]||FORMATION_COORDS["4-3-3"];const roles=FORMATIONS[m.formation||"4-3-3"]||FORMATIONS["4-3-3"];return starters.map((p,i)=>{const [x,y]=coords[i]||[50,50];return `<div class="pitch-player" style="left:${x}%;top:${y}%;pointer-events:none"><span class="pitch-number">${i+1}</span><strong>${p.name.split(" ")[0]}</strong><small>${roles[i]?.[0]||p.position||""}</small></div>`;}).join("");})();
  const lineupPreview=m.showLineup?`<article class="card"><div class="section-head"><h2>Formação · ${m.formation||"4-3-3"}</h2><span class="tag">11 titulares</span></div><div class="tactical-pitch" aria-label="Formação da equipe durante a partida"><div class="pitch-half"></div><div class="pitch-circle"></div><div class="pitch-box pitch-box-top"></div><div class="pitch-box pitch-box-bottom"></div>${matchPitch}</div></article>`:"";
  const sub=!m.finished&&m.substitutions.length<5&&bench.length?`<article class="card substitution-card"><div class="section-head"><h2>Substituições</h2><span class="tag">${m.substitutions.length}/5</span></div><div class="substitution-controls"><label>Sai<select id="sub-out">${starters.map(p=>`<option value="${p.id}">${p.name}</option>`).join("")}</select></label><label>Entra<select id="sub-in">${bench.map(p=>`<option value="${p.id}">${p.name}</option>`).join("")}</select></label><button class="primary-btn" onclick="makeSubstitution()">CONFIRMAR</button></div></article>`:"";
  setPage("Central de Partidas",`<article class="card live-match"><div class="match-status">${m.finished?"TEMPO INTEGRAL":m.paused?"PARTIDA PAUSADA":"PARTIDA AO VIVO"}</div><div class="scoreboard"><div class="score-team"><strong>${m.homeName}</strong><span>${m.homeScore}</span></div><div class="score-clock">${String(m.minute).padStart(2,"0")}’</div><div class="score-team"><strong>${m.awayName}</strong><span>${m.awayScore}</span></div></div><div class="match-stats" aria-label="Estatísticas da partida"><div><strong>${m.stats?.home?.shots||0}</strong><span>Finalizações</span><strong>${m.stats?.home?.onTarget||0}</strong><span>No alvo</span></div><div class="stats-label">ESTATÍSTICAS</div><div><strong>${m.stats?.away?.shots||0}</strong><span>Finalizações</span><strong>${m.stats?.away?.onTarget||0}</strong><span>No alvo</span></div></div><div class="match-controls"><button class="speed-btn" onclick="toggleMatchLineup()">⚽ ${m.showLineup?"OCULTAR ESCALAÇÃO":"VER ESCALAÇÃO NO CAMPO"}</button><button class="primary-btn" onclick="pauseMatch()" ${m.finished?"disabled":""}>${m.paused?"▶ Continuar":"Ⅱ Pausar"}</button><button class="speed-btn" onclick="setMatchSpeed(1)">1x</button><button class="speed-btn" onclick="setMatchSpeed(2)">2x</button><button class="speed-btn" onclick="setMatchSpeed(4)">4x</button><button class="speed-btn" onclick="newMatch()">Nova partida</button>${m.finished?'<button class="primary-btn" onclick="leaveMatch(\'calendar\')">AVANÇAR PARA O CALENDÁRIO</button><button class="speed-btn" onclick="leaveMatch(\'dashboard\')">VOLTAR AO PAINEL</button>':""}</div></article>${lineupPreview}<div class="grid match-squads"><article class="card span-6"><h2>Titulares · ${starters.length}/11</h2>${starters.map(p=>`<div class="player-row"><div><strong>${p.name}</strong><small>${p.positionName||p.position}</small></div><span class="rating">${p.overall}</span></div>`).join("")}</article><article class="card span-6"><h2>Reservas · ${bench.length}/7</h2>${bench.map(p=>`<div class="player-row"><div><strong>${p.name}</strong><small>${p.positionName||p.position}</small></div><span class="rating">${p.overall}</span></div>`).join("")}</article></div>${sub}<article class="card events-card"><div class="section-head"><h2>Relato da partida</h2><span class="tag">${m.events.length} eventos</span></div><div class="match-events">${m.events.map(e=>`<div class="match-event"><strong>${String(e.minute).padStart(2,"0")}’</strong><span>${e.text}</span></div>`).join("")}</div></article>`);
}


// INICIAR JOGO

init();
