"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { store } from "@/app/store/store";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Event, Game, Organization, Team, Sport, Address } from "@sk/types";
import { useOrganization } from "@/hooks/useOrganization";
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
  const orgId = params.id as string;
  const eventId = params.eventId as string;
  const router = useRouter();
  const { metalVariant } = useThemeColors();

  const { org, isLoading: orgLoading } = useOrganization(orgId, { subscribeData: true });
  const [event, setEvent] = useState<Event | undefined>(() => store.getEvent(eventId));
  const [games, setGames] = useState<Game[]>(() => store.getGames().filter(g => g.eventId === eventId));
  const [siteName, setSiteName] = useState(() => {
    const ev = store.getEvent(eventId);
    if (ev?.siteId) {
        return store.getSite(ev.siteId)?.name || "Unknown Site";
    }
    return "";
  });
  
  // Helper to resolve team names
  const [teamMap, setTeamMap] = useState<Record<string, string>>({});
  const [grouping, setGrouping] = useState<'time' | 'sport' | 'site'>('time');
  const [activeTab, setActiveTab] = useState<string>(searchParams.get("tab") || "schedule");

  // EDIT STATE (cloned from event)
  const [isProcessing, setIsProcessing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [editSiteId, setEditSiteId] = useState("");
  const [editSiteName, setEditSiteName] = useState("");
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [orgSearch, setOrgSearch] = useState("");

  const [matchFormData, setMatchFormData] = useState<MatchFormData | null>(null);
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [pendingOrgName, setPendingOrgName] = useState("");

  const [sites, setSites] = useState<any[]>([]);
  const [allSports, setAllSports] = useState<Sport[]>([]);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);

  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false });
  const [confirmCancel, setConfirmCancel] = useState({ isOpen: false });
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEventLoading, setIsEventLoading] = useState(!store.getEvent(eventId));

  const [filterSportId, setFilterSportId] = useState<string>("all");
  const [filterSiteId, setFilterSiteId] = useState<string>("all");

  // Dirty Tracking
  const isDirty = event ? (
      editName !== event.name ||
      editStartDate !== (event.startDate?.split('T')[0] || event.date?.split('T')[0] || "") ||
      (isMultiDay ? editEndDate !== (event.endDate?.split('T')[0] || "") : (!!event.endDate && event.endDate !== (event.startDate || event.date))) ||
      editSiteId !== (event.siteId || "default") ||
      JSON.stringify([...selectedSportIds].sort()) !== JSON.stringify([...(event.sportIds || [])].sort()) ||
      JSON.stringify([...selectedOrgIds].sort()) !== JSON.stringify([...(event.participatingOrgIds || [])].sort()) ||
      (event.type === 'SingleMatch' && matchFormData && (
          matchFormData.sportId !== (event.sportIds?.[0] || "") ||
          matchFormData.startTime !== (games[0]?.startTime ? format(new Date(games[0].startTime), "HH:mm") : "09:00") ||
          matchFormData.isTbd !== (!games[0]?.startTime) ||
          matchFormData.homeTeamId !== (games[0]?.participants?.[0]?.teamId || "") ||
          matchFormData.awayTeamId !== (games[0]?.participants?.[1]?.teamId || "") ||
          matchFormData.siteId !== (games[0]?.siteId || event.siteId || "")
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
        if (ev && JSON.stringify(ev) !== JSON.stringify(event)) {
             setEvent(ev);
        }
        
        if (ev) {
            // Subscribe to real-time updates for this event and its site
            store.subscribeToEvent(ev.id);
            if (ev.siteId) store.subscribeToSite(ev.siteId);

            const v = store.getSite(ev.siteId || "");
            const newSiteName = v ? v.name : "Unknown Site";
            if (newSiteName !== siteName) setSiteName(newSiteName);

            if (!isInitialized) {
                setEditName(ev.name);
                setEditStartDate(ev.startDate?.split('T')[0] || ev.date?.split('T')[0] || "");
                setEditEndDate(ev.endDate?.split('T')[0] || "");
                setIsMultiDay(!!ev.endDate && ev.endDate.split('T')[0] !== (ev.startDate || ev.date)?.split('T')[0]);
                setEditSiteId(ev.siteId || "default");
                if (v) setEditSiteName(v.name);
                setSelectedSportIds(ev.sportIds || []);
                setSelectedOrgIds(ev.participatingOrgIds || []);

                setIsInitialized(true);
            }
            setIsEventLoading(false);
        }

        const newSites = store.getSites(orgId);
        if (JSON.stringify(newSites) !== JSON.stringify(sites)) setSites(newSites);
        
        const newSports = store.getSports();
        if (JSON.stringify(newSports) !== JSON.stringify(allSports)) setAllSports(newSports);
        
        const newOrgs = store.getOrganizations();
        if (JSON.stringify(newOrgs) !== JSON.stringify(allOrgs)) setAllOrgs(newOrgs);

        const allGames = store.getGames(); // Get all to capture neutral games in event
        const eventGames = allGames.filter(g => g.eventId === eventId);
        if (JSON.stringify(eventGames) !== JSON.stringify(games)) setGames(eventGames);

        const allTeams = store.getTeams(); 
        const mapping: Record<string, string> = {};
        allTeams.forEach(t => {
            mapping[t.id] = t.name;
        });
        if (JSON.stringify(mapping) !== JSON.stringify(teamMap)) setTeamMap(mapping);
    };

    update();
    const unsub = store.subscribe(update);
    update(); // Initial load

    // If event is not found, try fetching it (e.g. deep link to shared event)
    if (!store.getEvent(eventId)) {
        store.fetchEvent(eventId).finally(() => setIsEventLoading(false));
    } else {
        setIsEventLoading(false);
    }

    return () => {
        store.unsubscribe(update);
        store.unsubscribeFromEvent(eventId);
        if (event?.siteId) store.unsubscribeFromSite(event.siteId);
        if (event?.participatingOrgIds) {
             event.participatingOrgIds.forEach(id => store.unsubscribeFromOrganizationData(id));
        }
    };
  }, [eventId, orgId, isInitialized]);

  // Separate effect to handle dynamic subscriptions to participating organizations
  useEffect(() => {
    if (event?.participatingOrgIds) {
        event.participatingOrgIds.forEach(id => {
            store.subscribeToOrganizationData(id);
        });
    }
  }, [event?.participatingOrgIds]);

  if ((orgLoading && !org) || (isEventLoading && !event)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading event details...</p>
      </div>
    );
  }

  if (!org) return null;

  if (!event) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <h2 className="text-2xl font-bold font-orbitron">Event Not Found</h2>
            <p className="text-muted-foreground">The event you are looking for does not exist or has been removed.</p>
            <MetalButton onClick={() => {
                const fromTeamId = searchParams.get("fromTeamId");
                if (fromTeamId) {
                    router.push(`/admin/organizations/${orgId}/teams/${fromTeamId}/events`);
                } else {
                    router.push(`/admin/organizations/${orgId}/events`);
                }
            }}>
                Back to Events
            </MetalButton>
        </div>
      );
  }

  const getTeamName = (id: string, name?: string) => {
      const team = store.getTeam(id);
      if (team) {
          const org = store.getOrganization(team.orgId);
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
    setIsProcessing(true);
    try {
        if (!editName.trim()) {
             toast({
                 title: "Validation Error",
                 description: "Event name is required",
                 variant: "warning"
             });
             setIsProcessing(false);
             return;
        }

        if (isMultiDay && editEndDate < editStartDate) {
            toast({
                title: "Validation Error",
                description: "End Date cannot be before Start Date",
                variant: "warning"
            });
            setIsProcessing(false);
            return;
        }

        const payload: Partial<Event> = {
            name: editName,
            startDate: editStartDate,
            endDate: isMultiDay ? editEndDate : undefined,
            siteId: editSiteId === "default" ? "" : editSiteId,
        };

        if (event.type === 'SingleMatch' && matchFormData) {
            payload.sportIds = matchFormData.sportId ? [matchFormData.sportId] : [];
            const awayTeam = store.getTeam(matchFormData.awayTeamId);
            payload.participatingOrgIds = awayTeam ? [awayTeam.orgId] : [];
        } else {
            payload.participatingOrgIds = selectedOrgIds;
            payload.sportIds = selectedSportIds;
        }

        await store.updateEvent(event.id, payload);
        console.log("EventDetailsPage: Updated event metadata", payload);

        if (event.type === 'SingleMatch' && games.length === 1 && matchFormData) {
            const gamePayload = {
                participants: [
                    { teamId: matchFormData.homeTeamId || null as any }, 
                    { teamId: matchFormData.awayTeamId || null as any }
                ],
                startTime: matchFormData.isTbd ? null as any : `${(editStartDate || event.startDate || event.date || "").split('T')[0]}T${matchFormData.startTime}:00`,
                siteId: matchFormData.siteId || null as any,
                facilityId: matchFormData.facilityId || null as any
            };
            console.log("EventDetailsPage: Updating game for SingleMatch", gamePayload);
            await store.updateGame(games[0].id, gamePayload);
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
        setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    setIsProcessing(true);
    try {
        await store.deleteEvent(event.id);
        const fromTeamId = searchParams.get("fromTeamId");
        if (fromTeamId) {
            router.push(`/admin/organizations/${orgId}/teams/${fromTeamId}/events`);
        } else {
            router.push(`/admin/organizations/${orgId}/events`);
        }
    } catch (err) {
        console.error(err);
        toast({
            title: "Error",
            description: "Failed to delete event",
            variant: "destructive"
        });
        setIsProcessing(false);
    }
  };

  const handleCancelEvent = async () => {
    if (!event) return;
    setIsProcessing(true);
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
        setIsProcessing(false);
    }
  };

  const toggleSport = (sportId: string) => {
      setSelectedSportIds(prev => 
          prev.includes(sportId) ? prev.filter(id => id !== sportId) : [...prev, sportId]
      );
  };

  const handleCreateSite = async (name: string) => {
      if (!name.trim()) return;
      try {
          const newSite = await store.addSite({
              name,
              address: { fullAddress: "TBD" } as Address,
              orgId
          });
          setEditSiteId(newSite.id);
          setEditSiteName(newSite.name);
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
      if (!orgPoints[event.orgId]) {
          orgPoints[event.orgId] = { wins: 0, draws: 0, losses: 0, total: 0 };
      }

      games.filter(g => g.status === 'Finished').forEach(g => {
          const p1 = g.participants?.[0]?.teamId;
          const p2 = g.participants?.[1]?.teamId;
          const homeTeam = p1 ? store.getTeam(p1) : undefined;
          const awayTeam = p2 ? store.getTeam(p2) : undefined;
          if (!homeTeam || !awayTeam) return;

          const homeOrgId = homeTeam.orgId;
          const awayOrgId = awayTeam.orgId;

          const getScore = (index: number) => g.finalScoreData?.[index === 0 ? 'home' : 'away'] ?? 0;
          const homeScore = getScore(0);
          const awayScore = getScore(1);

          if (homeScore > awayScore) {
              if (orgPoints[homeOrgId]) orgPoints[homeOrgId].wins++;
              if (orgPoints[awayOrgId]) orgPoints[awayOrgId].losses++;
          } else if (awayScore > homeScore) {
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
          const p1 = match.participants?.[0]?.teamId;
          const p2 = match.participants?.[1]?.teamId;
          const getScore = (index: number) => {
              if (match.status === 'Finished' && match.finalScoreData) return match.finalScoreData[index === 0 ? 'home' : 'away'] ?? 0;
              if (match.liveState) return match.liveState[index === 0 ? 'home' : 'away'] ?? 0;
              return 0;
          };
          
          return (
              <MetalCard className="p-8 text-center max-w-2xl mx-auto overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                  <div className="flex items-center justify-between gap-8 py-8">
                      <div className="flex-1 text-right">
                          <h2 className="text-3xl font-black uppercase mb-2">{p1 ? getTeamName(p1) : "Unknown"}</h2>
                          <div className="text-6xl font-black font-mono text-primary">{getScore(0)}</div>
                      </div>
                      <div className="flex flex-col items-center gap-4">
                          <Trophy className="w-12 h-12 text-primary/30" />
                          <div className="text-sm font-black uppercase tracking-widest text-muted-foreground">FINAL</div>
                      </div>
                      <div className="flex-1 text-left">
                          <h2 className="text-3xl font-black uppercase mb-2">{p2 ? getTeamName(p2) : "Unknown"}</h2>
                          <div className="text-6xl font-black font-mono text-primary">{getScore(1)}</div>
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
             const p1 = g.participants?.[0]?.teamId;
             const homeTeam = p1 ? store.getTeam(p1) : undefined;
             return homeTeam?.sportId === filterSportId;
         });
    }
    
    if (filterSiteId !== "all") {
         filteredGames = filteredGames.filter(g => g.siteId === filterSiteId);
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
            const p1 = g.participants?.[0]?.teamId;
            const homeTeam = p1 ? store.getTeam(p1) : undefined;
            key = homeTeam ? store.getSport(homeTeam.sportId)?.name || "Unknown Sport" : "Unknown Sport";
        } else if (grouping === 'site') {
            key = g.siteId ? store.getSite(g.siteId)?.name || "Unknown Site" : "No Site";
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
                            onClick={() => router.push(`/admin/organizations/${orgId}/events/${eventId}/games/${game.id}/edit`)}
                          />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 px-3 md:px-0">
        <div className="container py-4 md:py-8 space-y-4 md:space-y-8">
            <div className="flex flex-col gap-1">
                <Link 
                    href={(() => {
                        const fromTeamId = searchParams.get("fromTeamId");
                        return fromTeamId 
                            ? `/admin/organizations/${orgId}/teams/${fromTeamId}/events`
                            : `/admin/organizations/${orgId}/events`;
                    })()}
                    className="inline-flex items-center text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 hover:text-primary transition-colors w-fit group"
                >
                    <ChevronLeft className="h-3 w-3 mr-0.5 group-hover:-translate-x-0.5 transition-transform" />
                    Back to Events
                </Link>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight leading-tight">{event.name}</h1>
                        <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {format(new Date(event.startDate || event.date || ""), "EEE, d MMM yyyy")}</span>
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {siteName}</span>
                        </div>
                    </div>
                </div>
            </div>
            {event.type === 'SingleMatch' ? (
                <div className="max-w-3xl space-y-8 md:space-y-12">
                     <section className="space-y-4 md:space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight hidden md:block">Manage Match</h2>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-1 rounded">Single Match</span>
                        </div>
                        
                        <form onSubmit={handleUpdate} className="space-y-6 md:space-y-8">
                            <div className="space-y-2">
                                <Label htmlFor="name">Event Name</Label>
                                <Input 
                                    id="name" 
                                    value={editName} 
                                    onChange={e => setEditName(e.target.value)} 
                                    placeholder="e.g. Friendly Match"
                                    required 
                                />
                            </div>

                            <div className="pt-4 border-t border-border/50">
                                <MatchForm 
                                    key={games[0]?.id || 'new'}
                                    orgId={orgId}
                                    event={event}
                                    isSportsDay={false}
                                    dateNode={
                                        <div className="flex flex-col gap-2">
                                            <Label>Event Date</Label>
                                            <Input 
                                                type="date" 
                                                value={editStartDate} 
                                                onChange={e => setEditStartDate(e.target.value)} 
                                                required 
                                            />
                                        </div>
                                    }
                                    initialData={games[0] ? {
                                        startTime: games[0].startTime ? format(new Date(games[0].startTime), "HH:mm") : "09:00",
                                        isTbd: !games[0].startTime,
                                        siteId: games[0].siteId || event.siteId || "",
                                        facilityId: games[0].facilityId || "",
                                        homeTeamId: games[0].participants?.[0]?.teamId || "",
                                        awayTeamId: games[0].participants?.[1]?.teamId || "",
                                        sportId: event.sportIds?.[0] || ""
                                    } : undefined}
                                    onChange={setMatchFormData}
                                />
                            </div>

                            <div className="flex flex-col md:flex-row md:items-center justify-end gap-3 pt-6">
                                <MetalButton 
                                    type="button"
                                    variantType="outlined"
                                    className="w-full md:w-auto"
                                    disabled={!isDirty || isProcessing}
                                    onClick={() => setIsInitialized(false)}
                                >
                                    Discard Changes
                                </MetalButton>
                                <Button disabled={!isDirty || isProcessing} className="w-full md:w-auto md:px-8 h-12 md:h-10 order-first md:order-last">
                                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                                    <MetalButton variantType="outlined" className="w-full md:w-auto border-destructive/50 text-destructive hover:bg-destructive/10" glowColor="hsl(38, 92%, 50%)" onClick={() => setConfirmCancel({ isOpen: true })}>
                                        Cancel Event
                                    </MetalButton>
                                )}
                            </div>
                            
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <h3 className="font-bold text-lg">Delete Event</h3>
                                    <p className="text-sm text-muted-foreground italic">Permanently removes this event and all associated data. This action cannot be undone.</p>
                                </div>
                                <MetalButton variantType="outlined" className="w-full md:w-auto border-destructive/50 text-destructive hover:bg-destructive/10" glowColor="hsl(var(--destructive))" onClick={() => setConfirmDelete({ isOpen: true })} disabled={!canDelete || isProcessing}>
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
                                        variant={grouping === 'site' ? 'secondary' : 'ghost'} 
                                        size="sm" 
                                        className={cn("h-8 px-3 text-[10px] uppercase font-black tracking-widest whitespace-nowrap", grouping === 'site' && "shadow-sm")}
                                        onClick={() => setGrouping('site')}
                                    >
                                        <MapPinIcon className="w-3.5 h-3.5 mr-1.5" /> Site
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
                                    
                                    <Select value={filterSiteId} onValueChange={setFilterSiteId}>
                                        <SelectTrigger className="h-8 w-[130px] text-xs">
                                            <SelectValue placeholder="All Sites" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Sites</SelectItem>
                                            {sites.map(v => (
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
                                            onClick={() => router.push(`/admin/organizations/${orgId}/events/${eventId}/games/new`)}
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
                                                    <Label htmlFor="site">Site</Label>
                                                </div>
                                                <GenericAutocomplete 
                                                    items={sites.map(v => ({ id: v.id, label: v.name, data: v }))}
                                                    value={editSiteName}
                                                    onChange={setEditSiteName}
                                                    onSelect={(item) => {
                                                        if (item) {
                                                            setEditSiteId(item.id);
                                                            setEditSiteName(item.label);
                                                        } else {
                                                            setEditSiteId("");
                                                        }
                                                    }}
                                                    onCreateNew={handleCreateSite}
                                                    placeholder="Select or create site..."
                                                    createLabel="Create Site"
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
                                                        items={allOrgs.filter(o => !selectedOrgIds.includes(o.id) && o.id !== orgId).map(o => ({ id: o.id, label: o.name, data: o }))}
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
                                                disabled={!isDirty || isProcessing}
                                                onClick={() => setIsInitialized(false)}
                                            >
                                                Discard Changes
                                            </MetalButton>
                                            <Button disabled={!isDirty || isProcessing} className="px-8">
                                                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
