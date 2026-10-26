import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { syncAggregateAttendance } from '../src/services/attendanceSync.js';
import { recalculateBunk } from '../src/services/bunkCalculator.js';

const prisma = new PrismaClient();

test('Image Attendance Import & Calculation Sequential Suite', async () => {
  const testWorkspaceId = 'test-ws-' + Date.now();
  const testUserId = 'test-usr-' + Date.now();
  let testSubjectId = null;

  try {
    // 1. Setup test user, workspace, and subject
    const ws = await prisma.workspace.create({
      data: {
        workspace_id: testWorkspaceId,
        access_code: 'TEST-' + Date.now(),
        name: 'Test Student',
      },
    });
    assert.ok(ws);

    const sub = await prisma.subject.create({
      data: {
        workspace_id: testWorkspaceId,
        subject_code: 'TEST101',
        subject_name: 'Database Systems',
        faculty_name: 'Dr. Turing',
        total_classes_planned: 40,
      },
    });
    assert.ok(sub);
    testSubjectId = sub.subject_id;

    // Recalculate initially with 0 classes
    await recalculateBunk(testSubjectId);
    const initialCalc = await prisma.bunkCalculation.findUnique({
      where: {
        subject_id_checkpoint: { subject_id: testSubjectId, checkpoint: 'mse1' },
      },
    });
    assert.equal(initialCalc.current_percentage, 0, 'Initial attendance percentage must be 0% with 0 classes');
    assert.equal(initialCalc.classes_attended, 0);
    assert.equal(initialCalc.classes_total, 0);

    // 2. Sync image attendance: 18 presents, 2 absents (Bulk Sync / Extract Status Flow)
    await prisma.$transaction(async (tx) => {
      const currentSub = await tx.subject.findUnique({ where: { subject_id: testSubjectId } });
      const totalHeld = 18 + 2;
      if (currentSub && (currentSub.total_classes_planned || 0) < totalHeld) {
        await tx.subject.update({
          where: { subject_id: testSubjectId },
          data: { total_classes_planned: Math.max(40, totalHeld) },
        });
      }
      await syncAggregateAttendance(tx, testSubjectId, 18, 2, 'ocr_upload');
    });

    const records = await prisma.attendanceRecord.findMany({
      where: { subject_id: testSubjectId },
    });
    assert.equal(records.length, 20, 'Should have 20 total records');
    const presents = records.filter((r) => r.status === 'present').length;
    const absents = records.filter((r) => r.status === 'absent').length;
    assert.equal(presents, 18, 'Should have 18 present records');
    assert.equal(absents, 2, 'Should have 2 absent records');

    // Verify bunk calculation updated
    const calc = await prisma.bunkCalculation.findUnique({
      where: {
        subject_id_checkpoint: { subject_id: testSubjectId, checkpoint: 'mse1' },
      },
    });
    assert.ok(calc);
    assert.equal(calc.classes_attended, 18);
    assert.equal(calc.classes_total, 20);
    // (18 / 20) * 100 = 90.00%
    assert.equal(calc.current_percentage, 90.0);
    assert.equal(calc.status, 'safe');

    // 3. Sync updated image attendance: 25 presents, 5 absents (Import Confirm Flow)
    await prisma.$transaction(async (tx) => {
      await syncAggregateAttendance(tx, testSubjectId, 25, 5, 'document_import');
    });

    const records2 = await prisma.attendanceRecord.findMany({
      where: { subject_id: testSubjectId },
    });
    assert.equal(records2.length, 30, 'Should have 30 total records');
    const presents2 = records2.filter((r) => r.status === 'present').length;
    const absents2 = records2.filter((r) => r.status === 'absent').length;
    assert.equal(presents2, 25, 'Should have 25 present records');
    assert.equal(absents2, 5, 'Should have 5 absent records');

    const calc2 = await prisma.bunkCalculation.findUnique({
      where: {
        subject_id_checkpoint: { subject_id: testSubjectId, checkpoint: 'mse1' },
      },
    });
    assert.equal(calc2.classes_attended, 25);
    assert.equal(calc2.classes_total, 30);
    // (25 / 30) * 100 = 83.33%
    assert.equal(calc2.current_percentage, 83.33);
    assert.equal(calc2.status, 'safe');

    // 4. Sync 0 presents, 5 absents: Attendance percentage must be 0%
    await prisma.$transaction(async (tx) => {
      await syncAggregateAttendance(tx, testSubjectId, 0, 5, 'ocr_upload');
    });

    const records3 = await prisma.attendanceRecord.findMany({
      where: { subject_id: testSubjectId },
    });
    assert.equal(records3.length, 5, 'Should have 5 total records');
    const presents3 = records3.filter((r) => r.status === 'present').length;
    const absents3 = records3.filter((r) => r.status === 'absent').length;
    assert.equal(presents3, 0, 'Should have 0 presents');
    assert.equal(absents3, 5, 'Should have 5 absents');

    const calc3 = await prisma.bunkCalculation.findUnique({
      where: {
        subject_id_checkpoint: { subject_id: testSubjectId, checkpoint: 'mse1' },
      },
    });
    assert.equal(calc3.classes_attended, 0);
    assert.equal(calc3.classes_total, 5);
    // Formula: 0 attended => 0%
    assert.equal(calc3.current_percentage, 0.0);
    assert.equal(calc3.status, 'at_risk');
  } finally {
    // 5. Cleanup test data
    if (testSubjectId) {
      await prisma.attendanceRecord.deleteMany({ where: { subject_id: testSubjectId } });
      await prisma.bunkCalculation.deleteMany({ where: { subject_id: testSubjectId } });
      await prisma.subject.deleteMany({ where: { subject_id: testSubjectId } });
    }
    await prisma.workspace.deleteMany({ where: { workspace_id: testWorkspaceId } });
    await prisma.$disconnect();
  }
});
