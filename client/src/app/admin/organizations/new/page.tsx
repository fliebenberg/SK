import { OrgDetailsHeader } from "@/components/admin/OrgDetailsHeader";

export default function NewOrganizationPage() {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Create Organization</h1>
        <p className="text-muted-foreground mt-2">
          Enter the details for the new organization. You can add people, teams, and venues after creating it.
        </p>
      </div>
      
      <OrgDetailsHeader isCreating={true} />
    </div>
  );
}
