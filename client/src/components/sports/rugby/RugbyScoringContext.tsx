import React, { createContext, useContext } from 'react';
import { Game } from '@sk/types';
import { useRugbyScoring, ScoringFlowState } from './useRugbyScoring';

type RugbyScoringContextType = ReturnType<typeof useRugbyScoring>;

const RugbyScoringContext = createContext<RugbyScoringContextType | null>(null);

export function RugbyScoringProvider({ game, children }: { game: Game, children: React.ReactNode }) {
    const value = useRugbyScoring(game);
    return (
        <RugbyScoringContext.Provider value={value}>
            {children}
        </RugbyScoringContext.Provider>
    );
}

export function useSharedRugbyScoring() {
    const context = useContext(RugbyScoringContext);
    if (!context) {
        throw new Error('useSharedRugbyScoring must be used within a RugbyScoringProvider');
    }
    return context;
}
