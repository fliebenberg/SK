"use client";

import { LoginForm } from '@/components/auth/LoginForm';
import { Logo } from '@/components/Logo';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function LoginPage() {
  const { isDark, metalVariant, primaryColor } = useThemeColors();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5 animate-gradient" />
      
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse delay-1000" />
      
      <div className="relative z-10 w-full max-w-md">
        {/* Login Form */}
        <LoginForm />
      </div>
    </div>
  );
}
