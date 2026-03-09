import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

export function EventLogFeed({ gameId }: { gameId: string }) {
    // In a real implementation, this listens to the game:[id]:events socket room
    // and prepends items to this list.
    const mockEvents = [
        { id: '1', time: '14:23', type: 'TRY', team: 'Home', player: 'John Smith' },
        { id: '2', time: '12:05', type: 'PENALTY', team: 'Away', player: 'Mike Davis' },
        { id: '3', time: '00:00', type: 'KICK-OFF', team: 'Home', player: '' }
    ];

    return (
        <div className="flex flex-col h-full h-min-[200px]">
            <h3 className="font-semibold text-sm text-gray-500 mb-2 uppercase tracking-wider">Play-by-Play</h3>
            <ScrollArea className="flex-1 border rounded-md p-2 bg-gray-50/50">
                <div className="flex flex-col gap-2">
                    {mockEvents.map(evt => (
                        <div key={evt.id} className="text-sm flex gap-3 items-center p-2 bg-white rounded shadow-sm border border-gray-100">
                            <span className="font-mono text-gray-400 w-12">{evt.time}</span>
                            <span className={`font-semibold text-xs px-2 py-0.5 rounded ${
                                evt.team === 'Home' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                            }`}>
                                {evt.team}
                            </span>
                            <span className="font-medium">{evt.type}</span>
                            <span className="text-gray-600 ml-auto">{evt.player}</span>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
