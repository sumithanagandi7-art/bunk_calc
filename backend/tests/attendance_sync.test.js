import test from 'node:test';
import assert from 'node:assert/strict';
import { syncAggregateAttendance } from '../src/services/attendanceSync.js';

test('syncAggregateAttendance preserves real user manual records and adds only needed baseline records', async () => {
  // Mock Prisma client/tx
  const state = {
    records: [
      {
        record_id: 'real-1',
        subject_id: 'sub-123',
        class_date: new Date('2026-09-01'),
        time_slot: '09:00 AM',
        status: 'present',
        source: 'manual',
      },
      {
        record_id: 'real-2',
        subject_id: 'sub-123',
        class_date: new Date('2026-09-02'),
        time_slot: '10:00 AM',
        status: 'present',
        source: 'manual',
      },
      {
        record_id: 'real-3',
        subject_id: 'sub-123',
        class_date: new Date('2026-09-03'),
        time_slot: '11:00 AM',
        status: 'absent',
        source: 'manual',
      },
      {
        record_id: 'old-baseline-1',
        subject_id: 'sub-123',
        class_date: new Date('2026-08-20'),
        time_slot: 'Baseline P-1',
        status: 'present',
        source: 'document_import',
      },
    ],
    bunkCalculations: [],
  };

  const mockTx = {
    attendanceRecord: {
      findMany: async ({ where }) => {
        return state.records.filter(r => r.subject_id === where.subject_id);
      },
      deleteMany: async ({ where }) => {
        if (where?.record_id?.in) {
          const idsToDelete = new Set(where.record_id.in);
          state.records = state.records.filter(r => !idsToDelete.has(r.record_id));
        }
      },
      createMany: async ({ data }) => {
        for (const item of data) {
          state.records.push({
            record_id: 'new-' + Math.random(),
            ...item,
          });
        }
      },
    },
    subject: {
      findUnique: async () => ({
        subject_id: 'sub-123',
        total_classes_planned: 40,
      }),
    },
    bunkCalculation: {
      upsert: async () => {},
    },
  };

  // We want total target: 10 presents, 3 absents
  // Real records already have: 2 presents, 1 absent
  // Old synthetic has: 1 present (which should be replaced)
  // Expected after sync:
  // - Real records remain untouched (3 real records)
  // - Old synthetic is deleted
  // - New baseline records added: 8 presents (2 real + 8 baseline = 10), 2 absents (1 real + 2 baseline = 3)
  // - Total presents = 10, total absents = 3
  await syncAggregateAttendance(mockTx, 'sub-123', 10, 3, 'document_import');

  // Verify real records are preserved
  const realRecords = state.records.filter(r => r.source === 'manual');
  assert.equal(realRecords.length, 3, 'All 3 manual records MUST be preserved');

  // Verify old baseline is gone
  assert.ok(!state.records.some(r => r.record_id === 'old-baseline-1'), 'Old synthetic baseline must be replaced');

  // Verify total presents and absents
  const totalPresents = state.records.filter(r => r.status === 'present').length;
  const totalAbsents = state.records.filter(r => r.status === 'absent').length;
  assert.equal(totalPresents, 10, 'Total presents must equal target (10)');
  assert.equal(totalAbsents, 3, 'Total absents must equal target (3)');

  // Verify baseline records have distinct dates (no colliding dates)
  const baselineRecords = state.records.filter(r => r.source === 'document_import');
  const dateStrings = baselineRecords.map(r => r.class_date.toISOString());
  const uniqueDates = new Set(dateStrings);
  assert.equal(uniqueDates.size, baselineRecords.length, 'Every baseline record must have a distinct timestamp/date to avoid collisions');
});
