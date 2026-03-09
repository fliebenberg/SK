import React from 'react';
import { Game } from '@sk/types';

export default function RugbyScoreboard({ game }: { game: Game }) {
    // In a real app, game.finalScoreData or game.liveState handles the complex tree
    const scoreData = game.liveState?.score || { home: 0, away: 0 };
    
    return (
        <div className="flex items-center justify-between px-8 py-6 rounded bg-slate-900 text-white shadow-inner">
            <div className="flex flex-col items-center">
                <span className="text-sm font-semibold text-gray-400 tracking-wider mb-2">HOME</span>
                <span className="text-6xl font-bold font-mono">{scoreData.home}</span>
            </div>
            
            <div className="flex flex-col items-center justify-center">
                <span className="text-xs bg-slate-800 px-3 py-1 rounded-full text-gray-300 font-medium mb-1 border border-slate-700">1st Half</span>
                <span className="text-2xl font-mono text-amber-500 font-bold tracking-widest">37:12</span>
            </div>
            
            <div className="flex flex-col items-center">
                <span className="text-sm font-semibold text-gray-400 tracking-wider mb-2">AWAY</span>
                <span className="text-6xl font-bold font-mono">{scoreData.away}</span>
            </div>
        </div>
    );
}
