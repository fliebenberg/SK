"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { store } from "@/app/store/store";
import { addGameAction } from "@/app/actions";

// Note: In a real app, we'd fetch these via a Server Component or API
// For this mock, we'll assume we can get them or pass them as props if we refactor.
// Since store is shared in memory for this demo, we can try to access it directly, 
// but in a real Next.js app, we should pass data from a Server Component wrapper.
// Let's create a Client Component that takes teams/venues as props.

export default function NewGamePage() {
  // This is a bit of a hack for the mock store in a client component. 
  // Ideally, we'd fetch data. For now, we'll rely on the fact that it's a demo.
  // A better way is to make this a Server Component that renders a Client Form.
  // But let's stick to the pattern we used for Teams for consistency in this MVP.
  
  const teams = store.getTeams().filter(t => t.isActive !== false);
  const venues = store.getVenues();
  
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    await addGameAction(formData);
    setLoading(false);
    router.push("/admin");
    router.refresh();
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
              <label htmlFor="venueId" className="text-sm font-medium">Venue</label>
              <select 
                id="venueId" 
                name="venueId" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">Select Venue</option>
                {venues.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
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
