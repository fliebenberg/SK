import { AdminSidebar, MobileSidebar } from "@/components/admin/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">


      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 border-r min-h-screen">
        <AdminSidebar />
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
