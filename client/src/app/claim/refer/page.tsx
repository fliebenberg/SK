"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { store } from "@/app/store/store";
import { MetalButton } from "@/components/ui/MetalButton";
import { OrgLogo } from "@/components/ui/OrgLogo";
import { Input } from "@/components/ui/input"; // Assuming standard UI component
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label"; // Assuming standard UI component

function ReferPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [claimInfo, setClaimInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [referring, setReferring] = useState(false);
  const [referred, setReferred] = useState(false);
  const [email, setEmail] = useState("");

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

  const handleRefer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !email) return;

    if (!email.includes('@')) {
        toast({
            title: "Invalid Email",
            description: "Please enter a valid email address.",
            variant: "destructive"
        });
        return;
    }

    setReferring(true);
    try {
      await store.referOrgContactViaToken(token, [email]);
      setReferred(true);
      toast({
        title: "Referral Sent!",
        description: `We have sent an invitation to ${email}.`,
        variant: "success"
      });
    } catch (error: any) {
      toast({
        title: "Failed to refer",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setReferring(false);
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

  if (referred) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <h1 className="text-3xl font-orbitron font-extrabold text-primary mb-4">REFERRAL SENT</h1>
            <p className="mt-2 text-muted-foreground max-w-md">
                Thank you! We have sent a new invitation to <span className="text-foreground font-bold">{email}</span>.
            </p>
            <MetalButton onClick={() => router.push("/")} className="mt-8" size="lg">
                Back to Home
            </MetalButton>
        </div>
      );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12">
      <div className="w-full max-w-md p-8 rounded-3xl border-2 border-primary/20 bg-card shadow-2xl text-center relative overflow-hidden backdrop-blur-sm">
        
        <div className="flex justify-center mb-8 relative z-10">
          <OrgLogo 
            organization={{ 
                name: claimInfo.organizationName, 
                logo: claimInfo.organizationLogo 
            }} 
            size="xl" 
            className="shadow-2xl ring-4 ring-primary/10"
          />
        </div>
        
        <h1 className="text-2xl font-orbitron font-bold text-primary mb-2 relative z-10 uppercase">
          Refer Someone Else
        </h1>
        
        <p className="text-muted-foreground mb-8 relative z-10 text-sm">
          Know the right person to manage <span className="font-bold text-foreground">{claimInfo.organizationName}</span>? <br/>Enter their email below and we'll send them an invitation.
        </p>

        <form onSubmit={handleRefer} className="space-y-6 relative z-10 text-left">
             <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input 
                    id="email"
                    type="email" 
                    placeholder="colleague@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 bg-background/50"
                />
             </div>

             <div className="pt-2 space-y-3">
                <MetalButton 
                    type="submit"
                    disabled={referring}
                    className="w-full"
                    size="lg"
                    variantType="filled"
                    glowColor="hsl(var(--primary))"
                >
                    {referring ? "Sending..." : "Send Invitation"}
                </MetalButton>

                <button 
                    type="button"
                    onClick={() => router.push(`/claim?token=${token}`)}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    Cancel (Go Back)
                </button>
            </div>
        </form>
      </div>
    </div>
  );
}

export default function ReferPage() {
  return (
    <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
    }>
      <ReferPageContent />
    </Suspense>
  );
}
