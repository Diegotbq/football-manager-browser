import { test, expect } from "@playwright/test";

async function startCareer(page, clubId = "real-madrid") {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/");
  await expect(page.locator("#club-choice")).toBeVisible({ timeout: 45000 });
  await page.locator("#club-choice").selectOption(clubId);
  await page.getByRole("button", { name: /CONFIRMAR CLUBE E COMEÇAR CARREIRA/ }).click();
  await expect(page.locator("#club-name")).toHaveText("Real Madrid");
}

test("carrega o banco, escolhe clube e navega pelas áreas principais", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await startCareer(page);

  await expect(page.locator("#page-title")).toHaveText("Dashboard");
  await expect(page.locator("#view-root")).toContainText("Tamanho do elenco");
  const rosterOptions = await page.locator("#main-nav .nav-item").count();
  expect(rosterOptions).toBe(7);

  await page.locator('[data-view="squad"]').click();
  await expect(page.locator("#page-title")).toContainText("Elenco");
  await expect(page.locator("#view-root")).toContainText("Elenco principal");

  await page.locator('[data-view="market"]').click();
  await expect(page.locator("#page-title")).toHaveText("Mercado de Transferências");
  await expect(page.locator("#view-root")).toContainText("Buscar jogadores");

  await page.locator('[data-view="table"]').click();
  await expect(page.locator("#page-title")).toHaveText("Tabela");
  await expect(page.locator("#view-root")).toContainText("La Liga");

  await page.locator('[data-view="calendar"]').click();
  await expect(page.locator("#page-title")).toHaveText("Calendário");

  expect(errors).toEqual([]);
});

test("avança o calendário e salva o novo dia na carreira", async ({ page }) => {
  await startCareer(page);
  const before = await page.locator("#current-date").textContent();
  await page.locator("#advance-day").click();
  await expect(page.locator("#current-date")).not.toHaveText(before);
});

test("joga uma partida completa, pausa, retoma e registra o resultado", async ({ page }) => {
  test.setTimeout(60000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await startCareer(page);

  const matchesBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("fmb-match-history") || "[]").length);
  await page.locator('[data-view="match"]').click();
  await expect(page.locator("#match-opponent")).toBeVisible();
  await page.locator("#match-opponent").selectOption("barcelona");
  await page.getByRole("button", { name: /PREPARAR PARTIDA/ }).click();

  await expect(page.locator("#page-title")).toHaveText("Escalação e tática");
  await expect(page.locator("[data-xi]")).toHaveCount(11);
  await page.getByRole("button", { name: /CONFIRMAR ESCALAÇÃO E JOGAR/ }).click();

  await expect(page.locator(".match-status")).toHaveText("PARTIDA AO VIVO");
  await page.getByRole("button", { name: /Pausar/ }).click();
  await expect(page.locator(".match-status")).toHaveText("PARTIDA PAUSADA");
  await page.getByRole("button", { name: /Continuar/ }).click();
  await page.getByRole("button", { name: "4x" }).click();
  await expect(page.locator(".match-status")).toHaveText("INTERVALO · FIM DO PRIMEIRO TEMPO", { timeout: 30000 });
  await expect(page.getByRole("button", { name: /COMEÇAR SEGUNDO TEMPO/ })).toBeVisible();
  await page.getByRole("button", { name: /COMEÇAR SEGUNDO TEMPO/ }).click();

  await expect(page.locator(".match-status")).toHaveText("TEMPO INTEGRAL", { timeout: 45000 });
  await expect(page.locator(".events-card")).toContainText("Fim de jogo! Partida encerrada.");
  await expect(page.locator(".match-stats")).toBeVisible();
  const savedMatches = await page.evaluate(() => JSON.parse(localStorage.getItem("fmb-match-history") || "[]"));
  expect(savedMatches).toHaveLength(matchesBefore + 1);
  const completedMatch = savedMatches[savedMatches.length - 1];
  expect(completedMatch).toMatchObject({ homeId: "real-madrid", awayId: "barcelona" });
  expect(typeof completedMatch.homeScore).toBe("number");
  expect(typeof completedMatch.awayScore).toBe("number");
  expect(completedMatch.stats.home.shots + completedMatch.stats.away.shots).toBeGreaterThan(0);
  expect(completedMatch.stats.home.shots).toBeGreaterThanOrEqual(completedMatch.stats.home.onTarget);
  expect(completedMatch.stats.away.shots).toBeGreaterThanOrEqual(completedMatch.stats.away.onTarget);
  expect(completedMatch.scorers).toHaveLength(completedMatch.homeScore + completedMatch.awayScore);
  expect(completedMatch.scorers.every(goal => goal.playerId)).toBe(true);
  await page.locator('[data-view="table"]').click();
  await expect(page.locator("#view-root")).toContainText("Artilharia");
  await expect(page.locator("#view-root")).toContainText("Assistências");
  expect(errors).toEqual([]);
});


test("aplica instruções táticas e realiza substituição durante a partida", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await startCareer(page);

  await page.locator('[data-view="match"]').click();
  await page.locator("#match-opponent").selectOption("barcelona");
  await page.getByRole("button", { name: /PREPARAR PARTIDA/ }).click();

  const tactics = page.locator(".tactical-instructions select");
  await expect(tactics).toHaveCount(5);
  await tactics.nth(0).selectOption("attacking");
  await tactics.nth(1).selectOption("high");
  await expect(tactics.nth(0)).toHaveValue("attacking");
  await expect(tactics.nth(1)).toHaveValue("high");

  await page.getByRole("button", { name: /CONFIRMAR ESCALAÇÃO E JOGAR/ }).click();
  await expect(page.locator(".match-status")).toHaveText("PARTIDA AO VIVO");
  await page.getByRole("button", { name: /Pausar/ }).click();

  await expect(page.locator("#sub-out")).toBeVisible();
  await expect(page.locator("#sub-in")).toBeVisible();
  await page.locator("#sub-out").selectOption({ index: 0 });
  await page.locator("#sub-in").selectOption({ index: 0 });
  await page.getByRole("button", { name: "CONFIRMAR" }).click();

  await expect(page.locator(".substitution-card")).toContainText("1/5");
  await expect(page.locator(".events-card")).toContainText("entrou no lugar");
  expect(errors).toEqual([]);
});


test("abre o perfil individual e mostra estatísticas e histórico do jogador", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await startCareer(page);
  await page.locator('[data-view="squad"]').click();
  const firstProfile = page.locator('#view-root button[onclick^="openPlayerProfile("]').first();
  await expect(firstProfile).toBeVisible();
  await firstProfile.click();
  await expect(page.locator("#page-title")).toHaveText("Perfil do jogador");
  await expect(page.locator("#view-root")).toContainText("Atributos");
  await expect(page.locator("#view-root")).toContainText("Últimas partidas");
  await page.getByRole("button", { name: "VOLTAR AO ELENCO" }).click();
  await expect(page.locator("#page-title")).toContainText("Elenco");
  expect(errors).toEqual([]);
});


test("preserva estatísticas individuais no histórico entre temporadas", async ({ page }) => {
  await startCareer(page);
  await page.locator('[data-view="squad"]').click();
  const profileButton = page.locator('#view-root button[onclick^="openPlayerProfile("]').first();
  const onclick = await profileButton.getAttribute("onclick");
  const playerId = onclick.match(/openPlayerProfile\('([^']+)'\)/)[1];
  await page.evaluate(id => {
    localStorage.setItem("fmb-transfer-save", JSON.stringify({
      seasonHistory: [{
        season: "2025/26",
        matches: [{
          homeId: "real-madrid", awayId: "barcelona", homeScore: 2, awayScore: 1,
          date: "2026-05-20", competition: "La Liga", appearances: [id],
          scorers: [{playerId: id, teamId: "real-madrid", minute: 42, assistPlayerId: null}]
        }]
      }]
    }));
  }, playerId);
  await page.evaluate(() => loadTransferCareer());
  await page.locator('[data-view="squad"]').click();
  await page.locator('#view-root button[onclick^="openPlayerProfile("]').first().click();
  await expect(page.locator("#view-root")).toContainText("2025/26");
  await expect(page.locator("#view-root")).toContainText("Estatísticas por temporada");
  const seasonRow = page.locator("#view-root .card").filter({ hasText: "Estatísticas por temporada" }).locator("tbody tr").first();
  await expect(seasonRow.locator("td").nth(1)).toHaveText("1");
  await expect(seasonRow.locator("td").nth(2)).toHaveText("1");
  await expect(seasonRow.locator("td").nth(3)).toHaveText("0");
});

test("gera atributo específico de goleiro para influenciar as defesas", async ({ page }) => {
  await startCareer(page);
  const keeperRatings = await page.evaluate(async () => {
    const db = await fetch("database.json").then(response => response.json());
    const keeper = db.players.find(player => String(player.position || "").toUpperCase() === "GK");
    return keeper ? window.getPlayerAttributes(keeper) : null;
  });
  expect(keeperRatings).not.toBeNull();
  expect(keeperRatings.goalkeeping).toBeGreaterThan(keeperRatings.shooting);
});

test("La Liga tem 20 clubes, elencos completos e metadados sem lacunas", async ({ page }) => {
  await page.goto("/");
  const audit = await page.evaluate(async () => {
    const response = await fetch("database.json");
    if (!response.ok) throw new Error("Não foi possível carregar database.json");
    const db = await response.json();
    const teams = db.teams.filter(team => team.leagueId === "la-liga");
    const teamIds = new Set(teams.map(team => String(team.id)));
    const players = db.players.filter(player => teamIds.has(String(player.teamId)));
    const ids = players.map(player => String(player.id));
    return {
      clubs: teams.length,
      players: players.length,
      clubsWithMinimumSquad: teams.filter(team =>
        players.filter(player => String(player.teamId) === String(team.id)).length >= 18
      ).length,
      missingAges: players.filter(player =>
        !Number.isFinite(Number(player.age)) || Number(player.age) <= 0
      ).length,
      missingNationalities: players.filter(player =>
        !String(player.nationality || "").trim() ||
        ["—", "-", "n/a", "na", "null", "unknown"].includes(String(player.nationality).trim().toLowerCase())
      ).length,
      duplicateIds: ids.length - new Set(ids).size,
      playersWithoutValidTeam: players.filter(player => !teamIds.has(String(player.teamId))).length
    };
  });

  expect(audit.clubs).toBe(20);
  expect(audit.players).toBeGreaterThanOrEqual(360);
  expect(audit.clubsWithMinimumSquad).toBe(20);
  expect(audit.missingAges).toBe(0);
  expect(audit.missingNationalities).toBe(0);
  expect(audit.duplicateIds).toBe(0);
  expect(audit.playersWithoutValidTeam).toBe(0);
});

test("gera temporada completa de ida e volta para todas as ligas com clubes", async ({ page }) => {
  await startCareer(page);
  const audit = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("fmb-transfer-save") || "{}");
    const fixtures = saved.generatedFixtures || [];
    return (state.db.leagues || [])
      .filter(league => league.type === "league" && Array.isArray(league.teams) && league.teams.length >= 2)
      .map(league => {
        const ids = [...new Set(league.teams.map(String))];
        const matches = fixtures.filter(f => f.competitionId === league.id);
        const pairs = new Map();
        matches.forEach(f => {
          const key = [String(f.homeTeamId), String(f.awayTeamId)].sort().join("::");
          pairs.set(key, [...(pairs.get(key) || []), f]);
        });
        const validPairs = [...pairs.values()].every(pair =>
          pair.length === 2 &&
          pair.some(f => String(f.homeTeamId) === String(pair[0].awayTeamId) && String(f.awayTeamId) === String(pair[0].homeTeamId))
        );
        return {
          id: league.id,
          clubs: ids.length,
          fixtures: matches.length,
          expected: ids.length * (ids.length - 1),
          uniqueIds: new Set(matches.map(f => f.id)).size === matches.length,
          validPairs: validPairs && pairs.size === (ids.length * (ids.length - 1)) / 2
        };
      });
  });
  expect(audit.length).toBeGreaterThan(0);
  for (const league of audit) {
    expect(league.fixtures, league.id).toBe(league.expected);
    expect(league.uniqueIds, league.id).toBe(true);
    expect(league.validPairs, league.id).toBe(true);
  }
});

test("encerra temporada, registra resultados e inicia a próxima com calendário novo", async ({ page }) => {
  await startCareer(page);
  const before = await page.evaluate(() => ({
    season: state.db.meta.season,
    expectedFixtures: state.generatedFixtures.length
  }));
  expect(before.expectedFixtures).toBeGreaterThan(0);

  await page.evaluate(() => finishSeason());

  const after = await page.evaluate(() => ({
    season: state.db.meta.season,
    currentMatches: state.matchHistory.length,
    nextFixtures: state.generatedFixtures.length,
    history: state.seasonHistory[0],
    savedSeason: JSON.parse(localStorage.getItem("fmb-transfer-save") || "{}").seasonMeta?.season
  }));
  const year = Number(String(before.season).match(/^(\\d{4})/)?.[1]) + 1;
  expect(after.season).toBe(year + "/" + String((year + 1) % 100).padStart(2, "0"));
  expect(after.savedSeason).toBe(after.season);
  expect(after.currentMatches).toBe(0);
  expect(after.nextFixtures).toBe(before.expectedFixtures);
  expect(after.history.season).toBe(before.season);
  expect(after.history.matches.length).toBe(before.expectedFixtures);
  expect(after.history.matches.every(match => typeof match.homeScore === "number" && typeof match.awayScore === "number")).toBe(true);
});
