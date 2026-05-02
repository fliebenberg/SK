import React, { createContext, useContext } from 'react';
import { Game } from '@sk/types';
import { useDynamicScoring } from '@/hooks/useDynamicScoring';

// -----------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------
type DynamicScoringContextType = ReturnType<typeof useDynamicScoring>;

const DynamicScoringContext = createContext<DynamicScoringContextType | null>(null);

export function DynamicScoringProvider({ game, children }: { game: Game; children: React.ReactNode }) {
    const value = useDynamicScoring(game);
    return (
        <DynamicScoringContext.Provider value={value}>
            {children}
        </DynamicScoringContext.Provider>
    );
}

export function useSharedDynamicScoring(): DynamicScoringContextType {
    const ctx = useContext(DynamicScoringContext);
    if (!ctx) throw new Error('useSharedDynamicScoring must be used within a DynamicScoringProvider');
    return ctx;
}
