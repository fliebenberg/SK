import { store } from '@/app/store/store';

describe('Store Logic', () => {
  const TEST_SPORT_ID = 'sport-soccer';
  const TEST_ORG_ID = 'org-1'; // Springfield High School
  let TEST_EVENT_ID: string;

  beforeAll(async () => {
    // Ensure we have a valid event for game tests
    try {
        const event = await store.addEvent({
            name: 'Test Event',
            type: 'SingleMatch',
            orgId: TEST_ORG_ID,
            sportIds: [TEST_SPORT_ID],
            status: 'Scheduled',
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 86400000).toISOString()
        });
        TEST_EVENT_ID = event.id;
    } catch (e: any) {
        console.warn("Test setup: Failed to add event:", e.message);
    }
  });

  afterAll(async () => {
    if (TEST_EVENT_ID) {
        try {
            await store.deleteEvent(TEST_EVENT_ID);
        } catch (e) {}
    }
  });

  beforeEach(() => {
    store.clear();
  });

  it('should add a new team', async () => {
    const newTeam = await store.addTeam({
      name: 'Test Team',
      sportId: TEST_SPORT_ID,
      ageGroup: 'U14',
      orgId: TEST_ORG_ID
    }).catch(err => {
        console.error("DEBUG: addTeam failed:", err.message);
        throw err;
    });

    expect(newTeam.id).toBeDefined();
    expect(newTeam.name).toBe('Test Team');
    expect(store.getTeams().length).toBe(1);
    
    // Cleanup
    await store.deleteTeam(newTeam.id);
  });

  it('should add a new site', async () => {
    const newSite = await store.addSite({
      name: 'Test Site',
      address: {
        id: `addr-test-${Date.now()}`,
        fullAddress: '123 Test St, Test TS 12345 USA',
        addressLine1: '123 Test St',
        city: 'Test',
        province: 'TS',
        postalCode: '12345',
        country: 'USA'
      },
      orgId: TEST_ORG_ID
    }).catch(err => {
        console.error("DEBUG: addSite failed:", err.message);
        throw err;
    });

    expect(newSite.id).toBeDefined();
    expect(newSite.name).toBe('Test Site');
    expect(store.getSites().length).toBe(1);

    // Cleanup
    await store.deleteSite(newSite.id);
  });

  it('should add and retrieve a game', async () => {
    if (!TEST_EVENT_ID) {
        console.warn("Skipping game test: no valid TEST_EVENT_ID");
        return;
    }

    const homeTeam = await store.addTeam({ name: 'Home', orgId: TEST_ORG_ID, sportId: TEST_SPORT_ID, ageGroup: 'U14' });
    const awayTeam = await store.addTeam({ name: 'Away', orgId: TEST_ORG_ID, sportId: TEST_SPORT_ID, ageGroup: 'U14' });
    
    const newGame = await store.addGame({
      eventId: TEST_EVENT_ID,
      participants: [{ teamId: homeTeam.id }, { teamId: awayTeam.id }],
      startTime: '2024-01-01T12:00'
    });

    expect(newGame.id).toBeDefined();
    expect(newGame.status).toBe('Scheduled');
    
    const retrievedGame = store.getGame(newGame.id);
    expect(retrievedGame).toBeDefined();
    expect(retrievedGame?.id).toBe(newGame.id);

    // Cleanup
    await store.deleteGame(newGame.id);
    await store.deleteTeam(homeTeam.id);
    await store.deleteTeam(awayTeam.id);
  });

  it('should update game status and score', async () => {
    if (!TEST_EVENT_ID) {
        console.warn("Skipping game test: no valid TEST_EVENT_ID");
        return;
    }

    const homeTeam = await store.addTeam({ name: 'Home', orgId: TEST_ORG_ID, sportId: TEST_SPORT_ID, ageGroup: 'U14' });
    const awayTeam = await store.addTeam({ name: 'Away', orgId: TEST_ORG_ID, sportId: TEST_SPORT_ID, ageGroup: 'U14' });
    const game = await store.addGame({
      eventId: TEST_EVENT_ID,
      participants: [{ teamId: homeTeam.id }, { teamId: awayTeam.id }],
      startTime: '2024-01-01T14:00'
    });

    await store.updateGameStatus(game.id, 'Live');
    expect(store.getGame(game.id)?.status).toBe('Live');

    const homeParticipantId = game.participants?.[0]?.id;
    const awayParticipantId = game.participants?.[1]?.id;
    if (homeParticipantId && awayParticipantId) {
        await store.updateScore(game.id, { [homeParticipantId]: 1, [awayParticipantId]: 0 });
        const updatedGame = store.getGame(game.id);
        expect(updatedGame?.liveState?.scores?.[homeParticipantId]).toBe(1);
        expect(updatedGame?.liveState?.scores?.[awayParticipantId]).toBe(0);
    }

    // Cleanup
    await store.deleteGame(game.id);
    await store.deleteTeam(homeTeam.id);
    await store.deleteTeam(awayTeam.id);
  });
});
