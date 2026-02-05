// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Enter Screen', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test
    await page.context().clearCookies();
    await page.goto('/');
  });

  test('shows enter screen with title and button', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('36247');
    await expect(page.locator('#enter-btn')).toBeVisible();
    await expect(page.locator('#enter-btn')).toContainText('ENTER');
  });

  test('title is visible and not overflowing', async ({ page }) => {
    const title = page.locator('h1');
    await expect(title).toBeVisible();

    // Check title is within viewport
    const box = await title.boundingBox();
    const viewport = page.viewportSize();

    expect(box.x).toBeGreaterThanOrEqual(-10); // Allow small negative for transforms
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 10);
  });

  test('shows password prompt after clicking ENTER without cookies', async ({ page }) => {
    await page.click('#enter-btn');
    await expect(page.locator('#password-container')).toBeVisible();
    await expect(page.locator('#password-input')).toBeVisible();
  });

  test('password input is focusable and usable', async ({ page }) => {
    await page.click('#enter-btn');
    const input = page.locator('#password-input');
    await expect(input).toBeVisible();
    await input.focus();
    await expect(input).toBeFocused();
    await input.fill('testpassword');
    await expect(input).toHaveValue('testpassword');
  });

  test('shows error on wrong password', async ({ page }) => {
    await page.click('#enter-btn');
    await page.fill('#password-input', 'wrongpassword');
    await page.press('#password-input', 'Enter');
    await expect(page.locator('#password-error')).toHaveClass(/visible/);
  });
});

test.describe('Layout - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test('enter screen fits on mobile viewport', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');

    // Title should be visible
    const title = page.locator('h1');
    await expect(title).toBeVisible();

    // ENTER button should be visible
    const enterBtn = page.locator('#enter-btn');
    await expect(enterBtn).toBeVisible();
    await expect(enterBtn).toBeInViewport();

    // No horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });

  test('password input works on mobile', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');

    await page.click('#enter-btn');

    const input = page.locator('#password-input');
    await expect(input).toBeVisible();
    await expect(input).toBeInViewport();

    // Should be clickable and focusable
    await input.click();
    await expect(input).toBeFocused();
  });
});

test.describe('Player Screen', () => {
  test('player controls are visible after authentication', async ({ page }) => {
    // This test requires valid cookies - skip if not available
    await page.goto('/');

    // Check if already authenticated (has cookies)
    const enterScreen = page.locator('#enter-screen');
    const isEnterVisible = await enterScreen.isVisible();

    if (isEnterVisible) {
      // Try to authenticate with password
      await page.click('#enter-btn');
      await page.fill('#password-input', 'ayemanesaymane');
      await page.press('#password-input', 'Enter');
    }

    // Wait for player screen
    await expect(page.locator('#player-screen')).toBeVisible({ timeout: 10000 });

    // Check controls
    await expect(page.locator('#play-pause-btn')).toBeVisible();
    await expect(page.locator('#next-btn')).toBeVisible();
    await expect(page.locator('#back-btn')).toBeVisible();
  });
});

test.describe('Visual Regression', () => {
  test('enter screen screenshot - desktop', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for fonts to load
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('enter-screen-desktop.png', {
      maxDiffPixels: 100,
    });
  });

  test('enter screen screenshot - mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for fonts to load
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('enter-screen-mobile.png', {
      maxDiffPixels: 100,
    });
  });
});
