#!/usr/bin/env node
/**
 * After deploy.sh step 5: ensure kc-frontend answers HTTP on the port nginx uses.
 * Backend-only deploys used to leave Next stopped or crash-looping → nginx 502.
 */
const http = require('http');
const { execSync } = require('child_process');

const FRONTEND_PM2_NAME = 'kc-frontend';
const PORT = parseInt(process.env.KC_FRONTEND_PORT || '3001', 10);
const WAIT_SEC = parseInt(process.env.KC_FRONTEND_WAIT_SEC || '45', 10);

function pm2List() {
    const raw = execSync('pm2 jlist', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(raw);
}

function frontendProc() {
    try {
        return pm2List().find((p) => p && p.name === FRONTEND_PM2_NAME) || null;
    } catch {
        return null;
    }
}

function pm2Pid() {
    try {
        const out = execSync(`pm2 pid ${FRONTEND_PM2_NAME}`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        return out && out !== '0' ? out : '';
    } catch {
        return '';
    }
}

function httpProbe() {
    return new Promise((resolve) => {
        const req = http.get(
            {
                hostname: '127.0.0.1',
                port: PORT,
                path: '/',
                timeout: 4000,
            },
            (res) => {
                res.resume();
                resolve(res.statusCode && res.statusCode < 500);
            },
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

function pm2Action(cmd) {
    execSync(cmd, { stdio: 'inherit' });
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitHealthy(deadlineMs) {
    const start = Date.now();
    while (Date.now() - start < deadlineMs) {
        if (await httpProbe()) return true;
        await sleep(2000);
    }
    return false;
}

async function main() {
    if (process.platform === 'win32') {
        return;
    }
  if (!frontendProc()) {
    console.log(`   ⚠️  PM2 app "${FRONTEND_PM2_NAME}" not found — skip frontend health check.`);
    return;
  }

  const proc = frontendProc();
  const status = String(proc?.pm2_env?.status || '');
  const pid = pm2Pid();
  const unstable =
    !pid || status === 'stopped' || status === 'stopping' || status === 'errored';

  if (unstable) {
    console.log(`   ${FRONTEND_PM2_NAME} is ${status || 'not running'} — starting…`);
    try {
      pm2Action(`pm2 start ${FRONTEND_PM2_NAME}`);
    } catch {
      pm2Action(`pm2 restart ${FRONTEND_PM2_NAME}`);
    }
  } else if (!(await httpProbe())) {
    console.log(`   No HTTP response on 127.0.0.1:${PORT} — restarting ${FRONTEND_PM2_NAME}…`);
    pm2Action(`pm2 restart ${FRONTEND_PM2_NAME}`);
  } else {
    console.log(`   ✓ Storefront OK (127.0.0.1:${PORT})`);
    return;
  }

  const ok = await waitHealthy(WAIT_SEC * 1000);
  if (ok) {
    console.log(`   ✓ Storefront OK after restart (127.0.0.1:${PORT})`);
    return;
  }

  console.error('');
  console.error(`❌ ${FRONTEND_PM2_NAME} still not serving on port ${PORT} (nginx will show 502).`);
  console.error('   Run: pm2 logs kc-frontend --lines 100');
  console.error('   Fix:  KC_FORCE_CLIENT_BUILD=1 ./deploy.sh');
  process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});