"use client";

import { useParams } from "next/navigation";
import { EventList } from "@/components/admin/events/EventList";
import { useOrganization } from "@/hooks/useOrganization";

export default function EventsPage() {
  const params = useParams();
  const id = params.id as string;
  const { org, isLoading: loading } = useOrganization(id, { subscribeData: true });

  if (loading && !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading events...</p>
      </div>
    );
  }

  if (!org) return null;

  return (
    <div className="p-0 md:p-6">
      <EventList orgId={id} />
    </div>
  );
}
