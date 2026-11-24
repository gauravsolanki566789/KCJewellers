#!/usr/bin/env node
/**
 * ============================================
 * Database Migration Runner
 * Gaurav Softwares - Jewelry Estimation
 * ============================================
 * Usage: npm run migrate
 * ============================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const { stopFrontendForDeployIfNeeded } = require('./stop-frontend-for-deploy');

async function runMigrations() {
    console.log('');
    console.log('================================================');
    console.log('🚀 Enterprise Migration Runner');
    console.log('================================================');

    const client = await pool.connect();
    
    try {
        // Create migrations tracking table
        await client.query(`
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) UNIQUE NOT NULL,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Get executed migrations
        const executedResult = await client.query('SELECT filename FROM _migrations');
        const executedMigrations = new Set(executedResult.rows.map(r => r.filename));

        // Ensure migrations directory exists
        if (!fs.existsSync(MIGRATIONS_DIR)) {
            fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
            console.log('📁 Created migrations directory');
        }

        // Get migration files
        const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.sql'))
            .sort();

        if (migrationFiles.length === 0) {
            console.log('ℹ️  No migration files found.');
        } else {

        console.log(`📋 Found ${migrationFiles.length} migration file(s)`);
        console.log('');

        let migratedCount = 0;
        let skippedCount = 0;

        for (const filename of migrationFiles) {
            if (executedMigrations.has(filename)) {
                console.log(`⏭️  Skip: ${filename} (already executed)`);
                skippedCount++;
                continue;
            }

            const filePath = path.join(MIGRATIONS_DIR, filename);
            const sql = fs.readFileSync(filePath, 'utf8');

            console.log(`▶️  Running: ${filename}`);
            
            await client.query('BEGIN');
            
            try {
                await client.query(sql);
                await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
                await client.query('COMMIT');
                
                console.log(`✅ Done: ${filename}`);
                migratedCount++;
            } catch (error) {
                await client.query('ROLLBACK');
                console.error(`❌ Failed: ${filename}`);
                console.error(`   ${error.message}`);
                throw error;
            }
        }

        console.log('');
        console.log('================================================');
        console.log('✅ MIGRATION COMPLETE');
        console.log('================================================');
        console.log(`   Executed: ${migratedCount}`);
        console.log(`   Skipped:  ${skippedCount}`);
        console.log('');
        }

        stopFrontendForDeployIfNeeded();

    } catch (error) {
        console.error('');
        console.error('❌ MIGRATION FAILED:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();
