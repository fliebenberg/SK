"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { store } from "@/app/store/store";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { FullPageLoader } from "@/components/FullPageLoader";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !user) {
      router.replace("/");
      return;
    }

    const check = () => {
      setIsAllowed(true);
    };

    if (store.isLoaded()) {
      check();
    }
    
    return store.subscribe(check);
  }, [authLoading, isAuthenticated, user, router]);

  if (authLoading || isAllowed === null) {
    return <FullPageLoader />;
  }

  if (!isAllowed) return null;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden md:block w-64 border-r min-h-screen">
        <AdminSidebar />
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
