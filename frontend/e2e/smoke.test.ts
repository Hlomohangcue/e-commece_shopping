/**
 * Frontend smoke tests — Playwright.
 *
 * Validates:
 *  1. The homepage loads and renders a stable element.
 *  2. No fatal JS errors prevent the app from rendering.
 *  3. The /products page loads.
 *  4. The /login page loads with a form.
 *  5. The /register page loads with a form.
 *  6. Unauthenticated /cart page shows the sign-in prompt (not a crash).
 *  7. Unauthenticated /orders page shows the sign-in prompt (not a crash).
 *  8. The /ai page loads.
 *
 * These tests are READ-ONLY — no forms are submitted, no accounts created.
 */

import { test, expect } from '@playwright/test';

// Collect any page-level JS errors
function attachErrorListener(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('Smoke — page load checks', () => {
  // ── Homepage ─────────────────────────────────────────────────────────────

  test('homepage loads and renders heading', async ({ page }) => {
    const errors = attachErrorListener(page);
    await page.goto('/');
    // The homepage has a prominent heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  // ── Products ─────────────────────────────────────────────────────────────

  test('/products page loads', async ({ page }) => {
    const errors = attachErrorListener(page);
    await page.goto('/products');
    // Catalog heading is always rendered
    const heading = page.getByRole('heading', { name: /browse our premium collection/i });
    await expect(heading).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  // ── Login ────────────────────────────────────────────────────────────────

  test('/login page loads with email and password fields', async ({ page }) => {
    const errors = attachErrorListener(page);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  // ── Register ─────────────────────────────────────────────────────────────

  test('/register page loads with registration form', async ({ page }) => {
    const errors = attachErrorListener(page);
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  // ── Cart (unauthenticated) ────────────────────────────────────────────────

  test('/cart unauthenticated shows sign-in prompt', async ({ page }) => {
    const errors = attachErrorListener(page);
    await page.goto('/cart');
    // Cart page shows "Your cart is waiting" / "Sign in" when not logged in
    await expect(page.getByText(/sign in/i).first()).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  // ── Orders (unauthenticated) ──────────────────────────────────────────────

  test('/orders unauthenticated shows sign-in prompt', async ({ page }) => {
    const errors = attachErrorListener(page);
    await page.goto('/orders');
    await expect(page.getByText(/sign in/i).first()).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  // ── AI page ───────────────────────────────────────────────────────────────

  test('/ai page loads', async ({ page }) => {
    const errors = attachErrorListener(page);
    await page.goto('/ai');
    await expect(page.getByRole('heading', { name: /ai assistant/i })).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});
