#!/usr/bin/env node
/**
 * Audita cobertura, integridade e consistência entre a lista principal
 * de jogadores e os elencos incorporados em cada clube.
 * Uso: node scripts/audit-rosters.mjs [caminho-do-database.json]
 * O relatório também lista, por jogador, os campos de identidade que ainda precisam de verificação.
 */
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.argv[2] || "database.json");
const db = JSON.parse(fs.readFileSync(file, "utf8"));
const teams = Array.isArray(db.teams) ? db.teams : [];
const players = Array.isArray(db.players) ? db.players : [];

// Valores sentinela não contam como metadados reais preenchidos.
const hasUsableValue = value => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 && !["—", "-", "n/a", "na", "null", "unknown"].includes(normalized);
};
const ids = new Set();
const duplicatePlayerIds = [];
const playersWithoutValidTeam = [];
const teamCounts = new Map();
const knownTeamIds = new Set(teams.map(team => String(team.id)));

for (const player of players) {
  const id = String(player.id ?? "");
  if (!id || ids.has(id)) duplicatePlayerIds.push({ id: id || "(vazio)", player: player.name });
  ids.add(id);
  const teamId = String(player.teamId ?? "");
  teamCounts.set(teamId, (teamCounts.get(teamId) || 0) + 1);
  if (!teamId || !knownTeamIds.has(teamId)) {
    playersWithoutValidTeam.push({ player: player.name, teamId: teamId || null });
  }
}

const mainPlayersById = new Map(players.map(player => [String(player.id), player]));
const leagues = {};
const emptyTeams = [];
const squadReferenceIssues = [];
const clubsWithNonObjectSquadEntries = [];

for (const team of teams) {
  const leagueId = team.leagueId || "sem-liga";
  const count = teamCounts.get(String(team.id)) || 0;
  const entry = leagues[leagueId] ||= { clubs: 0, clubsWithPlayers: 0, players: 0 };
  entry.clubs += 1;
  entry.players += count;
  if (count) entry.clubsWithPlayers += 1;
  else emptyTeams.push({ team: team.name, leagueId });

  const squad = Array.isArray(team.players) ? team.players : [];
  if (squad.some(player => !player || typeof player !== "object")) clubsWithNonObjectSquadEntries.push(team.name);
  const squadIds = squad.map(player => {
    if (player && typeof player === "object") return String(player.id ?? "");
    return String(player ?? "");
  });
  const expectedIds = players.filter(player => String(player.teamId) === String(team.id)).map(player => String(player.id));
  const missingFromTeamSquad = expectedIds.filter(id => !squadIds.includes(id));
  const unknownInTeamSquad = squadIds.filter(id => !mainPlayersById.has(id));
  const duplicateInTeamSquad = squadIds.filter((id, index) => id && squadIds.indexOf(id) !== index);
  const wrongTeamObjects = squad.filter(player => player && typeof player === "object" &&
    String(player.teamId) !== String(team.id)).map(player => player.id || player.name);
  if (missingFromTeamSquad.length || unknownInTeamSquad.length ||
      duplicateInTeamSquad.length || wrongTeamObjects.length) {
    squadReferenceIssues.push({
      team: team.name,
      missingFromTeamSquad,
      unknownInTeamSquad,
      duplicateInTeamSquad,
      wrongTeamObjects
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  season: db.meta?.season || null,
  totals: {
    clubs: teams.length,
    playerRecords: players.length,
    clubsWithPlayers: teams.length - emptyTeams.length,
    clubsWithoutPlayers: emptyTeams.length
  },
  integrity: {
    duplicatePlayerIds: duplicatePlayerIds.length,
    playersWithoutValidTeam: playersWithoutValidTeam.length,
    clubsWithSquadReferenceIssues: squadReferenceIssues.length,
    clubsWithNonObjectSquadEntries: clubsWithNonObjectSquadEntries.length
  },
  leagues,
  emptyTeams,
  duplicatePlayerIds,
  playersWithoutValidTeam,
  squadReferenceIssues,
  clubsWithNonObjectSquadEntries
};


// Mede lacunas de metadados por liga sem inventar idade ou nacionalidade.
for (const [leagueId, entry] of Object.entries(leagues)) {
  const leagueTeamIds = new Set(teams
    .filter(team => (team.leagueId || "sem-liga") === leagueId)
    .map(team => String(team.id)));
  const leaguePlayers = players.filter(player => leagueTeamIds.has(String(player.teamId)));
  const isMissing = {
    name: player => !hasUsableValue(player.name),
    position: player => !hasUsableValue(player.position),
    age: player => !Number.isFinite(Number(player.age)) || Number(player.age) <= 0,
    nationality: player => !hasUsableValue(player.nationality)
  };
  const missing = Object.fromEntries(Object.entries(isMissing).map(([field, predicate]) =>
    [field, leaguePlayers.filter(predicate).length]));
  const teamById = new Map(teams.map(team => [String(team.id), team]));
  const missingMetadataPlayers = leaguePlayers.flatMap(player => {
    const missingFields = Object.entries(isMissing)
      .filter(([, predicate]) => predicate(player))
      .map(([field]) => field);
    if (!missingFields.length) return [];
    const team = teamById.get(String(player.teamId));
    return [{
      playerId: player.id ?? null,
      playerName: player.name ?? null,
      teamId: player.teamId ?? null,
      teamName: team?.name ?? null,
      missingFields
    }];
  });
  const playersWithVerifiedProfileSource = leaguePlayers.filter(player =>
    player.identitySource?.provider === "LALIGA" &&
    typeof player.identitySource.sourceUrl === "string" &&
    player.identitySource.sourceUrl.startsWith("https://www.laliga.com/")
  ).length;
  // A cobertura de metadados é calculada sobre a coleção principal de jogadores;
  // os espelhos dos elencos dos clubes não são somados novamente.
  entry.metadataCompleteness = {
    playerRecords: leaguePlayers.length,
    missing,
    present: Object.fromEntries(Object.entries(missing).map(([field, count]) =>
      [field, leaguePlayers.length - count])),
    playersWithVerifiedProfileSource,
    missingMetadataPlayers
  };
}

// Aplica os mínimos operacionais específicos de cada competição.
const defaultMinimum = 18;
const minimumRosterSizeByLeague = {};
for (const [leagueId, entry] of Object.entries(leagues)) {
  const leagueTeams = teams.filter(team => (team.leagueId || "sem-liga") === leagueId);
  const minimum = Math.max(1, Number(db.meta?.leagueMinimumRosterSizes?.[leagueId] || defaultMinimum));
  minimumRosterSizeByLeague[leagueId] = minimum;
  entry.minimumPlayersPerClub = minimum;
  entry.clubsMeetingMinimum = leagueTeams.filter(team => (teamCounts.get(String(team.id)) || 0) >= minimum).length;
  entry.clubsBelowMinimum = leagueTeams.filter(team => (teamCounts.get(String(team.id)) || 0) < minimum).length;
}
report.defaultMinimumRosterSize = defaultMinimum;
report.minimumRosterSizeByLeague = minimumRosterSizeByLeague;
report.clubsBelowMinimum = teams
  .filter(team => (teamCounts.get(String(team.id)) || 0) <
    Math.max(1, Number(db.meta?.leagueMinimumRosterSizes?.[team.leagueId] || defaultMinimum)))
  .map(team => ({
    team: team.name,
    leagueId: team.leagueId || null,
    players: teamCounts.get(String(team.id)) || 0,
    minimum: Math.max(1, Number(db.meta?.leagueMinimumRosterSizes?.[team.leagueId] || defaultMinimum))
  }));
report.rosterValidationNote = "Os mínimos medem cobertura estrutural; não confirmam, por si só, a inscrição atual ou a identidade real de cada jogador.";

const output = JSON.stringify(report, null, 2) + "\n";
process.stdout.write(output);
if (process.env.WRITE_ROSTER_AUDIT === "1") {
  fs.writeFileSync(path.resolve("data/roster-audit.json"), output);
}
// Re-run audit after the latest approved LaLiga profile metadata batch.
// Re-audit after approved LaLiga profile metadata revision 5.
