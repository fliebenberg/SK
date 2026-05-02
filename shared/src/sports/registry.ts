import { Sport } from '../models/sport/Sport';

const cache = new Map<string, Sport>();

/**
 * Lazy loads and caches sport-specific configurations.
 * This ensures that heavy event templates are only loaded when needed.
 */
export const getSportConfig = async (sportId: string): Promise<Sport | null> => {
  if (cache.has(sportId)) {
    return cache.get(sportId)!;
  }

  try {
    switch (sportId) {
      case 'sport-rugby': {
        const mod = await import('./rugby');
        const config = mod.RUGBY_CONFIG;
        cache.set(sportId, config);
        return config;
      }
      // Future sports like 'sport-soccer' will be added here
      default:
        return null;
    }
  } catch (err) {
    console.error(`[SportRegistry] Failed to load config for ${sportId}:`, err);
    return null;
  }
};

/**
 * Returns a list of sport IDs that have code-based configurations available.
 */
export const getConfiguredSportIds = () => ['sport-rugby'];
