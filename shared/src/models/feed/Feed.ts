import { Game } from "../event/Game";
import { Event } from "../event/Event";
import { Organization } from "../organization/Organization";

export interface FeedItem {
    id: string; // The match/game ID
    type: 'upcoming' | 'recent';
    game: Game;
    event?: Event;
    organization?: Organization;
    relevanceReason?: string; // e.g. "Because you follow Paul Roos"
}

export interface DiscoverySummary {
    trendingOrganizations: Organization[];
    popularTournaments: Event[];
}

export interface FeedHomeResponse {
    heroGames: Game[];
    personalizedFeed: FeedItem[];
    discovery: DiscoverySummary;
}
