import { defineConfig } from 'vite';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

let isSyncing = false;

function syncApiPlugin() {
    return {
        name: 'sync-api-plugin',
        configureServer(server) {
            server.middlewares.use('/api/sync/status', (req, res) => {
                res.setHeader('Content-Type', 'application/json');
                const dataJsonPath = path.resolve(__dirname, 'data.json');
                let lastSync = null;
                try {
                    if (fs.existsSync(dataJsonPath)) {
                        const content = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
                        lastSync = content.lastSync || null;
                    }
                } catch (e) {
                    // ignore
                }
                res.end(JSON.stringify({ success: true, syncing: isSyncing, lastSync }));
            });

            server.middlewares.use('/api/sync', (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }

                res.setHeader('Content-Type', 'application/json');
                if (isSyncing) {
                    res.statusCode = 409;
                    res.end(JSON.stringify({ success: false, error: 'Sync already in progress' }));
                    return;
                }

                isSyncing = true;
                const backendDir = path.resolve(__dirname, '../backend');
                const syncScript = path.resolve(backendDir, 'run_health_connect_sync.sh');

                exec(`bash "${syncScript}"`, { cwd: backendDir }, (error, stdout, stderr) => {
                    isSyncing = false;
                    if (error) {
                        console.error('[Sync API] Sync failed:', error, stderr);
                        res.statusCode = 500;
                        res.end(JSON.stringify({
                            success: false,
                            error: error.message,
                            details: stderr || stdout
                        }));
                        return;
                    }

                    console.log('[Sync API] Sync completed successfully');
                    let lastSync = null;
                    try {
                        const dataJsonPath = path.resolve(__dirname, 'data.json');
                        if (fs.existsSync(dataJsonPath)) {
                            const content = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
                            lastSync = content.lastSync || null;
                        }
                    } catch (e) {
                        // ignore
                    }

                    res.end(JSON.stringify({
                        success: true,
                        message: 'Sync completed successfully',
                        lastSync
                    }));
                });
            });
        }
    };
}

export default defineConfig({
    root: '.',
    plugins: [syncApiPlugin()],
    server: {
        port: 8080,
        open: true
    },
    build: {
        outDir: 'dist',
        sourcemap: true
    }
});

