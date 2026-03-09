import React, { Suspense, lazy } from 'react';
import { Game } from '@sk/types';

// Lazy load sport specific components
const RugbyScoreboard = lazy(() => import('./rugby/RugbyScoreboard'));
const RugbyScoringPanel = lazy(() => import('./rugby/RugbyScoringPanel'));

const AthleticsStartList = lazy(() => import('./athletics/AthleticsStartList'));
const AthleticsScoringGrid = lazy(() => import('./athletics/AthleticsScoringGrid'));

interface SlotProps {
    game: Game;
    role?: string;
    // other shared props could be injected here
}

export const SportComponentRegistry = {
    getScoreboard: (categoryStr: string) => {
        switch (categoryStr.toLowerCase()) {
            case 'rugby': return (props: SlotProps) => <RugbyScoreboard {...props} />;
            case 'athletics': return () => <div className="p-4 border rounded text-center text-gray-500">Athletics does not use a standard head-to-head scoreboard.</div>;
            default: return () => <div>Default Scoreboard</div>;
        }
    },
    
    getScoringPanel: (categoryStr: string) => {
        switch (categoryStr.toLowerCase()) {
            case 'rugby': return (props: SlotProps) => <RugbyScoringPanel {...props} />;
            case 'athletics': return (props: SlotProps) => <AthleticsScoringGrid {...props} />;
            default: return () => <div>Default Scoring Panel</div>;
        }
    },

    getParticipantList: (categoryStr: string) => {
        switch (categoryStr.toLowerCase()) {
            case 'rugby': return () => <div>Rugby Team Roster Slot</div>;
            case 'athletics': return (props: SlotProps) => <AthleticsStartList {...props} />;
            default: return () => <div>Default Participant List</div>;
        }
    }
};

export const SlotWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <Suspense fallback={<div className="animate-pulse bg-gray-200 h-32 rounded flex items-center justify-center">Loading Module...</div>}>
            {children}
        </Suspense>
    );
};
