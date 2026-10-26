import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Robust Bunk Calculator Service
 *
 * For a given subject, computes:
 *   - current attendance percentage (100% when no classes conducted, decreasing as absents accumulate)
 *   - bunks_remaining: remaining bunks allowed out of planned semester classes
 *   - status: safe / tight / at_risk
 *
 * Upserts results into bunk_calculations for 'mse1' (75%) and 'mse2' (85%) checkpoints.
 */
export async function recalculateBunk(subjectId, client = prisma) {
  const subject = await client.subject.findUnique({
    where: { subject_id: subjectId },
  });

  if (!subject) return null;

  const records = await client.attendanceRecord.findMany({
    where: { subject_id: subjectId },
  });

  const total = records.length;
  const attended = records.filter((r) => r.status === 'present' || r.status === 'condoned').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const planned = subject.total_classes_planned || 60;

  // FORMULA: (classes_attended / total_classes_held) * 100
  // Keep attendance 0 if no class attended; increase when subjects are attended
  const currentPct = (total > 0 && attended > 0)
    ? +((attended / total) * 100).toFixed(2)
    : 0.0;

  const THRESHOLDS = {
    mse1: 0.75,
    mse2: 0.85,
  };

  const checkpoints = ['mse1', 'mse2'];

  for (const checkpoint of checkpoints) {
    const threshold = THRESHOLDS[checkpoint];
    const thresholdPct = threshold * 100;

    // Remaining bunks out of total planned classes
    const maxBunksAllowed = Math.floor(planned * (1 - threshold));
    let bunksRemaining = Math.max(0, maxBunksAllowed - absent);

    let status;
    if (total === 0) {
      status = 'safe';
    } else if (currentPct >= thresholdPct) {
      status = 'safe';
    } else if (currentPct >= thresholdPct - 15) {
      status = 'tight';
    } else {
      status = 'at_risk';
    }

    await client.bunkCalculation.upsert({
      where: {
        subject_id_checkpoint: { subject_id: subjectId, checkpoint },
      },
      create: {
        subject_id: subjectId,
        checkpoint,
        current_percentage: +currentPct.toFixed(2),
        classes_attended: attended,
        classes_total: total,
        bunks_remaining: bunksRemaining,
        status,
      },
      update: {
        current_percentage: +currentPct.toFixed(2),
        classes_attended: attended,
        classes_total: total,
        bunks_remaining: bunksRemaining,
        status,
        calculated_at: new Date(),
      },
    });
  }

  return { attended, total, absent, currentPct: +currentPct.toFixed(2) };
}

/**
 * Recalculate all subjects for a given user workspace.
 */
export async function recalculateAllBunk(workspaceId) {
  const subjects = await prisma.subject.findMany({ where: { workspace_id: workspaceId } });
  await Promise.all(subjects.map((s) => recalculateBunk(s.subject_id)));
}
