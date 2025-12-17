"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { addVenueAction } from "@/app/actions";

export default function NewVenuePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    await addVenueAction(formData);
    setLoading(false);
    router.push("/venues");
    router.refresh();
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Add New Venue</CardTitle>
          <CardDescription>Register a new venue for events.</CardDescription>
        </CardHeader>
        <form action={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">Venue Name</label>
              <Input id="name" name="name" placeholder="e.g. Main Stadium" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="address" className="text-sm font-medium">Address</label>
              <Input id="address" name="address" placeholder="e.g. 123 Sport St" required />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-4">
            <Button variant="outline" type="button" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Create Venue" : "Create Venue"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
