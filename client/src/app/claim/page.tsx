"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { store } from "@/app/store/store";
import { useAuth } from "@/contexts/AuthContext";
import { MetalButton } from "@/components/ui/MetalButton";
import { OrgLogo } from "@/components/ui/OrgLogo";
import { toast } from "@/hooks/use-toast";

function ClaimPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [claimInfo, setClaimInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const t = searchParams.get("token");
    setToken(t);
    if (t) {
      store.getClaimInfo(t).then((info) => {
        setClaimInfo(info);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [searchParams]);

  const handleClaim = async () => {
    if (!token || !user) return;
    setClaiming(true);
    try {
      await store.claimOrgViaToken(token, user.id);
      toast({
        title: "Organization claimed successfully!",
        description: `You are now an administrator for ${claimInfo?.organizationName}.`,
        variant: "success"
      });
      router.push("/admin/organizations");
    } catch (error: any) {
      toast({
        title: "Failed to claim organization",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setClaiming(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Verifying invitation...</p>
      </div>
    );
  }

  if (!token || !claimInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-3xl font-orbitron font-extrabold text-destructive mb-4">INVALID INVITATION</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          This invitation link is invalid, expired, or has already been used.
        </p>
        <MetalButton onClick={() => router.push("/")} className="mt-8" size="lg">
          Back to Home
        </MetalButton>
      </div>
    );
  }

  if (claimInfo.status === 'claimed') {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <h1 className="text-3xl font-orbitron font-extrabold text-primary mb-4">ALREADY CLAIMED</h1>
          <p className="mt-2 text-muted-foreground max-w-md">
            The organization <span className="text-foreground font-bold">{claimInfo.organizationName}</span> has already been claimed by its administrator.
          </p>
          <MetalButton onClick={() => router.push("/")} className="mt-8" size="lg">
            Back to Home
          </MetalButton>
        </div>
      );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12">
      <div className="w-full max-w-md p-8 rounded-3xl border-2 border-primary/20 bg-card shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)] text-center relative overflow-hidden backdrop-blur-sm">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex justify-center mb-8 relative z-10">
          <OrgLogo 
            organization={{ 
                name: claimInfo.organizationName, 
                logo: claimInfo.organizationLogo 
            }} 
            size="xl" 
            className="shadow-2xl ring-4 ring-primary/20"
          />
        </div>
        
        <h1 className="text-3xl font-orbitron font-black text-primary mb-2 tracking-tighter relative z-10 uppercase">
          Claim Ownership
        </h1>
        
        <p className="text-lg text-muted-foreground mb-8 relative z-10">
          You have been invited to claim <br/>
          <span className="font-bold text-foreground text-xl tracking-tight">{claimInfo.organizationName}</span>
        </p>
        
        {!user ? (
          <div className="bg-orange-500/5 border border-orange-500/10 p-6 rounded-2xl mb-2 relative z-10">
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Please log in or create an account to claim this organization and become its official administrator.
            </p>
            <MetalButton 
              onClick={() => {
                localStorage.setItem('pendingClaimToken', token);
                router.push(`/login?callbackUrl=${encodeURIComponent('/claim?token=' + token)}`);
              }} 
              className="w-full"
              size="lg"
              glowColor="hsl(var(--primary))"
            >
              Log In to Proceed
            </MetalButton>
          </div>
        ) : (
          <div className="space-y-6 relative z-10">
            <div className="space-y-2">
                <p className="text-sm font-bold text-primary/60 uppercase tracking-widest">Administrator Rights</p>
                <p className="text-xs text-muted-foreground px-4">
                    Full control over teams, venues, scoring, and members.
                </p>
            </div>
            <MetalButton 
              onClick={handleClaim} 
              disabled={claiming}
              className="w-full h-16 text-xl shadow-primary/20"
              size="lg"
              glowColor="hsl(var(--primary))"
              variantType="filled"
            >
              {claiming ? "Processing..." : "Claim Org Now"}
            </MetalButton>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
    }>
      <ClaimPageContent />
    </Suspense>
  );
}
