#!/usr/bin/env node
/**
 * Audita a cobertura e a integridade dos elencos em database.json.
 * Uso: node scripts/audit-rosters.mjs [caminho-do-database.json]
 */
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.argv[2] || "database.json");
const db = JSON.parse(fs.readFileSync(file, "utf8"));
const teams = Array.isArray(db.teams) ? db.teams : [];
const players = Array.isArray(db.players) ? db.players : [];
const playersById = new Map();
const duplicatePlayerIds = [];
const orphanPlayers = [];
const unknownTeamPlayers = [];
const teamCounts = new Map();

for (const player of players) {
  const id = String(player.id ?? "");
  if (!id) duplicatePlayerIds.push({ id: "(vazio)", player: player.name });
  else if (playersById.has(id)) duplicatePlayerIds.push({ id, player: player.name });
  else playersById.set(id, player);

  const teamId = String(player.teamId ?? "");
  if (teamId) teamCounts.set(teamId, (teamCounts.get(teamId) || 0) + 1);
}

const knownTeamIds = new Set(teams.map(team => String(team.id)));
for (const player of players) {
  const teamId = String(player.teamId ?? "");
  if (!teamId || !knownTeamIds.has(teamId)) {
    orphanPlayers.push({ player: player.name, teamId: teamId || null });
  }
}

const leagues = {};
const emptyTeams = [];
for (const team of teams) {
  const leagueId = team.leagueId || "sem-liga";
  const count = teamCounts.get(String(team.id)) || 0;
  const entry = leagues[leagueId] ||= { clubs: 0, clubsWithPlayers: 0, players: 0 };
  entry.clubs += 1;
  entry.players += count;
  if (count) entry.clubsWithPlayers += 1;
  else emptyTeams.push({ team: team.name, leagueId });
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
    playersWithoutValidTeam: orphanPlayers.length
  },
  leagues,
  emptyTeams,
  duplicatePlayerIds,
  playersWithoutValidTeam: orphanPlayers
};

const output = JSON.stringify(report, null, 2) + "\n";
process.stdout.write(output);
if (process.env.WRITE_ROSTER_AUDIT === "1") {
  fs.writeFileSync(path.resolve("data/roster-audit.json"), output);
}
