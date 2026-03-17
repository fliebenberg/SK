import { useState, useEffect, useRef } from 'react';
import { GameClockState } from '@sk/types';

export function useGameTimer(clock?: GameClockState) {
    const [currentTimeMS, setCurrentTimeMS] = useState<number>(0);
    const frameRef = useRef<number>(null);

    useEffect(() => {
        if (!clock) {
            setCurrentTimeMS(0);
            return;
        }

        const updateClock = () => {
            let totalMS = clock.elapsedMS;
            
            if (clock.isRunning && clock.lastStartedAt) {
                const startTime = new Date(clock.lastStartedAt).getTime();
                const now = Date.now(); // TODO: Server time offset adjustment
                totalMS += (now - startTime);
            }

            setCurrentTimeMS(totalMS);
            frameRef.current = requestAnimationFrame(updateClock);
        };

        frameRef.current = requestAnimationFrame(updateClock);

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [clock?.isRunning, clock?.lastStartedAt, clock?.elapsedMS]);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const parts = [];
        if (hours > 0) parts.push(hours.toString().padStart(2, '0'));
        parts.push(minutes.toString().padStart(2, '0'));
        parts.push(seconds.toString().padStart(2, '0'));

        return parts.join(':');
    };

    return {
        ms: currentTimeMS,
        formattedTime: formatTime(currentTimeMS),
        isRunning: clock?.isRunning ?? false
    };
}
