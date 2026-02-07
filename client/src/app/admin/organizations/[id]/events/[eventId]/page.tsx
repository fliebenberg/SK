"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { store } from "@/app/store/store";
import { cn } from "@/lib/utils";
import { Event, Game, Organization, Team, Sport } from "@sk/types";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, MapPin as MapPinIcon, Trophy, Trophy as TrophyIcon, X, Loader2, Check, Settings as SettingsIcon, ArrowLeft, Clock, MapPin, Calendar, ChevronLeft, Pencil, Search } from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { MetalButton } from "@/components/ui/MetalButton";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { GenericAutocomplete } from "@/components/ui/GenericAutocomplete";
import { useThemeColors } from "@/hooks/useThemeColors";
import { OrgLogo } from "@/components/ui/OrgLogo";
import { MatchCard } from "@/components/ui/MatchCard";
import { getOrgInitialsFontSize, isPlaceholderLogo, getContrastColor } from "@/lib/utils";

import { MetalCard } from "@/components/ui/metal-card";
import { Badge } from "@/components/ui/badge";
import { format, startOfDay, isBefore } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchForm, MatchFormData } from "@/components/admin/games/MatchForm";
import { toast } from "@/hooks/use-toast";
import { OrgCreationDialog } from "@/components/admin/organizations/OrgCreationDialog";

export default function EventDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const organizationId = params.id as string;
  const eventId = params.eventId as string;
  const router = useRouter();
  const { metalVariant } = useThemeColors();

  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [games, setGames] = useState<Game[]>([]);
  const [venueName, setVenueName] = useState("");
  
  // Helper to resolve team names
  const [teamMap, setTeamMap] = useState<Record<string, string>>({});
  const [grouping, setGrouping] = useState<'time' | 'sport' | 'venue'>('time');
  const [activeTab, setActiveTab] = useState<string>(searchParams.get("tab") || "schedule");

  // EDIT STATE (cloned from event)
  const [loading, setLoading] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [editVenueId, setEditVenueId] = useState("");
  const [editVenueName, setEditVenueName] = useState("");
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [orgSearch, setOrgSearch] = useState("");

  const [matchFormData, setMatchFormData] = useState<MatchFormData | null>(null);
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [pendingOrgName, setPendingOrgName] = useState("");

  const [venues, setVenues] = useState<any[]>([]);
  const [allSports, setAllSports] = useState<Sport[]>([]);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);

  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false });
  const [confirmCancel, setConfirmCancel] = useState({ isOpen: false });
  const [isInitialized, setIsInitialized] = useState(false);

  const [filterSportId, setFilterSportId] = useState<string>("all");
  const [filterVenueId, setFilterVenueId] = useState<string>("all");

  // Dirty Tracking
  const isDirty = event ? (
      editName !== event.name ||
      editStartDate !== (event.startDate?.split('T')[0] || event.date?.split('T')[0] || "") ||
      (isMultiDay ? editEndDate !== (event.endDate?.split('T')[0] || "") : (!!event.endDate && event.endDate !== (event.startDate || event.date))) ||
      editVenueId !== (event.venueId || "default") ||
      JSON.stringify([...selectedSportIds].sort()) !== JSON.stringify([...(event.sportIds || [])].sort()) ||
      JSON.stringify([...selectedOrgIds].sort()) !== JSON.stringify([...(event.participatingOrgIds || [])].sort()) ||
      (event.type === 'SingleMatch' && matchFormData && (
          matchFormData.sportId !== (event.sportIds?.[0] || "") ||
          matchFormData.startTime !== (games[0]?.startTime || "09:00") ||
          matchFormData.isTbd !== (!games[0]?.startTime) ||
          matchFormData.homeTeamId !== (games[0]?.homeTeamId || "") ||
          matchFormData.awayTeamId !== (games[0]?.awayTeamId || "") ||
          matchFormData.venueId !== (games[0]?.venueId || event.venueId || "")
      ))
  ) : false;

  const canDelete = event && (() => {
      const today = startOfDay(new Date());
      const eventDate = startOfDay(new Date(event.startDate || event.date || ""));
      const isFuture = !isBefore(eventDate, today);
      const noGamesPlayed = games.every(g => g.status === 'Scheduled' || g.status === 'Cancelled');
      return isFuture && noGamesPlayed;
  })();

  useEffect(() => {
    const update = () => {
        const ev = store.getEvent(eventId);
        setEvent(ev);
        
        if (ev) {
            // Subscribe to real-time updates for this event and its venue
            store.subscribeToEvent(ev.id);
            if (ev.venueId) store.subscribeToVenue(ev.venueId);

            const v = store.getVenue(ev.venueId || "");
            setVenueName(v ? v.name : "Unknown Venue");

            if (!isInitialized) {
                setEditName(ev.name);
                setEditStartDate(ev.startDate?.split('T')[0] || ev.date?.split('T')[0] || "");
                setEditEndDate(ev.endDate?.split('T')[0] || "");
                setIsMultiDay(!!ev.endDate && ev.endDate.split('T')[0] !== (ev.startDate || ev.date)?.split('T')[0]);
                setEditVenueId(ev.venueId || "default");
                if (v) setEditVenueName(v.name);
                setSelectedSportIds(ev.sportIds || []);
                setSelectedOrgIds(ev.participatingOrgIds || []);

                setIsInitialized(true);
            }
        }

        setVenues(store.getVenues(organizationId));
        setAllSports(store.getSports());
        setAllOrgs(store.getOrganizations());

        const allGames = store.getGames(); // Get all to capture neutral games in event
        const eventGames = allGames.filter(g => g.eventId === eventId);
        setGames(eventGames);

        const allTeams = store.getTeams(); 
        const mapping: Record<string, string> = {};
        allTeams.forEach(t => {
            mapping[t.id] = t.name;
        });
        setTeamMap(mapping);
    };

    update();
    const unsub = store.subscribe(update);
    update(); // Initial load

    // If event is not found, try fetching it (e.g. deep link to shared event)
    if (!store.getEvent(eventId)) {
        store.fetchEvent(eventId);
    }

    return () => {
        store.unsubscribe(update);
        store.unsubscribeFromEvent(eventId);
        if (event?.venueId) store.unsubscribeFromVenue(event.venueId);
        if (event?.participatingOrgIds) {
             event.participatingOrgIds.forEach(id => store.unsubscribeFromOrganizationData(id));
        }
    };
  }, [eventId, organizationId, isInitialized]);

  // Separate effect to handle dynamic subscriptions to participating organizations
  useEffect(() => {
    if (event?.participatingOrgIds) {
        event.participatingOrgIds.forEach(id => {
            store.subscribeToOrganizationData(id);
        });
    }
  }, [event?.participatingOrgIds]);

  if (!event) {
      return <div className="p-8 text-center">Event not found</div>;
  }

  const getTeamName = (id: string, name?: string) => {
      const team = store.getTeam(id);
      if (team) {
          const org = store.getOrganization(team.organizationId);
          if (org?.shortName) {
              return `${org.shortName} ${team.name}`;
          }
          return team.name;
      }
      return name || "Unknown Team";
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setLoading(true);
    try {
        if (!editName.trim()) {
             toast({
                 title: "Validation Error",
                 description: "Event name is required",
                 variant: "warning"
             });
             setLoading(false);
             return;
        }

        if (isMultiDay && editEndDate < editStartDate) {
            toast({
                title: "Validation Error",
                description: "End Date cannot be before Start Date",
                variant: "warning"
            });
            setLoading(false);
            return;
        }

        const payload: Partial<Event> = {
            name: editName,
            startDate: editStartDate,
            endDate: isMultiDay ? editEndDate : undefined,
            venueId: editVenueId === "default" ? "" : editVenueId,
        };

        if (event.type === 'SingleMatch' && matchFormData) {
            payload.sportIds = matchFormData.sportId ? [matchFormData.sportId] : [];
            const awayTeam = store.getTeam(matchFormData.awayTeamId);
            payload.participatingOrgIds = awayTeam ? [awayTeam.organizationId] : [];
        } else {
            payload.participatingOrgIds = selectedOrgIds;
            payload.sportIds = selectedSportIds;
        }

        await store.updateEvent(event.id, payload);

        if (event.type === 'SingleMatch' && games.length === 1 && matchFormData) {
            await store.updateGame(games[0].id, {
                homeTeamId: matchFormData.homeTeamId,
                awayTeamId: matchFormData.awayTeamId,
                startTime: matchFormData.isTbd ? "" : `${(event.startDate || event.date || "").split('T')[0]}T${matchFormData.startTime}:00`,
                venueId: matchFormData.venueId
            });
        }

        setIsInitialized(false);
        setActiveTab("schedule");
    } catch (err) {
        console.error(err);
        toast({
            title: "Error",
            description: "Failed to update event",
            variant: "destructive"
        });
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    setLoading(true);
    try {
        await store.deleteEvent(event.id);
        router.push(`/admin/organizations/${organizationId}/events`);
    } catch (err) {
        console.error(err);
        toast({
            title: "Error",
            description: "Failed to delete event",
            variant: "destructive"
        });
        setLoading(false);
    }
  };

  const handleCancelEvent = async () => {
    if (!event) return;
    setLoading(true);
    try {
        await store.updateEvent(event.id, { status: 'Cancelled' });
        const scheduledGames = games.filter(g => g.status === 'Scheduled');
        for (const g of scheduledGames) {
            await store.updateGame(g.id, { status: 'Cancelled' });
        }
    } catch (err) {
        console.error(err);
        toast({
            title: "Error",
            description: "Failed to cancel event",
            variant: "destructive"
        });
    } finally {
        setLoading(false);
    }
  };

  const toggleSport = (sportId: string) => {
      setSelectedSportIds(prev => 
          prev.includes(sportId) ? prev.filter(id => id !== sportId) : [...prev, sportId]
      );
  };

  const handleCreateVenue = async (name: string) => {
      if (!name.trim()) return;
      try {
          const newVenue = await store.addVenue({
              name,
              address: "TBD",
              organizationId
          });
          setEditVenueId(newVenue.id);
          setEditVenueName(newVenue.name);
      } catch (e) {
          console.error(e);
      }
  };




  function renderScoreboard() {
      if (!event) return null;
      const orgPoints: Record<string, { wins: number, draws: number, losses: number, total: number }> = {};
      event.participatingOrgIds?.forEach(id => {
          orgPoints[id] = { wins: 0, draws: 0, losses: 0, total: 0 };
      });
      if (!orgPoints[event.organizationId]) {
          orgPoints[event.organizationId] = { wins: 0, draws: 0, losses: 0, total: 0 };
      }

      games.filter(g => g.status === 'Finished').forEach(g => {
          const homeTeam = store.getTeam(g.homeTeamId);
          const awayTeam = store.getTeam(g.awayTeamId);
          if (!homeTeam || !awayTeam) return;

          const homeOrgId = homeTeam.organizationId;
          const awayOrgId = awayTeam.organizationId;

          if (g.homeScore > g.awayScore) {
              if (orgPoints[homeOrgId]) orgPoints[homeOrgId].wins++;
              if (orgPoints[awayOrgId]) orgPoints[awayOrgId].losses++;
          } else if (g.awayScore > g.homeScore) {
              if (orgPoints[awayOrgId]) orgPoints[awayOrgId].wins++;
              if (orgPoints[homeOrgId]) orgPoints[homeOrgId].losses++;
          } else {
              if (orgPoints[homeOrgId]) orgPoints[homeOrgId].draws++;
              if (orgPoints[awayOrgId]) orgPoints[awayOrgId].draws++;
          }
      });

      const processed = Object.entries(orgPoints).map(([id, stats]) => ({
          id,
          name: store.getOrganization(id)?.name || "Unknown Org",
          ...stats,
          total: (stats.wins * 3) + stats.draws
      })).sort((a, b) => b.total - a.total);

      if (event.type === 'SingleMatch' && games.length > 0) {
          const match = games[0];
          return (
              <MetalCard className="p-8 text-center max-w-2xl mx-auto overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                  <div className="flex items-center justify-between gap-8 py-8">
                      <div className="flex-1 text-right">
                          <h2 className="text-3xl font-black uppercase mb-2">{getTeamName(match.homeTeamId)}</h2>
                          <div className="text-6xl font-black font-mono text-primary">{match.homeScore}</div>
                      </div>
                      <div className="flex flex-col items-center gap-4">
                          <Trophy className="w-12 h-12 text-primary/30" />
                          <div className="text-sm font-black uppercase tracking-widest text-muted-foreground">FINAL</div>
                      </div>
                      <div className="flex-1 text-left">
                          <h2 className="text-3xl font-black uppercase mb-2">{getTeamName(match.awayTeamId, match.awayTeamName)}</h2>
                          <div className="text-6xl font-black font-mono text-primary">{match.awayScore}</div>
                      </div>
                  </div>
              </MetalCard>
          );
      }

      return (
          <div className="space-y-6">
              <div className="overflow-x-auto rounded-xl ring-1 ring-border/50">
                  <table className="w-full text-sm text-left">
                      <thead className="text-[10px] uppercase font-black tracking-widest bg-muted/30">
                          <tr>
                              <th className="px-6 py-4">Position</th>
                              <th className="px-6 py-4">Organization</th>
                              <th className="px-6 py-4 text-center">W</th>
                              <th className="px-6 py-4 text-center">D</th>
                              <th className="px-6 py-4 text-center">L</th>
                              <th className="px-6 py-4 text-center text-primary">Points</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                          {processed.map((org, i) => (
                              <tr key={org.id} className="hover:bg-muted/10 transition-colors">
                                  <td className="px-6 py-4 font-mono font-bold">{i + 1}</td>
                                  <td className="px-6 py-4 font-bold">{org.name}</td>
                                  <td className="px-6 py-4 text-center">{org.wins}</td>
                                  <td className="px-6 py-4 text-center">{org.draws}</td>
                                  <td className="px-6 py-4 text-center">{org.losses}</td>
                                  <td className="px-6 py-4 text-center font-black text-primary">{org.total}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      );
  }


  function renderSchedule() {
    if (!event) return null;
    
    // Filter games based on selection
    let filteredGames = games;
    
    if (filterSportId !== "all") {
         filteredGames = filteredGames.filter(g => {
             const homeTeam = store.getTeam(g.homeTeamId);
             return homeTeam?.sportId === filterSportId;
         });
    }
    
    if (filterVenueId !== "all") {
         filteredGames = filteredGames.filter(g => g.venueId === filterVenueId);
    }

    if (games.length === 0) {
        return (
            <MetalCard className="p-12 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                    <h3 className="font-bold text-lg">No games scheduled</h3>
                    <p className="text-muted-foreground">Start by adding games to this event.</p>
                </div>
            </MetalCard>
        );
    }

    if (filteredGames.length === 0 && games.length > 0) {
         return (
            <MetalCard className="p-12 text-center space-y-4">
                 <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Search className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                    <h3 className="font-bold text-lg">No games found</h3>
                    <p className="text-muted-foreground">Try adjusting your filters.</p>
                </div>
            </MetalCard>
         )
    }

    const groups: Record<string, Game[]> = {};
    const sortedGames = [...filteredGames].sort((a, b) => {
        if (!a.startTime) return 1;
        if (!b.startTime) return -1;
        return a.startTime.localeCompare(b.startTime);
    });

    sortedGames.forEach(g => {
        let key = "Scheduled";
        if (grouping === 'time') key = g.startTime ? format(new Date(g.startTime), "HH:mm") : "TBD";
        else if (grouping === 'sport') {
            const homeTeam = store.getTeam(g.homeTeamId);
            key = homeTeam ? store.getSport(homeTeam.sportId)?.name || "Unknown Sport" : "Unknown Sport";
        } else if (grouping === 'venue') {
            key = g.venueId ? store.getVenue(g.venueId)?.name || "Unknown Venue" : "No Venue";
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(g);
    });

    return (
        <div className="space-y-8">
            {Object.entries(groups).map(([title, groupGames]) => (
                <div key={title} className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-3">{title}</h3>
                    <div className="space-y-3 bg-muted/20 border border-border/40 rounded-2xl p-4 shadow-inner">
                        {groupGames.map(game => (
                          <MatchCard 
                            key={game.id} 
                            game={game} 
                            onClick={() => router.push(`/admin/organizations/${organizationId}/events/${eventId}/games/${game.id}/edit`)}
                          />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
        <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur-md">
            <div className="container flex h-16 items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/organizations/${organizationId}/events`)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-black uppercase tracking-tight">{event.name}</h1>
                        <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {format(new Date(event.startDate || event.date || ""), "EEE, d MMM yyyy")}</span>
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {venueName}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Header actions can go here */}
                </div>
            </div>
        </header>

        <div className="container py-8 space-y-8">
            {event.type === 'SingleMatch' ? (
                <div className="max-w-3xl space-y-12">
                     <section className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-black uppercase tracking-tight">Manage Match</h2>
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-1 rounded">Single Match</span>
                        </div>
                        
                        <form onSubmit={handleUpdate} className="space-y-8">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-2 col-span-2">
                                    <Label htmlFor="name">Event Name</Label>
                                    <Input 
                                        id="name" 
                                        value={editName} 
                                        onChange={e => setEditName(e.target.value)} 
                                        placeholder="e.g. Friendly Match"
                                        required 
                                    />
                                </div>
                                
                                <div className="flex flex-col gap-2 col-span-2">
                                    <Label>Event Date</Label>
                                    <Input 
                                        type="date" 
                                        value={editStartDate} 
                                        onChange={e => setEditStartDate(e.target.value)} 
                                        required 
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-border/50">
                                    <MatchForm 
                                    organizationId={organizationId}
                                    event={event}
                                    isSportsDay={false}
                                    initialData={games[0] ? {
                                        homeTeamId: games[0].homeTeamId,
                                        awayTeamId: games[0].awayTeamId,
                                        startTime: games[0].startTime,
                                        isTbd: !games[0].startTime,
                                        venueId: games[0].venueId,
                                        sportId: event.sportIds?.[0]
                                    } : undefined}
                                    onChange={setMatchFormData}
                                    />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4">
                                <MetalButton 
                                    type="button"
                                    variantType="outlined"
                                    disabled={!isDirty || loading}
                                    onClick={() => setIsInitialized(false)}
                                >
                                    Discard Changes
                                </MetalButton>
                                <Button disabled={!isDirty || loading} className="px-8">
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    </section>

                    <section className="space-y-6 border-t border-destructive/10 pt-12">
                        <h2 className="text-xl font-black uppercase tracking-tight text-destructive">Danger Zone</h2>
                        <div className="space-y-8">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <h3 className="font-bold text-lg">Cancel Event</h3>
                                    <p className="text-sm text-muted-foreground italic">Marks the event and all scheduled matches as cancelled.</p>
                                </div>
                                {event.status === 'Cancelled' ? (
                                        <Badge variant="destructive" className="h-10 px-6 text-sm uppercase font-black">Event Cancelled</Badge>
                                ) : (
                                    <MetalButton variantType="outlined" className="border-destructive/50 text-destructive hover:bg-destructive/10" glowColor="hsl(38, 92%, 50%)" onClick={() => setConfirmCancel({ isOpen: true })}>
                                        Cancel Event
                                    </MetalButton>
                                )}
                            </div>
                            
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <h3 className="font-bold text-lg">Delete Event</h3>
                                    <p className="text-sm text-muted-foreground italic">Permanently removes this event and all associated data. This action cannot be undone.</p>
                                </div>
                                <MetalButton variantType="outlined" className="border-destructive/50 text-destructive hover:bg-destructive/10" glowColor="hsl(var(--destructive))" onClick={() => setConfirmDelete({ isOpen: true })} disabled={!canDelete}>
                                    Delete Event
                                </MetalButton>
                            </div>
                            {!canDelete && event.status !== 'Cancelled' && (
                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest text-center">
                                    Cannot delete event because it has already started or contains finished games.
                                </p>
                            )}
                        </div>
                    </section>
                </div>
            ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 md:w-[400px]">
                    <TabsTrigger value="schedule">Schedule</TabsTrigger>
                    <TabsTrigger value="scoreboard">Standings</TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center gap-2">
                        <SettingsIcon className="w-4 h-4" /> Settings
                    </TabsTrigger>
                </TabsList>

                    <div className="mt-8">
                        <TabsContent value="schedule" className="space-y-6 outline-none">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-muted/30 p-2 rounded-xl ring-1 ring-border/50">
                                <div className="flex items-center gap-1 p-1 overflow-x-auto w-full md:w-auto">
                                    <Button 
                                        variant={grouping === 'sport' ? 'secondary' : 'ghost'} 
                                        size="sm" 
                                        className={cn("h-8 px-3 text-[10px] uppercase font-black tracking-widest whitespace-nowrap", grouping === 'sport' && "shadow-sm")}
                                        onClick={() => setGrouping('sport')}
                                    >
                                        <TrophyIcon className="w-3.5 h-3.5 mr-1.5" /> Sport
                                    </Button>
                                    <Button 
                                        variant={grouping === 'venue' ? 'secondary' : 'ghost'} 
                                        size="sm" 
                                        className={cn("h-8 px-3 text-[10px] uppercase font-black tracking-widest whitespace-nowrap", grouping === 'venue' && "shadow-sm")}
                                        onClick={() => setGrouping('venue')}
                                    >
                                        <MapPinIcon className="w-3.5 h-3.5 mr-1.5" /> Venue
                                    </Button>
                                    <Button 
                                        variant={grouping === 'time' ? 'secondary' : 'ghost'} 
                                        size="sm" 
                                        className={cn("h-8 px-3 text-[10px] uppercase font-black tracking-widest whitespace-nowrap", grouping === 'time' && "shadow-sm")}
                                        onClick={() => setGrouping('time')}
                                    >
                                        <Clock className="w-3.5 h-3.5 mr-1.5" /> Time
                                    </Button>
                                </div>
                                
                                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                                    <Select value={filterSportId} onValueChange={setFilterSportId}>
                                        <SelectTrigger className="h-8 w-[130px] text-xs">
                                            <SelectValue placeholder="All Sports" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Sports</SelectItem>
                                            {allSports.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    
                                    <Select value={filterVenueId} onValueChange={setFilterVenueId}>
                                        <SelectTrigger className="h-8 w-[130px] text-xs">
                                            <SelectValue placeholder="All Venues" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Venues</SelectItem>
                                            {venues.map(v => (
                                                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
 
                                    <div className="ml-2 pl-2 border-l border-border/50">
                                        <MetalButton 
                                            size="sm" 
                                            variantType="filled"
                                            glowColor="hsl(var(--primary))"
                                            icon={<Trophy className="w-4 h-4" />}
                                            onClick={() => router.push(`/admin/organizations/${organizationId}/events/${eventId}/games/new`)}
                                        >
                                            Add Game
                                        </MetalButton>
                                    </div>
                                </div>
                            </div>
                            {renderSchedule()}
                        </TabsContent>
 
                    <TabsContent value="scoreboard" className="outline-none">
                        {renderScoreboard()}
                    </TabsContent>
 
                    <TabsContent value="settings" className="outline-none">
                        <div className="max-w-4xl space-y-12">
                            <section className="space-y-6">
                                <h2 className="text-2xl font-black uppercase tracking-tight">Event Settings</h2>
                                <MetalCard className="p-8">
                                    <form onSubmit={handleUpdate} className="grid gap-8">
                                        <div className="grid gap-6 md:grid-cols-2">
                                            <div className="space-y-2 col-span-2">
                                                <Label htmlFor="name">Event Name</Label>
                                                <Input 
                                                    id="name" 
                                                    value={editName} 
                                                    onChange={e => setEditName(e.target.value)} 
                                                    placeholder="e.g. Winter Sports Day 2024"
                                                    required 
                                                />
                                            </div>
                                            
                                            <div className="flex flex-col gap-2">
                                                <Label>Event Date</Label>
                                                <Input 
                                                    type="date" 
                                                    value={editStartDate} 
                                                    onChange={e => setEditStartDate(e.target.value)} 
                                                    required 
                                                />
                                            </div>
 
                                            <div className="flex items-center gap-2 mt-2">
                                                <input 
                                                    type="checkbox" 
                                                    id="editIsMultiDay" 
                                                    checked={isMultiDay} 
                                                    onChange={(e) => setIsMultiDay(e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                />
                                                <Label htmlFor="editIsMultiDay" className="text-xs cursor-pointer">Multi-day Event</Label>
                                            </div>
                                            
                                            {isMultiDay && (
                                                <div className="mt-2 text-sm text-destructive font-medium animate-in fade-in slide-in-from-top-1">
                                                     End Date: <Input type="date" min={editStartDate} value={editEndDate} onChange={e => setEditEndDate(e.target.value)} className="inline-block w-40 h-8 ml-2" required />
                                                </div>
                                            )}
 
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between mb-2">
                                                    <Label htmlFor="venue">Venue</Label>
                                                </div>
                                                <GenericAutocomplete 
                                                    items={venues.map(v => ({ id: v.id, label: v.name, data: v }))}
                                                    value={editVenueName}
                                                    onChange={setEditVenueName}
                                                    onSelect={(item) => {
                                                        if (item) {
                                                            setEditVenueId(item.id);
                                                            setEditVenueName(item.label);
                                                        } else {
                                                            setEditVenueId("");
                                                        }
                                                    }}
                                                    onCreateNew={handleCreateVenue}
                                                    placeholder="Select or create venue..."
                                                    createLabel="Create Venue"
                                                />
                                            </div>
                                        </div>
 
                                        {(event.type === 'SportsDay' || event.type === 'Tournament') && (
                                            <div className="grid gap-8 border-t border-border/50 pt-8">
                                                <div className="space-y-3">
                                                    <Label>Sports</Label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {allSports.map(sport => {
                                                            const isSelected = selectedSportIds.includes(sport.id);
                                                            return (
                                                                <div 
                                                                    key={sport.id}
                                                                    onClick={() => toggleSport(sport.id)}
                                                                    className={`cursor-pointer px-3 py-1.5 rounded-full border text-sm font-medium transition-colors flex items-center gap-2
                                                                        ${isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent"}
                                                                    `}
                                                                >
                                                                    {sport.name}
                                                                    {isSelected && <Check className="w-3 h-3" />}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
 
                                                <div className="space-y-3">
                                                    <Label>Participating Organizations</Label>
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        {selectedOrgIds.map(id => {
                                                            const org = allOrgs.find(o => o.id === id);
                                                            if (!org) return null;
                                                            return (
                                                                <div key={id} className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md text-sm ring-1 ring-border/50">
                                                                    {org.name}
                                                                    <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={() => setSelectedOrgIds(selectedOrgIds.filter(oid => oid !== id))} />
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                    <GenericAutocomplete 
                                                        items={allOrgs.filter(o => !selectedOrgIds.includes(o.id) && o.id !== organizationId).map(o => ({ id: o.id, label: o.name, data: o }))}
                                                        value={orgSearch}
                                                        onChange={setOrgSearch}
                                                        onSelect={(item) => {
                                                            if (item) {
                                                                setSelectedOrgIds([...selectedOrgIds, item.id]);
                                                                setOrgSearch("");
                                                            }
                                                        }}
                                                        onCreateNew={(name) => {
                                                            setPendingOrgName(name);
                                                            setOrgDialogOpen(true);
                                                        }}
                                                        placeholder="Add organization..."
                                                        createLabel="Register Organization"
                                                    />
                                                </div>
                                            </div>
                                        )}
 
                                        <div className="flex items-center justify-end gap-3 pt-4">
                                            <MetalButton 
                                                type="button"
                                                variantType="outlined"
                                                disabled={!isDirty || loading}
                                                onClick={() => setIsInitialized(false)}
                                            >
                                                Discard Changes
                                            </MetalButton>
                                            <Button disabled={!isDirty || loading} className="px-8">
                                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Save Changes
                                            </Button>
                                        </div>
                                    </form>
                                </MetalCard>
                            </section>
 
                            <section className="space-y-6">
                                <h2 className="text-xl font-black uppercase tracking-tight text-destructive">Danger Zone</h2>
                                <MetalCard className="p-8 border-destructive/20 bg-destructive/5">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="space-y-1">
                                            <h3 className="font-bold text-lg">Cancel Event</h3>
                                            <p className="text-sm text-muted-foreground italic">Marks the event and all scheduled matches as cancelled.</p>
                                        </div>
                                        {event.status === 'Cancelled' ? (
                                             <Badge variant="destructive" className="h-10 px-6 text-sm uppercase font-black">Event Cancelled</Badge>
                                        ) : (
                                            <MetalButton variantType="outlined" className="border-destructive/50 text-destructive hover:bg-destructive/10" glowColor="hsl(38, 92%, 50%)" onClick={() => setConfirmCancel({ isOpen: true })}>
                                                Cancel Event
                                            </MetalButton>
                                        )}
                                    </div>
                                    
                                    <div className="mt-8 pt-8 border-t border-destructive/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="space-y-1">
                                            <h3 className="font-bold text-lg">Delete Event</h3>
                                            <p className="text-sm text-muted-foreground italic">Permanently removes this event and all associated data. This action cannot be undone.</p>
                                        </div>
                                        <MetalButton variantType="outlined" className="border-destructive/50 text-destructive hover:bg-destructive/10" glowColor="hsl(var(--destructive))" onClick={() => setConfirmDelete({ isOpen: true })} disabled={!canDelete}>
                                            Delete Event
                                        </MetalButton>
                                    </div>
                                    {!canDelete && event.status !== 'Cancelled' && (
                                        <p className="mt-4 text-[10px] text-muted-foreground uppercase font-black tracking-widest text-center">
                                            Cannot delete event because it has already started or contains finished games.
                                        </p>
                                    )}
                                </MetalCard>
                            </section>
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
            )}
        </div>

        <ConfirmationModal 
            isOpen={confirmDelete.isOpen}
            onOpenChange={(open) => setConfirmDelete({ isOpen: open })}
            onConfirm={handleDelete}
            title="Delete Event?"
            description={`Are you sure you want to delete "${event.name}"? This will permanently remove all scheduled games and results.`}
            confirmText="Delete Event"
            variant="destructive"
        />

        <ConfirmationModal 
            isOpen={confirmCancel.isOpen}
            onOpenChange={(open) => setConfirmCancel({ isOpen: open })}
            onConfirm={handleCancelEvent}
            title="Cancel Event?"
            description={`Are you sure you want to cancel "${event.name}"? All scheduled games will also be marked as cancelled.`}
            confirmText="Cancel Event"
            variant="destructive"
        />

        <OrgCreationDialog 
            open={orgDialogOpen}
            onOpenChange={setOrgDialogOpen}
            initialName={pendingOrgName}
            onCreated={(org) => {
                setSelectedOrgIds([...selectedOrgIds, org.id]);
                setOrgSearch("");
            }}
            supportedSportIds={selectedSportIds}
        />
    </div>
  );
}
