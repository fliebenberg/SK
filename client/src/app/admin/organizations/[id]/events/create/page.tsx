"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { store } from "@/app/store/store";
import { Organization, Sport, Team } from "@sk/types";
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

export default function CreateEventPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const organizationId = params.id as string;
  const type = searchParams.get("type") as "tournament" | "game" | "sportsday" || "tournament";

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState("");
  const [isMultiDay, setIsMultiDay] = useState(false);
  
  // Venue State
  const [venueId, setVenueId] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venues, setVenues] = useState(store.getVenues(organizationId));
  
  const [sports, setSports] = useState(store.getSports());
  const [allOrgs, setAllOrgs] = useState(store.getOrganizations());

  // Tournament Specific
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [matchFormData, setMatchFormData] = useState<MatchFormData | null>(null);
  const [orgSearch, setOrgSearch] = useState("");

  const nameInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (nameInputRef.current) {
        nameInputRef.current.style.height = 'auto';
        nameInputRef.current.style.height = nameInputRef.current.scrollHeight + 'px';
    }
  }, [name]);

  useEffect(() => {
    const update = () => {
        setVenues(store.getVenues(organizationId));
        setSports(store.getSports());
        setAllOrgs(store.getOrganizations());
    };
    update();
    const unsub = store.subscribe(update);
    return unsub;
  }, [organizationId]);

  const handleCreateVenue = async (name: string) => {
      if (!name.trim()) return;
      setLoading(true);
      try {
          const newVenue = await store.addVenue({
              name: name,
              address: "TBD",
              organizationId: organizationId 
          });
          setVenueName(newVenue.name);
          setVenueId(newVenue.id);
      } catch (e) {
          console.error(e);
          alert("Failed to create venue");
      } finally {
          setLoading(true); // Wait, this should be false, but following existing logic
          setLoading(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
        if (type === 'tournament' || type === 'sportsday') {
            if (!name.trim()) {
                alert("Event name is required");
                setLoading(false);
                return;
            }

            if (isMultiDay && endDate < startDate) {
                alert("End Date cannot be before Start Date");
                setLoading(false);
                return;
            }

            await store.addEvent({
                name,
                startDate,
                endDate: isMultiDay ? endDate : undefined,
                venueId: venueId || "default", 
                organizationId,
                type: type === 'sportsday' ? 'SportsDay' : 'Tournament',
                participatingOrgIds: selectedOrgIds,
                sportIds: selectedSportIds
            });
            router.push(`/admin/organizations/${organizationId}/events`);
        } else {
            if (!matchFormData?.homeTeamId || !matchFormData?.awayTeamId) {
                alert("Please select both teams");
                setLoading(false);
                return;
            }

            const homeTeam = store.getTeam(matchFormData.homeTeamId);
            const homeOrg = store.getOrganization(organizationId);
            const awayTeam = store.getTeam(matchFormData.awayTeamId);
            const awayOrg = store.getOrganization(awayTeam?.organizationId || "");
            
            const homeChunk = `${homeOrg?.shortName || homeOrg?.name || 'Home'} ${homeTeam?.name || 'Team'}`;
            const awayChunk = `${awayOrg?.shortName || awayOrg?.name || 'Away'} ${awayTeam?.name || 'Team'}`;
            const defaultName = `${homeChunk} vs ${awayChunk}`;
            
            const newEvent = await store.addEvent({
                name: name || defaultName,
                startDate,
                venueId: venueId || matchFormData.venueId || "default",
                organizationId,
                type: 'SingleMatch',
                sportIds: matchFormData.sportId ? [matchFormData.sportId] : [],
                participatingOrgIds: awayTeam ? [awayTeam.organizationId] : []
            });

            await store.addGame({
                eventId: newEvent.id,
                homeTeamId: matchFormData.homeTeamId,
                awayTeamId: matchFormData.awayTeamId,
                startTime: matchFormData.isTbd ? "" : matchFormData.startTime,
                venueId: matchFormData.venueId
            });
            
            router.push(`/admin/organizations/${organizationId}/events`);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to create event");
    } finally {
        setLoading(false);
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

            {/* Venue - Hide for Single Match as it's handled in MatchForm */}
            {type !== 'game' && (
             <div className="space-y-2">
                <Label htmlFor="venue">Venue</Label>
                <GenericAutocomplete 
                    items={venues.map(v => ({ id: v.id, label: v.name, data: v }))}
                    value={venueName}
                    onChange={setVenueName}
                    onSelect={(item) => {
                        if (item) {
                            setVenueId(item.id);
                            setVenueName(item.label);
                        } else {
                            setVenueId("");
                        }
                    }}
                    onCreateNew={handleCreateVenue}
                    placeholder="Select or create venue..."
                    createLabel="Create Venue"
                />
            </div>
            )}

            {/* TOURNAMENT SPECIFIC */}
            {(type === 'tournament' || type === 'sportsday') && (
                <>
                    <div className="space-y-3">
                        <Label>Sports</Label>
                        <div className="flex flex-wrap gap-2">
                            {sports.map(sport => {
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
                                    <div key={id} className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md text-sm">
                                        {org.name}
                                        <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={() => setSelectedOrgIds(selectedOrgIds.filter(oid => oid !== id))} />
                                    </div>
                                )
                            })}
                        </div>
                        <GenericAutocomplete 
                            items={allOrgs.filter(o => o.id !== organizationId && !selectedOrgIds.includes(o.id)).map(o => ({ id: o.id, label: o.name, data: o }))}
                            value={orgSearch}
                            onChange={setOrgSearch}
                            onSelect={(item) => item && addOrg(item.id)}
                            onCreateNew={async (name) => {
                                if (!name.trim()) return;
                                setLoading(true);
                                try {
                                    const newOrg = await store.addOrganization({
                                        name: name,
                                        primaryColor: "#000000",
                                        secondaryColor: "#ffffff",
                                        shortName: name.substring(0, 3).toUpperCase(),
                                        supportedSportIds: selectedSportIds, 
                                        supportedRoleIds: []
                                    });
                                    addOrg(newOrg.id);
                                } catch (e) {
                                    console.error(e);
                                    alert("Failed to create organization");
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            placeholder="Add Organization..."
                            createLabel="Register New Organization" 
                        />
                    </div>
                </>
            )}

            {/* GAME SPECIFIC */}
            {type === 'game' && (
                <div className="space-y-6 pt-4 border-t">
                    <MatchForm 
                        organizationId={organizationId}
                        event={{ 
                            organizationId, 
                            id: 'temp-create', 
                            type: 'SingleMatch', 
                            name: '', 
                            date: startDate, 
                            startDate: startDate,
                            venueId: venueId || "default",
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
                    disabled={loading}
                    className="px-8"
                >
                    Cancel
                </MetalButton>
                <MetalButton
                    type="submit"
                    variantType="filled"
                    metalVariant={metalVariant}
                    glowColor="hsl(var(--primary))"
                    disabled={loading || (type === 'game' && (!matchFormData?.homeTeamId || !matchFormData?.awayTeamId))}
                    className="px-8"
                >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {type === 'tournament' ? "Create Tournament" : type === 'sportsday' ? "Create Sports Day" : "Schedule Match"}
                </MetalButton>
            </div>
            </CardContent>
         </Card>
      </form>
    </div>
  );
}
