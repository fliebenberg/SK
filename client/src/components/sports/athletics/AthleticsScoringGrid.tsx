import React from 'react';
import { Game } from '@sk/types';
import { Button } from '@/components/ui/button';

export default function AthleticsScoringGrid({ game }: { game: Game }) {
    // In Athletics, the "scoring" panel is often just tracking lap completions 
    // or registering final times per competitor as they cross the line.

    const athletes = [
        { lane: 1, name: 'S. Kiptoo', laps: 10 },
        { lane: 2, name: 'J. Cheptegei', laps: 10 },
        { lane: 3, name: 'M. Farah', laps: 10 },
        { lane: 4, name: 'H. Gebrselassie', laps: 10 },
    ];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-semibold text-lg">Lap Tracking / Results</h3>
                <Button variant="outline" size="sm">Mass Start</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {athletes.map(a => (
                    <div key={a.lane} className="border rounded-lg p-3 flex flex-col items-center justify-center bg-gray-50 hover:bg-white transition-colors">
                        <span className="text-xs text-gray-400 font-mono mb-1">BIB {a.lane}</span>
                        <span className="font-bold text-center leading-tight mb-3">{a.name}</span>
                        
                        <div className="text-sm font-medium text-amber-600 mb-2">Laps: {a.laps}/12.5</div>
                        
                        <div className="flex gap-2 w-full mt-auto">
                            <Button size="sm" variant="secondary" className="flex-1 w-full text-xs h-8">Lap Split</Button>
                            <Button size="sm" className="flex-1 w-full text-xs h-8 bg-emerald-600 hover:bg-emerald-700">Finish</Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
