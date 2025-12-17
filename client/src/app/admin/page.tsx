"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/organizations');
  }, [router]);

  return <div className="p-8">Loading...</div>;
}
