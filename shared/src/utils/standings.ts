import { Game } from "../models/event/Game";
import { LeagueStandingRow } from "../models/league/League";

export interface StandingsConfig {
  pointsPerWin: number;
  pointsPerDraw: number;
  pointsPerLoss: number;
}

/**
 * Pure function to calculate standings for a set of games and participants (teams or orgs).
 * 
 * To compute standings on an organization level (e.g. for a multi-sport Sports Day), 
 * map the participants' teamId in the games list to their organizationId before calling.
 */
export function calculateStandings(
  games: Game[],
  participants: Array<{ id: string; name: string }>,
  config: StandingsConfig
): LeagueStandingRow[] {
  const standings: Record<string, LeagueStandingRow> = {};

  // Initialize standings rows
  participants.forEach(p => {
    standings[p.id] = {
      teamId: p.id,
      teamName: p.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointsDifference: 0,
      points: 0
    };
  });

  games.forEach(game => {
    if (game.status !== "Finished" || !game.finalScoreData) return;

    const participantsList = game.participants;
    if (!participantsList || participantsList.length < 2) return;

    const pHome = participantsList[0];
    const pAway = participantsList[1];

    if (!pHome || !pAway || !pHome.teamId || !pAway.teamId) return;

    const homeScore = game.finalScoreData.home ?? 0;
    const awayScore = game.finalScoreData.away ?? 0;

    const rowHome = standings[pHome.teamId];
    const rowAway = standings[pAway.teamId];

    if (rowHome) {
      rowHome.played++;
      rowHome.pointsFor += homeScore;
      rowHome.pointsAgainst += awayScore;
    }

    if (rowAway) {
      rowAway.played++;
      rowAway.pointsFor += awayScore;
      rowAway.pointsAgainst += homeScore;
    }

    if (homeScore > awayScore) {
      if (rowHome) {
        rowHome.wins++;
        rowHome.points += config.pointsPerWin;
      }
      if (rowAway) {
        rowAway.losses++;
        rowAway.points += config.pointsPerLoss;
      }
    } else if (homeScore < awayScore) {
      if (rowAway) {
        rowAway.wins++;
        rowAway.points += config.pointsPerWin;
      }
      if (rowHome) {
        rowHome.losses++;
        rowHome.points += config.pointsPerLoss;
      }
    } else {
      if (rowHome) {
        rowHome.draws++;
        rowHome.points += config.pointsPerDraw;
      }
      if (rowAway) {
        rowAway.draws++;
        rowAway.points += config.pointsPerDraw;
      }
    }

    if (rowHome) {
      rowHome.pointsDifference = rowHome.pointsFor - rowHome.pointsAgainst;
    }
    if (rowAway) {
      rowAway.pointsDifference = rowAway.pointsFor - rowAway.pointsAgainst;
    }
  });

  // Sort standings: Points desc -> PointsDifference desc -> PointsFor desc
  const standingsList: LeagueStandingRow[] = Object.keys(standings).map(key => standings[key]);
  return standingsList.sort((a: LeagueStandingRow, b: LeagueStandingRow) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.pointsDifference !== a.pointsDifference) return b.pointsDifference - a.pointsDifference;
    return b.pointsFor - a.pointsFor;
  });
}

