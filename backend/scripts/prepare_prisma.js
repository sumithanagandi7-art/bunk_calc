import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');

const dbUrl = process.env.DATABASE_URL || '';
const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');
const targetProvider = isPostgres ? 'postgresql' : 'sqlite';

if (fs.existsSync(schemaPath)) {
  let content = fs.readFileSync(schemaPath, 'utf8');
  const updated = content.replace(/provider\s*=\s*"(postgresql|sqlite)"/, `provider = "${targetProvider}"`);
  if (content !== updated) {
    fs.writeFileSync(schemaPath, updated, 'utf8');
  }
  console.log(`✓ Prisma schema configured for provider: ${targetProvider} (DATABASE_URL: ${isPostgres ? 'PostgreSQL' : 'SQLite'})`);
}
