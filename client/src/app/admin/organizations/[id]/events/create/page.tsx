"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { store } from "@/app/store/store";
import { Organization, Sport, Team, Address } from "@sk/types";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GenericAutocomplete } from "@/components/ui/GenericAutocomplete";
import { ChevronLeft, Check, Loader2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MetalButton } from "@/components/ui/MetalButton";
import { useThemeColors } from "@/hooks/useThemeColors";
import { MatchForm, MatchFormData } from "@/components/admin/games/MatchForm";
import { toast } from "@/hooks/use-toast";
import { OrgCreationDialog } from "@/components/admin/organizations/OrgCreationDialog";
import { useAuth } from "@/contexts/AuthContext";

export default function CreateEventPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgId = params.id as string;
  const type = searchParams.get("type") as "tournament" | "game" | "sportsday" || "tournament";

  const { user } = useAuth();
  const { org: currentOrg, isLoading: orgLoading } = useOrganization(orgId, { subscribeData: true });
  const [isProcessing, setIsProcessing] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(""); // Initialize empty to avoid hydration mismatch by server/client time difference
  
  useEffect(() => {
    // Set default date to today's local date on client side only
    if (!startDate) setStartDate(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD format
  }, []);

  const [endDate, setEndDate] = useState("");
  const [isMultiDay, setIsMultiDay] = useState(false);
  
  // Site State
  const [siteId, setSiteId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [sites, setSites] = useState<any[]>([]);
  
  const [sports, setSports] = useState<Sport[]>([]);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);

  // Tournament Specific
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [matchFormData, setMatchFormData] = useState<MatchFormData | null>(null);
  const [orgSearch, setOrgSearch] = useState("");
  const [searchedOrgs, setSearchedOrgs] = useState<Organization[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Instant Local Search + Debounced Backend Search
  useEffect(() => {
    const query = orgSearch.trim();
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
            const results = await store.searchSimilarOrganizations(orgSearch);
            setSearchedOrgs(results);
        } catch (e) {
            console.error("Failed to search orgs", e);
        } finally {
            setIsSearching(false);
        }
    }, 400); 
    
    return () => clearTimeout(timer);
  }, [orgSearch, allOrgs]);

  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [pendingOrgName, setPendingOrgName] = useState("");

  const nameInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (nameInputRef.current) {
        nameInputRef.current.style.height = 'auto';
        nameInputRef.current.style.height = nameInputRef.current.scrollHeight + 'px';
    }
  }, [name]);

  useEffect(() => {
    const update = () => {
        setSites(store.getSites(orgId));
        setSports(store.getSports());
        setAllOrgs(store.getOrganizations());
    };
    update();
    const unsub = store.subscribe(update);
    return unsub;
  }, [orgId]);

  const handleCreateSite = async (name: string) => {
      if (!name.trim()) return;
      setIsProcessing(true);
      try {
          const newSite = await store.addSite({
              name: name,
              address: { fullAddress: "TBD" } as Address,
              orgId: orgId 
          });
          setSiteName(newSite.name);
          setSiteId(newSite.id);
      } catch (e) {
          console.error(e);
          toast({ 
              title: "Error",
              description: "Failed to create site",
              variant: "destructive"
          });
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
        if (type === 'tournament' || type === 'sportsday') {
            if (!name.trim()) {
                toast({
                    title: "Validation Error",
                    description: "Event name is required",
                    variant: "warning"
                });
                setIsProcessing(false);
                return;
            }

            if (isMultiDay && endDate < startDate) {
                toast({
                    title: "Validation Error",
                    description: "End Date cannot be before Start Date",
                    variant: "warning"
                });
                setIsProcessing(false);
                return;
            }

            await store.addEvent({
                name,
                startDate,
                endDate: isMultiDay ? endDate : undefined,
                siteId: siteId || "default", 
                orgId,
                type: type === 'sportsday' ? 'SportsDay' : 'Tournament',
                participatingOrgIds: selectedOrgIds,
                sportIds: selectedSportIds
            });
            router.push(`/admin/organizations/${orgId}/events`);
        } else {
            if (!matchFormData?.homeTeamId || !matchFormData?.awayTeamId) {
                toast({
                    title: "Validation Error",
                    description: "Please select both teams",
                    variant: "warning"
                });
                setIsProcessing(false);
                return;
            }

            const homeTeam = store.getTeam(matchFormData.homeTeamId);
            const homeOrg = store.getOrganization(orgId);
            const awayTeam = store.getTeam(matchFormData.awayTeamId);
            const awayOrg = store.getOrganization(awayTeam?.orgId || "");
            
            const homeChunk = `${homeOrg?.shortName || homeOrg?.name || 'Home'} ${homeTeam?.name || 'Team'}`;
            const awayChunk = `${awayOrg?.shortName || awayOrg?.name || 'Away'} ${awayTeam?.name || 'Team'}`;
            const defaultName = `${homeChunk} vs ${awayChunk}`;
            
            const newEvent = await store.addEvent({
                name: name || defaultName,
                startDate,
                siteId: siteId || matchFormData.siteId || "default",
                orgId,
                type: 'SingleMatch',
                sportIds: matchFormData.sportId ? [matchFormData.sportId] : [],
                participatingOrgIds: awayTeam ? [awayTeam.orgId] : []
            });

            // Handle Referrals
            if (matchFormData.referrals && user?.id) {
                for (const [orgId, emails] of Object.entries(matchFormData.referrals)) {
                    const validEmails = emails.map(e => e.trim()).filter(e => e && e.includes('@'));
                    if (validEmails.length > 0) {
                        try {
                            await store.referOrgContact(orgId, validEmails, user.id);
                        } catch (e) {
                            console.error(`Failed to refer contacts for org ${orgId}`, e);
                        }
                    }
                }
            }

            await store.addGame({
                eventId: newEvent.id,
                homeTeamId: matchFormData.homeTeamId,
                awayTeamId: matchFormData.awayTeamId,
                startTime: matchFormData.isTbd ? undefined : `${startDate}T${matchFormData.startTime}:00`,
                siteId: matchFormData.siteId
            });
            
            router.push(`/admin/organizations/${orgId}/events`);
        }
    } catch (err) {
        console.error(err);
        toast({
            title: "Error",
            description: "Failed to create event",
            variant: "destructive"
        });
    } finally {
        setIsProcessing(false);
    }
  };

  const toggleSport = (id: string) => {
      if (selectedSportIds.includes(id)) {
          setSelectedSportIds(selectedSportIds.filter(s => s !== id));
      } else {
          setSelectedSportIds([...selectedSportIds, id]);
      }
  };

  const addOrg = (orgId: string) => {
      if (!selectedOrgIds.includes(orgId)) {
          setSelectedOrgIds([...selectedOrgIds, orgId]);
      }
      setOrgSearch("");
  };

  const { metalVariant } = useThemeColors();

  if (orgLoading && !currentOrg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading event creation...</p>
      </div>
    );
  }

  if (!currentOrg) return null;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-start gap-4">
        <MetalButton 
            variantType="outlined" 
            size="icon" 
            metalVariant={metalVariant}
            onClick={() => router.back()}
            className="rounded-full shadow-lg mt-1 flex-shrink-0"
        >
            <ChevronLeft className="h-5 w-5" />
        </MetalButton>
        <div className="flex-1">
            <textarea
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onInput={(e) => {
                    e.currentTarget.style.height = 'auto';
                    e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                }}
                className="text-4xl md:text-5xl font-bold tracking-tight bg-transparent border-none p-0 focus:outline-none resize-none overflow-hidden rounded px-2 -ml-2 w-full leading-tight text-left break-words transition-all hover:bg-muted/50 hover:ring-1 hover:ring-ring cursor-text"
                placeholder={type === 'tournament' ? "Tournament Name" : type === 'sportsday' ? "Sports Day Name" : "Event Name"}
                rows={1}
                style={{ fontFamily: 'var(--font-orbitron)', minHeight: '1.2em' }}
            />
            <p className="text-muted-foreground text-sm font-medium mt-1 uppercase tracking-wider">
                {type === 'tournament' ? "New Tournament" : type === 'sportsday' ? "New Sports Day" : "New Match Schedule"}
            </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
         <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6 space-y-6">
            
            {/* Common Fields */}
            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <Label htmlFor="date">{isMultiDay ? "Start Date" : "Date"}</Label>
                        {(type === 'tournament' || type === 'sportsday') && (
                            <div className="flex items-center gap-2">
                                <input 
                                    type="checkbox" 
                                    id="isMultiDay" 
                                    checked={isMultiDay} 
                                    onChange={(e) => setIsMultiDay(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <Label htmlFor="isMultiDay" className="text-xs cursor-pointer">Multi-day</Label>
                            </div>
                        )}
                    </div>
                    <Input id="date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                </div>

                {isMultiDay && (type === 'tournament' || type === 'sportsday') && (
                    <div className="space-y-2">
                        <Label htmlFor="endDate">End Date</Label>
                        <Input id="endDate" type="date" min={startDate} value={endDate} onChange={e => setEndDate(e.target.value)} required />
                    </div>
                )}
            </div>

            {/* Site - Hide for Single Match as it's handled in MatchForm */}
            {type !== 'game' && (
             <div className="space-y-2">
                <Label htmlFor="site">Site</Label>
                <GenericAutocomplete 
                    items={sites.map(v => ({ id: v.id, label: v.name, data: v }))}
                    value={siteName}
                    onChange={setSiteName}
                    onSelect={(item) => {
                        if (item) {
                            setSiteId(item.id);
                            setSiteName(item.label);
                        } else {
                            setSiteId("");
                        }
                    }}
                    onCreateNew={handleCreateSite}
                    placeholder="Select or create site..."
                    createLabel="Create Site"
                />
            </div>
            )}

            {/* TOURNAMENT SPECIFIC */}
            {(type === 'tournament' || type === 'sportsday') && (
                <>
                    <div className="space-y-3">
                        <Label>Sports</Label>
                        <div className="flex flex-wrap gap-2">
                            {(currentOrg?.supportedSportIds?.length ? sports.filter(s => currentOrg.supportedSportIds.includes(s.id)) : sports).map(sport => {
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
                                const org = allOrgs.find(o => o.id === id) || store.getOrganization(id);
                                if (!org) return null;
                                return (
                                    <div key={id} className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md text-sm">
                                        {org.name}
                                        <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={() => setSelectedOrgIds(selectedOrgIds.filter(oid => oid !== id))} />
                                    </div>
                                )
                            })}
                        </div>
                        <GenericAutocomplete 
                            items={searchedOrgs.filter(o => o.id !== orgId && !selectedOrgIds.includes(o.id)).map(o => ({ 
                                id: o.id, 
                                label: o.name, 
                                subLabel: o.shortName,
                                data: o 
                            }))}
                            value={orgSearch}
                            onChange={(val) => {
                                setOrgSearch(val);
                                setIsSearching(true);
                            }}
                            onSelect={(item) => item && addOrg(item.id)}
                            onCreateNew={(name) => {
                                setPendingOrgName(name);
                                setOrgDialogOpen(true);
                            }}
                            placeholder="Add Organization (Name or Code)..."
                            createLabel="Register New Organization"
                            isLoading={isSearching}
                            disableFiltering={true} 
                        />
                    </div>
                </>
            )}

            {/* GAME SPECIFIC */}
            {type === 'game' && (
                <div className="space-y-6 pt-4 border-t">
                    <MatchForm 
                        orgId={orgId}
                        event={{ 
                            orgId, 
                            id: 'temp-create', 
                            type: 'SingleMatch', 
                            name: '', 
                            date: startDate, 
                            startDate: startDate,
                            siteId: siteId || "default",
                            status: 'Scheduled', 
                            participatingOrgIds: [], 
                            sportIds: [] 
                        }}
                        isSportsDay={false}
                        onChange={setMatchFormData}
                        initialData={useMemo(() => ({
                            startTime: "09:00",
                            isTbd: false,
                            sportId: searchParams.get("sportId") || undefined,
                            homeTeamId: searchParams.get("homeTeamId") || undefined
                        }), [searchParams])}
                    />
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
                <MetalButton
                    type="button"
                    variantType="outlined"
                    onClick={() => router.back()}
                    disabled={isProcessing}
                    className="px-8"
                >
                    Cancel
                </MetalButton>
                <MetalButton
                    type="submit"
                    variantType="filled"
                    metalVariant={metalVariant}
                    glowColor="hsl(var(--primary))"
                    disabled={isProcessing || (type === 'game' && (!matchFormData?.homeTeamId || !matchFormData?.awayTeamId))}
                    className="px-8"
                >
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {type === 'tournament' ? "Create Tournament" : type === 'sportsday' ? "Create Sports Day" : "Schedule Match"}
                </MetalButton>
            </div>
            </CardContent>
         </Card>
      </form>

      <OrgCreationDialog 
        open={orgDialogOpen}
        onOpenChange={setOrgDialogOpen}
        initialName={pendingOrgName}
        onCreated={(org) => addOrg(org.id)}
        supportedSportIds={selectedSportIds}
      />
    </div>
  );
}
