"use client";

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { useThemeColors } from '@/hooks/useThemeColors';
import { FullPageLoader } from '@/components/FullPageLoader';
import { Suspense } from 'react';

function LoginPageContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const { mounted, primaryColor } = useThemeColors();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push(callbackUrl);
    }
  }, [isAuthenticated, isLoading, router, callbackUrl]);

  // If we are looking for the session, or haven't mounted the theme yet,
  // or if we are already authenticated (waiting for redirect), show loader.
  if (isLoading || !mounted || isAuthenticated) {
    return <FullPageLoader />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background" style={{ borderBottom: `2px solid ${primaryColor}` }} />
      <div 
        className="absolute inset-0 opacity-10 animate-gradient" 
        style={{ backgroundImage: `linear-gradient(to bottom right, transparent, transparent, ${primaryColor})` }}
      />
      
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 rounded-full blur-3xl animate-pulse" style={{ backgroundColor: `${primaryColor}15` }} />
      <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full blur-3xl animate-pulse delay-1000" style={{ backgroundColor: `${primaryColor}10` }} />
      
      <div className="relative z-10 w-full max-w-md">
        {/* Login Form */}
        <LoginForm />
      </div>
    </div>
  );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<FullPageLoader />}>
            <LoginPageContent />
        </Suspense>
    );
}
