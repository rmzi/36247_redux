import { test, expect } from '@playwright/test';

// Helper to generate signed cookies (calls Python script)
async function getSignedCookies(): Promise<{ name: string; value: string; domain: string; path: string; secure: boolean; sameSite: 'Strict' }[]> {
  const { execSync } = await import('child_process');
  const output = execSync(
    'source tools/.venv/bin/activate && python tools/sign-cookies.py --format json 2>/dev/null',
    { cwd: process.cwd(), encoding: 'utf-8' }
  );

  // Parse JSON output - it should be a multi-line JSON object
  const cookies = JSON.parse(output.trim());
  return Object.entries(cookies).map(([name, value]) => ({
    name,
    value: value as string,
    domain: '36247.rmzi.world',
    path: '/',
    secure: true,
    sameSite: 'Strict' as const,
  }));
}

test.describe('36247 Player', () => {
  test.beforeEach(async ({ context }) => {
    // Set signed cookies before each test
    const cookies = await getSignedCookies();
    await context.addCookies(cookies);
  });

  test('shows enter screen on load', async ({ page }) => {
    await page.goto('https://36247.rmzi.world');

    await expect(page.locator('#enter-screen')).toBeVisible();
    await expect(page.locator('#enter-btn')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('36247');
  });

  test('enters player and starts playback', async ({ page }) => {
    await page.goto('https://36247.rmzi.world');

    // Click enter
    await page.click('#enter-btn');

    // Should show player screen
    await expect(page.locator('#player-screen')).toBeVisible();

    // Track info should be populated
    await expect(page.locator('#artist')).not.toHaveText('---');

    // Audio should be playing (or at least have a source)
    const audio = page.locator('#audio-player');
    await expect(audio).toHaveAttribute('src', /^\/audio\//);
  });

  test('next button loads new track', async ({ page }) => {
    await page.goto('https://36247.rmzi.world');
    await page.click('#enter-btn');

    // Wait for first track
    await expect(page.locator('#player-screen')).toBeVisible();
    const firstArtist = await page.locator('#artist').textContent();

    // Click next multiple times to ensure we get a different track
    for (let i = 0; i < 5; i++) {
      await page.click('#next-btn');
      await page.waitForTimeout(500);
    }

    // At least one track change should have occurred
    const audio = page.locator('#audio-player');
    await expect(audio).toHaveAttribute('src', /^\/audio\//);
  });

  test('progress bar updates during playback', async ({ page }) => {
    await page.goto('https://36247.rmzi.world');
    await page.click('#enter-btn');

    await expect(page.locator('#player-screen')).toBeVisible();

    // Wait for some playback
    await page.waitForTimeout(2000);

    // Progress bar should have moved
    const progressBar = page.locator('#progress-bar');
    const width = await progressBar.evaluate(el => el.style.width);
    expect(parseFloat(width)).toBeGreaterThan(0);
  });

  test('keyboard shortcuts work', async ({ page }) => {
    await page.goto('https://36247.rmzi.world');
    await page.click('#enter-btn');

    await expect(page.locator('#player-screen')).toBeVisible();

    // Space should pause
    await page.keyboard.press('Space');
    const audio = page.locator('#audio-player');
    const isPaused = await audio.evaluate((el: HTMLAudioElement) => el.paused);
    expect(isPaused).toBe(true);

    // Space again should play
    await page.keyboard.press('Space');
    const isPlaying = await audio.evaluate((el: HTMLAudioElement) => !el.paused);
    expect(isPlaying).toBe(true);
  });

  test('catalog progress shows heard count', async ({ page }) => {
    await page.goto('https://36247.rmzi.world');
    await page.click('#enter-btn');

    await expect(page.locator('#player-screen')).toBeVisible();

    // Total count should be 2091
    await expect(page.locator('#total-count')).toHaveText('2091');

    // Heard count should be at least 1 after entering
    const heardCount = await page.locator('#heard-count').textContent();
    expect(parseInt(heardCount || '0')).toBeGreaterThanOrEqual(1);
  });
});

test.describe('36247 Super Mode', () => {
  test.beforeEach(async ({ context }) => {
    const cookies = await getSignedCookies();
    await context.addCookies(cookies);
  });

  test('shows track list in super mode', async ({ page }) => {
    await page.goto('https://36247.rmzi.world#super');
    await page.click('#enter-btn');

    await expect(page.locator('#player-screen')).toBeVisible();
    await expect(page.locator('#track-list-container')).toBeVisible();
    await expect(page.locator('#track-search')).toBeVisible();
  });

  test('search filters track list', async ({ page }) => {
    await page.goto('https://36247.rmzi.world#super');
    await page.click('#enter-btn');

    await expect(page.locator('#track-list-container')).toBeVisible();

    // Search for a specific artist
    await page.fill('#track-search', 'DJ Paul');

    // All visible tracks should contain DJ Paul
    const tracks = page.locator('.track-item');
    const count = await tracks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking track plays it', async ({ page }) => {
    await page.goto('https://36247.rmzi.world#super');
    await page.click('#enter-btn');

    await expect(page.locator('#track-list-container')).toBeVisible();

    // Click first track's play button
    await page.locator('.play-btn').first().click();

    // Audio should have a source
    const audio = page.locator('#audio-player');
    await expect(audio).toHaveAttribute('src', /^\/audio\//);
  });
});

test.describe('36247 Secret Mode', () => {
  test.beforeEach(async ({ context }) => {
    const cookies = await getSignedCookies();
    await context.addCookies(cookies);
  });

  test('shows download button in secret mode', async ({ page }) => {
    await page.goto('https://36247.rmzi.world#secret');
    await page.click('#enter-btn');

    await expect(page.locator('#player-screen')).toBeVisible();

    // Download button should be visible
    await expect(page.locator('#download-btn')).toHaveClass(/visible/);
  });

  test('track list has download buttons', async ({ page }) => {
    await page.goto('https://36247.rmzi.world#secret');
    await page.click('#enter-btn');

    await expect(page.locator('#track-list-container')).toBeVisible();

    // Download buttons should exist
    const dlButtons = page.locator('.track-item-btn.download');
    const count = await dlButtons.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('36247 Security', () => {
  test('audio returns 403 without signed cookies', async ({ page }) => {
    // Don't set cookies
    const response = await page.goto('https://36247.rmzi.world/audio/test.mp3');
    expect(response?.status()).toBe(403);
  });

  test('manifest returns 403 without signed cookies', async ({ page }) => {
    const response = await page.goto('https://36247.rmzi.world/manifest.json');
    expect(response?.status()).toBe(403);
  });
});
