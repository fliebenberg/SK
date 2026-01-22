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

  it('should add a new team', () => {
    const initialCount = store.getTeams().length;
    const newTeam = store.addTeam({
      name: 'Test Team',
      sportId: 'sport-tennis',
      ageGroup: 'U14',
      organizationId: 'org-test'
    });

    expect(newTeam.id).toBeDefined();
    expect(newTeam.name).toBe('Test Team');
    expect(store.getTeams().length).toBe(initialCount + 1);
  });

  it('should add a new venue', () => {
    const initialCount = store.getVenues().length;
    const newVenue = store.addVenue({
      name: 'Test Venue',
      address: '123 Test St'
    });

    expect(newVenue.id).toBeDefined();
    expect(newVenue.name).toBe('Test Venue');
    expect(store.getVenues().length).toBe(initialCount + 1);
  });

  it('should add and retrieve a game', () => {
    const teams = store.getTeams();
    const homeTeam = teams[0];
    const awayTeam = teams[1];
    
    const newGame = store.addGame({
      eventId: 'event-test',
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      startTime: '2024-01-01T12:00'
    });

    expect(newGame.id).toBeDefined();
    expect(newGame.status).toBe('Scheduled');
    
    const retrievedGame = store.getGame(newGame.id);
    expect(retrievedGame).toBeDefined();
    expect(retrievedGame?.id).toBe(newGame.id);
  });

  it('should update game status and score', () => {
    const teams = store.getTeams();
    const game = store.addGame({
      eventId: 'event-test-2',
      homeTeamId: teams[0].id,
      awayTeamId: teams[1].id,
      startTime: '2024-01-01T14:00'
    });

    store.updateGameStatus(game.id, 'Live');
    expect(store.getGame(game.id)?.status).toBe('Live');

    store.updateScore(game.id, 1, 0);
    const updatedGame = store.getGame(game.id);
    expect(updatedGame?.homeScore).toBe(1);
    expect(updatedGame?.awayScore).toBe(0);
  });
});
