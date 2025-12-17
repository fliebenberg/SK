import { store } from "@/lib/store";
import { TeamPlayersList } from "@/components/admin/TeamPlayersList";

interface PageProps {
  params: Promise<{ id: string; teamId: string }>;
}

export default async function PlayersPage({ params }: PageProps) {
  const { teamId } = await params;
  
  // Fetch data directly from store on server
  const members = store.getTeamMembers(teamId);
  const players = members.filter(p => p.roleId === 'role-player');

  return (
    <div className="py-6">
      <TeamPlayersList teamId={teamId} players={players} />
    </div>
  );
}
