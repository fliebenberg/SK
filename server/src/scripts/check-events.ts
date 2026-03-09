import db from '../db';

async function checkEvents() {
    try {
        const events = await db.query('SELECT * FROM events ORDER BY start_date DESC LIMIT 5');
        console.log("Recent Events:");
        console.table(events.rows.map(e => ({
            id: e.id,
            name: e.name,
            type: e.type,
            startDate: e.start_date,
            orgId: e.org_id
        })));

        const games = await db.query('SELECT * FROM games ORDER BY start_time DESC LIMIT 5');
        console.log("\nRecent Games:");
        console.table(games.rows.map(g => ({
            id: g.id,
            eventId: g.event_id,
            homeTeam: g.home_team_id,
            awayTeam: g.away_team_id,
            startTime: g.start_time
        })));

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkEvents();
