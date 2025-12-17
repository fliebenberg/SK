import { store } from "@/lib/store";
import { notFound } from "next/navigation";
import { TeamDetailsForm } from "@/components/admin/TeamDetailsForm";

interface PageProps {
  params: Promise<{ id: string; teamId: string }>;
}

export default async function TeamDetailsPage({ params }: PageProps) {
  const { id, teamId } = await params;
  const team = store.getTeam(teamId);

  if (!team) {
    return <div>Team not found (ID: {teamId})</div>; // Or use notFound()
  }

  const org = store.getOrganization(id);

  return (
    <TeamDetailsForm initialTeam={team} organization={org} />
  );
}
