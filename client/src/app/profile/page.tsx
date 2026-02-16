"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { MetalButton } from '@/components/ui/MetalButton';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { useThemeColors } from '@/hooks/useThemeColors';
import { 
  User, 
  Mail, 
  Shield, 
  Palette, 
  Check, 
  AlertCircle, 
  Settings, 
  Circle,
  Eye,
  EyeOff,
  ChevronRight,
  UserPlus
} from "lucide-react";
import { cn } from '@/lib/utils';
import { UserBadge } from '@sk/types';
import { store } from '@/app/store/store';

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
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [isOldPasswordVerified, setIsOldPasswordVerified] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activeSection, setActiveSection] = useState('account');
  const [badges, setBadges] = useState<UserBadge[]>([]);

  useEffect(() => {
    if (user) {
      store.getUserBadges(user.id).then(setBadges).catch(console.error);
    }
  }, [user]);

  const handleVerifyOldPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/user/profile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: oldPassword }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Incorrect password");
      }
      
      setIsOldPasswordVerified(true);
      toast({
        title: "Success",
        description: "Password verified! You can now set a new one.",
        variant: "success"
      });
    } catch (error: any) {
      setOldPassword('');
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);

    try {
      await updateProfile({ 
        password: newPassword,
        oldPassword: oldPassword
      } as any);
      
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsEditingPassword(false);
      setIsOldPasswordVerified(false);
      
      toast({
        title: "Success",
        description: user?.hasPassword ? "Password updated successfully!" : "Password set successfully!",
        variant: "success"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update password",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const cancelPasswordEdit = () => {
    setIsEditingPassword(false);
    setIsOldPasswordVerified(false);
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const getPasswordStrength = (password: string) => {
    if (!password) return { score: 0, label: "Empty", color: "bg-muted" };
    if (password.length < 6) return { score: 1, label: "Too Short", color: "bg-destructive" };
    
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    
    const labels = ["Weak", "Fair", "Good", "Strong", "Excellent"];
    const colors = ["bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-primary", "bg-green-500"];
    
    return {
      score: score + 1,
      label: labels[score],
      color: colors[score]
    };
  };

  const strength = getPasswordStrength(newPassword);

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

  // Removed local message timeout useEffect as toast handles its own duration

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsLoading(true);

    try {
      await updateProfile({ 
        name, 
        customImage, 
        avatarSource 
      } as any);
      setInitialData({ name, customImage, avatarSource });
      toast({
        title: "Success",
        description: "Profile updated successfully",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      // Wait a bit for the session update to propagate then fetch socials again to ensure UI consistency
      setTimeout(() => {
        router.refresh();
      }, 500);
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
    { id: 'badges', label: 'Your Badges', icon: Palette },
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
          {/* Badges Section */}
          <section id="badges" className="scroll-mt-24">
            <Card className="p-8 bg-card/40 backdrop-blur-sm border-2 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10" />
              <h2 className="text-2xl font-bold mb-8 flex items-center gap-3" style={{ fontFamily: 'var(--font-orbitron)' }}>
                <Palette className="text-primary w-6 h-6" />
                Your Badges
              </h2>
              
              {badges.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {badges.map((badge) => (
                    <div key={badge.id} className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-background/50 border-2 border-primary/20 group hover:border-primary/50 transition-all duration-300">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        {badge.badgeType === 'community_builder' ? <UserPlus className="w-8 h-8" /> : <Shield className="w-8 h-8" />}
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold uppercase tracking-widest">{badge.badgeType.replace('_', ' ')}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{new Date(badge.earnedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-2xl bg-background/20">
                    <Palette className="w-12 h-12 text-muted-foreground/30 mb-4" />
                    <p className="text-lg font-bold text-muted-foreground">No badges earned yet</p>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">Help build the community by referring other organizations to earn your first badge!</p>
                </div>
              )}
            </Card>
          </section>

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
                          {(() => {
                            const sourceImg = socialAccounts.find(a => a.provider === avatarSource)?.provider_image;
                            if (sourceImg && sourceImg !== "" && sourceImg !== "null" && sourceImg !== "undefined") {
                              return (
                                <img 
                                  src={sourceImg} 
                                  className="w-full h-full object-cover" 
                                  alt="Active Avatar"
                                />
                              );
                            }
                            return <User className="w-12 h-12 text-muted-foreground" />;
                          })()}
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
                             {customImage ? <img src={customImage} className="w-full h-full object-cover" alt="Custom" /> : <User className="w-4 h-4" />}
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
                                {(() => {
                                  if (acc.provider_image && acc.provider_image !== "" && acc.provider_image !== "null" && acc.provider_image !== "undefined") {
                                    return <img src={acc.provider_image} className="w-full h-full object-cover" alt={acc.provider} />;
                                  }
                                  return <User className="w-4 h-4 text-muted-foreground" />;
                                })()}
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
              <div className="flex items-center justify-between mb-8 gap-4">
                <h2 className="text-2xl font-bold flex items-center gap-3" style={{ fontFamily: 'var(--font-orbitron)' }}>
                  <Shield className="text-primary w-6 h-6" />
                  Security & Password
                </h2>
                {isEditingPassword && (
                    <MetalButton 
                        variantType="outlined" 
                        metalVariant="silver-dark" 
                        size="sm" 
                        onClick={cancelPasswordEdit}
                        className="h-9 px-4 text-xs"
                    >
                        Cancel
                    </MetalButton>
                )}
              </div>

              <div className="max-w-2xl space-y-8">
                {/* Status Message */}
                {!isEditingPassword && (
                    <div className="flex items-center justify-between p-6 rounded-2xl bg-background/50 border-2 border-primary/20 group">
                        <div className="flex items-center gap-4">
                            <div className={cn("p-3 rounded-full bg-primary/10", user.hasPassword ? "text-primary" : "text-amber-500 bg-amber-500/10")}>
                                <Shield className="w-5 h-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-lg font-bold">
                                    {user.hasPassword ? 'Password Protection Active' : 'No Password Set'}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">
                                    {user.hasPassword ? 'Your account is secured with a password' : 'Set a password to log in via email directly'}
                                </span>
                            </div>
                        </div>
                        <MetalButton 
                            variantType="filled" 
                            glowColor={primaryColor}
                            size="sm"
                            onClick={() => setIsEditingPassword(true)}
                            className="text-xs uppercase font-bold tracking-widest px-6"
                        >
                            {user.hasPassword ? 'Change Password' : 'Add Password'}
                        </MetalButton>
                    </div>
                )}

                {/* Step 1: Verify Old Password */}
                {isEditingPassword && user?.hasPassword && !isOldPasswordVerified && (
                    <form onSubmit={handleVerifyOldPassword} className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                        <input 
                            type="text" 
                            name="username" 
                            defaultValue={user?.email || ''} 
                            autoComplete="username" 
                            style={{ display: 'none' }} 
                            readOnly 
                        />
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                Please verify your current password to continue.
                            </p>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current Password</label>
                                <div className="flex gap-3">
                                    <div className="relative flex-1">
                                        <Input
                                            type={showOldPassword ? "text" : "password"}
                                            placeholder="••••••••"
                                            value={oldPassword}
                                            onChange={(e) => setOldPassword(e.target.value)}
                                            required
                                            autoFocus
                                            autoComplete="current-password"
                                            className="bg-background/50 h-11 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowOldPassword(!showOldPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <MetalButton 
                                        type="submit"
                                        variantType="filled" 
                                        glowColor={primaryColor}
                                        disabled={isLoading || !oldPassword}
                                        className="h-11 px-8"
                                    >
                                        {isLoading ? 'Verifying...' : 'Verify'}
                                    </MetalButton>
                                </div>
                            </div>
                        </div>
                    </form>
                )}

                {/* Step 2/New: Set New Password */}
                {isEditingPassword && (!user?.hasPassword || isOldPasswordVerified) && (
                    <form onSubmit={handleUpdatePassword} className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                        <input 
                            type="text" 
                            name="username" 
                            defaultValue={user?.email || ''} 
                            autoComplete="username" 
                            style={{ display: 'none' }} 
                            readOnly 
                        />
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                {user.hasPassword ? 'Enter your new security credentials.' : 'Set your new login password.'}
                            </p>
                            <div className="grid gap-6 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">New Password</label>
                                    <div className="relative">
                                        <Input
                                            type={showNewPassword ? "text" : "password"}
                                            placeholder="••••••••"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            required
                                            autoFocus
                                            autoComplete="new-password"
                                            className="bg-background/50 h-11 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {/* Strength Indicator */}
                                    {newPassword && (
                                        <div className="space-y-2 pt-1 animate-in fade-in duration-300">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">Strength: <span className={cn("inline-block ml-1", strength.color.replace('bg-', 'text-'))}>{strength.label}</span></span>
                                                <span className="text-[9px] font-black tabular-nums text-muted-foreground">{strength.score}/5</span>
                                            </div>
                                            <div className="flex gap-1 h-1.5 px-0.5">
                                                {[1, 2, 3, 4, 5].map((s) => (
                                                    <div 
                                                        key={s} 
                                                        className={cn(
                                                            "flex-1 rounded-full transition-all duration-500", 
                                                            s <= strength.score ? strength.color : "bg-muted/30"
                                                        )} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Confirm New Password</label>
                                    <div className="relative">
                                        <Input
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="••••••••"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                            autoComplete="new-password"
                                            className="bg-background/50 h-11 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {/* Match Indicator */}
                                    {confirmPassword && (
                                        <div className="pt-1 animate-in fade-in duration-300">
                                            {confirmPassword === newPassword ? (
                                                <div className="flex items-center gap-1.5 text-primary">
                                                    <Check className="w-3 h-3" />
                                                    <span className="text-[9px] font-black uppercase tracking-tighter">Passwords match</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-destructive">
                                                    <AlertCircle className="w-3 h-3" />
                                                    <span className="text-[9px] font-black uppercase tracking-tighter">Passwords do not match</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end pt-4">
                                <MetalButton 
                                    type="submit"
                                    variantType="filled" 
                                    glowColor={primaryColor}
                                    disabled={isLoading || !newPassword || newPassword !== confirmPassword}
                                    className="min-w-[200px] h-11 uppercase font-bold tracking-widest"
                                >
                                    {isLoading ? 'Saving...' : (user.hasPassword ? 'Update Password' : 'Save Password')}
                                </MetalButton>
                            </div>
                        </div>
                    </form>
                )}

                <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-xs text-muted-foreground italic leading-relaxed">
                   Having a direct password allows you to sign in using your email even if social login providers are unavailable.
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
                    <Check className="w-3 h-3" />
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
      {/* Status Notifications are now handled by the global Toaster */}
    </div>
  );
}
