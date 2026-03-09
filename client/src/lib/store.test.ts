import { store } from '@/app/store/store';

describe('Store Logic', () => {
  // Note: Since the store is a singleton module with in-memory state, 
  // state might persist between tests if not careful. 
  // For this mock implementation, we accept that we are testing the running state.
  
  it('should initialize with default data', () => {
    const teams = store.getTeams();
    expect(teams.length).toBeGreaterThan(0);
    expect(teams[0].name).toBe('First XI');
  });

  it('should add a new team', async () => {
    const initialCount = store.getTeams().length;
    const newTeam = await store.addTeam({
      name: 'Test Team',
      sportId: 'sport-tennis',
      ageGroup: 'U14',
      orgId: 'org-test'
    });

    expect(newTeam.id).toBeDefined();
    expect(newTeam.name).toBe('Test Team');
    expect(store.getTeams().length).toBe(initialCount + 1);
  });

  it('should add a new site', async () => {
    const initialCount = store.getSites().length;
    const newSite = await store.addSite({
      name: 'Test Site',
      address: {
        id: 'addr-1',
        fullAddress: '123 Test St, Test TS 12345 USA',
        addressLine1: '123 Test St',
        city: 'Test',
        province: 'TS',
        postalCode: '12345',
        country: 'USA'
      },
      orgId: 'org-test'
    });

    expect(newSite.id).toBeDefined();
    expect(newSite.name).toBe('Test Site');
    expect(store.getSites().length).toBe(initialCount + 1);
  });

  it('should add and retrieve a game', async () => {
    const teams = store.getTeams();
    const homeTeam = teams[0];
    const awayTeam = teams[1];
    
    const newGame = await store.addGame({
      eventId: 'event-test',
      participants: [{ teamId: homeTeam.id }, { teamId: awayTeam.id }],
      startTime: '2024-01-01T12:00'
    });

    expect(newGame.id).toBeDefined();
    expect(newGame.status).toBe('Scheduled');
    
    const retrievedGame = store.getGame(newGame.id);
    expect(retrievedGame).toBeDefined();
    expect(retrievedGame?.id).toBe(newGame.id);
  });

  it('should update game status and score', async () => {
    const teams = store.getTeams();
    const game = await store.addGame({
      eventId: 'event-test-2',
      participants: [{ teamId: teams[0].id }, { teamId: teams[1].id }],
      startTime: '2024-01-01T14:00'
    });

    await store.updateGameStatus(game.id, 'Live');
    expect(store.getGame(game.id)?.status).toBe('Live');

    await store.updateScore(game.id, 1, 0);
    const updatedGame = store.getGame(game.id);
    expect(updatedGame?.liveState?.home).toBe(1);
    expect(updatedGame?.liveState?.away).toBe(0);
  });
});

