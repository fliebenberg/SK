"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { store } from "@/app/store/store";
// Let's create a Client Component that takes teams/sites as props.

export default function NewGamePage() {
  // This is a bit of a hack for the mock store in a client component. 
  // Ideally, we'd fetch data. For now, we'll rely on the fact that it's a demo.
  // A better way is to make this a Server Component that renders a Client Form.
  // But let's stick to the pattern we used for Teams for consistency in this MVP.
  
  const teams = store.getTeams().filter(t => t.isActive !== false);
  const sites = store.getSites();
  
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      const homeTeamId = formData.get("homeTeamId") as string;
      const awayTeamId = formData.get("awayTeamId") as string;
      const siteId = formData.get("siteId") as string;
      const date = formData.get("date") as string;
      const time = formData.get("time") as string;

      if (!homeTeamId || !awayTeamId || !siteId || !date || !time) {
        throw new Error("Missing required fields");
      }

      const yellowCardMin = parseInt(formData.get("yellowCardDurationMS") as string) || 10;
      const redCardMin = parseInt(formData.get("redCardDurationMS") as string) || 20;
      const allowTimedRedCard = formData.get("allowTimedRedCard") === "on";

      await store.addGame({
        eventId: "event-1", // Simplified for MVP
        sportId: "rugby",
        participants: [
          { teamId: homeTeamId, status: 'active' },
          { teamId: awayTeamId, status: 'active' }
        ],
        siteId,
        startTime: `${date}T${time}`,
        customSettings: {
          yellowCardDurationMS: yellowCardMin * 60000,
          redCardDurationMS: redCardMin * 60000,
          allowTimedRedCard
        }
      });
      router.push("/admin");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Schedule Game</CardTitle>
        </CardHeader>
        <form action={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="homeTeamId" className="text-sm font-medium">Home Team</label>
                <select 
                  id="homeTeamId" 
                  name="homeTeamId" 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select Team</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="awayTeamId" className="text-sm font-medium">Away Team</label>
                <select 
                  id="awayTeamId" 
                  name="awayTeamId" 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select Team</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="siteId" className="text-sm font-medium">Site</label>
              <select 
                id="siteId" 
                name="siteId" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">Select Site</option>
                {sites.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="date" className="text-sm font-medium">Date</label>
                <Input id="date" name="date" type="date" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="time" className="text-sm font-medium">Time</label>
                <Input id="time" name="time" type="time" required />
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Sport Specific Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label htmlFor="yellowCardDurationMS" className="text-xs font-bold uppercase tracking-tight">Yellow Card (min)</label>
                        <Input id="yellowCardDurationMS" name="yellowCardDurationMS" type="number" defaultValue="10" />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="redCardDurationMS" className="text-xs font-bold uppercase tracking-tight">Timed Red Card (min)</label>
                        <div className="flex gap-2">
                            <Input id="redCardDurationMS" name="redCardDurationMS" type="number" defaultValue="20" className="flex-1" />
                            <div className="flex items-center gap-2 border rounded-md px-3 bg-muted/20">
                                <input type="checkbox" id="allowTimedRedCard" name="allowTimedRedCard" className="w-4 h-4" />
                                <label htmlFor="allowTimedRedCard" className="text-[10px] uppercase font-black whitespace-nowrap">Allow Timed</label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-4">
            <Button variant="outline" type="button" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              Schedule Game
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

