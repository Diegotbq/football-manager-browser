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

test("prepara escalação, inicia e pausa uma partida", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await startCareer(page);

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

  expect(errors).toEqual([]);
});
