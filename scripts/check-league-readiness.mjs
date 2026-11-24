#!/usr/bin/env node
/**
 * Só considera uma liga completa quando TODOS os clubes têm elenco mínimo
 * e não existem IDs duplicados nem jogadores ligados a clubes inexistentes.
 *
 * Uso: node scripts/check-league-readiness.mjs [caminho-do-database.json]
 * Ajuste o mínimo com MIN_PLAYERS_PER_TEAM=18.
 */
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.argv[2] || "database.json");
const defaultMinimum = Math.max(1, Number(process.env.MIN_PLAYERS_PER_TEAM || 18));
const db = JSON.parse(fs.readFileSync(file, "utf8"));
const teams = Array.isArray(db.teams) ? db.teams : [];
const players = Array.isArray(db.players) ? db.players : [];

const teamIds = new Set(teams.map(team => String(team.id)));
const counts = new Map();
const ids = new Set();
const duplicateIds = [];
const invalidTeamLinks = [];
const playerIdsByTeam = new Map();

for (const player of players) {
  const id = String(player.id || "");
  if (!id || ids.has(id)) duplicateIds.push(id || "(vazio)");
  ids.add(id);

  const teamId = String(player.teamId || "");
  if (!teamId || !teamIds.has(teamId)) invalidTeamLinks.push({
    player: player.name || null,
    teamId: teamId || null
  });
  counts.set(teamId, (counts.get(teamId) || 0) + 1);
  if (!playerIdsByTeam.has(teamId)) playerIdsByTeam.set(teamId, []);
  playerIdsByTeam.get(teamId).push(id);
}

const squadReferenceIssues = [];
for (const team of teams) {
  const teamId = String(team.id);
  const expected = playerIdsByTeam.get(teamId) || [];
  const actualPlayers = Array.isArray(team.players) ? team.players : [];
  const actual = actualPlayers.map(player => String(
    player && typeof player === "object" ? player.id || "" : player || ""
  ));
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter(id => !actualSet.has(id));
  const unexpected = actual.filter(id => !expectedSet.has(id));
  const duplicateSquadIds = actual.filter((id, index) => id && actual.indexOf(id) !== index);
  if (missing.length || unexpected.length || duplicateSquadIds.length) {
    squadReferenceIssues.push({
      teamId: team.id,
      team: team.name,
      missingFromSquad: missing.length,
      unexpectedInSquad: unexpected.length,
      duplicateInSquad: duplicateSquadIds.length
    });
  }
}

const leagues = new Map();
for (const team of teams) {
  const leagueId = team.leagueId || "sem-liga";
  if (!leagues.has(leagueId)) leagues.set(leagueId, []);
  leagues.get(leagueId).push({
    id: team.id,
    name: team.name,
    players: counts.get(String(team.id)) || 0,
    squadReferenceIssues: squadReferenceIssues.filter(issue => String(issue.teamId) === String(team.id)).length
  });
}

const results = [...leagues.entries()].map(([leagueId, clubs]) => {
  const minimum = Math.max(1, Number(db.meta?.leagueMinimumRosterSizes?.[leagueId] || defaultMinimum));
  const belowMinimum = clubs.filter(club => club.players < minimum);
  const squadIssues = clubs.reduce((sum, club) => sum + club.squadReferenceIssues, 0);
  const complete = belowMinimum.length === 0 && squadIssues === 0 &&
    duplicateIds.length === 0 && invalidTeamLinks.length === 0;
  return {
    leagueId,
    clubs: clubs.length,
    clubsMeetingMinimum: clubs.length - belowMinimum.length,
    squadReferenceIssues: squadIssues,
    minimumPlayersPerClub: minimum,
    complete,
    clubsBelowMinimum: belowMinimum
  };
}).sort((a, b) => a.leagueId.localeCompare(b.leagueId));

const report = {
  season: db.meta?.season || null,
  generatedAt: new Date().toISOString(),
  rule: `Mínimo padrão de ${defaultMinimum} jogadores, com exceções por liga em meta.leagueMinimumRosterSizes; IDs únicos; vínculos válidos; arrays team.players iguais ao cadastro mestre.`,
  integrity: {
    duplicatePlayerIds: duplicateIds.length,
    invalidTeamLinks: invalidTeamLinks.length,
    squadReferenceIssues: squadReferenceIssues.length
  },
  completeLeagues: results.filter(item => item.complete).map(item => item.leagueId),
  pendingLeagues: results.filter(item => !item.complete),
  leagues: results
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
