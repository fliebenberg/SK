import React, { useState } from 'react';
import { Game } from '@sk/types';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw } from 'lucide-react';

export function TimerPanelSlot({ game, canEdit }: { game: Game, canEdit: boolean }) {
    // In a real implementation, this would sync with socket.io time events
    const [isRunning, setIsRunning] = useState(false);
    const [timeStr, setTimeStr] = useState('00:00');

    return (
        <div className="flex flex-col items-center justify-center py-2">
            <span className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-widest">Match Clock</span>
            <div className="text-5xl font-mono font-bold text-gray-800 mb-4 tracking-tighter">
                {timeStr}
            </div>
            
            {canEdit && (
                <div className="flex gap-2">
                    <Button 
                        variant={isRunning ? "outline" : "default"} 
                        size="icon"
                        onClick={() => setIsRunning(!isRunning)}
                        className={!isRunning ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                    >
                        {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </Button>
                    <Button variant="outline" size="icon">
                        <RotateCcw className="h-5 w-5" />
                    </Button>
                </div>
            )}
        </div>
    );
}
