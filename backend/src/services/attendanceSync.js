import { recalculateBunk } from './bunkCalculator.js';

/**
 * Synchronize aggregate attendance counts into AttendanceRecords without destroying
 * real user-entered records or creating duplicate/colliding entries.
 *
 * @param {object} tx - Prisma transaction or client
 * @param {string} subjectId - UUID of the subject
 * @param {number} targetPresents - desired total present count
 * @param {number} targetAbsents - desired total absent count
 * @param {string} source - 'document_import' | 'manual' | 'portal_sync'
 */
export async function syncAggregateAttendance(tx, subjectId, targetPresents, targetAbsents, source = 'document_import') {
  if (targetPresents === undefined && targetAbsents === undefined) {
    return;
  }

  const pTarget = Math.max(0, parseInt(targetPresents, 10) || 0);
  const aTarget = Math.max(0, parseInt(targetAbsents, 10) || 0);

  // 1. Fetch all existing attendance records for this subject
  const existingRecords = await tx.attendanceRecord.findMany({
    where: { subject_id: subjectId },
  });

  // 2. Identify real date-specific/manual records vs prior synthetic baseline records
  const isSynthetic = (r) =>
    r.source === 'document_import' ||
    r.source === 'ocr_upload' ||
    r.source === 'portal_sync' ||
    r.time_slot.startsWith('Baseline ') ||
    r.time_slot.startsWith('Import ') ||
    r.time_slot.startsWith('Initial ') ||
    r.time_slot.startsWith('Portal Sync P-') ||
    r.time_slot.startsWith('Portal Sync A-');

  const realRecords = existingRecords.filter((r) => !isSynthetic(r));
  const priorSyntheticRecords = existingRecords.filter(isSynthetic);

  // 3. Count how many real presents and absents are already logged
  const realPresents = realRecords.filter((r) => r.status === 'present' || r.status === 'condoned').length;
  const realAbsents = realRecords.filter((r) => r.status === 'absent').length;

  // 4. Calculate how many baseline placeholder records are needed to reach the target totals
  const neededPresents = Math.max(0, pTarget - realPresents);
  const neededAbsents = Math.max(0, aTarget - realAbsents);

  // 5. Remove only prior synthetic placeholder records
  if (priorSyntheticRecords.length > 0) {
    await tx.attendanceRecord.deleteMany({
      where: {
        record_id: { in: priorSyntheticRecords.map((r) => r.record_id) },
      },
    });
  }

  // 6. Generate needed baseline records with distinct dates spread out over past days
  // (1 class per day offset to guarantee zero unique-constraint collisions)
  const recordsToInsert = [];
  const baseDate = new Date();
  baseDate.setHours(9, 0, 0, 0); // Normalized morning timestamp

  let dayOffset = 1;

  for (let p = 0; p < neededPresents; p++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - dayOffset);
    dayOffset++;

    recordsToInsert.push({
      subject_id: subjectId,
      class_date: d,
      time_slot: `Baseline P-${p + 1}`,
      status: 'present',
      source,
      notes: 'Aggregate baseline attendance',
    });
  }

  for (let a = 0; a < neededAbsents; a++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - dayOffset);
    dayOffset++;

    recordsToInsert.push({
      subject_id: subjectId,
      class_date: d,
      time_slot: `Baseline A-${a + 1}`,
      status: 'absent',
      source,
      notes: 'Aggregate baseline attendance',
    });
  }

  if (recordsToInsert.length > 0) {
    await tx.attendanceRecord.createMany({ data: recordsToInsert });
  }

  // 7. Recalculate bunk status using the current transaction client
  await recalculateBunk(subjectId, tx);
}
