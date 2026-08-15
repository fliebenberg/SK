import { useState, useEffect, useRef } from 'react';
import { GameClockState } from '@sk/shared';
import { wsService } from '../services/websocket';

const formatTime = (ms: number, showHours: boolean = true): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (showHours && hours > 0) {
    parts.push(hours.toString());
    parts.push(minutes.toString().padStart(2, '0'));
  } else {
    parts.push(totalMinutes.toString().padStart(2, '0'));
  }
  parts.push(seconds.toString().padStart(2, '0'));

  return parts.join(':');
};

export function getLiveElapsedMS(clock?: GameClockState): number {
  if (!clock) return 0;
  let totalMS = clock.elapsedMS || 0;
  if (clock.isRunning && clock.lastStartedAt) {
    const startedAtMS = new Date(clock.lastStartedAt).getTime();
    const now = wsService.getServerTime();
    totalMS += Math.max(0, now - startedAtMS);
  }
  return totalMS;
}

const getInitialTime = (clock?: GameClockState, showHours: boolean = true): string => {
  if (!clock) return "00:00";
  const totalMS = getLiveElapsedMS(clock);
  return formatTime(totalMS, showHours);
};

export function useGameTimer(clock?: GameClockState, startTime?: string, finishTime?: string, showHours: boolean = true) {
  const [formattedTime, setFormattedTime] = useState<string>(() => getInitialTime(clock, showHours));
  const [formattedActualTime, setFormattedActualTime] = useState<string>("00:00");
  const [formattedTotalDuration, setFormattedTotalDuration] = useState<string>("00:00");
  
  const frameRef = useRef<number | null>(null);
  const lastClockRef = useRef<GameClockState | undefined>(clock);

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
          const now = wsService.getServerTime();
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

      if (startTime) {
        const startMS = new Date(startTime).getTime();
        const endMS = finishTime ? new Date(finishTime).getTime() : wsService.getServerTime();
        const durationMS = Math.max(0, endMS - startMS);
        const newDurationFormatted = formatTime(durationMS, showHours);
        setFormattedTotalDuration(prev => prev === newDurationFormatted ? prev : newDurationFormatted);
      } else {
        setFormattedTotalDuration("00:00");
      }

      if (activeClock?.isRunning || (startTime && !finishTime)) {
        frameRef.current = requestAnimationFrame(updateClock);
      }
    };

    updateClock();

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [clock?.isRunning, clock?.lastStartedAt, clock?.elapsedMS, clock?.totalActualElapsedMS, startTime, finishTime, showHours]);

  return {
    formattedTime,
    formattedActualTime,
    formattedTotalDuration,
    isRunning: clock?.isRunning ?? lastClockRef.current?.isRunning ?? false,
    currentMS: clock ? (clock.elapsedMS + (clock.isRunning && clock.lastStartedAt ? wsService.getServerTime() - new Date(clock.lastStartedAt).getTime() : 0)) : 0,
    currentActualMS: clock ? ((clock.totalActualElapsedMS ?? clock.elapsedMS) + (clock.isRunning && clock.lastStartedAt ? wsService.getServerTime() - new Date(clock.lastStartedAt).getTime() : 0)) : 0
  };
}
