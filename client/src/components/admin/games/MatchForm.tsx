"use client";

import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GenericAutocomplete } from "@/components/ui/GenericAutocomplete";
import { Event, Organization, Sport, Team } from "@sk/types";
import { store } from "@/app/store/store";
import { Loader2, Check } from "lucide-react";
import { OrgCreationDialog } from "../organizations/OrgCreationDialog";
import { TeamCreationDialog } from "../teams/TeamCreationDialog";

export interface MatchFormData {
  homeTeamId: string;
  awayTeamId: string;
  startTime: string;
  isTbd: boolean;
  venueId: string;
  sportId: string;
}

interface MatchFormProps {
  organizationId: string;
  event: Event;
  initialData?: Partial<MatchFormData>;
  onChange: (data: MatchFormData) => void;
  isSportsDay?: boolean;
}

export function MatchForm({
  organizationId,
  event,
  initialData,
  onChange,
  isSportsDay = false,
}: MatchFormProps) {
  const [loading, setLoading] = useState(false);
  const [allSports, setAllSports] = useState<Sport[]>([]);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [venues, setVenues] = useState<any[]>([]);

  // Form State
  const [selectedSportId, setSelectedSportId] = useState(initialData?.sportId || (event.sportIds?.[0] || ""));
  const [homeOrgId, setHomeOrgId] = useState(organizationId);
  const [homeOrgName, setHomeOrgName] = useState("");
  const [homeTeamId, setHomeTeamId] = useState(initialData?.homeTeamId || "");
  const [homeOrgTeams, setHomeOrgTeams] = useState<Team[]>([]);

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [targetOrgName, setTargetOrgName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(initialData?.awayTeamId || null);
  const [targetTeamName, setTargetTeamName] = useState("");
  const [opponentOrgTeams, setOpponentOrgTeams] = useState<Team[]>([]);

  const [startTime, setStartTime] = useState(() => {
    if (!initialData?.startTime) return "09:00";
    if (initialData.startTime.includes('T')) {
      return initialData.startTime.split('T')[1].substring(0, 5);
    }
    return initialData.startTime;
  });
  const [isTbd, setIsTbd] = useState(initialData?.isTbd || !initialData?.startTime);
  const [gameVenueId, setGameVenueId] = useState(initialData?.venueId || event.venueId || "");
  const [gameVenueName, setGameVenueName] = useState("");

  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [pendingOrgName, setPendingOrgName] = useState("");
  const [isCreatingHomeOrg, setIsCreatingHomeOrg] = useState(false);

  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [isCreatingHomeTeam, setIsCreatingHomeTeam] = useState(false);
  const [pendingTeamName, setPendingTeamName] = useState("");
  const [targetOrgIdForTeam, setTargetOrgIdForTeam] = useState("");

  const participatingOrgIds = [event.organizationId, ...(event.participatingOrgIds || [])];
  const eventSports = event.sportIds && event.sportIds.length > 0 
    ? allSports.filter(s => (event.sportIds || []).includes(s.id))
    : allSports;

  // Notify parent of changes
  useEffect(() => {
    onChange({
      homeTeamId,
      awayTeamId: selectedTeamId || "",
      startTime,
      isTbd,
      venueId: gameVenueId,
      sportId: selectedSportId
    });
  }, [homeTeamId, selectedTeamId, startTime, isTbd, gameVenueId, selectedSportId]);

  // Initialization & Updates
  useEffect(() => {
    const update = () => {
      setAllOrgs(store.getOrganizations());
      setAllSports(store.getSports());
      const allVenues = store.getVenues(organizationId);
      setVenues(allVenues);

      if (gameVenueId && !gameVenueName) {
        const v = store.getVenue(gameVenueId);
        if (v) setGameVenueName(v.name);
      }

      if (homeOrgId) {
        let teams = store.getTeams(homeOrgId).filter(t => t.isActive !== false);
        if (selectedSportId) {
          teams = teams.filter(t => t.sportId === selectedSportId);
        }
        setHomeOrgTeams(teams);
      }

      if (selectedOrgId) {
        let teams = store.getTeams(selectedOrgId).filter(t => t.isActive !== false);
        if (selectedSportId) {
          teams = teams.filter(t => t.sportId === selectedSportId);
        }
        setOpponentOrgTeams(teams);
      }
    };

    update();
    const unsub = store.subscribe(update);
    return unsub;
  }, [homeOrgId, selectedOrgId, selectedSportId, organizationId, gameVenueId]);

  // Special effect to resolve organizations from team IDs once data is available
  useEffect(() => {
    // Resolve Away Team Details
    if (initialData?.awayTeamId && (!selectedOrgId || !targetTeamName || !targetOrgName)) {
      const awayTeam = store.getTeam(initialData.awayTeamId);
      if (awayTeam) {
        if (!selectedOrgId) setSelectedOrgId(awayTeam.organizationId);
        if (!targetOrgName) setTargetOrgName(store.getOrganization(awayTeam.organizationId)?.name || "");
        if (!selectedTeamId) setSelectedTeamId(awayTeam.id);
        if (!targetTeamName) setTargetTeamName(awayTeam.name);
      }
    }
    
    // Resolve Home Team Details
    if (initialData?.homeTeamId && (!homeOrgName || !homeTeamId)) {
        const homeTeam = store.getTeam(initialData.homeTeamId);
        if (homeTeam) {
            // Only update ID if strictly needed or if we suspect mismatch (but here we trust initialData)
            // Just update Name if missing
            if ((!homeOrgId || homeOrgId === organizationId) && homeTeam.organizationId !== homeOrgId) {
                 setHomeOrgId(homeTeam.organizationId);
            }
            if (!homeOrgName) setHomeOrgName(store.getOrganization(homeTeam.organizationId)?.name || "");
            if (!homeTeamId) setHomeTeamId(homeTeam.id);
        }
    }
  }, [initialData, homeTeamId, selectedOrgId, selectedTeamId, homeOrgName, targetOrgName, targetTeamName, allOrgs]);

  const handleCreateOrg = (name: string, isHome: boolean) => {
    setPendingOrgName(name);
    setIsCreatingHomeOrg(isHome);
    setOrgDialogOpen(true);
  };

  const handleOrgCreated = (newOrg: Organization) => {
    if (isCreatingHomeOrg) {
      setHomeOrgId(newOrg.id);
      setHomeOrgName(newOrg.name);
    } else {
      setSelectedOrgId(newOrg.id);
      setTargetOrgName(newOrg.name);
    }
  };

  const handleCreateTeam = (name: string, isHome: boolean) => {
    const orgId = isHome ? homeOrgId : selectedOrgId;
    if (!orgId || !name.trim()) return;
    
    setPendingTeamName(name);
    setIsCreatingHomeTeam(isHome);
    setTargetOrgIdForTeam(orgId);
    setTeamDialogOpen(true);
  };

  const handleTeamCreated = (newTeam: Team) => {
    if (isCreatingHomeTeam) {
      setHomeTeamId(newTeam.id);
    } else {
      setSelectedTeamId(newTeam.id);
      setTargetTeamName(newTeam.name);
    }
  };

  const handleCreateVenue = async (name: string) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const newVenue = await store.addVenue({
        name: name,
        address: "TBD",
        organizationId: organizationId
      });
      setGameVenueName(newVenue.name);
      setGameVenueId(newVenue.id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SPORT & TIME */}
        <div className="space-y-4">
          {eventSports.length > 1 && (
            <div className="space-y-2">
              <Label>Sport</Label>
              <Select value={selectedSportId} onValueChange={setSelectedSportId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Sport..." />
                </SelectTrigger>
                <SelectContent>
                  {eventSports.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Time</Label>
              <Label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isTbd}
                  onChange={(e) => setIsTbd(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/40 text-primary focus:ring-primary cursor-pointer transition-colors group-hover:border-primary/50"
                />
                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground group-hover:text-primary/70 transition-colors">TBD</span>
              </Label>
            </div>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={isTbd}
              className={isTbd ? "opacity-50" : ""}
            />
          </div>

          <div className="space-y-2">
            <Label>Venue</Label>
            <GenericAutocomplete
              items={venues.map(v => ({ id: v.id, label: v.name, data: v }))}
              value={gameVenueName}
              onChange={setGameVenueName}
              onSelect={(item) => {
                if (item) {
                  setGameVenueId(item.id);
                  setGameVenueName(item.label);
                } else {
                  setGameVenueId("");
                }
              }}
              onCreateNew={handleCreateVenue}
              placeholder="Select match location..."
              createLabel="Add Location"
              isLoading={loading}
            />
          </div>
        </div>

        {/* TEAM SELECTION */}
        <div className="space-y-4">
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary/70">Teams</h3>
            
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="uppercase">Team 1</Label>
                {isSportsDay ? (
                  <div className="space-y-2">
                     <GenericAutocomplete 
                        items={allOrgs.map(o => ({ id: o.id, label: o.name, data: o }))}
                        value={homeOrgName}
                        onChange={(val) => {
                            setHomeOrgName(val);
                            if (!val) setHomeOrgId("");
                        }}
                        onSelect={(item) => {
                            if (item) {
                                setHomeOrgId(item.id);
                                setHomeOrgName(item.label);
                            } else {
                                setHomeOrgId("");
                            }
                        }}
                        onCreateNew={(name) => handleCreateOrg(name, true)}
                        placeholder="Select school/club..."
                        createLabel="Register Org"
                        isLoading={loading}
                    />
                    <GenericAutocomplete 
                        items={homeOrgTeams.map(t => ({ id: t.id, label: t.name, subLabel: t.ageGroup, data: t }))}
                        value={homeOrgTeams.find(t => t.id === homeTeamId)?.name || ""}
                        onChange={() => {}} 
                        onSelect={(item) => setHomeTeamId(item?.id || "")}
                        onCreateNew={(name) => handleCreateTeam(name, true)}
                        placeholder={selectedSportId ? "Select team..." : "Select Sport First"}
                        createLabel="Add Team"
                        isLoading={loading || !selectedSportId}
                    />
                  </div>
                ) : (
                  <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select our team..." />
                    </SelectTrigger>
                    <SelectContent>
                      {homeOrgTeams.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name} ({t.ageGroup})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="relative py-2 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/30" />
                </div>
                <span className="relative bg-background px-2 text-[10px] font-black italic text-muted-foreground uppercase tracking-widest">vs</span>
              </div>

              <div className="space-y-1.5">
                <Label className="uppercase">Team 2</Label>
                <div className="space-y-2">
                  <GenericAutocomplete
                    items={allOrgs.map(o => ({ id: o.id, label: o.name, data: o }))}
                    value={targetOrgName}
                    onChange={setTargetOrgName}
                    onSelect={(item) => {
                      if (item) {
                        setSelectedOrgId(item.id);
                      } else {
                        setSelectedOrgId(null);
                      }
                    }}
                    onCreateNew={(name) => handleCreateOrg(name, false)}
                    placeholder="Search opponent org..."
                    createLabel="Register Org"
                    isLoading={loading}
                  />
                  <GenericAutocomplete
                    items={opponentOrgTeams.map(t => ({ id: t.id, label: t.name, subLabel: t.ageGroup, data: t }))}
                    value={targetTeamName}
                    onChange={setTargetTeamName}
                    onSelect={(item) => setSelectedTeamId(item?.id || null)}
                    onCreateNew={(name) => handleCreateTeam(name, false)}
                    placeholder={selectedOrgId ? "Search opponent team..." : "Select organization first"}
                    createLabel="Add Team"
                    isLoading={loading || !selectedOrgId}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <OrgCreationDialog 
        open={orgDialogOpen}
        onOpenChange={setOrgDialogOpen}
        initialName={pendingOrgName}
        onCreated={handleOrgCreated}
        supportedSportIds={selectedSportId ? [selectedSportId] : []}
      />

      <TeamCreationDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        organizationId={targetOrgIdForTeam}
        initialName={pendingTeamName}
        initialSportId={selectedSportId}
        initialAgeGroup={(() => {
            const otherTeamId = isCreatingHomeTeam ? selectedTeamId : homeTeamId;
            if (otherTeamId) {
                const team = store.getTeam(otherTeamId);
                return team?.ageGroup;
            }
            return "Open";
        })()}
        onCreated={handleTeamCreated}
      />
    </div>
  );
}
