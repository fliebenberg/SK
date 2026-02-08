"use client";

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { MetalButton } from '@/components/ui/MetalButton';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Chrome, Facebook, Shield } from 'lucide-react';

export function LoginForm() {
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const { isDark, metalVariant, primaryColor } = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
       // Check if it's a NextAuth error or a string
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      await loginWithGoogle();
      // NextAuth handles redirection for OAuth usually, 
      // but we wait for it to trigger.
    } catch (err) {
      setError('Google login failed');
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md p-8 backdrop-blur-xl bg-card/80 border-2 shadow-2xl">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Welcome Back</h1>
          <p className="text-muted-foreground">
            Sign in to your ScoreKeeper account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="transition-all duration-200 focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="transition-all duration-200 focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="remember"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-input bg-background accent-primary cursor-pointer"
            />
            <label
              htmlFor="remember"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Remember me
            </label>
          </div>

          {error && (
            <div className="rounded-xl overflow-hidden border border-red-500/50 dark:bg-red-500/10 bg-red-50 shadow-lg dark:shadow-[0_0_30px_rgba(239,68,68,0.15)] animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-red-500 px-4 py-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-white" />
                <span className="font-bold text-sm text-white">Sign In Failed</span>
              </div>
              <div className="p-4 text-[13px] leading-relaxed font-semibold dark:text-slate-100 text-red-900 dark:bg-black/20 bg-red-50/50">
                {error === 'EMAIL_NOT_FOUND' && "This email isn't registered. If you used Google to sign up, please try the Google button below, or create a new account."}
                {error === 'PASSWORD_MISMATCH' && "The password you entered is incorrect. You can reset it using the 'Forgot password?' link above."}
                {error === 'SOCIAL_ONLY' && "You usually log in with Google. Please click the 'Continue with Google' button below to access your account."}
                {!['EMAIL_NOT_FOUND', 'PASSWORD_MISMATCH', 'SOCIAL_ONLY'].includes(error) && error}
              </div>
            </div>
          )}

          <MetalButton
            type="submit"
            metalVariant={metalVariant}
            variantType="filled"
            glowColor={primaryColor}
            disabled={isLoading}
            className="w-full text-lg"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </MetalButton>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="flex w-full items-center justify-center p-4 bg-white hover:bg-gray-50 border border-border rounded-lg transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-medium gap-3"
            aria-label="Sign in with Google"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Don't have an account? </span>
          <Link href="/signup" className="text-primary font-semibold hover:underline">
            Sign up
          </Link>
        </div>
      </div>
    </Card>
  );
}
