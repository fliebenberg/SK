import React, { Suspense, lazy } from 'react';
import { Game } from '@sk/types';
import { DynamicScoringPanel } from './shared/DynamicScoringPanel';

// Lazy load sport specific components
const RugbyScoreboard = lazy(() => import('./rugby/RugbyScoreboard'));
const RugbyScoringPanel = lazy(() => import('./rugby/RugbyScoringPanel'));

const AthleticsStartList = lazy(() => import('./athletics/AthleticsStartList'));
const AthleticsScoringGrid = lazy(() => import('./athletics/AthleticsScoringGrid'));

// Generic dynamic panel components driven by EventTemplates
const DynamicGameEventsPanel = ({ role }: { game: Game, role?: string }) => (
    <DynamicScoringPanel section="Game Events" />
);
const DynamicGeneralPlayPanel = ({ role }: { game: Game, role?: string }) => (
    <DynamicScoringPanel section="General Play" />
);

interface SlotProps {
    game: Game;
    role?: string;
    // other shared props could be injected here
}

// Stable fallback components to ensure consistent references
const DefaultScoreboard = ({ game, role }: SlotProps) => <div className="p-4 border rounded text-center text-gray-500">Default Scoreboard</div>;
const DefaultScoringPanel = ({ game, role }: SlotProps) => <div className="p-4 border rounded text-center text-gray-500">Default Scoring Panel</div>;
const DefaultParticipantList = ({ game, role }: SlotProps) => <div className="p-4 border rounded text-center text-gray-500">Default Participant List</div>;
const AthleticsScoreboardNotice = ({ game, role }: SlotProps) => <div className="p-4 border rounded text-center text-gray-500">Athletics does not use a standard head-to-head scoreboard.</div>;
const RugbyRosterNotice = ({ game, role }: SlotProps) => <div className="p-4 border rounded text-center text-gray-500 font-black uppercase tracking-widest text-tiny">Rugby Team Roster Slot</div>;

export const SportComponentRegistry = {
    getScoreboard: (categoryStr: string) => {
        switch (categoryStr.toLowerCase()) {
            case 'rugby': return RugbyScoreboard;
            case 'athletics': return AthleticsScoreboardNotice;
            default: return DefaultScoreboard;
        }
    },
    
    getScoringPanel: (categoryStr: string) => {
        switch (categoryStr.toLowerCase()) {
            case 'rugby': return RugbyScoringPanel;
            case 'athletics': return AthleticsScoringGrid;
            default: return DefaultScoringPanel;
        }
    },

    getGameEventsPanel: (categoryStr: string) => {
        switch (categoryStr.toLowerCase()) {
            case 'rugby': return DynamicGameEventsPanel; // Now template-driven!
            default: return null; 
        }
    },

    getGeneralPlayPanel: (categoryStr: string) => {
        switch (categoryStr.toLowerCase()) {
            case 'rugby': return DynamicGeneralPlayPanel;
            default: return null;
        }
    },

    getParticipantList: (categoryStr: string) => {
        switch (categoryStr.toLowerCase()) {
            case 'rugby': return RugbyRosterNotice;
            case 'athletics': return AthleticsStartList;
            default: return DefaultParticipantList;
        }
    }
};

export const SlotWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <Suspense fallback={<div className="animate-pulse bg-primary/10 h-32 rounded-2xl border border-primary/20 flex items-center justify-center text-tiny font-black uppercase tracking-widest text-primary/40">Loading Module...</div>}>
            {children}
        </Suspense>
    );
};

