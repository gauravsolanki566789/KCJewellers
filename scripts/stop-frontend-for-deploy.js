#!/usr/bin/env node
/**
 * Called after successful `npm run migrate` on the VPS.
 * deploy.sh step 3 runs `rm -rf client/.next` while Next.js holds files open;
 * stopping kc-frontend here avoids manual `pm2 stop kc-frontend` before ./deploy.sh.
 * Step 5 of deploy.sh runs `pm2 restart all` and brings the frontend back.
 */
const { execSync } = require('child_process');

const FRONTEND_PM2_NAME = 'kc-frontend';

function pm2List() {
    const raw = execSync('pm2 jlist', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(raw);
}

function stopFrontendForDeployIfNeeded() {
    if (process.env.KC_SKIP_FRONTEND_STOP === '1' || process.env.KC_SKIP_FRONTEND_STOP === 'true') {
        return;
    }
    if (process.platform === 'win32') {
        return;
    }

    let list;
    try {
        list = pm2List();
    } catch {
        return;
    }

    const proc = list.find((p) => p && p.name === FRONTEND_PM2_NAME);
    if (!proc || !proc.pm2_env) {
        return;
    }

    const status = String(proc.pm2_env.status || '');
    if (status !== 'online' && status !== 'launching') {
        return;
    }

    console.log('');
    console.log(`⏸️  Stopping ${FRONTEND_PM2_NAME} so client/.next can be removed and rebuilt…`);
    console.log('   (deploy.sh will run pm2 restart all when the build finishes)');
    try {
        execSync(`pm2 stop ${FRONTEND_PM2_NAME}`, { stdio: 'inherit' });
        console.log(`✅ ${FRONTEND_PM2_NAME} stopped`);
    } catch (err) {
        console.error(`⚠️  Could not stop ${FRONTEND_PM2_NAME}:`, err.message || err);
        process.exit(1);
    }
}

if (require.main === module) {
    stopFrontendForDeployIfNeeded();
}

module.exports = { stopFrontendForDeployIfNeeded, FRONTEND_PM2_NAME };