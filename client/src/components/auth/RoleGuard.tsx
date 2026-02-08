"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, ReactNode } from "react";
import { FullPageLoader } from "@/components/FullPageLoader";

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles?: ('user' | 'admin')[];
  redirectTo?: string;
}

/**
 * RoleGuard protects routes by checking authentication and global roles.
 * It shows a loader while checking and redirects if access is denied.
 */
export function RoleGuard({ 
  children, 
  allowedRoles = ['admin'], 
  redirectTo = '/' 
}: RoleGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        // Not authenticated? Go to home page
        router.push("/");
      } else if (user && !allowedRoles.includes(user.globalRole)) {
        // Authenticated but wrong role? Go to the specified redirect
        router.push(redirectTo);
      }
    }
  }, [isLoading, isAuthenticated, user, allowedRoles, router, redirectTo, pathname]);

  // Show loader while checking auth state
  if (isLoading) {
    return <FullPageLoader />;
  }

  // If not authenticated or wrong role, return nothing (redirecting...)
  if (!isAuthenticated || (user && !allowedRoles.includes(user.globalRole))) {
    return null;
  }

  // Access granted
  return <>{children}</>;
}
