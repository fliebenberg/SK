"use client";

import { store } from "@/app/store/store";
import { TeamPlayersList } from "@/components/admin/TeamPlayersList";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Person } from "@sk/types";

export default function PlayersPage() {
  const params = useParams();
  const teamId = params.teamId as string;
  
  const [players, setPlayers] = useState<any[]>([]);

  useEffect(() => {
    store.subscribeToTeamData(teamId);

    const updatePlayers = () => {
        const members = store.getTeamMembers(teamId);
        const p = members.filter(p => !p.roleId || p.roleId === 'role-player'); // Default to player if no role? Or strictly role-player
        setPlayers(p);
    };

    updatePlayers();
    const unsubscribe = store.subscribe(updatePlayers);
    return () => {
        unsubscribe();
        store.unsubscribeFromTeamData(teamId);
    };
  }, [teamId]);

  return (
    <div className="py-6">
      <TeamPlayersList teamId={teamId} players={players} />
    </div>
  );
}
