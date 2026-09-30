import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { PeopleImportReport, PeopleImportRow, SocketAction } from '@sk/shared';
import pool, { query } from '../db';
import { fixtureIds } from './setup/fixtures/testOrgs';

/**
 * Importing people and their guardians (`IMPORT_ORG_PEOPLE`), end to end over a real socket against
 * the test organisations (Doringkloof).
 *
 *  - Who may import: Admin or Staff of the org, and nobody else.
 *  - A preview writes nothing, and says per row what an apply would do: new, update, unchanged, or
 *    refused, with the reasons.
 *  - An apply with a refused row writes nothing at all.
 *  - An apply writes people, memberships, guardian profiles and links in one go; a guardian shared
 *    by brothers and sisters is one profile; the first guardian is the primary one; guardians get
 *    no membership.
 *  - A retry with the same key writes nothing twice; importing the same sheet again changes nothing.
 *  - What an import will not do: make an Admin, change an Admin's role, change the email of
 *    someone on ScoreKeeper.
 *
 * Needs a server on the same database: `PORT=3099 npx ts-node src/index.ts`, then
 * `SOCKET_URL=http://localhost:3099 npx ts-node src/scripts/test-people-import.ts`. The import makes
 * its own ids, so what it adds is found for cleanup by the markers below (`PI-` Member IDs, the
 * `people-import.test` domain, "PI Test" names) and removed at the end; every fixture row it
 * changes is put back.
 */

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3099';
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';

const DKL = fixtureIds.org('dkl');
const ADMIN = fixtureIds.user('Johan van der Merwe');
const STAFF = fixtureIds.user('Annelie Botha');
const MEMBER = fixtureIds.user('Francois Marais');
const STRANGER = fixtureIds.user('Catherine Whitfield'); // St Aldric's admin

const HENNIE = fixtureIds.profile('dkl', 'Hennie Steyn'); // a coach with an email and no account
const FRANCOIS = fixtureIds.profile('dkl', 'Francois Marais'); // a Member with an account
const JOHAN = fixtureIds.profile('dkl', 'Johan van der Merwe'); // the Admin
const TOUCHED = [HENNIE, FRANCOIS, JOHAN];

const DOMAIN = 'people-import.test';
const SHARED_PARENT = `shared.parent@${DOMAIN}`;
/** Idempotency keys unique to this run: the server remembers a key for ten minutes, across runs. */
const RUN = `test-people-import-${Date.now()}`;

let checks = 0;
const failures: string[] = [];
function expect(actual: unknown, expected: unknown, what: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

function connect(userId: string): Promise<Socket> {
  const token = jwt.sign({ id: userId }, JWT_SECRET);
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, { transports: ['websocket'], reconnection: false, auth: { token } });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function send(socket: Socket, type: SocketAction, payload: any): Promise<any> {
  return new Promise((resolve) => socket.emit('action', { type, payload }, resolve));
}

/** The next message of `type` on `room`, joining it first. */
function nextMessage(socket: Socket, room: string, type: string): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socket.off('update', onUpdate); resolve(null); }, 8000);
    const onUpdate = (message: any) => {
      if (message?.topic !== room || message?.type !== type) return;
      clearTimeout(timer);
      socket.off('update', onUpdate);
      resolve(message.data);
    };
    socket.on('update', onUpdate);
  });
}

const importPeople = (socket: Socket, rows: PeopleImportRow[], mode: 'preview' | 'apply', idempotencyKey?: string) =>
  send(socket, SocketAction.IMPORT_ORG_PEOPLE, { orgId: DKL, rows, mode, idempotencyKey });

const outcomes = (report: PeopleImportReport | undefined) => report?.rows?.map(r => r.outcome);

/** The rows this test imports first. Rows 7 and 8 are refused. */
const SHEET: PeopleImportRow[] = [
  {
    rowNumber: 2, identifier: 'PI-1', name: 'PI Test Kid One', email: `kid.one@${DOMAIN}`, birthdate: '2013-01-01',
    guardians: [{ name: 'PI Test Shared Parent', email: SHARED_PARENT }],
  },
  {
    rowNumber: 3, identifier: 'PI-2', name: 'PI Test Kid Two', birthdate: '2015-06-30', role: 'Member',
    guardians: [
      { name: 'PI Test Shared Parent', email: SHARED_PARENT.toUpperCase() },
      { name: 'PI Test Gran', cellphone: '082 000 0001', relationship: 'Grandparent' },
    ],
  },
  // Hennie, matched by email: gains a cellphone, and becomes Staff.
  { rowNumber: 4, name: 'Hennie Steyn', email: 'hennie.steyn@doringkloof.test', cellphone: '082 000 0003', role: 'Staff' },
  // Francois, matched by email, nothing new.
  { rowNumber: 5, name: 'Francois Marais', email: 'francois.marais@doringkloof.test' },
  // The Admin, asked to be Staff: left an Admin.
  { rowNumber: 6, name: 'Johan van der Merwe', email: 'johan.vandermerwe@doringkloof.test', role: 'Staff' },
  { rowNumber: 7, identifier: 'PI-7', name: 'PI Test Would Be Admin', role: 'Admin' },
  { rowNumber: 8, identifier: 'PI-8', name: 'PI Test Same Email', email: `same@${DOMAIN}`, guardians: [{ name: 'PI Test Twin', email: `same@${DOMAIN}` }] },
];
const GOOD_ROWS = SHEET.slice(0, 5);

async function snapshot() {
  const profiles = (await query(`SELECT id, name, email, cellphone, identifier FROM org_profiles WHERE id = ANY($1)`, [TOUCHED])).rows;
  const memberships = (await query(
    `SELECT id, org_profile_id, role_id FROM org_memberships WHERE org_profile_id = ANY($1) AND org_id = $2 AND end_date IS NULL`,
    [TOUCHED, DKL]
  )).rows;
  const org = (await query(`SELECT settings FROM organizations WHERE id = $1`, [DKL])).rows[0];
  return { profiles, memberships, settings: org?.settings };
}

/** Every profile this test's imports can have created. */
async function importedProfileIds(): Promise<string[]> {
  return (await query(
    `SELECT id FROM org_profiles
      WHERE org_id = $1 AND (identifier LIKE 'PI-%' OR email LIKE $2 OR name LIKE 'PI Test%')
        AND id <> ALL($3)`,
    [DKL, `%@${DOMAIN}`, TOUCHED]
  )).rows.map((r: any) => r.id);
}

async function teardown(original: Awaited<ReturnType<typeof snapshot>>) {
  const ids = await importedProfileIds();
  await query(`DELETE FROM profile_guardians WHERE player_profile_id = ANY($1) OR guardian_profile_id = ANY($1)`, [ids]);
  await query(`DELETE FROM org_memberships WHERE org_profile_id = ANY($1)`, [ids]);
  await query(`DELETE FROM org_profiles WHERE id = ANY($1)`, [ids]);
  for (const p of original.profiles) {
    await query(`UPDATE org_profiles SET name = $2, email = $3, cellphone = $4, identifier = $5 WHERE id = $1`,
      [p.id, p.name, p.email, p.cellphone, p.identifier]);
  }
  // A membership the import gave a fixture profile goes; one it re-roled gets its role back.
  const kept = original.memberships.map((m: any) => m.id);
  await query(`DELETE FROM org_memberships WHERE org_profile_id = ANY($1) AND org_id = $2 AND id <> ALL($3)`, [TOUCHED, DKL, kept]);
  for (const m of original.memberships) await query(`UPDATE org_memberships SET role_id = $2 WHERE id = $1`, [m.id, m.role_id]);
  await query(`UPDATE organizations SET settings = $2 WHERE id = $1`, [DKL, original.settings]);
}

async function main() {
  const original = await snapshot();
  if (!original.settings && !original.profiles.length) {
    throw new Error('The test organisations are not loaded — run `npm run db:test-orgs`.');
  }
  // Start clean, whatever an interrupted run left behind.
  await teardown(original);
  // Minors off, with the default age: the state a new organisation is in.
  await query(`UPDATE organizations SET settings = COALESCE(settings, '{}'::jsonb) - 'minors' WHERE id = $1`, [DKL]);

  const admin = await connect(ADMIN);
  const staff = await connect(STAFF);
  const member = await connect(MEMBER);
  const stranger = await connect(STRANGER);
  const sockets = [admin, staff, member, stranger];

  try {
    // --- Who may import --------------------------------------------------------------------------
    expect((await importPeople(member, GOOD_ROWS, 'preview'))?.status, 'error', 'a plain member cannot import');
    expect((await importPeople(stranger, GOOD_ROWS, 'preview'))?.status, 'error', "another org's admin cannot import");
    expect((await send(staff, SocketAction.IMPORT_ORG_PEOPLE, { orgId: DKL, rows: GOOD_ROWS, mode: 'write' }))?.status, 'error', 'an unknown mode is refused');

    // --- Preview ---------------------------------------------------------------------------------
    const preview = await importPeople(staff, SHEET, 'preview');
    expect(preview?.status, 'ok', 'staff can preview');
    const report: PeopleImportReport = preview.data;
    expect(outcomes(report), ['new', 'new', 'update', 'unchanged', 'unchanged', 'error', 'error'], 'each row says what it would do');
    expect(report.counts, { new: 2, update: 1, unchanged: 2, error: 2, newGuardians: 2, newGuardianLinks: 3 }, 'the preview counts');
    expect(report.rows[1].guardians, [
      { position: 1, name: 'PI Test Shared Parent', profile: 'new', link: 'new' },
      { position: 2, name: 'PI Test Gran', profile: 'new', link: 'new' },
    ], "a sibling's guardians");
    expect(report.rows[2].changes.map(c => c.field), ['Cellphone', 'Role'], "Hennie's changes");
    expect(report.rows[4].warnings.some(w => w.includes('an import does not change an Admin')), true, "the Admin's role is left alone, and it says so");
    expect(report.rows[5].errors[0].includes('cannot make someone an Admin'), true, 'an Admin row is refused');
    expect(report.rows[6].errors, ['Guardian 1 has the same email as the person. Give each their own.'], 'a guardian may not share the email');
    expect(report.rows[0].warnings.some(w => w.includes('counts as a minor')), true, 'a minor with an email is warned about');
    expect((await importedProfileIds()).length, 0, 'a preview writes nothing');

    // --- An apply with a refused row writes nothing ---------------------------------------------
    const refused = await importPeople(staff, SHEET, 'apply');
    expect(refused?.status, 'error', 'an apply with refused rows is refused');
    expect(typeof refused?.message === 'string' && refused.message.startsWith('2 rows have problems, so nothing was imported.'), true, 'and says so');
    expect((await importedProfileIds()).length, 0, 'and writes nothing');

    // --- Apply -----------------------------------------------------------------------------------
    const joined = nextMessage(admin, `org:${DKL}:members`, 'ORG_MEMBERS_SYNC');
    admin.emit('join_room', `org:${DKL}:members`);
    await joined; // the join's own snapshot
    const membersBroadcast = nextMessage(admin, `org:${DKL}:members`, 'ORG_MEMBERS_SYNC');

    const applied = await importPeople(staff, GOOD_ROWS, 'apply', `${RUN}-1`);
    expect(applied?.status, 'ok', 'staff can apply');
    expect(applied?.data?.counts, { new: 2, update: 1, unchanged: 2, error: 0, newGuardians: 2, newGuardianLinks: 3 }, 'the apply counts');
    const members = await membersBroadcast;
    expect(Array.isArray(members) && members.some((m: any) => m.name === 'PI Test Kid One'), true, 'the People screens get the whole new list, once');

    const kids = (await query(
      `SELECT op.identifier, om.role_id FROM org_profiles op
         JOIN org_memberships om ON om.org_profile_id = op.id AND om.end_date IS NULL
        WHERE op.org_id = $1 AND op.identifier IN ('PI-1', 'PI-2') ORDER BY op.identifier`,
      [DKL]
    )).rows;
    expect(kids, [{ identifier: 'PI-1', role_id: 'role-org-member' }, { identifier: 'PI-2', role_id: 'role-org-member' }], 'new people are Members');

    const guardians = (await query(
      `SELECT g.name, g.email, g.cellphone, p.identifier AS player, pg.relationship, pg.is_primary,
              EXISTS (SELECT 1 FROM org_memberships om WHERE om.org_profile_id = g.id) AS member
         FROM profile_guardians pg
         JOIN org_profiles g ON g.id = pg.guardian_profile_id
         JOIN org_profiles p ON p.id = pg.player_profile_id
        WHERE pg.org_id = $1 AND p.identifier LIKE 'PI-%'
        ORDER BY p.identifier, pg.is_primary DESC`,
      [DKL]
    )).rows;
    expect(guardians, [
      { name: 'PI Test Shared Parent', email: SHARED_PARENT, cellphone: null, player: 'PI-1', relationship: 'parent', is_primary: true, member: false },
      { name: 'PI Test Shared Parent', email: SHARED_PARENT, cellphone: null, player: 'PI-2', relationship: 'parent', is_primary: true, member: false },
      { name: 'PI Test Gran', email: null, cellphone: '082 000 0001', player: 'PI-2', relationship: 'grandparent', is_primary: false, member: false },
    ], 'guardians: one profile per person, the first is primary, and none is a member');

    const hennie = (await query(
      `SELECT op.cellphone, om.role_id FROM org_profiles op
         JOIN org_memberships om ON om.org_profile_id = op.id AND om.end_date IS NULL AND om.org_id = $2
        WHERE op.id = $1`,
      [HENNIE, DKL]
    )).rows;
    expect(hennie, [{ cellphone: '082 000 0003', role_id: 'role-org-staff' }], 'Hennie is updated');
    const johan = (await query(`SELECT role_id FROM org_memberships WHERE org_profile_id = $1 AND end_date IS NULL`, [JOHAN])).rows;
    expect(johan, [{ role_id: 'role-org-admin' }], 'the Admin is still an Admin');

    // --- Retrying, and importing the same sheet again -------------------------------------------
    const replay = await importPeople(staff, GOOD_ROWS, 'apply', `${RUN}-1`);
    expect(replay?.data?.replayed, true, 'a retry with the same key is a replay');
    expect((await importedProfileIds()).length, 4, 'and writes nothing twice (two kids, two guardians)');

    const again = await importPeople(staff, GOOD_ROWS, 'apply', `${RUN}-2`);
    if (again?.status !== 'ok') console.error('second import:', again);
    expect(outcomes(again?.data), ['unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged'], 'the same sheet again changes nothing');
    expect(again?.data?.counts?.newGuardianLinks, 0, 'and links nobody twice');

    // --- What an import will not do ------------------------------------------------------------
    const francoisId = original.profiles.find((p: any) => p.id === FRANCOIS)?.identifier;
    const moveEmail = await importPeople(admin, [{ rowNumber: 2, identifier: francoisId, name: 'Francois Marais', email: `francois.new@${DOMAIN}` }], 'preview');
    expect(moveEmail?.data?.rows?.[0]?.outcome, 'unchanged', "the email of someone on ScoreKeeper is not changed");
    expect(moveEmail?.data?.rows?.[0]?.warnings?.[0]?.startsWith('Email not changed'), true, 'and it says so');

    const namesake = await importPeople(admin, [{ rowNumber: 2, name: 'Hennie Steyn' }], 'preview');
    expect(namesake?.data?.rows?.[0]?.outcome, 'new', 'a name alone never matches');
    expect(namesake?.data?.rows?.[0]?.warnings?.[0]?.startsWith('There is already a Hennie Steyn on record'), true, 'but it is flagged as a possible duplicate');

    const wrongId = await importPeople(admin, [{ rowNumber: 2, identifier: 'PI-3', name: 'Hennie Steyn', email: 'hennie.steyn@doringkloof.test' }], 'preview');
    expect(wrongId?.data?.rows?.[0]?.errors?.[0]?.includes('whose Member ID is'), true, 'an email whose owner has another Member ID is refused');

    const twice = await importPeople(admin, [
      { rowNumber: 2, identifier: 'PI-9', name: 'PI Test A' },
      { rowNumber: 3, identifier: 'PI-9', name: 'PI Test B' },
    ], 'preview');
    expect(twice?.data?.counts?.error, 2, 'the same Member ID on two rows refuses both');
  } finally {
    sockets.forEach(s => s.disconnect());
    await teardown(original);
    await pool.end();
  }

  if (failures.length) {
    console.error(`test-people-import: ${failures.length} of ${checks} checks failed`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`test-people-import: all ${checks} checks passed`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
