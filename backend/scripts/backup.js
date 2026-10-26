#!/usr/bin/env node
/**
 * Bunk Calculator — Database Backup Script
 * Run manually or via cron: node scripts/backup.js
 *
 * Saves a pg_dump to ./backups/ and prunes files older than 7 days.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const RETENTION_DAYS = 7;

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filename = `bunk_${timestamp}.sql`;
const filepath = path.join(BACKUP_DIR, filename);

// Extract connection details from DATABASE_URL
const dbUrl = new URL(process.env.DATABASE_URL);

try {
  console.log(`📦 Starting backup: ${filename}`);

  const cmd = `pg_dump -h ${dbUrl.hostname} -p ${dbUrl.port || 5432} -U ${dbUrl.username} ${dbUrl.pathname.slice(1)}`;

  const env = { ...process.env, PGPASSWORD: dbUrl.password };
  const output = execSync(cmd, { env });

  fs.writeFileSync(filepath, output);
  console.log(`✅ Backup saved: ${filepath}`);

  // Prune old backups
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const file of files.slice(RETENTION_DAYS)) {
    if (file.mtime.getTime() < cutoff) {
      fs.unlinkSync(path.join(BACKUP_DIR, file.name));
      pruned++;
    }
  }

  if (pruned > 0) console.log(`🗑  Pruned ${pruned} old backup(s).`);
  console.log(`📊 Total backups retained: ${Math.min(files.length, RETENTION_DAYS)}`);
} catch (err) {
  console.error('❌ Backup failed:', err.message);
  process.exit(1);
}
