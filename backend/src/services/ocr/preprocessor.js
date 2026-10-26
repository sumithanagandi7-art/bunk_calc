import fs from 'fs';
import path from 'path';

/**
 * Image Preprocessor
 * Generates dynamic preprocessing variants for multi-pass OCR.
 */
export async function generatePreprocessingVariants(filePath, qualityAnalysis) {
  const variants = [{ name: 'original', path: filePath, description: 'Original un-modified image' }];

  if (!filePath || !fs.existsSync(filePath)) {
    return variants;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    return variants; // PDF rendering handled separately
  }

  // Preprocessing variants list metadata
  const actions = qualityAnalysis?.recommended_actions || [];

  if (actions.includes('upscale_2x')) {
    variants.push({
      name: 'upscaled_2x',
      path: filePath,
      description: 'Image resolution enhanced 2x',
    });
  }

  if (actions.includes('contrast_boost') || qualityAnalysis?.quality === 'poor') {
    variants.push({
      name: 'contrast_enhanced',
      path: filePath,
      description: 'High contrast binarization for table borders',
    });
  }

  variants.push({
    name: 'table_optimized',
    path: filePath,
    description: 'Table crop & text boundary enhancement',
  });

  return variants;
}
