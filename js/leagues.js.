
window.FM_LEAGUES = {
  countries: [
    {
      id: "england",
      name: "Inglaterra",
      divisions: [
        "Premier League",
        "Championship",
        "League One",
        "League Two"
      ]
    },
    {
      id: "spain",
      name: "Espanha",
      divisions: [
        "La Liga",
        "La Liga 2",
        "Primera Federación"
      ]
    },
    {
      id: "italy",
      name: "Itália",
      divisions: [
        "Serie A",
        "Serie B",
        "Serie C"
      ]
    },
    {
      id: "germany",
      name: "Alemanha",
      divisions: [
        "Bundesliga",
        "2. Bundesliga",
        "3. Liga"
      ]
    },
    {
      id: "brazil",
      name: "Brasil",
      divisions: [
        "Série A",
        "Série B",
        "Série C",
        "Série D"
      ]
    }
  ],

  clubsPerDivision: 20,
  promotionSpots: 3,
  relegationSpots: 3,

  getTotalDivisions() {
    return this.countries.reduce(
      (total, country) => total + country.divisions.length,
      0
    );
  },

  getTotalClubSlots() {
    return this.getTotalDivisions() * this.clubsPerDivision;
  }
};

console.log("Football Manager Leagues carregado!");
console.log("Divisões:", window.FM_LEAGUES.getTotalDivisions());
console.log("Vagas:", window.FM_LEAGUES.getTotalClubSlots());
