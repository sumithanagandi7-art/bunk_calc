/**
 * Contextual OCR Validator & Confidence Scoring Engine
 *
 * Validates attendance data integrity without silently changing values.
 * Flags issues for user review instead of auto-correcting.
 */

/**
 * Safely parse a numeric value without aggressive character replacement.
 * Returns null for unreadable values instead of 0.
 */
export function safeParseInt(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    return Math.max(0, Math.floor(val));
  }

  const str = String(val).trim();
  if (str === '') return null;

  const num = parseInt(str, 10);
  if (isNaN(num)) return null;
  return Math.max(0, num);
}

/**
 * Subject Code Normalizer — clean whitespace and case, but don't alter characters
 */
export function normalizeSubjectCode(code) {
  if (!code) return '';
  return String(code).toUpperCase().trim().replace(/\s+/g, '');
}

/**
 * Validate a single subject row's attendance data and compute confidence.
 *
 * IMPORTANT: This function does NOT silently swap or fix values.
 * It flags issues as warnings so the user can review them.
 */
export function validateAndScoreSubject(subject, passAgreementCount = 1) {
  const code = normalizeSubjectCode(subject.subject_code || subject.code || subject.raw_code);
  const name = (subject.subject_name || subject.name || subject.raw_name || '').trim() || (code ? `Subject ${code}` : 'Unknown Subject');

  // Parse attendance values — preserve null for unreadable
  let presents = safeParseInt(
    subject.presents !== undefined ? subject.presents :
    subject.classes_attended !== undefined ? subject.classes_attended :
    subject.attended !== undefined ? subject.attended : null
  );

  let absents = safeParseInt(
    subject.absents !== undefined ? subject.absents : null
  );

  let totalClasses = safeParseInt(
    subject.total_classes !== undefined ? subject.total_classes :
    subject.total_classes_planned !== undefined ? subject.total_classes_planned :
    subject.total !== undefined ? subject.total : null
  );

  // Track validation issues
  const warnings = [];
  let mathValid = true;
  let mathCorrected = false;

  // Derive missing values where unambiguous
  if (presents !== null && absents !== null && totalClasses === null) {
    totalClasses = presents + absents;
  } else if (presents !== null && totalClasses !== null && absents === null) {
    if (totalClasses >= presents) {
      absents = totalClasses - presents;
    }
  } else if (absents !== null && totalClasses !== null && presents === null) {
    if (totalClasses >= absents) {
      presents = totalClasses - absents;
    }
  }

  // Validate consistency (don't auto-fix, just warn)
  if (presents !== null && totalClasses !== null && presents > totalClasses) {
    warnings.push(`Present count (${presents}) exceeds total classes (${totalClasses}). Possible column swap — requires review.`);
    mathValid = false;
  }

  if (absents !== null && totalClasses !== null && absents > totalClasses) {
    warnings.push(`Absent count (${absents}) exceeds total classes (${totalClasses}). Requires review.`);
    mathValid = false;
  }

  if (presents !== null && absents !== null && totalClasses !== null) {
    if (presents + absents !== totalClasses) {
      warnings.push(`Present (${presents}) + Absent (${absents}) = ${presents + absents}, but total is ${totalClasses}. There may be condoned/other categories, or a column mapping error.`);
      // This is only a hard math failure if the sum is larger than total
      if (presents + absents > totalClasses) {
        mathValid = false;
      }
    }
  }

  // Check percentage consistency
  let givenPercentage = subject.attendance_percentage !== undefined ? parseFloat(subject.attendance_percentage) :
                        subject.percentage !== undefined ? parseFloat(subject.percentage) : null;

  let calculatedPercentage = null;
  if (presents !== null && totalClasses !== null && totalClasses > 0) {
    calculatedPercentage = +((presents / totalClasses) * 100).toFixed(1);
  }

  let percentageValid = true;
  if (givenPercentage !== null && !isNaN(givenPercentage) && calculatedPercentage !== null) {
    if (Math.abs(givenPercentage - calculatedPercentage) > 5.0) {
      percentageValid = false;
      warnings.push(`Displayed percentage (${givenPercentage}%) differs from calculated (${calculatedPercentage}%). Possible column mapping error.`);
    }
  }

  const finalPercentage = calculatedPercentage !== null ? calculatedPercentage :
                          (givenPercentage !== null && !isNaN(givenPercentage)) ? givenPercentage : null;

  // Detect if this looks like a total/summary row
  const isSummaryRow = /^(?:total|average|grand total|overall|aggregate|summary)$/i.test(name) ||
                       /^(?:total|average|grand total|overall|aggregate|summary)$/i.test(code);
  if (isSummaryRow) {
    warnings.push('This row appears to be a summary/total row, not an individual subject.');
  }

  // Validate subject code format
  const isStandardCode = /^[0-9]{2}[A-Z]{2,6}[0-9]{1,4}[A-Z0-9/]*$/i.test(code);
  if (!code || code.startsWith('SUB')) {
    warnings.push('Subject code could not be detected. Manual entry required.');
  }

  // Check for negative values
  if (presents !== null && presents < 0) {
    warnings.push('Present count is negative.');
    mathValid = false;
  }
  if (absents !== null && absents < 0) {
    warnings.push('Absent count is negative.');
    mathValid = false;
  }

  // Calculate confidence score
  let confidenceScore = 0.85;

  // Pass agreement boost
  if (passAgreementCount >= 2) confidenceScore += 0.08;

  // Mathematical consistency
  if (mathValid && percentageValid) confidenceScore += 0.05;
  else if (!mathValid) confidenceScore -= 0.30;
  else if (!percentageValid) confidenceScore -= 0.15;

  // Code format
  if (isStandardCode) confidenceScore += 0.05;
  else if (!code || code.startsWith('SUB')) confidenceScore -= 0.15;

  // Missing data penalty
  if (presents === null && absents === null) confidenceScore -= 0.20;
  if (totalClasses === null) confidenceScore -= 0.10;

  // Summary row penalty
  if (isSummaryRow) confidenceScore -= 0.30;

  confidenceScore = Math.min(1.0, Math.max(0.0, +confidenceScore.toFixed(2)));

  const isLowConfidence = confidenceScore < 0.70;
  const needsReview = !mathValid || !percentageValid || warnings.length > 0 || isLowConfidence;

  return {
    raw_code: subject.subject_code || subject.code || subject.raw_code || '',
    normalized_code: code,
    subject_code: code,
    subject_name: name,
    faculty_name: subject.faculty_name || '',
    classes_attended: presents,
    presents: presents,
    absents: absents,
    classes_absent: absents,
    total_classes: totalClasses,
    total_classes_planned: totalClasses,
    attendance_percentage: finalPercentage,
    confidence_score: confidenceScore,
    confidence: isLowConfidence ? 'low' : needsReview ? 'medium' : 'high',
    low_confidence: isLowConfidence,
    needs_review: needsReview,
    is_summary_row: isSummaryRow,
    warnings: warnings,
    math_valid: mathValid,
    math_corrected: mathCorrected,
    percentage_valid: percentageValid,
    source_evidence: {
      raw_presents: subject.presents ?? subject.classes_attended ?? subject.attended ?? null,
      raw_absents: subject.absents ?? null,
      raw_total: subject.total_classes ?? subject.total_classes_planned ?? subject.total ?? null,
      raw_percentage: subject.attendance_percentage ?? subject.percentage ?? null,
    },
  };
}
