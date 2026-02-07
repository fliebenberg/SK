"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { MetalButton } from '@/components/ui/MetalButton';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { useThemeColors } from '@/hooks/useThemeColors';
import { User, Shield, Mail, Settings, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProfilePage() {
  const { user, isAuthenticated, updateProfile } = useAuth();
  const router = useRouter();
  const { isDark, metalVariant, primaryColor } = useThemeColors();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [image, setImage] = useState('');
  const [customImage, setCustomImage] = useState('');
  const [avatarSource, setAvatarSource] = useState('custom');
  const [socialAccounts, setSocialAccounts] = useState<{provider: string, provider_image: string}[]>([]);
  const [initialData, setInitialData] = useState({ name: '', customImage: '', avatarSource: 'custom' });
  const [isLoading, setIsLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeSection, setActiveSection] = useState('account');

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      await updateProfile({ password: newPassword } as any);
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: 'Password set successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update password' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user) {
      setName(user.name);
      setEmail(user.email);
      setCustomImage(user.customImage || '');
      setAvatarSource(user.avatarSource || 'custom');
      setImage(user.image || '');
      setInitialData({
        name: user.name,
        customImage: user.customImage || '',
        avatarSource: user.avatarSource || 'custom'
      });
    }
    
    // Fetch extended profile info (social accounts)
    const fetchSocials = async () => {
      try {
        const res = await fetch('/api/user/profile');
        if (res.ok) {
          const data = await res.json();
          setSocialAccounts(data.socialAccounts || []);
          if (data.user) {
            const source = data.user.avatar_source || 'custom';
            const custom = data.user.custom_image || '';
            setAvatarSource(source);
            setCustomImage(custom);
            setInitialData(prev => ({ ...prev, avatarSource: source, customImage: custom }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch social accounts", err);
      }
    };
    
    fetchSocials();
  }, [user, isAuthenticated, router]);

  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message.text]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      await updateProfile({ 
        name, 
        customImage, 
        avatarSource 
      } as any);
      setInitialData({ name, customImage, avatarSource });
      setMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setName(initialData.name);
    setCustomImage(initialData.customImage);
    setAvatarSource(initialData.avatarSource);
  };

  const isDirty = name !== initialData.name || 
                  customImage !== initialData.customImage || 
                  avatarSource !== initialData.avatarSource;

  const navItems = [
    { id: 'account', label: 'Account Details', icon: User },
    { id: 'security', label: 'Security & Password', icon: Shield },
    { id: 'emails', label: 'Linked Emails', icon: Mail },
    { id: 'advanced', label: 'Advanced Settings', icon: Settings },
  ];

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 px-4 min-h-screen">
      {/* Header section consistent with Teams page */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6 border-b border-border pb-8">
        <div className="text-center md:text-left">
          <h1 className="text-4xl font-bold tracking-tight mb-2 uppercase" style={{ fontFamily: 'var(--font-orbitron)' }}>
            PROFILE SETTINGS
          </h1>
          <p className="text-muted-foreground">Manage your personal information, security, and linked accounts.</p>
        </div>
        <MetalButton 
          variantType="outlined" 
          onClick={() => router.back()}
          className="min-w-[120px]"
        >
          Back to App
        </MetalButton>
      </div>

      <div className="grid gap-12 lg:grid-cols-12 relative">
        {/* Sticky Sidebar Navigation */}
        <aside className="lg:col-span-3 hidden lg:block">
          <div className="sticky top-24 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 px-3">Navigation</p>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                    setActiveSection(item.id);
                    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 group",
                  activeSection === item.id 
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-5px_hsl(var(--primary))]" 
                    : "hover:bg-muted text-muted-foreground border border-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={cn("w-4 h-4 transition-colors", activeSection === item.id ? "text-primary" : "group-hover:text-foreground")} />
                  <span className="text-sm font-semibold">{item.label}</span>
                </div>
                {activeSection === item.id && <ChevronRight className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </aside>

        {/* Main Content: Vertical Stack */}
        <div className="lg:col-span-9 space-y-12">
          {/* Account Details Section */}
          <section id="account" className="scroll-mt-24">
            <Card className="p-8 bg-card/40 backdrop-blur-sm border-2 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10" />
              <div className="flex items-center justify-between mb-8 gap-4">
                <h2 className="text-2xl font-bold flex items-center gap-3" style={{ fontFamily: 'var(--font-orbitron)' }}>
                  <User className="text-primary w-6 h-6" />
                  Account Details
                </h2>
                
                {isDirty && (
                  <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                    <MetalButton
                      type="button"
                      variantType="outlined"
                      metalVariant="silver-dark"
                      onClick={handleCancel}
                      disabled={isLoading}
                      className="px-6 h-10 text-xs"
                    >
                      Cancel
                    </MetalButton>
                    <MetalButton
                      type="submit"
                      form="profile-form"
                      metalVariant={metalVariant}
                      variantType="filled"
                      glowColor={primaryColor}
                      disabled={isLoading}
                      className="px-8 h-10 text-xs"
                    >
                      {isLoading ? 'Saving...' : 'Update Account'}
                    </MetalButton>
                  </div>
                )}
              </div>
              <form id="profile-form" onSubmit={handleProfileSubmit} className="max-w-2xl space-y-8">
                <div className="flex items-start gap-8">
                  <div className="space-y-6 flex flex-col items-center shrink-0 w-48 lg:w-64">
                    <div className="space-y-4 flex flex-col items-center">
                      {avatarSource === 'custom' ? (
                        <ImageUpload 
                          onChange={setCustomImage} 
                          value={customImage} 
                          initials={name}
                          minimal
                          rounded="full"
                          className="w-32 h-32"
                        />
                      ) : (
                        <div className="w-32 h-32 rounded-full border-2 border-primary/20 bg-muted flex items-center justify-center overflow-hidden shadow-xl ring-2 ring-background">
                          <img 
                            src={socialAccounts.find(a => a.provider === avatarSource)?.provider_image || ''} 
                            className="w-full h-full object-cover" 
                            alt="Active Avatar"
                          />
                        </div>
                      )}
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter text-center">
                        {avatarSource === 'custom' ? 'Custom Upload' : `${avatarSource} Profile Pic`}
                      </p>
                    </div>

                    {/* Avatar Source Selection - Now Vertical below picture */}
                    <div className="space-y-4 w-full pt-4 border-t border-border/50">
                       <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center block">Profile Pic Source</label>
                       <div className="flex flex-col gap-2">
                         {/* Custom Source */}
                         <button
                           type="button"
                           onClick={() => setAvatarSource('custom')}
                           className={cn(
                             "flex items-center gap-2 p-2 rounded-xl border transition-all text-left",
                             avatarSource === 'custom' 
                               ? "border-primary bg-primary/5 ring-1 ring-primary" 
                               : "border-border hover:border-muted-foreground/30 bg-background/50"
                           )}
                         >
                           <div className="w-8 h-8 rounded-full border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                             {customImage ? <img src={customImage} className="w-full h-full object-cover" /> : <User className="w-4 h-4" />}
                           </div>
                           <div className="flex flex-col min-w-0">
                             <span className="text-[10px] font-bold uppercase tracking-tight">Custom</span>
                           </div>
                         </button>

                         {/* Social Sources */}
                         {socialAccounts.map((acc) => (
                           <button
                             key={acc.provider}
                             type="button"
                             onClick={() => setAvatarSource(acc.provider)}
                             className={cn(
                               "flex items-center gap-2 p-2 rounded-xl border transition-all text-left uppercase",
                               avatarSource === acc.provider
                                 ? "border-primary bg-primary/5 ring-1 ring-primary"
                                 : "border-border hover:border-muted-foreground/30 bg-background/50"
                             )}
                           >
                              <div className="w-8 h-8 rounded-full border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                                <img src={acc.provider_image} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-tight">{acc.provider}</span>
                              </div>
                           </button>
                         ))}
                       </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Full Name</label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="e.g. John Doe"
                        className="bg-background/50"
                      />
                    </div>
                    
                    <div className="space-y-2 opacity-60">
                      <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Primary Email</label>
                      <Input value={user.email} disabled className="bg-muted/50 cursor-not-allowed" />
                    </div>
                  </div>
                </div>
              </form>
            </Card>
          </section>

          {/* Security Section */}
          <section id="security" className="scroll-mt-24">
            <Card className="p-8 bg-card/40 backdrop-blur-sm border-2">
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-3" style={{ fontFamily: 'var(--font-orbitron)' }}>
                <Shield className="text-primary w-6 h-6" />
                Security & Password
              </h2>
              <div className="max-w-2xl space-y-8">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-sm font-semibold mb-1">
                    {user.hasPassword ? 'Keep your account secure' : 'Set a direct login password'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.hasPassword 
                      ? 'We recommend updating your password every few months to ensure maximum security.' 
                      : 'Since you signed up with Google, you can set a password here to log in directly via email in the future.'}
                  </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">New Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Confirm Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-background/50"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <MetalButton 
                    variantType="outlined" 
                    metalVariant={metalVariant}
                    disabled={isLoading || !newPassword || newPassword !== confirmPassword}
                    onClick={handleUpdatePassword}
                    className="min-w-[180px]"
                  >
                    {user.hasPassword ? 'Update Password' : 'Set Password'}
                  </MetalButton>
                </div>
              </div>
            </Card>
          </section>

          {/* Linked Emails Section */}
          <section id="emails" className="scroll-mt-24">
            <Card className="p-8 bg-card/40 backdrop-blur-sm border-2">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold flex items-center gap-3" style={{ fontFamily: 'var(--font-orbitron)' }}>
                  <Mail className="text-primary w-6 h-6" />
                  Linked Emails
                </h2>
                <MetalButton variantType="outlined" size="sm" onClick={() => {}} className="text-xs uppercase font-bold tracking-widest">
                  Link New Email
                </MetalButton>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 rounded-2xl bg-background/50 border-2 border-primary/20 group hover:border-primary/40 transition-all duration-300">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-primary/10 text-primary">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-lg font-bold">{user.email}</span>
                      <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">Primary Contact</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 text-[10px] font-black uppercase tracking-widest">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Verified
                  </div>
                </div>
                
                <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-xs text-muted-foreground italic leading-relaxed">
                  Linking additional email addresses (e.g. from your school and personal life) allows you to consolidate your entire sports history and stats under a single profile.
                </div>
              </div>
            </Card>
          </section>

          {/* Advanced Settings Section */}
          <section id="advanced" className="scroll-mt-24">
            <Card className="p-8 bg-card/40 border-2 border-slate-800/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-500/20 to-transparent" />
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-3" style={{ fontFamily: 'var(--font-orbitron)' }}>
                <Settings className="text-slate-400 w-6 h-6" />
                Advanced
              </h2>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 p-6 rounded-2xl border border-dashed border-border bg-background/30">
                <div className="max-w-md">
                  <h4 className="text-lg font-bold mb-2">Consolidate Accounts</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Do you have another account with game history from a different organization? Merge it into this one to see all your stats in one place.
                  </p>
                </div>
                <MetalButton 
                  variantType="outlined" 
                  metalVariant="silver-dark"
                  onClick={() => router.push('/profile/merge')}
                  className="whitespace-nowrap min-w-[200px]"
                >
                  Start Merge Process
                </MetalButton>
              </div>

              <div className="mt-8 flex justify-between items-center px-2">
                  <p className="text-xs text-muted-foreground">User ID: <code className="bg-muted px-1 rounded">{user.id}</code></p>
                  <p className="text-xs text-muted-foreground">Last login: {new Date().toLocaleDateString()}</p>
              </div>
            </Card>
          </section>
        </div>
      </div>

      {/* Status Notifications */}
      {message.text && (
        <div className={cn(
          "fixed bottom-8 right-8 p-4 rounded-2xl border-2 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] flex items-center gap-3 animate-in slide-in-from-right-10 duration-500 z-50",
          message.type === 'success' 
            ? 'bg-green-500/10 text-green-500 border-green-500/20' 
            : 'bg-destructive/10 text-destructive border-destructive/20'
        )}>
          {message.type === 'success' ? <Shield className="w-5 h-5" /> : <Shield className="w-5 h-5 text-destructive" />}
          <span className="font-bold text-sm tracking-tight">{message.text}</span>
        </div>
      )}
    </div>
  );
}
