"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { store } from "@/lib/store"; // NOTE: This won't work directly in Client Component if store is server-side only. 
// But since store.ts is just a TS file, it will be bundled. 
// However, modifications here won't affect the Server Component rendering of the list page if they are separate instances.
// To fix this for the demo, we need a Server Action or API Route.

// Let's use a Server Action for adding the team to ensure it updates the "server" store.
import { addTeamAction } from "@/app/actions"; 

export default function NewTeamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    await addTeamAction(formData);
    setLoading(false);
    router.push("/teams");
    router.refresh(); // Refresh server components
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Add New Team</CardTitle>
          <CardDescription>Create a new team for your organization.</CardDescription>
        </CardHeader>
        <form action={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">Team Name</label>
              <Input id="name" name="name" placeholder="e.g. First XI" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="sport" className="text-sm font-medium">Sport</label>
                <Input id="sport" name="sport" placeholder="e.g. Soccer" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="ageGroup" className="text-sm font-medium">Age Group</label>
                <Input id="ageGroup" name="ageGroup" placeholder="e.g. U19" required />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-4">
            <Button variant="outline" type="button" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Team"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
