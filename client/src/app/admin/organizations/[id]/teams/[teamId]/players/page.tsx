"use client";

import { store } from "@/lib/store";
import { TeamPlayersList } from "@/components/admin/TeamPlayersList";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Person } from "@sk/types";

export default function PlayersPage() {
  const params = useParams();
  const teamId = params.teamId as string;
  
  const [players, setPlayers] = useState<any[]>([]);

  useEffect(() => {
    const updatePlayers = () => {
        const members = store.getTeamMembers(teamId);
        const p = members.filter(p => p.roleId === 'role-player');
        setPlayers(p);
    };

    updatePlayers();
    const unsubscribe = store.subscribe(updatePlayers);
    return () => unsubscribe();
  }, [teamId]);

  return (
    <div className="py-6">
      <TeamPlayersList teamId={teamId} players={players} />
    </div>
  );
}
