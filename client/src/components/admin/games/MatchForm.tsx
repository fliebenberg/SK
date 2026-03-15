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
import { Event, Organization, Sport, Team, Address } from "@sk/types";
import { store } from "@/app/store/store";
import { Loader2, Check } from "lucide-react";
import { OrgCreationDialog } from "../organizations/OrgCreationDialog";
import { TeamCreationDialog } from "../teams/TeamCreationDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface MatchFormData {
  homeTeamId: string;
  awayTeamId: string;
  startTime: string;
  isTbd: boolean;
  siteId: string;
  facilityId: string;
  sportId: string;
  referrals?: Record<string, string[]>;
}

interface MatchFormProps {
  orgId: string;
  event: Event;
  initialData?: Partial<MatchFormData>;
  onChange: (data: MatchFormData) => void;
  isSportsDay?: boolean;
  dateNode?: React.ReactNode;
}

export function MatchForm({
  orgId,
  event,
  initialData,
  onChange,
  isSportsDay = false,
  dateNode,
}: MatchFormProps) {
  const [loading, setLoading] = useState(false);
  const [allSports, setAllSports] = useState<Sport[]>([]);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);

  // Form State
  const [selectedSportId, setSelectedSportId] = useState(initialData?.sportId || (event.sportIds?.[0] || ""));
  const [homeOrgId, setHomeOrgId] = useState(orgId);
  const [homeOrgName, setHomeOrgName] = useState("");
  const [homeTeamId, setHomeTeamId] = useState(initialData?.homeTeamId || "");
  const [homeOrgTeams, setHomeOrgTeams] = useState<Team[]>([]);
  const [homeTeamName, setHomeTeamName] = useState("");

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
  const [gameSiteId, setGameSiteId] = useState(initialData?.siteId || event.siteId || "");
  const [gameSiteName, setGameSiteName] = useState("");
  const [gameFacilityId, setGameFacilityId] = useState(initialData?.facilityId || event.facilityId || "");
  const [gameFacilityName, setGameFacilityName] = useState("");

  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [pendingOrgName, setPendingOrgName] = useState("");
  const [isCreatingHomeOrg, setIsCreatingHomeOrg] = useState(false);

  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [isCreatingHomeTeam, setIsCreatingHomeTeam] = useState(false);
  const [pendingTeamName, setPendingTeamName] = useState("");
  const [targetOrgIdForTeam, setTargetOrgIdForTeam] = useState("");

  const [searchedOrgs, setSearchedOrgs] = useState<Organization[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [referrals, setReferrals] = useState<Record<string, string[]>>({});

  const participatingOrgIds = [event.orgId, ...(event.participatingOrgIds || [])];
  const orgSports = currentOrg?.supportedSportIds && currentOrg.supportedSportIds.length > 0
    ? allSports.filter(s => currentOrg.supportedSportIds.includes(s.id))
    : allSports;

  const eventSports = event.sportIds && event.sportIds.length > 0 
    ? orgSports.filter(s => (event.sportIds || []).includes(s.id))
    : orgSports;

  // Notify parent of changes
  useEffect(() => {
    onChange({
      homeTeamId,
      awayTeamId: selectedTeamId || "",
      startTime,
      isTbd,
      siteId: gameSiteId,
      facilityId: gameFacilityId,
      sportId: selectedSportId,
      referrals
    });
  }, [homeTeamId, selectedTeamId, startTime, isTbd, gameSiteId, gameFacilityId, selectedSportId, referrals]);

  // Initialization & Updates
  useEffect(() => {
    const update = () => {
      setAllOrgs(store.getOrganizations());
      setAllSports(store.getSports());
      const allSites = store.getSites(orgId);
      setSites(allSites.filter(s => s.isActive !== false || s.id === initialData?.siteId || s.id === event.siteId || s.id === gameSiteId));

      if (gameSiteId) {
          setFacilities(store.getFacilities(gameSiteId).filter(f => f.isActive !== false || f.id === initialData?.facilityId || f.id === event.facilityId || f.id === gameFacilityId));
      } else {
          setFacilities([]);
      }

      const org = store.getOrganization(orgId);
      if (org) setCurrentOrg(org);
      else store.fetchOrganization(orgId);

      if (gameSiteId && !gameSiteName) {
        const v = store.getSite(gameSiteId);
        if (v) setGameSiteName(v.name);
      }
      
      if (gameFacilityId && !gameFacilityName) {
        const f = store.getFacility(gameFacilityId);
        if (f) setGameFacilityName(f.name);
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
  }, [homeOrgId, selectedOrgId, selectedSportId, orgId, gameSiteId]);

  const [searchTerm, setSearchTerm] = useState("");

  // Instant Local Search + Debounced Backend Search
  useEffect(() => {
    const query = searchTerm.trim();
    if (!query) {
        setSearchedOrgs(allOrgs);
        setIsSearching(false);
        return;
    }

    // 1. Instant local search update
    setSearchedOrgs(store.searchOrganizationsLocal(query));
    setIsSearching(true);

    // 2. Debounced backend augmentation
    const timer = setTimeout(async () => {
        try {
            const results = await store.searchSimilarOrganizations(searchTerm);
            setSearchedOrgs(results);
        } catch (e) {
            console.error("Failed to search orgs", e);
        } finally {
            setIsSearching(false);
        }
    }, 400); // Slightly longer debounce since we have local results for instant feedback
    
    return () => clearTimeout(timer);
  }, [searchTerm, allOrgs]);

  // Special effect to resolve organizations from team IDs once data is available
  useEffect(() => {
    // Resolve Away Team Details
    if (initialData?.awayTeamId && (!selectedOrgId || !targetTeamName || !targetOrgName)) {
      const awayTeam = store.getTeam(initialData.awayTeamId);
      if (awayTeam) {
        if (!selectedOrgId) setSelectedOrgId(awayTeam.orgId);
        if (!targetOrgName) setTargetOrgName(store.getOrganization(awayTeam.orgId)?.name || "");
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
            if ((!homeOrgId || homeOrgId === orgId) && homeTeam.orgId !== homeOrgId) {
                 setHomeOrgId(homeTeam.orgId);
            }
            if (!homeOrgName) setHomeOrgName(store.getOrganization(homeTeam.orgId)?.name || "");
            if (!homeTeamId) setHomeTeamId(homeTeam.id);
            if (!homeTeamName) setHomeTeamName(homeTeam.name);
        }
    }
  }, [initialData, homeTeamId, selectedOrgId, selectedTeamId, homeOrgName, targetOrgName, targetTeamName, homeTeamName, allOrgs]);

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

  const handleCreateSite = async (name: string) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const newSite = await store.addSite({
        name: name,
        address: { fullAddress: "TBD" } as Address,
        orgId: orgId
      });
      setGameSiteName(newSite.name);
      setGameSiteId(newSite.id);
      setGameFacilityId("");
      setGameFacilityName("");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFacility = async (name: string) => {
    if (!name.trim() || !gameSiteId) return;
    setLoading(true);
    try {
      const newFacility = await store.addFacility({
        siteId: gameSiteId,
        name: name,
        surfaceType: ""
      });
      setGameFacilityName(newFacility.name);
      setGameFacilityId(newFacility.id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReferralChange = (orgId: string, index: number, value: string) => {
    const orgReferrals = [...(referrals[orgId] || [""])];
    orgReferrals[index] = value;
    setReferrals({ ...referrals, [orgId]: orgReferrals });
  };

  const addReferralField = (orgId: string) => {
    const orgReferrals = [...(referrals[orgId] || [""])];
    setReferrals({ ...referrals, [orgId]: [...orgReferrals, ""] });
  };

  const removeReferralField = (orgId: string, index: number) => {
    const orgReferrals = (referrals[orgId] || [""]).filter((_, i) => i !== index);
    setReferrals({ ...referrals, [orgId]: orgReferrals.length ? orgReferrals : [""] });
  };

  const renderReferralPrompt = (org: Organization) => {
    if (org.isClaimed !== false) return null;

    const orgReferrals = referrals[org.id] || [""];

    return (
      <div className="col-span-1 md:col-span-2 bg-primary/5 border border-primary/20 rounded-xl p-4 mt-2 space-y-3">
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-semibold text-primary flex items-center gap-2">
            <span className="bg-primary/10 text-primary p-1 rounded-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-users-round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a9 9 0 0 0-2.2-2.2"/></svg>
            </span>
            Known Contacts for {org.name}?
          </Label>
          <p className="text-[10px] text-muted-foreground">
            This organization is not claimed yet. Help us get them on board by providing a contact email.
          </p>
        </div>
        
        <div className="space-y-2">
          {orgReferrals.map((email, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={email}
                onChange={(e) => handleReferralChange(org.id, index, e.target.value)}
                placeholder="contact@school.edu"
                className="text-xs h-9 bg-background/50"
                type="email"
              />
              {orgReferrals.length > 1 && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => removeReferralField(org.id, index)}
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={() => addReferralField(org.id)}
          className="text-[10px] h-7 border-dashed h-auto py-1"
        >
          + Add Contact
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SPORT, DATE & TIME */}
        <div className="space-y-4">
          {dateNode}
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
        </div>

        {/* SITE & FACILITY */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Site</Label>
            <GenericAutocomplete
              items={sites.map(v => ({ id: v.id, label: v.name, data: v }))}
              value={gameSiteName}
              onChange={setGameSiteName}
              onSelect={(item) => {
                if (item) {
                  setGameSiteId(item.id);
                  setGameSiteName(item.label);
                  if (item.id !== gameSiteId) {
                      setGameFacilityId("");
                      setGameFacilityName("");
                  }
                } else {
                  setGameSiteId("");
                  setGameFacilityId("");
                  setGameFacilityName("");
                }
              }}
              onCreateNew={handleCreateSite}
              placeholder="Select match location..."
              createLabel="Add Location"
              isLoading={loading}
            />
          </div>

          {gameSiteId && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
              <Label>Facility (Optional)</Label>
              <GenericAutocomplete
                items={facilities.map(f => ({ id: f.id, label: f.name, subLabel: f.surfaceType, data: f }))}
                value={gameFacilityName}
                onChange={setGameFacilityName}
                onSelect={(item) => {
                  if (item) {
                    setGameFacilityId(item.id);
                    setGameFacilityName(item.label);
                  } else {
                    setGameFacilityId("");
                  }
                }}
                onCreateNew={handleCreateFacility}
                placeholder="Select field/court..."
                createLabel="Add Facility"
                isLoading={loading}
              />
            </div>
          )}
        </div>
      </div>

      {/* TEAM SELECTION */}
      <div className="space-y-4 pt-4 border-t border-border/50">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary/70">Teams</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
          <div className="space-y-1.5">
            <Label className="uppercase">Team 1</Label>
                {isSportsDay ? (
                  <div className="space-y-2">
                     <GenericAutocomplete 
                        items={searchedOrgs.map(o => ({ 
                            id: o.id, 
                            label: o.name, 
                            subLabel: o.shortName,
                            data: o 
                        }))}
                        value={homeOrgName}
                        onChange={(val) => {
                            setHomeOrgName(val);
                            setSearchTerm(val);
                            setIsSearching(true);
                            if (!val) setHomeOrgId("");
                        }}
                        onSelect={(item) => {
                            if (item) {
                                setHomeOrgId(item.id);
                                setHomeOrgName(item.label);
                                setHomeTeamId("");
                                setHomeTeamName("");
                            } else {
                                setHomeOrgId("");
                                setHomeTeamId("");
                                setHomeTeamName("");
                            }
                        }}
                        onCreateNew={(name) => handleCreateOrg(name, true)}
                        placeholder="Search school/club..."
                        createLabel="Register Org"
                        isLoading={isSearching}
                        disableFiltering={true}
                    />
                    <GenericAutocomplete 
                        items={homeOrgTeams
                          .filter(t => homeOrgId !== selectedOrgId || t.id !== selectedTeamId)
                          .map(t => ({ id: t.id, label: t.name, subLabel: t.ageGroup, data: t }))}
                        value={homeTeamName || homeOrgTeams.find(t => t.id === homeTeamId)?.name || ""}
                        onChange={setHomeTeamName} 
                        onSelect={(item) => {
                          setHomeTeamId(item?.id || "");
                          if (item) setHomeTeamName(item.label);
                        }}
                        onCreateNew={(name) => handleCreateTeam(name, true)}
                        placeholder={selectedSportId ? "Select team..." : "Select Sport First"}
                        createLabel="Add Team"
                        isLoading={loading || !selectedSportId}
                    />
                    {(() => {
                        const org = store.getOrganization(homeOrgId);
                        return org ? renderReferralPrompt(org) : null;
                    })()}
                  </div>
                ) : (
                  <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select our team..." />
                    </SelectTrigger>
                    <SelectContent>
                      {homeOrgTeams
                        .filter(t => homeOrgId !== selectedOrgId || t.id !== selectedTeamId)
                        .map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name} ({t.ageGroup})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center pointer-events-none mt-2">
            <span className="bg-background px-2 text-[10px] font-black italic text-muted-foreground uppercase tracking-widest z-10">vs</span>
          </div>

          <div className="relative py-2 flex items-center justify-center md:hidden">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/30" />
            </div>
            <span className="relative bg-background px-2 text-[10px] font-black italic text-muted-foreground uppercase tracking-widest">vs</span>
          </div>

          <div className="space-y-1.5">
            <Label className="uppercase">Team 2</Label>
                <div className="space-y-2">
                  <GenericAutocomplete
                    items={searchedOrgs.map(o => ({ 
                        id: o.id, 
                        label: o.name, 
                        subLabel: o.shortName,
                        data: o 
                    }))}
                    value={targetOrgName}
                    onChange={(val) => {
                        setTargetOrgName(val);
                        setSearchTerm(val);
                        setIsSearching(true);
                    }}
                    onSelect={(item) => {
                      if (item) {
                        setSelectedOrgId(item.id);
                        setTargetOrgName(item.label);
                        setSelectedTeamId(null);
                        setTargetTeamName("");
                      } else {
                        setSelectedOrgId(null);
                        setSelectedTeamId(null);
                        setTargetTeamName("");
                      }
                    }}
                    onCreateNew={(name) => handleCreateOrg(name, false)}
                    placeholder="Search opponent org..."
                    createLabel="Register Org"
                    isLoading={isSearching}
                    disableFiltering={true}
                  />
                  <GenericAutocomplete
                    items={opponentOrgTeams
                      .filter(t => selectedOrgId !== homeOrgId || t.id !== homeTeamId)
                      .map(t => ({ id: t.id, label: t.name, subLabel: t.ageGroup, data: t }))}
                    value={targetTeamName}
                    onChange={setTargetTeamName}
                    onSelect={(item) => setSelectedTeamId(item?.id || null)}
                    onCreateNew={(name) => handleCreateTeam(name, false)}
                    placeholder={selectedOrgId ? "Search opponent team..." : "Select organization first"}
                    createLabel="Add Team"
                    isLoading={loading || !selectedOrgId}
                  />
                  {(() => {
                      const org = selectedOrgId ? store.getOrganization(selectedOrgId) : null;
                      return org ? renderReferralPrompt(org) : null;
                  })()}
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
        orgId={targetOrgIdForTeam}
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

