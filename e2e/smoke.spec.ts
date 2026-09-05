import { test, expect } from "@playwright/test";

test("home page renders and links to the lobby", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "DarkFantasyGame" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter lobby" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
});

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("register page renders the registration form", async ({ page }) => {
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "Create account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeVisible();
});
