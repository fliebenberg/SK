"use client";

import { useState, useEffect, Fragment } from "react";
import { store } from "@/app/store/store";
import { cn } from "@/lib/utils";
import { Event, Game } from "@sk/types";
import { MetalButton } from "@/components/ui/MetalButton";
import { Plus, Pencil, Trash2, Calendar, MapPin, Trophy, Clock, Activity, Search, History, EyeOff } from "lucide-react";
import { useThemeColors } from "@/hooks/useThemeColors";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/PageHeader";

import { MatchCard } from "@/components/ui/MatchCard";

interface EventListProps {
  orgId: string;
  teamId?: string;
}

export function EventList({ orgId, teamId }: EventListProps) {
  const router = useRouter();
  const { metalVariant } = useThemeColors();
  const [events, setEvents] = useState<Event[]>(store.getEvents(orgId));
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; eventId: string; name: string }>({
    isOpen: false,
    eventId: "",
    name: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'upcoming' | 'past'>('upcoming');
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const update = () => {
        setEvents([...store.getEvents(orgId)]);
    };
    update(); 
    store.subscribeToOrganizationData(orgId);
    const unsub = store.subscribe(update);
    return () => {
        unsub();
        store.unsubscribeFromOrganizationData(orgId);
    };
  }, [orgId]);

  const handleDelete = async () => {
    if (confirmDelete.eventId) {
      await store.deleteEvent(confirmDelete.eventId);
      setConfirmDelete({ isOpen: false, eventId: "", name: "" });
    }
  };

  const getDisplayName = (event: Event) => {
      if (event.name) return event.name;
      
      const games = store.getGames().filter(g => g.eventId === event.id);
      if (games.length === 1) {
          const game = games[0];
          const homeTeamId = game.participants?.[0]?.teamId;
          const awayTeamId = game.participants?.[1]?.teamId;
          const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : undefined;
          const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : undefined;
          
          if (homeTeam && awayTeam) {
              const homeOrg = store.getOrganization(homeTeam.orgId);
              const awayOrg = store.getOrganization(awayTeam.orgId);
              
              const homeChunk = `${homeOrg?.shortName || homeOrg?.name || ''} ${homeTeam.name}`;
              const awayChunk = `${awayOrg?.shortName || awayOrg?.name || ''} ${awayTeam.name}`;
              return `${homeChunk} vs ${awayChunk}`;
          }
      }
      return event.name || "Unnamed Event";
  };

  const filteredEvents = events
    .filter(e => {
        // If teamId is provided, only show events involving this team
        if (teamId) {
            const games = store.getGames().filter(g => g.eventId === e.id);
            const isInvolved = games.some(g => g.participants?.some(p => p.teamId === teamId));
            if (!isInvolved) return false;
        }

        const displayName = getDisplayName(e).toLowerCase();
        const matchesSearch = displayName.includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        const eventDate = e.startDate ? new Date(e.startDate) : (e.date ? new Date(e.date) : null);
        const now = new Date();
        const pastCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        let datePass = false;
        if (viewMode === 'upcoming') {
            // Include matches with no date or starting within the last 24h/future
            datePass = !eventDate || eventDate >= pastCutoff;
        } else {
            // Only matches that started more than 24h ago
            datePass = !!(eventDate && eventDate < pastCutoff);
        }

        if (!datePass) {
            // console.log(`EventList: Event ${e.name || e.id} failed date filter. Date: ${eventDate}, Cutoff: ${pastCutoff}`);
        }

        return datePass;
    })
    .sort((a, b) => {
        const dateAStr = a.startDate || a.date;
        const dateBStr = b.startDate || b.date;

        if (!dateAStr && !dateBStr) return 0;
        if (!dateAStr) return 1;
        if (!dateBStr) return -1;

        const dateA = new Date(dateAStr).getTime();
        const dateB = new Date(dateBStr).getTime();

        if (dateA !== dateB) {
            return viewMode === 'upcoming' ? dateA - dateB : dateB - dateA;
        }

        // Same day, sort by time
        const getStartTime = (event: Event) => {
            const games = store.getGames().filter(g => g.eventId === event.id);
            if (games.length === 0) return "23:59";
            return games.sort((g1, g2) => (g1.startTime || "23:59").localeCompare(g2.startTime || "23:59"))[0].startTime || "23:59";
        };

        const timeA = getStartTime(a);
        const timeB = getStartTime(b);

        return viewMode === 'upcoming' ? timeA.localeCompare(timeB) : timeB.localeCompare(timeA);
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Manage matches, tournaments, and schedules."
      >
          {/* Creation Button Dropdown */}
          <div className="flex flex-row items-center justify-end gap-3 w-full">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <MetalButton 
                  variantType="filled" 
                  metalVariant={metalVariant}
                  glowColor="hsl(var(--primary))"
                  icon={<Plus className="h-4 w-4" />}
                  className="h-11 px-6 font-bold"
                >
                  Add Event
                </MetalButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-md border-border/50">
                <DropdownMenuItem 
                  onClick={() => {
                      let url = `/admin/organizations/${orgId}/events/create?type=game`;
                      if (teamId) {
                          const team = store.getTeam(teamId);
                          if (team) {
                              url += `&homeTeamId=${teamId}&sportId=${team.sportId}`;
                          }
                      }
                      router.push(url);
                  }}
                  className="gap-2 cursor-pointer py-3"
                >
                  <Plus className="h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-bold">Schedule Match</span>
                    <span className="text-[10px] text-muted-foreground">Standard head-to-head game</span>
                  </div>
                </DropdownMenuItem>
                
                {!teamId && (
                  <>
                    <DropdownMenuItem 
                      onClick={() => router.push(`/admin/organizations/${orgId}/events/create?type=sportsday`)}
                      className="gap-2 cursor-pointer py-3"
                    >
                      <Activity className="h-4 w-4 text-primary" />
                      <div className="flex flex-col">
                        <span className="font-bold">Create Sports Day</span>
                        <span className="text-[10px] text-muted-foreground">Multi-org, multi-sport event</span>
                      </div>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={() => router.push(`/admin/organizations/${orgId}/events/create?type=tournament`)}
                      className="gap-2 cursor-pointer py-3"
                    >
                      <Trophy className="h-4 w-4 text-primary" />
                      <div className="flex flex-col">
                        <span className="font-bold">Create Tournament</span>
                        <span className="text-[10px] text-muted-foreground">Bracket or pool-based competition</span>
                      </div>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
      </PageHeader>

      <div className="flex flex-col gap-4">
        {/* Row 2: Search & Toggle */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full group">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background/50 h-11 border-border/50 focus:border-primary/50 transition-all rounded-xl"
              />
            </div>
            
            <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50 shrink-0 w-full sm:w-auto">
              <button
                onClick={() => setViewMode('upcoming')}
                className={cn(
                  "flex-1 sm:flex-none px-6 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                  viewMode === 'upcoming' 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Upcoming
              </button>
              <button
                onClick={() => setViewMode('past')}
                className={cn(
                  "flex-1 sm:flex-none px-6 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                  viewMode === 'past' 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Past
              </button>
            </div>
          </div>
        </div>

      <div className="space-y-2">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-2xl text-muted-foreground bg-muted/5">
            <Calendar className="h-12 w-12 mb-4 opacity-20" />
            <p className="font-medium">No matches scheduled yet.</p>
          </div>
        ) : !hasMounted ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          filteredEvents.map((event) => {
            const games = store.getGames().filter(g => g.eventId === event.id);
            const isContainerEvent = event.type === 'SportsDay' || event.type === 'Tournament';
            
            // For team view, we only care about games involving this specific team
            let relevantGames = games;
            const isHost = event.orgId === orgId;

            if (teamId) {
                relevantGames = games.filter(g => g.participants?.some(p => p.teamId === teamId));
            } else if (isHost) {
                // For Host Org view, show ALL games regardless of team resolution
                relevantGames = games;
            } else {
                // For Participating Org view, show games where this org is involved
                relevantGames = games.filter(g => {
                    return g.participants?.some(p => {
                        if (!p.teamId) return false;
                        const team = store.getTeam(p.teamId);
                        return team?.orgId === orgId;
                    });
                });
            }
            
            relevantGames = relevantGames.sort((a, b) => {
                const dateA = a.startTime || event.startDate || "";
                const dateB = b.startTime || event.startDate || "";
                return dateA.localeCompare(dateB);
            });

            // If this organization is the host, we should always show the event 
            // even if it has no valid games yet (e.g. partial creation or corrupt data)
            if (relevantGames.length === 0 && !teamId && !isHost) return null;
            
            // If it's a SingleMatch but has no games, we still need to show the header 
            // otherwise the user sees nothing.
            const showHeader = isContainerEvent || (relevantGames.length > 1 && !teamId) || (relevantGames.length === 0 && isHost);

            return (
              <div 
                key={event.id} 
                className={cn(
                  "space-y-0 overflow-hidden", 
                  isContainerEvent ? "border border-primary/20 rounded-2xl bg-primary/10 mb-6 shadow-sm" : "space-y-1"
                )}
              >
                {/* Event Group Header (only for container events or if multiple games or host seeing empty event) */}
                {showHeader && (
                  <div 
                    onClick={() => isContainerEvent && router.push(`/admin/organizations/${orgId}/events/${event.id}`)}
                    className={cn(
                      "flex items-center justify-between gap-4 px-3 py-1.5 transition-all",
                      isContainerEvent 
                        ? "bg-primary/10 border-b border-border/50 cursor-pointer hover:bg-primary/20" 
                        : "rounded-lg bg-primary/5 border border-primary/10 mb-2"
                    )}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="p-1 rounded bg-primary text-primary-foreground shrink-0">
                        {event.type === 'Tournament' ? <Trophy className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
                      </div>
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary truncate">
                        {event.name || getDisplayName(event)}
                      </h3>
                    </div>
                    <div className="flex items-center gap-4 text-[9px] font-bold text-muted-foreground uppercase opacity-70 shrink-0">
                      <span>{event.type === 'SportsDay' ? 'Sports Day' : event.type}</span>
                      {event.siteId && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {store.getSite(event.siteId)?.name || "Unknown Site"}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Match Rows */}
                <div className={cn(
                  "grid gap-2",
                  isContainerEvent ? "p-3" : ""
                )}>
                  {relevantGames.map((game) => {
                    return (
                      <MatchCard 
                        key={game.id} 
                        game={game} 
                        isStandalone={!isContainerEvent}
                        highlightTeamId={teamId}
                        onClick={() => {
                            if (event.type === 'SingleMatch') {
                                router.push(`/admin/organizations/${orgId}/events/${event.id}`);
                            } else {
                                router.push(`/admin/organizations/${orgId}/events/${event.id}/games/${game.id}/edit`);
                            }
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onOpenChange={(open) => setConfirmDelete({ ...confirmDelete, isOpen: open })}
        title="Delete Event"
        description={`Are you sure you want to delete ${confirmDelete.name}? This action cannot be undone and will remove all associated games.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}

