"use client";

import { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import { Organization } from "@sk/types";
import { store } from "@/app/store/store";

interface UseOrganizationOptions {
    subscribeData?: boolean;
    subscribeSummary?: boolean;
    gracePeriodMs?: number;
}

export function useOrganization(id: string, options: UseOrganizationOptions = {}) {
    const { 
        subscribeData = false, 
        subscribeSummary = false, 
        gracePeriodMs = 3000 
    } = options;

    const [org, setOrg] = useState<Organization | undefined>(() => store.getOrganization(id));
    const [isLoading, setIsLoading] = useState(!org);
    const [isNotFound, setIsNotFound] = useState(false);

    if (isNotFound) {
        notFound();
    }

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        const update = () => {
            const currentOrg = store.getOrganization(id);
            if (currentOrg) {
                setOrg(currentOrg);
                setIsLoading(false);
                if (timeoutId) clearTimeout(timeoutId);
            } else if (store.isOrganizationMissing(id)) {
                // Immediate 404 trigger
                if (timeoutId) clearTimeout(timeoutId);
                setIsNotFound(true);
            } else if (store.isLoaded()) {
                if (!timeoutId) {
                    timeoutId = setTimeout(() => {
                        if (!store.getOrganization(id)) {
                            setIsNotFound(true);
                        }
                    }, gracePeriodMs);
                }
            }
        };

        update();

        if (subscribeSummary) store.subscribeToOrganizationSummary(id);
        if (subscribeData) store.subscribeToOrganizationData(id);

        const unsubscribe = store.subscribe(update);

        return () => {
            unsubscribe();
            if (timeoutId) clearTimeout(timeoutId);
            if (subscribeSummary) store.unsubscribeFromOrganizationSummary(id);
            // unsubscribeFromOrganizationData is not implemented in some store versions or needs care
        };
    }, [id, subscribeData, subscribeSummary, gracePeriodMs]);

    return { org, isLoading };
}
