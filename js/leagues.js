window.FM_LEAGUES = {
  countries: [
    { id: "england", name: "Inglaterra", uefaRank: 1, divisions: ["Premier League", "Championship", "League One", "League Two"] },
    { id: "spain", name: "Espanha", uefaRank: 4, divisions: ["La Liga", "La Liga 2", "Primera Federación"] },
    { id: "italy", name: "Itália", uefaRank: 2, divisions: ["Serie A", "Serie B", "Serie C"] },
    { id: "germany", name: "Alemanha", uefaRank: 3, divisions: ["Bundesliga", "2. Bundesliga", "3. Liga"] },
    { id: "brazil", name: "Brasil", divisions: ["Série A", "Série B", "Série C", "Série D"] },
    { id: "france", name: "França", uefaRank: 5, divisions: ["Ligue 1", "Ligue 2", "National"] },
    { id: "netherlands", name: "Holanda", uefaRank: 6, divisions: ["Eredivisie", "Eerste Divisie"] },
    { id: "portugal", name: "Portugal", uefaRank: 7, divisions: ["Primeira Liga", "Liga Portugal 2"] },
    { id: "belgium", name: "Bélgica", uefaRank: 8, divisions: ["Belgian Pro League", "Challenger Pro League"] },
    { id: "turkey", name: "Turquia", uefaRank: 10, divisions: ["Süper Lig", "1. Lig"] },
    { id: "scotland", name: "Escócia", uefaRank: 14, divisions: ["Scottish Premiership", "Championship", "League One", "League Two"] },
    { id: "switzerland", name: "Suíça", uefaRank: 17, divisions: ["Swiss Super League", "Challenge League"] },
    { id: "croatia", name: "Croácia", uefaRank: 21, divisions: ["HNL", "Prva NL"] }
  ],

  europeanCompetitions: [
    { id: "champions-league", name: "UEFA Champions League", confederation: "UEFA", format: "league-phase-and-knockout", leaguePhaseTeams: 36 },
    { id: "europa-league", name: "UEFA Europa League", confederation: "UEFA", format: "league-phase-and-knockout", leaguePhaseTeams: 36 },
    { id: "conference-league", name: "UEFA Conference League", confederation: "UEFA", format: "league-phase-and-knockout", leaguePhaseTeams: 36 }
  ],

  qualificationSeason: "2026/27",
  qualificationSource: "UEFA access list 2026/27",
  qualificationNote: "As vagas e as fases de entrada devem seguir a lista de acesso UEFA da temporada, incluindo campeões nacionais, copas, campeões das competições europeias e eventuais reequilíbrios.",

  clubsPerDivision: 20,
  promotionSpots: 3,
  relegationSpots: 3,

  getTotalDivisions() {
    return this.countries.reduce((total, country) => total + country.divisions.length, 0);
  },

  getTotalClubSlots() {
    return this.getTotalDivisions() * this.clubsPerDivision;
  },

  getEuropeanCompetitions() {
    return this.europeanCompetitions.map(competition => ({ ...competition }));
  },

  getCountry(id) {
    return this.countries.find(country => country.id === id) || null;
  }
};

console.log("Football Manager Leagues carregado!");
console.log("Países:", window.FM_LEAGUES.countries.length);
console.log("Divisões:", window.FM_LEAGUES.getTotalDivisions());
console.log("Vagas teóricas:", window.FM_LEAGUES.getTotalClubSlots());
