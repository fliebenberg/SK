"use client";

import React from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Trophy, Activity, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// Mock Data
const mockMatches = [
  {
    id: "1",
    homeTeam: "Eagles U15",
    awayTeam: "Lions U15",
    date: "2026-02-10",
    time: "14:00",
    venue: "Main Stadium",
    eventName: "Regional Championship 2026",
    eventType: "Tournament",
    status: "Scheduled"
  },
  {
    id: "2",
    homeTeam: "Eagles U15",
    awayTeam: "Hawks U15",
    date: "2026-02-12",
    time: "10:00",
    venue: "Field B",
    eventName: "School Sports Day",
    eventType: "SportsDay",
    status: "Scheduled"
  },
  {
    id: "3",
    homeTeam: "Wolves U15",
    awayTeam: "Eagles U15",
    date: "2026-02-15",
    time: "16:30",
    venue: "Wolves Arena",
    eventName: null,
    eventType: "Match",
    status: "Scheduled"
  }
];

export default function MatchListDemoPage() {
  return (
    <div className="container mx-auto py-12 px-4 space-y-16 pb-24">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight">Match List Suggestions</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Experimental views for the Team Detail page. These focus on **Matches** as the primary entity instead of Events.
        </p>
      </div>

      {/* Suggestion 1: Flattened Grid */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 border-b pb-2">
          <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center font-bold">1</Badge>
          <h2 className="text-2xl font-bold">Flattened Match-Centric Grid</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mockMatches.map(match => (
            <Card key={match.id} className="hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-bold text-lg leading-tight">
                    {match.homeTeam} vs {match.awayTeam}
                  </div>
                  {match.eventName && (
                    <Badge variant="secondary" className="shrink-0 text-[10px] uppercase font-bold tracking-tighter">
                      {match.eventType === 'Tournament' ? <Trophy className="w-3 h-3 mr-1" /> : <Activity className="w-3 h-3 mr-1" />}
                      {match.eventType}
                    </Badge>
                  )}
                </div>
                
                {match.eventName && (
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <span className="opacity-70">Part of:</span> {match.eventName}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs pt-2 border-t mt-2">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{match.date}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{match.time}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground max-w-[80px]">
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="truncate">{match.venue}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Suggestion 2: Grouped by Event */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 border-b pb-2">
          <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center font-bold">2</Badge>
          <h2 className="text-2xl font-bold">Grouped List with Minimal Headers</h2>
        </div>
        <div className="space-y-8">
          {/* Tournament Group */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-primary/80 uppercase tracking-widest pl-2">
              <Trophy className="w-4 h-4" /> Regional Championship 2026
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
               <Card className="bg-muted/30 border-dashed border-2">
                <CardContent className="p-4">
                   <div className="font-bold">Eagles U15 vs Lions U15</div>
                   <div className="text-xs text-muted-foreground mt-1">Feb 10, 14:00 • Main Stadium</div>
                </CardContent>
               </Card>
               {/* Imagine more matches here if the team played multiple in one tourney */}
            </div>
          </div>

          {/* Standalone Match */}
          <div className="space-y-3">
             <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground uppercase tracking-widest pl-2">
              <span className="h-4 w-4 rounded-full border border-muted-foreground/30" /> Regular Season
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
               <Card>
                <CardContent className="p-4">
                   <div className="font-bold">Wolves U15 vs Eagles U15</div>
                   <div className="text-xs text-muted-foreground mt-1">Feb 15, 16:30 • Wolves Arena</div>
                </CardContent>
               </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Suggestion 3: Horizontal Rows */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 border-b pb-2">
          <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center font-bold">3</Badge>
          <h2 className="text-2xl font-bold">Enhanced Horizontal Match Rows</h2>
        </div>
        <div className="space-y-2">
          {mockMatches.map(match => (
            <div 
              key={match.id} 
              className="flex items-center gap-4 p-4 bg-card border rounded-xl hover:shadow-sm hover:border-primary/50 transition-all cursor-pointer group"
            >
              <div className="flex flex-col items-center justify-center w-20 border-r pr-4">
                <span className="text-lg font-bold">10</span>
                <span className="text-[10px] uppercase text-muted-foreground font-bold leading-none">Feb</span>
              </div>

              <div className="flex-1 flex items-center justify-between gap-8">
                 <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1 text-right font-medium text-sm md:text-base">{match.homeTeam}</div>
                    <div className="text-[10px] font-black text-muted-foreground bg-muted px-1.5 py-0.5 rounded italic">VS</div>
                    <div className="flex-1 text-left font-medium text-sm md:text-base">{match.awayTeam}</div>
                 </div>

                 <div className="hidden md:flex flex-col gap-1 items-end w-48 text-right border-l pl-4">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      {match.eventName ? match.eventName : 'Friendly Service'}
                    </div>
                    <div className="text-xs text-muted-foreground/70 flex items-center gap-2">
                      <Clock className="w-3 h-3" /> {match.time}
                      <MapPin className="w-3 h-3" /> {match.venue}
                    </div>
                 </div>
              </div>

              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                 <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter cursor-pointer hover:bg-primary/10">Details</Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-center pt-8">
         <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl max-w-xl text-center space-y-3">
            <h3 className="font-bold text-primary italic">Developer Note</h3>
            <p className="text-sm text-primary/80">
              Suggestion 3 (Horizontal Rows) is often preferred for schedule-heavy views because it scales better with long team names and provides a cleaner "ledger" look. Suggestion 1 is great for visual impact if we have team logos.
            </p>
         </div>
      </div>
    </div>
  );
}
