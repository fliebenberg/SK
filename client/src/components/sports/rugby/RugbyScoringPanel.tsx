import React from 'react';
import { Game } from '@sk/types';
import { Button } from '@/components/ui/button';

export default function RugbyScoringPanel({ game }: { game: Game }) {
    const handleScore = (points: number, team: 'home' | 'away') => {
        // Here we would emit SocketAction.ADD_GAME_EVENT
        console.log(`Scored ${points} for ${team}`);
    };

    return (
        <div className="flex flex-col gap-4">
            <h3 className="font-semibold text-lg border-b pb-2">Scoring Panel</h3>
            
            <div className="grid grid-cols-2 gap-8">
                {/* Home Actions */}
                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-gray-500 text-center mb-1">Home Team</span>
                    <Button onClick={() => handleScore(5, 'home')} className="bg-emerald-600 hover:bg-emerald-700">Try (5)</Button>
                    <Button onClick={() => handleScore(2, 'home')} variant="secondary">Conversion (2)</Button>
                    <Button onClick={() => handleScore(3, 'home')} variant="secondary">Penalty (3)</Button>
                    <Button onClick={() => handleScore(3, 'home')} variant="secondary">Drop Goal (3)</Button>
                </div>
                
                {/* Away Actions */}
                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-gray-500 text-center mb-1">Away Team</span>
                    <Button onClick={() => handleScore(5, 'away')} className="bg-emerald-600 hover:bg-emerald-700">Try (5)</Button>
                    <Button onClick={() => handleScore(2, 'away')} variant="secondary">Conversion (2)</Button>
                    <Button onClick={() => handleScore(3, 'away')} variant="secondary">Penalty (3)</Button>
                    <Button onClick={() => handleScore(3, 'away')} variant="secondary">Drop Goal (3)</Button>
                </div>
            </div>
        </div>
    );
}
