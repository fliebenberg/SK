/**
 * PM2 process file for a deployed server (the test server at test.scorekeeper.live today).
 * Not used in development: there, `npm run dev` runs the server under nodemon.
 *
 * On the server, PM2 runs as the `sk` user, from this folder, after `npm run build`:
 *   pm2 start pm2.config.js          first time
 *   pm2 reload pm2.config.js         after a deploy
 *   pm2 save                          so the list survives a reboot
 * Settings come from `server/.env`, which the server reads itself; nothing secret goes here.
 * The full deploy steps are in docs/deployment.md.
 */
module.exports = {
    apps: [
        {
            name: 'scorekeeper',
            cwd: __dirname,
            script: 'dist/index.js',
            env: {
                NODE_ENV: 'production',
            },
            // One process. The server keeps live rooms and caches in memory, so it cannot be
            // split across a cluster without a shared store.
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            restart_delay: 5000,
            // The test server has 1 GB of memory; restart before the machine starts swapping hard.
            max_memory_restart: '600M',
            // Give open sockets a moment to close on a restart.
            kill_timeout: 5000,
            watch: false,
        },
    ],
};
