import { test, expect, Page } from '@playwright/test';
import { ORG, USERS, signIn } from './support';

/**
 * The socket's message limit against the largest thing sent over it, a people import (`MEDIA-3`,
 * shared/src/constants/SocketLimits.ts). Only previews, which write nothing.
 */

const HEADER = 'Member ID,Full name,Email,Cellphone,Birthdate,National ID,Role,Guardian 1 name,Guardian 1 email,Guardian 1 cellphone,Guardian 1 relationship,Guardian 2 name,Guardian 2 email,Guardian 2 cellphone,Guardian 2 relationship';

/** A 2,000-row file (`PEOPLE_IMPORT_MAX_ROWS`) with every column filled, names `nameLength` long. */
function peopleFile(nameLength: number) {
  const name = 'N'.repeat(nameLength);
  const rows = Array.from({ length: 2000 }, (_, i) => [
    `LIMIT-${i}`, name, `person.limit.${i}@example.org`, '082 555 0100', '2012-03-05', `A${String(i).padStart(8, '0')}`, 'Member',
    `Guardian One ${name}`, `first.guardian.${i}@example.org`, '082 555 0101', 'Parent',
    `Guardian Two ${name}`, `second.guardian.${i}@example.org`, '082 555 0102', 'Grandparent',
  ].join(','));
  return { name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from([HEADER, ...rows].join('\n')) };
}

async function chooseFile(page: Page, file: ReturnType<typeof peopleFile>) {
  await signIn(page, USERS.sacAdmin);
  await page.goto(`/admin/${ORG.sac}/people/import`);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose a file', { exact: true }).click();
  await (await chooser).setFiles(file);
}

test.describe('The socket message limit', () => {
  test('a people import just under the limit gets through', async ({ page }) => {
    test.setTimeout(120000);
    let largestSent = 0;
    page.on('websocket', ws => ws.on('framesent', frame => { largestSent = Math.max(largestSent, frame.payload.length); }));
    await chooseFile(page, peopleFile(368));
    await expect(page.getByText('to update')).toBeVisible({ timeout: 90000 });
    expect(largestSent).toBeGreaterThan(2.9 * 1024 * 1024);
    expect(largestSent).toBeLessThan(3 * 1024 * 1024);
  });

  test('a file over the limit is refused, saying so', async ({ page }) => {
    await chooseFile(page, peopleFile(1000));
    await expect(page.getByText(/^Too large to send: [\d.]+MB, and the limit is 3MB\. Nothing was saved\. Split the file into smaller ones\.$/)).toBeVisible();
  });
});
