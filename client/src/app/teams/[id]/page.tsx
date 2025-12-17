"use client";

import { notFound, useParams } from "next/navigation";
import { store } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addPersonAction, addPersonFromForm } from "@/app/actions";
import { UserPlus, User } from "lucide-react";
import { useState, useEffect } from "react";
import { Team, TeamMembership, Person } from "@sk/types";

export default function TeamDetailPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [team, setTeam] = useState<Team | undefined>(() => store.getTeam(id));
  const [roster, setRoster] = useState<(Person & { roleId: string; roleName?: string; membershipId: string })[]>(() => store.getTeamMembers(id));
  const [loading, setLoading] = useState(!store.getTeam(id));

  useEffect(() => {
    const update = () => {
        const t = store.getTeam(id);
        if (t) {
            setTeam(t);
            setRoster(store.getTeamMembers(id));
            setLoading(false);
        }
    };
    
    update();
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, [id]);
  
  if (loading) return <div className="p-8">Loading...</div>;
  if (!team) {
    return <div className="p-8">Team not found</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
        <p className="text-muted-foreground">{store.getSport(team.sportId)?.name} • {team.ageGroup}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Roster ({roster.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {roster.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members yet.</p>
                ) : (
                  roster.map((person) => (
                    <div key={person.membershipId} className="flex items-center justify-between p-2 border rounded-md">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{person.name}</p>
                          <p className="text-xs text-muted-foreground">{person.roleName || store.getTeamRole(person.roleId)?.name}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Add Member</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addPersonFromForm} className="space-y-4">
                <input type="hidden" name="teamId" value={team.id} />
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">Name</label>
                  <Input id="name" name="name" placeholder="John Doe" required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="roleId" className="text-sm font-medium">Role</label>
                  <select 
                    id="roleId" 
                    name="roleId" 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    required
                  >
                    {store.getTeamRoles().map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" /> Add Member
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
