"use client";

import { EventList } from "@/components/admin/events/EventList";
import { useParams } from "next/navigation";

export default function TeamEventsPage() {
  const params = useParams();
  const id = params.id as string;
  const teamId = params.teamId as string;

  if (!teamId) return null;

  return (
    <div className="p-6">
      <EventList organizationId={id} teamId={teamId} />
    </div>
  );
}
