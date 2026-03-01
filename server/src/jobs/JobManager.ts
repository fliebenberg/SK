import { Pool } from 'pg';
import pool from '../db';

export interface Job {
    name: string;
    intervalMs: number;
    handler: () => Promise<void>;
}

export class JobManager {
    private jobs: Job[] = [];
    private runningJobs: Set<string> = new Set();
    private intervals: NodeJS.Timeout[] = [];

    registerJob(job: Job) {
        this.jobs.push(job);
    }

    start() {
        console.log(`[JobManager] Starting with ${this.jobs.length} registered jobs...`);
        this.jobs.forEach(job => {
            const interval = setInterval(async () => {
                await this.runJob(job);
            }, job.intervalMs);
            this.intervals.push(interval);
            
            // Run immediately on start
            this.runJob(job);
        });
    }

    async runJob(job: Job) {
        if (this.runningJobs.has(job.name)) {
            console.log(`[JobManager] Skipping ${job.name} - already running.`);
            return;
        }

        // Priority check: If it's the 24h job, wait for any 1h job to finish if they would overlap?
        // Actually, the simplest is to just prevent the same job from overlapping itself.
        // But the user specifically asked: "the 1 hour job should run before the 24 hour job etc."
        if (job.name === 'accuracy-audit' && this.runningJobs.has('membership-expiry')) {
            console.log(`[JobManager] Postponing accuracy-audit until membership-expiry completes. Retrying in 5 min.`);
            setTimeout(() => this.runJob(job), 5 * 60 * 1000);
            return;
        }

        this.runningJobs.add(job.name);
        console.log(`[JobManager] Starting job: ${job.name}`);
        const startTime = Date.now();

        try {
            await job.handler();
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[JobManager] Completed job: ${job.name} in ${duration}s`);
        } catch (error) {
            console.error(`[JobManager] Error in job ${job.name}:`, error);
        } finally {
            this.runningJobs.delete(job.name);
        }
    }

    stop() {
        this.intervals.forEach(clearInterval);
        this.intervals = [];
    }
}

export const jobManager = new JobManager();
