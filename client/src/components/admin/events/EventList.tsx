"use client";

import { useState, useEffect } from "react";
import { store } from "@/app/store/store";
import { cn } from "@/lib/utils";
import { Event } from "@sk/types";
import { MetalButton } from "@/components/ui/MetalButton";
import { Plus, Pencil, Trash2, Calendar, MapPin, Trophy, Clock, Activity, Search, History, EyeOff } from "lucide-react";
import { useThemeColors } from "@/hooks/useThemeColors";

import { useRouter } from "next/navigation";
import { format, isBefore, startOfDay } from "date-fns";
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

interface EventListProps {
  organizationId: string;
  teamId?: string;
}

export function EventList({ organizationId, teamId }: EventListProps) {
  const router = useRouter();
  const { metalVariant } = useThemeColors();
  const [events, setEvents] = useState<Event[]>(store.getEvents(organizationId));
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; eventId: string; name: string }>({
    isOpen: false,
    eventId: "",
    name: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    const update = () => {
        setEvents([...store.getEvents(organizationId)]);
    };
    update(); // Initial fetch might be needed if store wasn't ready
    const unsub = store.subscribe(update);
    return unsub;
  }, [organizationId]);

  const handleDelete = async () => {
    if (confirmDelete.eventId) {
      await store.deleteEvent(confirmDelete.eventId);
      setConfirmDelete({ isOpen: false, eventId: "", name: "" });
    }
  };

  const getVenueName = (id: string) => {
      const v = store.getVenue(id);
      return v ? v.name : "Unknown Venue";
  }

  const getSportName = (id?: string) => {
      if (!id) return "Unknown Sport";
      const s = store.getSports().find(s => s.id === id);
      return s ? s.name : "Unknown Sport";
  }

  const getDisplayName = (event: Event) => {
      if (event.name) return event.name;
      
      const games = store.getGames().filter(g => g.eventId === event.id);
      if (games.length === 1) {
          const game = games[0];
          const homeTeam = store.getTeam(game.homeTeamId);
          const awayTeam = store.getTeam(game.awayTeamId);
          
          if (homeTeam && awayTeam) {
              const homeOrg = store.getOrganization(homeTeam.organizationId);
              const awayOrg = store.getOrganization(awayTeam.organizationId);
              
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
            const isInvolved = games.some(g => g.homeTeamId === teamId || g.awayTeamId === teamId);
            if (!isInvolved) return false;
        }

        const displayName = getDisplayName(e).toLowerCase();
        const matchesSearch = displayName.includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        const eventDate = e.startDate ? startOfDay(new Date(e.startDate)) : (e.date ? startOfDay(new Date(e.date)) : null);
        const today = startOfDay(new Date());

        if (viewMode === 'upcoming') {
            // Include matches with no date or future/today dates
            return !eventDate || !isBefore(eventDate, today);
        } else {
            // Only past dates
            return eventDate && isBefore(eventDate, today);
        }
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
      <div className="flex flex-col gap-8">
        {/* Title Section */}
        <div className="text-center space-y-2 pb-2">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>Events</h1>
          <p className="text-muted-foreground text-lg">Manage matches, tournaments, and schedules.</p>
        </div>

        {/* Toolbar Section */}
        <div className="flex flex-col gap-4">
          {/* Row 1: Creation Button Dropdown */}
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
                      let url = `/admin/organizations/${organizationId}/events/create?type=game`;
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
                      onClick={() => router.push(`/admin/organizations/${organizationId}/events/create?type=sportsday`)}
                      className="gap-2 cursor-pointer py-3"
                    >
                      <Activity className="h-4 w-4 text-primary" />
                      <div className="flex flex-col">
                        <span className="font-bold">Create Sports Day</span>
                        <span className="text-[10px] text-muted-foreground">Multi-org, multi-sport event</span>
                      </div>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={() => router.push(`/admin/organizations/${organizationId}/events/create?type=tournament`)}
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
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredEvents.map((event) => {
          const games = store.getGames().filter(g => g.eventId === event.id);
          const isMatch = games.length === 1;
          const game = isMatch ? games[0] : null;

          return (
          <Card 
            key={event.id} 
            className="group relative flex flex-col justify-between hover:shadow-md hover:ring-1 hover:ring-primary/50 transition-all duration-200 border-border/50 cursor-pointer overflow-hidden bg-card/50"
            onClick={() => router.push(`/admin/organizations/${organizationId}/events/${event.id}`)}
          >
            <div className="p-3 space-y-3">
              {/* Top Row: Name & Sport */}
              <div className="flex justify-between items-start gap-4">
                <div className="font-bold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
                  {getDisplayName(event)}
                </div>
                <div className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70 flex items-center gap-1 bg-muted/50 px-1.5 py-0.5 rounded border border-border/50">
                    {/* @ts-ignore */}
                    <Activity className="h-3 w-3" />
                    {getSportName(event.sportIds?.[0])}
                </div>
              </div>

              {/* Bottom Row: Type, Time, Venue */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-border/40">
                {/* Left: Type */}
                <div className="flex-1 text-left">
                     <Badge variant="secondary" className="text-[9px] px-1.5 py-0 uppercase tracking-widest font-bold h-5 bg-secondary/50 text-foreground/80">
                      {event.type === 'SportsDay' ? "Sports Day" : (event.type === 'Tournament' ? "Tournament" : "Match")}
                     </Badge>
                </div>

                {/* Center: Time/Date */}
                <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                        <Clock className="w-3.5 h-3.5 text-primary/70" />
                        <span className="font-mono text-[11px]">
                          {isMatch 
                            ? (game?.startTime || "TBD") 
                            : (event.startDate ? format(new Date(event.startDate), "MMM d") : "No Date")
                          }
                        </span>
                    </div>
                </div>

                {/* Right: Venue */}
                <div className="flex-1 flex justify-end">
                    <div className="flex items-center gap-1.5 text-muted-foreground max-w-[100px]">
                        <MapPin className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                        <span className="truncate text-[11px]">{getVenueName(event.venueId)}</span>
                    </div>
                </div>
              </div>
            </div>
          </Card>
          );
        })}
        
        {filteredEvents.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-muted-foreground">
                <Calendar className="h-12 w-12 mb-4 opacity-20" />
                <p>No events scheduled yet.</p>
            </div>
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
