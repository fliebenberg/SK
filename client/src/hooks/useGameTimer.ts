import { useState, useEffect, useRef } from 'react';
import { GameClockState } from '@sk/types';

const formatTime = (ms: number, showHours: boolean = true): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (showHours && hours > 0) {
        parts.push(hours.toString().padStart(2, '0'));
        parts.push(minutes.toString().padStart(2, '0'));
    } else {
        parts.push(totalMinutes.toString().padStart(2, '0'));
    }
    parts.push(seconds.toString().padStart(2, '0'));

    return parts.join(':');
};

const getInitialTime = (clock?: GameClockState, showHours: boolean = true): string => {
    if (!clock) return "00:00";
    let totalMS = clock.elapsedMS;
    if (clock.isRunning && clock.lastStartedAt) {
        const startTime = new Date(clock.lastStartedAt).getTime();
        totalMS += (Date.now() - startTime);
    }
    return formatTime(totalMS, showHours);
};

export function useGameTimer(clock?: GameClockState, startTime?: string, finish_time?: string, showHours: boolean = true) {
    const [formattedTime, setFormattedTime] = useState<string>(() => getInitialTime(clock, showHours));
    const [formattedActualTime, setFormattedActualTime] = useState<string>("00:00");
    const [formattedTotalDuration, setFormattedTotalDuration] = useState<string>("00:00");
    
    const frameRef = useRef<number>(null);
    const lastClockRef = useRef<GameClockState | undefined>(clock);

    // Track the latest valid clock to prevent resetting to 0 during partial store updates
    if (clock) {
        lastClockRef.current = clock;
    }

    useEffect(() => {
        const activeClock = clock || lastClockRef.current;
        
        const updateClock = () => {
            if (activeClock) {
                let totalMS = activeClock.elapsedMS;
                let actualMS = activeClock.totalActualElapsedMS || 0;
                
                if (activeClock.isRunning && activeClock.lastStartedAt) {
                    const startedAtMS = new Date(activeClock.lastStartedAt).getTime();
                    const now = Date.now();
                    const delta = (now - startedAtMS);
                    totalMS += delta;
                    actualMS += delta;
                }

                const newFormatted = formatTime(totalMS, showHours);
                const newActualFormatted = formatTime(actualMS, showHours);
                
                setFormattedTime(prev => prev === newFormatted ? prev : newFormatted);
                setFormattedActualTime(prev => prev === newActualFormatted ? prev : newActualFormatted);
            } else {
                setFormattedTime("00:00");
                setFormattedActualTime("00:00");
            }

            // Total Duration calculation
            if (startTime) {
                const startMS = new Date(startTime).getTime();
                const endMS = finish_time ? new Date(finish_time).getTime() : Date.now();
                const durationMS = Math.max(0, endMS - startMS);
                const newDurationFormatted = formatTime(durationMS, showHours);
                setFormattedTotalDuration(prev => prev === newDurationFormatted ? prev : newDurationFormatted);
            } else {
                setFormattedTotalDuration("00:00");
            }

            if (activeClock?.isRunning || (startTime && !finish_time)) {
                frameRef.current = requestAnimationFrame(updateClock);
            }
        };

        // Initial update
        updateClock();

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [clock?.isRunning, clock?.lastStartedAt, clock?.elapsedMS, clock?.totalActualElapsedMS, startTime, finish_time, showHours]);

    return {
        formattedTime,
        formattedActualTime,
        formattedTotalDuration,
        isRunning: clock?.isRunning ?? lastClockRef.current?.isRunning ?? false,
        currentMS: clock ? (clock.elapsedMS + (clock.isRunning && clock.lastStartedAt ? Date.now() - new Date(clock.lastStartedAt).getTime() : 0)) : 0
    };
}
