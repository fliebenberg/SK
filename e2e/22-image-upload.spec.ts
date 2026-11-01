import { test, expect, Page } from '@playwright/test';
import { ORG, USERS, signIn } from './support';

/**
 * Pictures are cropped in the app and uploaded on their own (okf/api_comms.md §Uploaded Images,
 * 2026-11-01). The upload is stored at once but used by nothing until a save sends its name; a form
 * closed without saving deletes it straight away.
 *
 * St Aldric's has no logo, so its admin goes straight to the picture library. The picture is wider
 * than tall, and zoomed out to fit: the stored logo is square, with clear space above and below.
 */

const API = process.env.E2E_API_URL || 'http://localhost:3001';
const logoFile = (name: string) => `${API}/uploads/public/logos/${name}_medium.webp`;

/** A 400 × 200 PNG, drawn by the browser so the test needs no image library. */
async function widePicture(page: Page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(200, 40, 40)';
    ctx.fillRect(0, 0, 400, 200);
    return canvas.toDataURL('image/png');
  });
  return { name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

/** Opens the picture library from `open`, picks the wide picture, fits it and uploads it. Answers its name. */
async function uploadWidePicture(page: Page, open: () => Promise<void>) {
  const chooser = page.waitForEvent('filechooser');
  await open();
  await (await chooser).setFiles(await widePicture(page));
  await page.getByRole('button', { name: 'Fit' }).click();
  const uploaded = page.waitForResponse(r => r.url().includes('/api/uploads') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Use picture' }).click();
  const response = await uploaded;
  expect(response.status()).toBe(201);
  await expect(page.getByRole('button', { name: 'Use picture' })).toHaveCount(0);
  return (await response.json()).name as string;
}

test.describe('Picture uploads', () => {
  test('a logo is cropped, uploaded and saved, then removed', async ({ page }) => {
    await signIn(page, USERS.sacAdmin);
    await page.goto(`/admin/${ORG.sac}/profile`);

    const name = await uploadWidePicture(page, () => page.getByLabel('Change the logo').click());

    // Stored square, from a picture twice as wide as tall.
    const stored = await page.request.get(logoFile(name));
    expect(stored.status()).toBe(200);

    // Opening it again shows the logo, with Remove; removing deletes the file.
    await page.getByLabel('Change the logo').click();
    await expect(page.getByText('Choose a new picture')).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Choose a new picture')).toHaveCount(0);
    await expect.poll(async () => (await page.request.get(logoFile(name))).status()).toBe(404);
  });

  // The photo that started this (2026-11-01): a 32KB JPEG refused with a 413, sent inline as base64.
  test('your own photo is uploaded and saved from Settings', async ({ page }) => {
    await signIn(page, USERS.rbhCoach);
    await page.goto('/settings');
    const saved = page.waitForResponse(r => r.url().endsWith('/auth/profile') && r.request().method() === 'PATCH');
    const name = await uploadWidePicture(page, () => page.getByLabel('Change your photo').click());
    const response = await saved;
    expect(response.status()).toBe(200);
    expect((await response.json()).user.customImage).toBe(name);
    await expect(page.getByText('Profile photo updated.')).toBeVisible();
  });

  test('closing a form without saving deletes its upload', async ({ page }) => {
    await signIn(page, USERS.sacAdmin);
    await page.goto(`/admin/${ORG.sac}/leagues`);
    await page.getByLabel('New league').click();

    const name = await uploadWidePicture(page, () => page.getByLabel('Choose the league logo').click());
    expect((await page.request.get(logoFile(name))).status()).toBe(200);

    const discarded = page.waitForRequest(r => r.url().endsWith(`/api/uploads/${name}`) && r.method() === 'DELETE');
    await page.getByText('Cancel', { exact: true }).click();
    await discarded;
    await expect.poll(async () => (await page.request.get(logoFile(name))).status()).toBe(404);
  });

  /** In a form, Remove only empties the field: the dialog closes and Save does the rest. */
  async function removeLogo(page: Page, label: string) {
    await page.getByLabel(label).click();
    await expect(page.getByText('Choose a new picture')).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Choose a new picture')).toHaveCount(0);
  }

  /** The saved logo stays until Save: Cancel brings it back, and Save deletes its file. */
  async function removeSavedLogo(page: Page, label: string, name: string) {
    const unsaved = page.getByText('Unsaved Changes');
    await removeLogo(page, label);
    await expect(unsaved).toBeVisible();
    expect((await page.request.get(logoFile(name))).status()).toBe(200);
    await page.getByText('Cancel', { exact: true }).click();
    await expect(unsaved).toHaveCount(0);

    await removeLogo(page, label);
    await page.getByText('Save', { exact: true }).click();
    await expect(unsaved).toHaveCount(0);
    await expect.poll(async () => (await page.request.get(logoFile(name))).status()).toBe(404);
  }

  test("a new league's and season's logo, and a saved one, can be removed", async ({ page }) => {
    await signIn(page, USERS.sacAdmin);
    await page.goto(`/admin/${ORG.sac}/leagues`);

    // A new league: a logo chosen by mistake can be taken out again, and its upload goes with it.
    await page.getByLabel('New league').click();
    const mistake = await uploadWidePicture(page, () => page.getByLabel('Choose the league logo').click());
    await removeLogo(page, 'Choose the league logo');
    await expect.poll(async () => (await page.request.get(logoFile(mistake))).status()).toBe(404);

    const leagueLogo = await uploadWidePicture(page, () => page.getByLabel('Choose the league logo').click());
    await page.getByPlaceholder('e.g. Western Province U19 Rugby').fill('Logo Test League');
    await page.getByText('Select a Sport').click();
    await page.getByRole('button', { name: 'Rugby', exact: true }).click();
    await page.getByText('Create League', { exact: true }).click();
    await page.getByLabel('Edit Logo Test League').click();

    // A new season, the same.
    await page.getByText('New Season', { exact: true }).click();
    const seasonMistake = await uploadWidePicture(page, () => page.getByLabel('Choose the season logo').click());
    await removeLogo(page, 'Choose the season logo');
    await expect.poll(async () => (await page.request.get(logoFile(seasonMistake))).status()).toBe(404);

    const seasonLogo = await uploadWidePicture(page, () => page.getByLabel('Choose the season logo').click());
    await page.getByPlaceholder('e.g. 2026 Season').fill('Logo Test Season');
    await page.getByLabel('Start date').fill('2027-01-01');
    await page.getByLabel('End date').fill('2027-06-30');
    await page.getByText('Create Season', { exact: true }).click();
    await expect(page.getByText('Logo Test Season')).toBeVisible();

    // The saved league logo.
    await removeSavedLogo(page, 'Change the league logo', leagueLogo);

    // The saved season logo.
    await page.getByLabel('Edit Logo Test Season').click();
    await page.getByText('Settings', { exact: true }).last().click();
    await removeSavedLogo(page, 'Change the season logo', seasonLogo);
  });
});
