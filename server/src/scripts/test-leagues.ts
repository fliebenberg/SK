import { dataManager } from '../DataManager';
import { query } from '../db';

async function runTest() {
    console.log("=== STARTING LEAGUES & SEASONS INTEGRATION TEST ===");
    
    // Fetch an existing sport dynamically
    const sports = await dataManager.getSports();
    if (sports.length === 0) {
        throw new Error("No sports found in the database. Please seed sports first.");
    }
    const sportId = sports[0].id;
    console.log(`Using sport: ${sports[0].name} (${sportId})`);

    // Test data IDs
    const orgId = `torg-${Date.now()}`;
    const teamAId = `tteam-a-${Date.now()}`;
    const teamBId = `tteam-b-${Date.now()}`;
    const leagueId = `tleague-${Date.now()}`;
    const seasonId = `tseason-${Date.now()}`;
    const eventId = `tevent-${Date.now()}`;
    const game1Id = `tgame-1-${Date.now()}`;
    const game2Id = `tgame-2-${Date.now()}`;

    try {
        // 1. Create Test Organization
        console.log("Creating test organization...");
        await dataManager.addOrganization({
            id: orgId,
            name: "Test League Org",
            isClaimed: true
        } as any);

        // 2. Create Test Teams
        console.log("Creating test teams...");
        await dataManager.addTeam({
            id: teamAId,
            name: "Pretoria U19 Rugby",
            orgId: orgId,
            sportId: sportId,
            ageGroup: "U19"
        } as any);
        await dataManager.addTeam({
            id: teamBId,
            name: "Johannesburg U19 Rugby",
            orgId: orgId,
            sportId: sportId,
            ageGroup: "U19"
        } as any);

        // 3. Create Test League
        console.log("Creating test league...");
        const league = await dataManager.createLeague({
            id: leagueId,
            name: "SA U19 Rugby League",
            orgId: orgId,
            sportId: sportId,
            ageGroup: "U19",
            joinPolicy: "CLOSED",
            criteria: { ageGroup: "U19" }
        });
        console.log("League created:", league.name);

        // 4. Create Test Season
        console.log("Creating test season...");
        const season = await dataManager.createSeason({
            id: seasonId,
            leagueId: leagueId,
            name: "2026 Season",
            startDate: new Date('2026-03-01').toISOString(),
            endDate: new Date('2026-09-01').toISOString(),
            status: "ACTIVE",
            settings: { pointsPerWin: 4, pointsPerDraw: 2, pointsPerLoss: 0 }
        });
        console.log("Season created:", season.name);

        // 5. Register Teams to Season
        console.log("Registering teams to season...");
        await dataManager.addTeamToSeason(seasonId, teamAId, 'approved');
        await dataManager.addTeamToSeason(seasonId, teamBId, 'approved');

        const seasonTeams = await dataManager.getSeasonTeams(seasonId);
        console.log(`Registered teams count: ${seasonTeams.length}`);
        if (seasonTeams.length !== 2) throw new Error("Expected 2 registered teams in season.");

        // 6. Create Test Event
        console.log("Creating test event...");
        await dataManager.addEvent({
            id: eventId,
            name: "Derby Day Cup",
            orgId: orgId,
            startDate: new Date().toISOString()
        } as any);

        // 7. Create Test Games
        console.log("Creating test games...");
        await dataManager.addGame({
            id: game1Id,
            eventId: eventId,
            sportId: sportId,
            scheduledStartTime: new Date().toISOString(),
            participants: [
                { teamId: teamAId, sortOrder: 0 },
                { teamId: teamBId, sortOrder: 1 }
            ]
        });
        await dataManager.addGame({
            id: game2Id,
            eventId: eventId,
            sportId: sportId,
            scheduledStartTime: new Date().toISOString(),
            participants: [
                { teamId: teamBId, sortOrder: 0 },
                { teamId: teamAId, sortOrder: 1 }
            ]
        });

        // Link Games to Season
        console.log("Linking games to season...");
        await dataManager.addGameToSeason(game1Id, seasonId);
        await dataManager.addGameToSeason(game2Id, seasonId);

        // 8. Score Game 1: Pretoria (A) wins 24 - 10 Johannesburg (B)
        console.log("Scoring Game 1: Pretoria wins 24 - 10 Johannesburg...");
        await dataManager.updateGame(game1Id, {
            finalScoreData: { home: 24, away: 10 }
        });
        await dataManager.updateGameStatus(game1Id, 'Finished');

        // Verify Standings after Game 1
        console.log("Verifying standings after Game 1...");
        let updatedSeason = await dataManager.getSeason(seasonId);
        let standings = updatedSeason?.cachedStandings || [];
        console.log("Current standings:", JSON.stringify(standings, null, 2));

        if (standings.length !== 2) throw new Error("Standings should contain exactly 2 teams.");
        
        const rowA_1 = standings.find(s => s.teamId === teamAId);
        const rowB_1 = standings.find(s => s.teamId === teamBId);

        if (!rowA_1 || rowA_1.wins !== 1 || rowA_1.points !== 4 || rowA_1.pointsFor !== 24 || rowA_1.pointsAgainst !== 10) {
            throw new Error(`Standings check failed for Team A after Game 1: ${JSON.stringify(rowA_1)}`);
        }
        if (!rowB_1 || rowB_1.losses !== 1 || rowB_1.points !== 0 || rowB_1.pointsFor !== 10 || rowB_1.pointsAgainst !== 24) {
            throw new Error(`Standings check failed for Team B after Game 1: ${JSON.stringify(rowB_1)}`);
        }

        // 9. Score Game 2: Johannesburg (B) draws 15 - 15 Pretoria (A)
        // Note: In Game 2, B is home (sortOrder 0) and A is away (sortOrder 1)
        console.log("Scoring Game 2: Draw 15 - 15...");
        await dataManager.updateGame(game2Id, {
            finalScoreData: { home: 15, away: 15 }
        });
        await dataManager.updateGameStatus(game2Id, 'Finished');

        // Verify Standings after Game 2
        console.log("Verifying standings after Game 2...");
        updatedSeason = await dataManager.getSeason(seasonId);
        standings = updatedSeason?.cachedStandings || [];
        console.log("Current standings:", JSON.stringify(standings, null, 2));

        const rowA_2 = standings.find(s => s.teamId === teamAId);
        const rowB_2 = standings.find(s => s.teamId === teamBId);

        // Pretoria (A): 1 Win (4 pts) + 1 Draw (2 pts) = 6 pts. Played 2. PF: 24+15=39, PA: 10+15=25, Diff: 14.
        if (!rowA_2 || rowA_2.played !== 2 || rowA_2.wins !== 1 || rowA_2.draws !== 1 || rowA_2.points !== 6 || rowA_2.pointsFor !== 39 || rowA_2.pointsAgainst !== 25) {
            throw new Error(`Standings check failed for Team A after Game 2: ${JSON.stringify(rowA_2)}`);
        }
        // Johannesburg (B): 1 Loss (0 pts) + 1 Draw (2 pts) = 2 pts. Played 2. PF: 10+15=25, PA: 24+15=39, Diff: -14.
        if (!rowB_2 || rowB_2.played !== 2 || rowB_2.losses !== 1 || rowB_2.draws !== 1 || rowB_2.points !== 2 || rowB_2.pointsFor !== 25 || rowB_2.pointsAgainst !== 39) {
            throw new Error(`Standings check failed for Team B after Game 2: ${JSON.stringify(rowB_2)}`);
        }

        console.log("Standings values look PERFECT!");

    } catch (err) {
        console.error("❌ TEST FAILED:", err);
    } finally {
        // 10. Clean up
        console.log("Cleaning up test data...");
        try {
            // Delete game participants explicitly to bypass potential cascade reference locks in dev DB
            await query('DELETE FROM game_participants WHERE game_id IN ($1, $2)', [game1Id, game2Id]);
            await dataManager.deleteGame(game1Id);
            await dataManager.deleteGame(game2Id);
            await dataManager.deleteEvent(eventId);
            await dataManager.deleteSeason(seasonId);
            await dataManager.deleteLeague(leagueId);
            await dataManager.deleteTeam(teamAId);
            await dataManager.deleteTeam(teamBId);
            await dataManager.deleteOrganization(orgId);
            console.log("Cleanup complete!");
        } catch (cleanErr) {
            console.error("Error during cleanup:", cleanErr);
        }
    }
    
    console.log("=== INTEGRATION TEST FINISHED ===");
    process.exit(0);
}

runTest();
