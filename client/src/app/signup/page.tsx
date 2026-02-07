"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { SignupForm } from '@/components/auth/SignupForm';
import { useThemeColors } from '@/hooks/useThemeColors';
import { FullPageLoader } from '@/components/FullPageLoader';

export default function SignupPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { mounted, primaryColor } = useThemeColors();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loader while checking auth or mounting theme
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
        {/* Signup Form */}
        <SignupForm />
      </div>
    </div>
  );
}
