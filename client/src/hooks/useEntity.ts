"use client";

import { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import { store } from "@/app/store/store";

interface UseEntityOptions {
    subscribeData?: boolean;
    gracePeriodMs?: number;
    redirectOnNotFound?: boolean;
}

/**
 * Generic hook for fetching and subscribing to a store entity with loading and not-found handling.
 */
export function useEntity<T>(
    type: string, 
    id: string, 
    getter: (id: string) => T | undefined,
    subscribeFn: (id: string) => void,
    unsubscribeFn: (id: string) => void,
    options: UseEntityOptions = {}
) {
    const { 
        subscribeData = true, 
        gracePeriodMs = 3000,
        redirectOnNotFound = true
    } = options;

    const [data, setData] = useState<T | undefined>(() => id ? getter(id) : undefined);
    const [isLoading, setIsLoading] = useState(!data && !!id);
    const [isNotFound, setIsNotFound] = useState(false);

    if (isNotFound && redirectOnNotFound) {
        notFound();
    }

    useEffect(() => {
        if (!id) return;
        
        let timeoutId: NodeJS.Timeout;

        const update = () => {
            const current = getter(id);
            if (current) {
                setData(current);
                setIsLoading(false);
                if (timeoutId) clearTimeout(timeoutId);
            } else if (store.isMissing(type, id)) {
                if (timeoutId) clearTimeout(timeoutId);
                setIsNotFound(true);
                setIsLoading(false);
            } else if (store.isLoaded()) {
                if (!timeoutId) {
                    timeoutId = setTimeout(() => {
                        if (!getter(id)) {
                            setIsNotFound(true);
                            setIsLoading(false);
                        }
                    }, gracePeriodMs);
                }
            }
        };

        update();

        if (subscribeData) subscribeFn(id);

        const unsubscribe = store.subscribe(update);

        return () => {
            unsubscribe();
            if (timeoutId) clearTimeout(timeoutId);
            if (subscribeData) unsubscribeFn(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, type, subscribeData, gracePeriodMs]);

    return { data, isLoading, isNotFound };
}

// Concrete Hooks

export function useTeam(id: string, options: UseEntityOptions = {}) {
    const { data: team, ...rest } = useEntity(
        'team', 
        id, 
        (id) => store.getTeam(id),
        (id) => store.subscribeToTeamData(id),
        (id) => store.unsubscribeFromTeamData(id),
        options
    );
    return { team, ...rest };
}

export function useEvent(id: string, options: UseEntityOptions = {}) {
    const { data: event, ...rest } = useEntity(
        'event', 
        id, 
        (id) => store.getEvent(id),
        (id) => store.subscribeToEvent(id),
        (id) => store.unsubscribeFromEvent(id),
        options
    );
    return { event, ...rest };
}

export function useGame(id: string, options: UseEntityOptions = {}) {
    const { data: game, ...rest } = useEntity(
        'game', 
        id, 
        (id) => store.getGame(id),
        (id) => store.subscribeToGame(id),
        (id) => store.unsubscribeFromGame(id),
        options
    );
    return { game, ...rest };
}

export function useSite(id: string, options: UseEntityOptions = {}) {
    const { data: site, ...rest } = useEntity(
        'site', 
        id, 
        (id) => store.getSite(id),
        (id) => store.subscribeToSite(id),
        (id) => store.unsubscribeFromSite(id),
        options
    );
    return { site, ...rest };
}

export function useFacility(id: string, options: UseEntityOptions = {}) {
    const { data: facility, ...rest } = useEntity(
        'facility', 
        id, 
        (id) => store.getFacility(id),
        (id) => store.subscribeToFacility(id),
        (id) => store.unsubscribeFromFacility(id),
        options
    );
    return { facility, ...rest };
}
