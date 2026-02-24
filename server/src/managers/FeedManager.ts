import { Game, FeedHomeResponse, FeedItem, UserPreferences } from "@sk/types";
import { eventManager } from "./EventManager";
import { organizationManager } from "./OrganizationManager";
import { userManager } from "./UserManager";

class FeedManager {
  
  public async getHomeFeed(userId?: string, timezone?: string): Promise<FeedHomeResponse> {
    
    // Default empty preferences if anonymous
    let preferences: UserPreferences = {
        followedOrganizations: [],
        followedTeams: [],
        favoriteSports: [],
    };

    if (userId) {
        const user = await userManager.getUser(userId);
        if (user && user.preferences) {
            preferences = user.preferences;
        }
    }

    // 1. Fetch Hero Games (Highest priority live games)
    const liveGames = await eventManager.getLiveGames();
    
    // Simple heuristic: Take up to 3 live games to feature
    const heroGames = liveGames.slice(0, 3);

    // 2. Fetch Personalized Feed (Upcoming and Recent)
    // For MVP, we'll just grab some upcoming games. 
    // In a real implementation, we'd filter these based on preferences.
    const allGames = await eventManager.getGames();
    const upcomingGames = allGames.filter(g => g.status === 'Scheduled');
    
    const personalizedFeed: FeedItem[] = upcomingGames.slice(0, 5).map(game => ({
        id: game.id,
        type: 'upcoming',
        game: game,
        relevanceReason: 'Based on your selected sports'
    }));

    // 3. Discovery section
    const allOrgs = await organizationManager.getOrganizations();
    const trendingOrganizations = allOrgs.slice(0, 4); // Just grab first 4 for now
    // If we had a robust event manager getEvents, we'd grab popular events here.
    const popularTournaments = await eventManager.getEvents(); 

    return {
        heroGames,
        personalizedFeed,
        discovery: {
            trendingOrganizations,
            popularTournaments: popularTournaments.slice(0, 2)
        }
    };
  }

}

export const feedManager = new FeedManager();
