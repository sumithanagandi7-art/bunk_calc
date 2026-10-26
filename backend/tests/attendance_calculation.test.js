import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { recalculateBunk } from '../src/services/bunkCalculator.js';

const prisma = new PrismaClient();

test('Attendance Calculation: 0% when no classes attended, increases with (attended/total)*100', async (t) => {
  let workspace;
  let subject;

  // Setup: create a temporary workspace and subject
  const accessCode = `CALC-TEST-${Date.now().toString().slice(-5)}`;
  workspace = await prisma.workspace.create({
    data: { access_code: accessCode, name: 'Attendance Calc Tester' },
  });

  subject = await prisma.subject.create({
    data: {
      workspace_id: workspace.workspace_id,
      subject_code: 'CALC101',
      subject_name: 'Calculus of Attendance',
      total_classes_planned: 60,
    },
  });

  t.after(async () => {
    // Teardown: delete test workspace and cascade delete subjects/records/calculations
    if (workspace) {
      await prisma.workspace.delete({ where: { workspace_id: workspace.workspace_id } });
      await prisma.$executeRawUnsafe('VACUUM');
    }
    await prisma.$disconnect();
  });

  await t.test('1. When 0 classes have been conducted/attended, attendance percentage must be 0%', async () => {
    const result = await recalculateBunk(subject.subject_id);
    assert.equal(result.total, 0);
    assert.equal(result.attended, 0);
    assert.equal(result.currentPct, 0.0);

    const calc = await prisma.bunkCalculation.findUnique({
      where: { subject_id_checkpoint: { subject_id: subject.subject_id, checkpoint: 'mse1' } },
    });
    assert.equal(calc.current_percentage, 0.0);
    assert.equal(calc.classes_attended, 0);
    assert.equal(calc.classes_total, 0);
    assert.equal(calc.status, 'safe');
  });

  await t.test('2. When classes are conducted but 0 attended (all absent), attendance percentage must remain 0%', async () => {
    await prisma.attendanceRecord.createMany({
      data: [
        { subject_id: subject.subject_id, class_date: new Date('2026-10-01'), time_slot: '09:00', status: 'absent' },
        { subject_id: subject.subject_id, class_date: new Date('2026-10-02'), time_slot: '09:00', status: 'absent' },
        { subject_id: subject.subject_id, class_date: new Date('2026-10-03'), time_slot: '09:00', status: 'absent' },
      ],
    });

    const result = await recalculateBunk(subject.subject_id);
    assert.equal(result.total, 3);
    assert.equal(result.attended, 0);
    assert.equal(result.absent, 3);
    assert.equal(result.currentPct, 0.0);

    const calc = await prisma.bunkCalculation.findUnique({
      where: { subject_id_checkpoint: { subject_id: subject.subject_id, checkpoint: 'mse1' } },
    });
    assert.equal(calc.current_percentage, 0.0);
    assert.equal(calc.classes_attended, 0);
    assert.equal(calc.classes_total, 3);
    assert.equal(calc.status, 'at_risk');
  });

  await t.test('3. When classes are attended, attendance increases using (attended / total) * 100', async () => {
    // Add 1 present: total 4, attended 1 -> (1 / 4) * 100 = 25%
    await prisma.attendanceRecord.create({
      data: { subject_id: subject.subject_id, class_date: new Date('2026-10-04'), time_slot: '09:00', status: 'present' },
    });

    let result = await recalculateBunk(subject.subject_id);
    assert.equal(result.total, 4);
    assert.equal(result.attended, 1);
    assert.equal(result.currentPct, 25.0);

    // Add 2 more presents: total 6, attended 3 -> (3 / 6) * 100 = 50%
    await prisma.attendanceRecord.createMany({
      data: [
        { subject_id: subject.subject_id, class_date: new Date('2026-10-05'), time_slot: '09:00', status: 'present' },
        { subject_id: subject.subject_id, class_date: new Date('2026-10-06'), time_slot: '09:00', status: 'present' },
      ],
    });

    result = await recalculateBunk(subject.subject_id);
    assert.equal(result.total, 6);
    assert.equal(result.attended, 3);
    assert.equal(result.currentPct, 50.0);

    // Add 6 more presents: total 12, attended 9 -> (9 / 12) * 100 = 75%
    const morePresents = [];
    for (let i = 7; i <= 12; i++) {
      morePresents.push({
        subject_id: subject.subject_id,
        class_date: new Date(`2026-10-${i.toString().padStart(2, '0')}`),
        time_slot: '09:00',
        status: 'present',
      });
    }
    await prisma.attendanceRecord.createMany({ data: morePresents });

    result = await recalculateBunk(subject.subject_id);
    assert.equal(result.total, 12);
    assert.equal(result.attended, 9);
    assert.equal(result.currentPct, 75.0);

    const calc = await prisma.bunkCalculation.findUnique({
      where: { subject_id_checkpoint: { subject_id: subject.subject_id, checkpoint: 'mse1' } },
    });
    assert.equal(calc.current_percentage, 75.0);
    assert.equal(calc.status, 'safe');
  });

  await t.test('4. Perfect attendance gives 100%', async () => {
    // Delete absents so all 9 remaining records are present
    await prisma.attendanceRecord.deleteMany({
      where: { subject_id: subject.subject_id, status: 'absent' },
    });

    const result = await recalculateBunk(subject.subject_id);
    assert.equal(result.total, 9);
    assert.equal(result.attended, 9);
    assert.equal(result.absent, 0);
    assert.equal(result.currentPct, 100.0);
  });
});
