"use client";

import { useEffect, useState } from "react";
import { store } from "@/app/store/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Info, Building2 } from "lucide-react";

export default function ReportsPage() {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const update = () => {
            setReports([...store.reports]);
            setLoading(false);
        };

        const unsubscribe = store.subscribe(update);
        store.fetchReports();

        return () => unsubscribe();
    }, []);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'resolved': return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Resolved</Badge>;
            case 'pending': return <Badge variant="outline" className="text-amber-500 border-amber-500/20 bg-amber-500/5">Pending</Badge>;
            default: return <Badge variant="secondary">{status}</Badge>;
        }
    };

    const getIcon = (reason: string) => {
        if (reason.includes('Discrepancy')) return <AlertCircle className="h-5 w-5 text-red-500" />;
        if (reason.includes('Audit')) return <Info className="h-5 w-5 text-blue-500" />;
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="System Reports & Audits"
                description="View automated accuracy audits, system alerts, and reported issues."
            />

            <div className="grid gap-4">
                {reports.length === 0 ? (
                    <Card className="border-dashed py-12 flex flex-col items-center justify-center text-center">
                        <CheckCircle2 className="h-12 w-12 text-muted-foreground/20 mb-4" />
                        <h3 className="text-lg font-semibold text-muted-foreground">No reports found</h3>
                        <p className="text-sm text-muted-foreground max-w-xs">
                            System is running smoothly. Audit reports will appear here if discrepancies are found.
                        </p>
                    </Card>
                ) : (
                    reports.map((report) => (
                        <Card key={report.id} className="overflow-hidden border-border/40 hover:border-border/80 transition-colors">
                            <div className="bg-muted/30 px-6 py-3 border-b border-border/40 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {getIcon(report.reason)}
                                    <span className="font-bold text-sm uppercase tracking-tight">{report.reason}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-muted-foreground font-medium">
                                        {new Date(report.createdAt).toLocaleString()}
                                    </span>
                                    {getStatusBadge(report.status)}
                                </div>
                            </div>
                            <CardContent className="p-6">
                                <div className="flex flex-col md:flex-row gap-6">
                                    <div className="flex-1">
                                        <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                                            {report.description}
                                        </p>
                                    </div>
                                    
                                    {report.entityId && (
                                        <div className="flex flex-col gap-2 min-w-[200px]">
                                            <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 border border-border/40">
                                                <Building2 className="h-4 w-4 text-primary" />
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Affected Entity</span>
                                                    <span className="text-xs font-mono font-medium truncate">{report.entityType}:{report.entityId}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {report.status === 'resolved' && report.resolvedAt && (
                                    <div className="mt-4 pt-4 border-t border-border/20 flex items-center gap-2 text-xs text-muted-foreground italic">
                                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                                        Resolved on {new Date(report.resolvedAt).toLocaleDateString()}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
