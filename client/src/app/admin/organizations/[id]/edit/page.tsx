import { OrgDetailsHeader } from "@/components/admin/OrgDetailsHeader";
import { store } from "@/lib/store";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrganizationEditPage({ params }: PageProps) {
  const { id } = await params;
  const org = store.getOrganization(id);

  if (!org) {
    notFound();
  }

  // Double check ID match for basic security/correctness in this mock
  if (org.id !== id) {
      // In real app, handle error
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-orbitron)' }}>Organization Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your organization&apos;s details, branding, and preferences.
        </p>
      </div>
      
      <OrgDetailsHeader organization={org} />
    </div>
  );
}
