import fs from 'fs';
import crypto from 'crypto';

const memoryCache = new Map();

/**
 * Calculate SHA-256 hash of a file
 */
export function calculateFileHash(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Retrieve cached OCR pipeline result by SHA-256 file hash
 */
export function getCachedOCRResult(fileHash) {
  if (!fileHash) return null;
  if (memoryCache.has(fileHash)) {
    const entry = memoryCache.get(fileHash);
    // Cache valid for 24 hours
    if (Date.now() - entry.timestamp < 24 * 60 * 60 * 1000) {
      return { ...entry.data, cached: true };
    }
    memoryCache.delete(fileHash);
  }
  return null;
}

/**
 * Store OCR pipeline result in cache
 */
export function setCachedOCRResult(fileHash, resultData) {
  if (!fileHash || !resultData) return;
  memoryCache.set(fileHash, {
    timestamp: Date.now(),
    data: resultData,
  });
}
