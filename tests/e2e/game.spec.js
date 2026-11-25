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
  expect(rosterOptions).toBe(6);

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
  await expect(page.locator("#view-root")).toContainText("1</td><td>1</td><td>0");
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
