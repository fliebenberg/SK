"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { MetalButton } from '@/components/ui/MetalButton';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { useThemeColors } from '@/hooks/useThemeColors';


export default function ProfilePage() {
  const { user, isAuthenticated, updateProfile } = useAuth();
  const router = useRouter();
  const { isDark, metalVariant, primaryColor } = useThemeColors();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });



  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user) {
      setName(user.name);
      setEmail(user.email);
      setAvatar(user.avatar || '');
    }
  }, [user, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      await updateProfile({ name, avatar });
      setMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">

      
      <main className="container mx-auto px-4 py-24 flex justify-center">
        <Card className="w-full max-w-2xl p-8 backdrop-blur-xl bg-card/80 border-2 shadow-2xl">
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
              <p className="text-muted-foreground">
                Manage your account details and preferences
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-full max-w-xs">
                  <ImageUpload 
                    onChange={setAvatar} 
                    value={avatar} 
                    className="flex justify-center"
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Click upload to change your profile picture
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Full Name
                  </label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    disabled
                    className="bg-muted opacity-70 cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed
                  </p>
                </div>
              </div>

              {message.text && (
                <div className={`p-4 rounded-lg text-sm ${
                  message.type === 'success' 
                    ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
                    : 'bg-destructive/10 text-destructive border border-destructive/20'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <MetalButton
                  type="button"
                  variantType="outlined"
                  onClick={() => router.back()}
                  disabled={isLoading}
                  className="w-full sm:w-auto min-w-[120px]"
                >
                  Cancel
                </MetalButton>
                <MetalButton
                  type="submit"
                  metalVariant={metalVariant}
                  variantType="filled"
                  glowColor={primaryColor}
                  disabled={isLoading}
                  className="w-full sm:w-auto min-w-[150px]"
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </MetalButton>
              </div>
            </form>
          </div>
        </Card>
      </main>
    </div>
  );
}
