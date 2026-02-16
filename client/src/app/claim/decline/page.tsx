"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { store } from "@/app/store/store";
import { MetalButton } from "@/components/ui/MetalButton";
import { OrgLogo } from "@/components/ui/OrgLogo";
import { toast } from "@/hooks/use-toast";

function DeclinePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [claimInfo, setClaimInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);

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

  const handleDecline = async () => {
    if (!token) return;
    setDeclining(true);
    try {
      await store.declineClaim(token);
      setDeclined(true);
      toast({
        title: "Invitation Declined",
        description: "You have successfully declined the invitation. We won't contact you about this again.",
        variant: "success"
      });
    } catch (error: any) {
      toast({
        title: "Failed to decline",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setDeclining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!token || !claimInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-3xl font-orbitron font-extrabold text-destructive mb-4">INVALID INVITATION</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          This invitation link is invalid or has expired.
        </p>
        <MetalButton onClick={() => router.push("/")} className="mt-8" size="lg">
          Back to Home
        </MetalButton>
      </div>
    );
  }

  if (declined) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <h1 className="text-3xl font-orbitron font-extrabold text-primary mb-4">INVITATION DECLINED</h1>
            <p className="mt-2 text-muted-foreground max-w-md">
                Thank you for letting us know. We have removed your email from the list for this organization.
            </p>
            <MetalButton onClick={() => router.push("/")} className="mt-8" size="lg">
                Back to Home
            </MetalButton>
        </div>
      );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12">
      <div className="w-full max-w-md p-8 rounded-3xl border-2 border-destructive/20 bg-card shadow-2xl text-center relative overflow-hidden backdrop-blur-sm">
        
        <div className="flex justify-center mb-8 relative z-10">
          <OrgLogo 
            organization={{ 
                name: claimInfo.organizationName, 
                logo: claimInfo.organizationLogo 
            }} 
            size="xl" 
            className="shadow-2xl ring-4 ring-destructive/10 grayscale"
          />
        </div>
        
        <h1 className="text-2xl font-orbitron font-bold text-destructive mb-2 relative z-10 uppercase">
          Decline Invitation
        </h1>
        
        <p className="text-muted-foreground mb-8 relative z-10">
          Are you sure you want to decline ownership of <br/>
          <span className="font-bold text-foreground text-lg">{claimInfo.organizationName}</span> and not suggest someone else?
        </p>

        <div className="space-y-4 relative z-10">
             <MetalButton 
              onClick={handleDecline} 
              disabled={declining}
              className="w-full"
              size="lg"
              variantType="filled"
              glowColor="hsl(var(--destructive))"
            >
              {declining ? "Processing..." : "Yes, Decline Invitation"}
            </MetalButton>

            <button 
              type="button"
              onClick={() => router.push(`/claim?token=${token}`)}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel (Go Back)
            </button>
        </div>
      </div>
    </div>
  );
}

export default function DeclinePage() {
  return (
    <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
    }>
      <DeclinePageContent />
    </Suspense>
  );
}
