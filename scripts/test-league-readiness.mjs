#!/usr/bin/env node
/**
 * Testes de regressão do verificador de conclusão de ligas.
 * Uso: node scripts/test-league-readiness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(here, "check-league-readiness.mjs");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-readiness-"));

function makeDatabase({ players = 18, age = 24, nationality = "Brasil", duplicate = false } = {}) {
  const team = { id: "test-fc", name: "Test FC", leagueId: "test-league", players: [] };
  const roster = Array.from({ length: players }, (_, index) => ({
    id: duplicate && index === 1 ? "test-player-0" : `test-player-${index}`,
    name: `Jogador ${index}`,
    position: index === 0 ? "GK" : "DF",
    age,
    overall: 60,
    marketValue: 100000,
    teamId: team.id,
    nationality,
    injured: false
  }));
  team.players = roster.map(player => ({ ...player }));
  return { meta: { season: "2026/27" }, teams: [team], players: roster };
}

function runCase(name, database) {
  const file = path.join(tempDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(database));
  const result = spawnSync(process.execPath, [checker, file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `Checker failed for ${name}`);
  return JSON.parse(result.stdout);
}

try {
  const valid = runCase("valid", makeDatabase());
  assert.deepEqual(valid.completeLeagues, ["test-league"], "A complete roster should pass");

  const missingAge = runCase("missing-age", makeDatabase({ age: null }));
  assert.equal(missingAge.leagues[0].complete, false, "Null age must block completion");
  assert.equal(missingAge.leagues[0].incompleteMetadataClubs[0].missing.age, 18);

  const placeholderNationality = runCase("placeholder-nationality", makeDatabase({ nationality: "—" }));
  assert.equal(placeholderNationality.leagues[0].complete, false, "Placeholder nationality must block completion");
  assert.equal(placeholderNationality.leagues[0].incompleteMetadataClubs[0].missing.nationality, 18);

  const shortRoster = runCase("short-roster", makeDatabase({ players: 17 }));
  assert.equal(shortRoster.leagues[0].complete, false, "Roster below the minimum must block completion");

  const duplicateIds = runCase("duplicate-ids", makeDatabase({ duplicate: true }));
  assert.equal(duplicateIds.integrity.duplicatePlayerIds, 1, "Duplicate IDs must be detected");
  assert.equal(duplicateIds.leagues[0].complete, false, "Duplicate IDs must block completion");

  console.log("OK: 5 testes do verificador de conclusão passaram.");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
