/**
 * The test organisations: a fixed, made-up dataset that `db:seed` loads into every development
 * database and `db:test:setup` loads into the test database. It is the base every test starts
 * from — a test that needs an edge case adds it on top rather than editing this file.
 *
 * **Reproducible to the byte.** Every id, date and password hash below is a literal or is
 * derived from one; nothing calls `Date.now()`, `NOW()` or a random generator. Deleting the
 * organisations (`npm run db:test-orgs`) and loading them again gives exactly the same rows.
 *
 * **Ids are readable and derived from names**, so a test can name what it expects:
 *
 *     organisation   fx-org-<org>                    fx-org-dkl
 *     team           fx-team-<org>-<team>            fx-team-dkl-rugby-u16a
 *     profile        fx-prof-<org>-<name>            fx-prof-dkl-ruan-potgieter
 *     user account   fx-user-<name>                  fx-user-pieter-joubert
 *     facility       fx-fac-<org>-<facility>         fx-fac-dkl-a-field
 *
 * `fx-` ("fixture") marks every row this file owns, and nothing else in the app uses it — the
 * integration scripts' own throwaway rows are `test-…`. `fixtureIds` builds each id, so a test
 * imports the helper instead of spelling the id out.
 *
 * Names must be unique within an organisation, because the profile id is built from the name.
 * The one person in two organisations (Lerato Mokoena) is deliberate: one user account, a
 * profile in each.
 */

/** The password of every fixture account. */
export const FIXTURE_PASSWORD = 'Test1234!';

/**
 * bcrypt of `FIXTURE_PASSWORD`, fixed so the `users` rows are identical on every load (a fresh
 * hash has a fresh salt). The loader checks it still matches the password.
 */
export const FIXTURE_PASSWORD_HASH = '$2b$10$mdoK4gRn7fZI/vT6g8xUBeY2OC.ekGUOffa9yAfKsQc4YLvDIZ3Ya';

/** When the fixture accounts were "created" and their emails verified. */
export const FIXTURE_ACCOUNTS_CREATED = '2026-01-10T08:00:00Z';

/** When every membership starts, unless the person says otherwise. */
export const FIXTURE_MEMBERSHIP_START = '2026-01-15T00:00:00Z';

export const FIXTURE_ORG_ROLES = ['role-org-admin', 'role-org-staff', 'role-org-member'] as const;

export interface FixturePerson {
    name: string;
    /** Staff and account holders have one; most players do not. */
    email?: string;
    /** Gets a login account with `FIXTURE_PASSWORD`. */
    account?: boolean;
}

export interface FixturePlayer extends FixturePerson {
    /** The day this player left the organisation and the team. Absent means still a member. */
    left?: string;
}

export interface FixtureTeam {
    /** Unique within the organisation; part of the team id. */
    key: string;
    name: string;
    sportId: 'rugby' | 'netball';
    /** A starter age group name (see ageGroupSeed.ts). */
    ageGroup: string;
    /** Shown on the team's crest (docs/teams.md). Absent: the crest shows the age group. */
    shortName?: string;
    /** Deactivated: kept, but not offered when picking teams for new games. */
    inactive?: boolean;
    /** Players are born in this year; the day within it comes from their position in the list. */
    birthYear: number;
    /** Absent only on a team with no people yet — add such a team last, so no org ID moves. */
    coach?: FixturePerson;
    /** A plain string is a player with no email and no account. */
    players: (string | FixturePlayer)[];
}

/** A member in no team — an adult on the roster, say. */
export interface FixtureMember extends FixturePerson {
    role: (typeof FIXTURE_ORG_ROLES)[number];
    birthdate?: string;
}

/**
 * Someone who answers for one or more people in the organisation (`MEMBER-3`). A guardian who is
 * not already listed in the organisation gets a profile with **no membership and no org ID**, as
 * the app makes them; one who is (a staff member who is also a parent) is linked through the
 * profile they already have.
 */
export interface FixtureGuardian extends FixturePerson {
    /** International form, as the app stores it. */
    cellphone?: string;
    children: {
        /** A person listed in this organisation. */
        name: string;
        relationship: 'parent' | 'guardian' | 'grandparent' | 'other';
        /** One active primary per child. */
        primary?: boolean;
        /** When the link ended. Absent means current. */
        ended?: string;
    }[];
}

/**
 * Someone already listed in the organisation, on a team's staff in a role other than Coach — so
 * a team has a manager and an assistant without anybody new, whose org ID would move others'.
 */
export interface FixtureTeamStaff {
    /** A team key in this organisation. */
    team: string;
    /** A person already listed in this organisation. */
    name: string;
    role: 'role-assistant-coach' | 'role-manager' | 'role-scorer' | 'role-medic' | 'role-staff';
}

/**
 * A game one of the organisation's teams plays, in an event of its own (a single match, as the
 * app makes them). Loaded after every organisation, since the other side is another one's team.
 * Dates are fixed, like everything here, so "upcoming" games stay Scheduled after their day.
 */
export interface FixtureGame {
    /** Unique within the organisation; part of the event, game and participant ids. */
    key: string;
    /** The event's name — what the team page shows as the competition. */
    event: string;
    /** A team key in this organisation. */
    team: string;
    /** Another test organisation's team. */
    opponent: { org: string; team: string };
    /** At this organisation's site, and this team listed first; otherwise the opponent hosts. */
    home: boolean;
    /** Kick-off, an instant. */
    kickoff: string;
    /** The kick-off time is not set yet (noon venue time, as the app stores it). */
    timeTbd?: boolean;
    status: 'Scheduled' | 'Finished' | 'Cancelled';
    /** This team's score, then the opponent's. */
    score?: [number, number];
    /** Finished, with the result recorded as not provided. */
    scoreNotProvided?: boolean;
}

export interface FixtureFacility {
    key: string;
    name: string;
    sportId: 'rugby' | 'netball';
}

export interface FixtureOrg {
    /** Short, lowercase; part of every id this organisation owns. */
    key: string;
    name: string;
    shortName: string;
    type: 'SCHOOL' | 'CLUB';
    primaryColor: string;
    secondaryColor: string;
    address: {
        line1: string;
        city: string;
        province: string;
        postalCode: string;
        latitude: number;
        longitude: number;
    };
    site: { name: string; facilities: FixtureFacility[] };
    admin: FixturePerson;
    staff: FixturePerson[];
    teams: FixtureTeam[];
    /**
     * Loaded after the teams, so adding one never moves anybody's org ID (`DKL0043`…), which the
     * people-import sample and its tests name.
     */
    members?: FixtureMember[];
    guardians?: FixtureGuardian[];
    teamStaff?: FixtureTeamStaff[];
    games?: FixtureGame[];
}

const STANDARD_FACILITIES: FixtureFacility[] = [
    { key: 'a-field', name: 'A Field', sportId: 'rugby' },
    { key: 'b-field', name: 'B Field', sportId: 'rugby' },
    { key: 'court-1', name: 'Netball Court 1', sportId: 'netball' },
    { key: 'court-2', name: 'Netball Court 2', sportId: 'netball' },
    { key: 'court-3', name: 'Netball Court 3', sportId: 'netball' },
];

export const TEST_ORGS: FixtureOrg[] = [
    {
        key: 'dkl',
        name: 'Test Hoërskool Doringkloof',
        shortName: 'DKL',
        type: 'SCHOOL',
        primaryColor: '#7A1F2B',
        secondaryColor: '#E0B040',
        address: { line1: '12 Kiepersol Avenue', city: 'Centurion', province: 'Gauteng', postalCode: '0157', latitude: -25.8603, longitude: 28.1894 },
        site: { name: 'Main Campus', facilities: STANDARD_FACILITIES },
        admin: { name: 'Johan van der Merwe', email: 'johan.vandermerwe@doringkloof.test', account: true },
        staff: [
            { name: 'Annelie Botha', email: 'annelie.botha@doringkloof.test', account: true },
            { name: 'Lerato Mokoena', email: 'lerato.mokoena@doringkloof.test', account: true },
        ],
        teams: [
            {
                key: 'rugby-u16a', name: 'U16 A', shortName: 'U16A', sportId: 'rugby', ageGroup: 'U16', birthYear: 2010,
                coach: { name: 'Pieter Joubert', email: 'pieter.joubert@doringkloof.test', account: true },
                players: [
                    'Ruan Potgieter', 'Jaco Swanepoel', 'Wian Kruger', 'Thabo Maseko', 'Divan Olivier',
                    'Christo Lombard', 'Neo Mahlangu', 'Bernard Visser', 'Hanro Smit', 'Kagiso Sithole',
                    'Dian Ferreira', 'Marco du Plessis', 'Jandré Nieuwoudt', 'Lwazi Ndlovu', 'Stefan Engelbrecht',
                    'Tiaan Vermeulen', 'Morné Bester', 'Karabo Nkosi',
                ],
            },
            {
                key: 'rugby-1stxv', name: '1st XV', shortName: '1XV', sportId: 'rugby', ageGroup: 'U19', birthYear: 2008,
                coach: { name: 'Hennie Steyn', email: 'hennie.steyn@doringkloof.test' },
                players: [
                    { name: 'Francois Marais', email: 'francois.marais@doringkloof.test', account: true },
                    'Wikus Labuschagne', 'Sibusiso Khumalo', 'Gerhard Roux', 'Andries Fourie',
                    'Tshepo Radebe', 'Louis Meyer', 'Heinrich Bosman', 'Jurie Theron', 'Mpho Tau',
                    'Johannes Pienaar', 'Werner Erasmus', 'Lebo Mashaba', 'Charl Hattingh', 'Albertus de Beer',
                    'Quinton Els', 'Deon Scholtz', 'Brandon Viljoen',
                ],
            },
            {
                key: 'netball-u14a', name: 'U14 A', shortName: 'NB14A', sportId: 'netball', ageGroup: 'U14', birthYear: 2012,
                coach: { name: 'Marelize Coetzee', email: 'marelize.coetzee@doringkloof.test' },
                players: [
                    'Anika Kotzé', 'Mia Strydom', 'Zanele Mkhize', 'Carla Rossouw', 'Liné Janse van Rensburg',
                    'Palesa Moloi', 'Elri de Wet', 'Kayla Bezuidenhout', 'Nandi Shabalala', 'Chanté Grobler',
                ],
            },
            {
                key: 'netball-u16a', name: 'U16 A', sportId: 'netball', ageGroup: 'U16', birthYear: 2010,
                coach: { name: 'Sonja Pretorius', email: 'sonja.pretorius@doringkloof.test' },
                players: [
                    'Marli Wessels', 'Refilwe Maake', 'Inge van Wyk', 'Lize Oosthuizen', 'Tumi Letsoalo',
                    'Danielle Nortje', 'Amoré Blignaut', 'Thandeka Zwane', 'Jana Steenkamp', 'Bianca Cronjé',
                ],
            },
            // Two teams with nobody in them, last so no org ID moves (docs/teams.md): one just
            // created, and one deactivated.
            { key: 'netball-u19a', name: 'U19 A', sportId: 'netball', ageGroup: 'U19', birthYear: 2008, players: [] },
            { key: 'rugby-u15a', name: 'U15 A', shortName: 'U15A', sportId: 'rugby', ageGroup: 'U15', birthYear: 2011, inactive: true, players: [] },
        ],
        // U16 A's staff beyond its coach, from people already listed.
        teamStaff: [
            { team: 'rugby-u16a', name: 'Annelie Botha', role: 'role-manager' },
            { team: 'rugby-u16a', name: 'Marelize Coetzee', role: 'role-assistant-coach' },
        ],
        // U16 A's season, for the team page's Games card: wins, a draw, a loss, a result recorded
        // as not provided, a cancelled game, and three to come — one with its time not set.
        games: [
            { key: 'u16a-r1', event: 'Winter league round 1', team: 'rugby-u16a', opponent: { org: 'sac', team: 'rugby-u16a' }, home: true, kickoff: '2026-08-15T08:00:00Z', status: 'Finished', score: [21, 10] },
            { key: 'u16a-r2', event: 'Winter league round 2', team: 'rugby-u16a', opponent: { org: 'rbh', team: 'rugby-u16a' }, home: false, kickoff: '2026-08-22T08:30:00Z', status: 'Finished', score: [14, 14] },
            { key: 'u16a-r3', event: 'Winter league round 3', team: 'rugby-u16a', opponent: { org: 'ksc', team: 'rugby-u16' }, home: true, kickoff: '2026-08-29T08:00:00Z', status: 'Finished', score: [7, 19] },
            { key: 'u16a-friendly', event: 'Friendly', team: 'rugby-u16a', opponent: { org: 'sac', team: 'rugby-u16a' }, home: false, kickoff: '2026-09-05T08:00:00Z', status: 'Finished', scoreNotProvided: true },
            { key: 'u16a-r4', event: 'Winter league round 4', team: 'rugby-u16a', opponent: { org: 'rbh', team: 'rugby-u16a' }, home: true, kickoff: '2026-09-12T08:00:00Z', status: 'Finished', score: [31, 5] },
            { key: 'u16a-r5', event: 'Winter league round 5', team: 'rugby-u16a', opponent: { org: 'ksc', team: 'rugby-u16' }, home: false, kickoff: '2026-09-19T08:00:00Z', status: 'Cancelled' },
            { key: 'u16a-r6', event: 'Winter league round 6', team: 'rugby-u16a', opponent: { org: 'sac', team: 'rugby-u16a' }, home: true, kickoff: '2026-10-10T07:00:00Z', status: 'Scheduled' },
            { key: 'u16a-r7', event: 'Winter league round 7', team: 'rugby-u16a', opponent: { org: 'rbh', team: 'rugby-u16a' }, home: false, kickoff: '2026-10-17T08:30:00Z', status: 'Scheduled' },
            { key: 'u16a-r8', event: 'Winter league round 8', team: 'rugby-u16a', opponent: { org: 'ksc', team: 'rugby-u16' }, home: true, kickoff: '2026-10-24T10:00:00Z', timeTbd: true, status: 'Scheduled' },
        ],
        members: [
            // An adult with a guardian: a *dependant* (docs/people.md §4). The app treats him as a
            // minor; the screens call him a dependant.
            { name: 'Daniel Pretorius', email: 'daniel.pretorius@doringkloof.test', role: 'role-org-member', birthdate: '1999-11-09' },
        ],
        // Guardians, one deliberate case each. None is on a player a test relies on (Anika Kotzé
        // and Mia Strydom start with no guardian in test-guardians.ts).
        guardians: [
            // The dependant's guardian.
            { name: 'Marieta Pretorius', email: 'marieta.pretorius@example.test', cellphone: '+27825550201',
              children: [{ name: 'Daniel Pretorius', relationship: 'parent', primary: true }] },
            // A minor with two guardians: a parent with an account (log in to see My Family) and a
            // grandparent with a cellphone and no email.
            { name: 'Busisiwe Mkhize', email: 'busisiwe.mkhize@example.test', cellphone: '+27825550202', account: true,
              children: [{ name: 'Zanele Mkhize', relationship: 'parent', primary: true }] },
            { name: 'Nomathemba Mkhize', cellphone: '+27825550203',
              children: [{ name: 'Zanele Mkhize', relationship: 'grandparent' }] },
            // One guardian for three children: the hostel father of three boarders. Primary for two;
            // for Palesa her mother is primary and he is the second guardian.
            { name: 'Dirk Hanekom', email: 'dirk.hanekom@doringkloof.test', cellphone: '+27825550204',
              children: [
                  { name: 'Neo Mahlangu', relationship: 'guardian', primary: true },
                  { name: 'Nandi Shabalala', relationship: 'guardian', primary: true },
                  { name: 'Palesa Moloi', relationship: 'guardian' },
              ] },
            { name: 'Refiloe Moloi', email: 'refiloe.moloi@example.test',
              children: [{ name: 'Palesa Moloi', relationship: 'parent', primary: true }] },
            // A guardian who is also a member here (staff, with an account): linked through her own
            // profile, not given a second one.
            { name: 'Lerato Mokoena', email: 'lerato.mokoena@doringkloof.test', account: true,
              children: [{ name: 'Tumi Letsoalo', relationship: 'parent', primary: true }] },
            // An ended link: the father was the guardian until 30 June; the mother is now.
            { name: 'Willie Rossouw', email: 'willie.rossouw@example.test',
              children: [{ name: 'Carla Rossouw', relationship: 'parent', primary: true, ended: '2026-06-30T00:00:00Z' }] },
            { name: 'Elsa Rossouw', email: 'elsa.rossouw@example.test', cellphone: '+27825550205',
              children: [{ name: 'Carla Rossouw', relationship: 'parent', primary: true }] },
            // One parent, two organisations: one account, a guardian profile here and at
            // Kwaggafontein, a child in each.
            { name: 'Elmarie Kruger', email: 'elmarie.kruger@example.test', cellphone: '+27825550206', account: true,
              children: [{ name: 'Wian Kruger', relationship: 'parent', primary: true }] },
        ],
    },
    {
        key: 'sac',
        name: "Test St Aldric's College",
        shortName: 'SAC',
        type: 'SCHOOL',
        primaryColor: '#1B2A4A',
        secondaryColor: '#8FB8DE',
        address: { line1: '3 Dorp Street', city: 'Stellenbosch', province: 'Western Cape', postalCode: '7600', latitude: -33.9346, longitude: 18.8602 },
        site: { name: 'College Grounds', facilities: STANDARD_FACILITIES },
        admin: { name: 'Catherine Whitfield', email: 'catherine.whitfield@staldrics.test', account: true },
        staff: [
            { name: 'Graham Hendricks', email: 'graham.hendricks@staldrics.test', account: true },
        ],
        teams: [
            {
                key: 'rugby-u16a', name: 'U16 A', sportId: 'rugby', ageGroup: 'U16', birthYear: 2010,
                coach: { name: "Brendan O'Neill", email: 'brendan.oneill@staldrics.test', account: true },
                players: [
                    'Liam Harding', 'Ethan Daniels', 'Cameron Solomons', 'Josh Fredericks', 'Aidan McKenzie',
                    'Matthew Isaacs', 'Yusuf Abrahams', 'Connor Wilson', 'Dylan Arendse', 'Kyle Paulse',
                    'Siyabonga Mfeka', 'Nathan Cloete', 'Ryan Booysen', 'Luke Gelderblom', 'Tristan Mouton',
                    'Jared Williams', 'Sinethemba Qwabe', 'Adam van Niekerk',
                ],
            },
            {
                key: 'rugby-1stxv', name: '1st XV', sportId: 'rugby', ageGroup: 'U19', birthYear: 2008,
                coach: { name: 'Ashwin Petersen', email: 'ashwin.petersen@staldrics.test' },
                players: [
                    { name: 'James Thornton', email: 'james.thornton@staldrics.test', account: true },
                    'Oliver Sampson', 'Michael February', 'Zaid Davids', 'Ben Carstens',
                    'Thomas Rhode', 'Aphiwe Ntlabathi', 'Jean-Pierre Louw', 'Chad Adonis', 'Sam Galant',
                    'Tyrone Maart', 'Nicholas Bruwer', 'Kurt Julies', 'Sebastian Hart', 'Lwando Gqoba',
                    'Daniel Oliphant', 'Robert Kinnear', 'Justin Moos',
                ],
            },
            {
                key: 'netball-u14a', name: 'U14 A', sportId: 'netball', ageGroup: 'U14', birthYear: 2012,
                coach: { name: 'Fiona Adams', email: 'fiona.adams@staldrics.test' },
                players: [
                    'Emma Fortuin', 'Chloe Jansen', 'Leah Swart', 'Ameera Salie', 'Jessica Brink',
                    'Olwethu Siko', 'Hannah Groenewald', 'Zara Manuel', 'Megan Kleinhans', 'Kaylin Stuurman',
                ],
            },
            {
                key: 'netball-u16a', name: 'U16 A', sportId: 'netball', ageGroup: 'U16', birthYear: 2010,
                coach: { name: 'Nadia Jacobs', email: 'nadia.jacobs@staldrics.test' },
                players: [
                    'Sophie Marshall', 'Tayla Samuels', 'Lindiwe Dyantyi', 'Rachel Cupido', 'Isabella Muller',
                    'Natasha Hector', 'Caitlin Rademeyer', 'Imaan Ebrahim', 'Grace Goliath', 'Ella Lategan',
                ],
            },
        ],
    },
    {
        key: 'rbh',
        name: 'Test Riverbend High School',
        shortName: 'RBH',
        type: 'SCHOOL',
        primaryColor: '#1E6B3A',
        secondaryColor: '#F5F5F5',
        address: { line1: '48 Alexandra Road', city: 'Pietermaritzburg', province: 'KwaZulu-Natal', postalCode: '3201', latitude: -29.6006, longitude: 30.3794 },
        site: { name: 'Riverbend Campus', facilities: STANDARD_FACILITIES },
        admin: { name: 'Sipho Dlamini', email: 'sipho.dlamini@riverbend.test', account: true },
        staff: [
            { name: 'Priya Naidoo', email: 'priya.naidoo@riverbend.test', account: true },
        ],
        teams: [
            {
                key: 'rugby-u16a', name: 'U16 A', sportId: 'rugby', ageGroup: 'U16', birthYear: 2010,
                coach: { name: 'Themba Zulu', email: 'themba.zulu@riverbend.test', account: true },
                players: [
                    'Sanele Mthethwa', 'Ryan Pillay', 'Luyanda Cele', 'Kyle Reddy', 'Bongani Ngcobo',
                    'Jordan Chetty', 'Andile Shezi', 'Mandla Buthelezi', 'Keegan Maharaj', 'Siyanda Gumede',
                    'Tyler Moodley', 'Njabulo Hlongwane', 'Grant Stewart', 'Musa Mkhwanazi', 'Dylan Singh',
                    'Lindokuhle Majola', 'Ross Campbell', 'Nkosinathi Ntuli',
                ],
            },
            {
                key: 'rugby-1stxv', name: '1st XV', sportId: 'rugby', ageGroup: 'U19', birthYear: 2008,
                coach: { name: 'Craig Govender', email: 'craig.govender@riverbend.test' },
                players: [
                    { name: 'Wandile Zungu', email: 'wandile.zungu@riverbend.test', account: true },
                    'Sean Naicker', 'Ayanda Msomi', 'Keshav Ramlall', 'Siphiwe Mbatha',
                    'Liam Fraser', 'Mthokozisi Dube', 'Jaden Padayachee', 'Thulani Khoza', 'Matthew Rowe',
                    'Sifiso Nxumalo', 'Devin Pather', 'Lungelo Madlala', 'Brett Anderson', 'Sandile Mabaso',
                    'Kiran Moonsamy', 'Xolani Cebekhulu',
                    // Left the school at the end of the first term: a past member of the
                    // organisation and the team, so 17 players are current.
                    { name: 'Ethan Murray', left: '2026-03-31T00:00:00Z' },
                ],
            },
            {
                key: 'netball-u14a', name: 'U14 A', sportId: 'netball', ageGroup: 'U14', birthYear: 2012,
                coach: { name: 'Nomvula Mthembu', email: 'nomvula.mthembu@riverbend.test' },
                players: [
                    'Amahle Ndlela', 'Kiara Naidu', 'Nosipho Dladla', 'Shreya Ramdass', 'Lwandile Nzama',
                    'Tanya Perumal', 'Asanda Mtshali', 'Kerry-Lee Botes', 'Zinhle Mdletshe', 'Riana Sewpersad',
                ],
            },
            {
                key: 'netball-u16a', name: 'U16 A', sportId: 'netball', ageGroup: 'U16', birthYear: 2010,
                coach: { name: 'Ayesha Moosa', email: 'ayesha.moosa@riverbend.test' },
                players: [
                    'Snenhlanhla Hadebe', 'Nikita Pillai', 'Ntombi Mngadi', 'Aaliyah Khan', 'Philile Mncube',
                    'Jessica Gounden', 'Thando Mzimela', 'Priyanka Sookdeo', 'Hlengiwe Shange', "Megan O'Connor",
                ],
            },
        ],
    },
    {
        key: 'ksc',
        name: 'Test Kwaggafontein Sports Club',
        shortName: 'KSC',
        type: 'CLUB',
        primaryColor: '#E86A10',
        secondaryColor: '#1A1A1A',
        address: { line1: '7 Nelson Mandela Drive', city: 'Bloemfontein', province: 'Free State', postalCode: '9301', latitude: -29.1183, longitude: 26.2141 },
        site: {
            name: 'Clubhouse Grounds',
            facilities: [
                { key: 'main-field', name: 'Main Field', sportId: 'rugby' },
                { key: 'back-field', name: 'Back Field', sportId: 'rugby' },
                { key: 'court-1', name: 'Court 1', sportId: 'netball' },
                { key: 'court-2', name: 'Court 2', sportId: 'netball' },
                { key: 'court-3', name: 'Court 3', sportId: 'netball' },
            ],
        },
        admin: { name: 'Riaan Venter', email: 'riaan.venter@kwaggafontein.test', account: true },
        staff: [
            { name: 'Karabo Molefe', email: 'karabo.molefe@kwaggafontein.test', account: true },
        ],
        teams: [
            {
                key: 'rugby-u16', name: 'U16 Lions', sportId: 'rugby', ageGroup: 'U16', birthYear: 2010,
                coach: { name: 'Dewald Nel', email: 'dewald.nel@kwaggafontein.test', account: true },
                players: [
                    'Thabang Motaung', 'Pule Sehloho', 'Retief Coetzer', 'Katlego Molapo', 'Hendrik Lourens',
                    'Teboho Ramokoena', 'Jan-Hendrik Snyman', 'Lefa Tshabalala', 'Rikus Holtzhausen', 'Mosa Lekhoaba',
                    'Ockert Brits', 'Tebogo Masilo', 'Dirk Kotze', 'Kamohelo Nthako', 'Gideon Loots',
                    'Lehlohonolo Mokhele', 'Wessel Bothma', 'Seabata Phakoe',
                ],
            },
            {
                key: 'rugby-u19', name: 'U19 Colts', sportId: 'rugby', ageGroup: 'U19', birthYear: 2008,
                coach: { name: 'Tumelo Mofokeng', email: 'tumelo.mofokeng@kwaggafontein.test' },
                players: [
                    { name: 'Neo Lebona', email: 'neo.lebona@kwaggafontein.test', account: true },
                    'Stephan van Zyl', 'Relebohile Moshoeshoe', 'Pierre Jordaan', 'Tshiamo Seleke',
                    'Morgan Wolmarans', 'Bokang Mokhethi', 'Jacques Rautenbach', 'Mothusi Setlhare', 'Frikkie Human',
                    'Lesego Mahase', 'Herman Kemp', 'Thapelo Moroka', 'Wynand Terblanche', 'Sello Letsie',
                    'Armand Greeff', 'Kabelo Motsamai', 'Nico Pansegrouw',
                ],
            },
            {
                key: 'netball-u14', name: 'U14 Meteors', sportId: 'netball', ageGroup: 'U14', birthYear: 2012,
                coach: { name: 'Charmaine du Toit', email: 'charmaine.dutoit@kwaggafontein.test' },
                players: [
                    'Dineo Mahlatsi', 'Elzanne Myburgh', 'Nthabiseng Tsotetsi', 'Carmen Rudolph', 'Masechaba Motloung',
                    'Ilse Vorster', 'Keitumetse Moeketsi', 'Lindie Schoeman', 'Boitumelo Molete', 'Tanja Maritz',
                ],
            },
            {
                key: 'netball-u16', name: 'U16 Comets', sportId: 'netball', ageGroup: 'U16', birthYear: 2010,
                // Also on the staff at Doringkloof: one account, a profile in each organisation.
                coach: { name: 'Lerato Mokoena', email: 'lerato.mokoena@doringkloof.test', account: true },
                players: [
                    'Mamello Sefali', 'Juanita Ackermann', 'Kgomotso Mokgatle', 'Lieske Strauss', 'Nomsa Mabena',
                    'Hanlie Kleynhans', 'Puleng Makhetha', 'Monique du Preez', 'Rethabile Mphuthi', 'Sunette Fick',
                ],
            },
        ],
        guardians: [
            // The same account as her guardian profile at Doringkloof.
            { name: 'Elmarie Kruger', email: 'elmarie.kruger@example.test', cellphone: '+27825550206', account: true,
              children: [{ name: 'Ockert Brits', relationship: 'parent', primary: true }] },
        ],
    },
];

/** "Jandré Nieuwoudt" → "jandre-nieuwoudt". */
export function fixtureSlug(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/** Every fixture id, built the one way the loader builds it. */
export const fixtureIds = {
    org: (orgKey: string) => `fx-org-${orgKey}`,
    address: (orgKey: string) => `fx-addr-${orgKey}`,
    site: (orgKey: string) => `fx-site-${orgKey}`,
    facility: (orgKey: string, facilityKey: string) => `fx-fac-${orgKey}-${facilityKey}`,
    team: (orgKey: string, teamKey: string) => `fx-team-${orgKey}-${teamKey}`,
    profile: (orgKey: string, name: string) => `fx-prof-${orgKey}-${fixtureSlug(name)}`,
    orgMembership: (orgKey: string, name: string) => `fx-om-${orgKey}-${fixtureSlug(name)}`,
    teamMembership: (orgKey: string, teamKey: string, name: string) =>
        `fx-tm-${orgKey}-${teamKey}-${fixtureSlug(name)}`,
    event: (orgKey: string, gameKey: string) => `fx-event-${orgKey}-${gameKey}`,
    game: (orgKey: string, gameKey: string) => `fx-game-${orgKey}-${gameKey}`,
    gameParticipant: (orgKey: string, gameKey: string, side: 'home' | 'away') => `fx-gp-${orgKey}-${gameKey}-${side}`,
    guardianLink: (orgKey: string, guardianName: string, childName: string) =>
        `fx-pg-${orgKey}-${fixtureSlug(guardianName)}-${fixtureSlug(childName)}`,
    user: (name: string) => `fx-user-${fixtureSlug(name)}`,
    userEmail: (name: string) => `fx-email-${fixtureSlug(name)}`,
};
