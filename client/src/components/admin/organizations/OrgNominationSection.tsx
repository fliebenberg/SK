"use client";

import { useState, useEffect } from "react";
import { store } from "@/app/store/store";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Send, History, CheckCircle2, Clock, XCircle, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface OrgNominationSectionProps {
  orgId: string;
}

export function OrgNominationSection({ orgId }: OrgNominationSectionProps) {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newEmails, setNewEmails] = useState<string[]>([""]);

  useEffect(() => {
    // 1. Initial listener to sync local state with store
    const update = () => {
      setReferrals([...store.orgReferrals]);
      setLoading(false);
    };

    // 2. Subscribe to store changes
    const unsubscribe = store.subscribe(update);
    
    // 3. Join the real-time room for this organization's referrals
    store.subscribeToOrgReferrals(orgId);
    
    // Trigger initial update
    update();

    return () => {
      unsubscribe();
      store.unsubscribeFromOrgReferrals(orgId);
    };
  }, [orgId]);

  const handleAddEmailField = () => {
    setNewEmails([...newEmails, ""]);
  };

  const handleRemoveEmailField = (index: number) => {
    const updated = newEmails.filter((_, i) => i !== index);
    setNewEmails(updated.length ? updated : [""]);
  };

  const handleEmailChange = (index: number, value: string) => {
    const updated = [...newEmails];
    updated[index] = value;
    setNewEmails(updated);
  };

  const handleNominate = async () => {
    const validEmails = newEmails.map(e => e.trim()).filter(e => e && e.includes("@"));
    if (validEmails.length === 0) {
      toast({
        title: "Invalid Input",
        description: "Please enter at least one valid email.",
        variant: "destructive"
      });
      return;
    }

    if (!user?.id) return;

    setSubmitting(true);
    try {
      await store.referOrgContact(orgId, validEmails, user.id);
      toast({
        title: "Nomination Success",
        description: `Nomination sent to ${validEmails.length} contact(s).`,
        variant: "success"
      });
      setNewEmails([""]);
      // No manual fetch needed, back-end will broadcast ORG_REFERRAL_ADDED
    } catch (e: any) {
      toast({
        title: "Nomination Error",
        description: e.message || "Failed to send nominations.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1 capitalize">
            <Clock className="h-3 w-3" />
            {status}
          </Badge>
        );
      case "claimed":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 gap-1 capitalize">
            <CheckCircle2 className="h-3 w-3" />
            {status}
          </Badge>
        );
      case "declined":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 gap-1 capitalize">
            <XCircle className="h-3 w-3" />
            {status}
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="capitalize">{status}</Badge>;
    }
  };

  return (
    <div className="grid gap-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Nominate New Owner
          </CardTitle>
          <CardDescription>
            Send an invitation to someone you know who should manage this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {newEmails.map((email, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="email"
                  placeholder="contact@example.com"
                  value={email}
                  onChange={(e) => handleEmailChange(index, e.target.value)}
                  className="bg-background/50"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveEmailField(index)}
                  disabled={newEmails.length === 1}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddEmailField}
                className="border-dashed"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another
              </Button>
              <Button
                onClick={handleNominate}
                disabled={submitting || !newEmails.some(e => e.includes("@"))}
                className="sm:ml-auto"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send Nominations
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Nomination History
          </CardTitle>
          <CardDescription>
            See who has been nominated for this organization and their response.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : referrals.length === 0 ? (
            <div className="text-center py-8 border border-dashed rounded-lg bg-muted/20">
              <Info className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No nominations found for this organization.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {referrals.map((ref) => (
                <div key={ref.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{ref.referredEmail}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Nominated on {new Date(ref.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(ref.status)}
                    {ref.claimedAt && (
                      <p className="text-xs text-muted-foreground hidden lg:block">
                        Claimed on {new Date(ref.claimedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

