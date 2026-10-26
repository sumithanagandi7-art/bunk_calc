"""
OpenCV Image Preprocessing & Cleaning Module for OCR
Provides advanced image enhancement:
- Grayscale conversion
- Contrast Limited Adaptive Histogram Equalization (CLAHE)
- Bilateral filtering / Denoising
- Otsu thresholding & Adaptive Binarization
- Deskewing & rotation alignment
- Table grid text isolation
"""

import os
import cv2
import numpy as np


def load_image(image_path: str) -> np.ndarray:
    """Load image safely from disk, supporting Unicode/Windows paths."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found at: {image_path}")
    
    # Use cv2.imdecode to avoid Windows path encoding issues
    with open(image_path, "rb") as f:
        bytes_data = bytearray(f.read())
        numpy_array = np.asarray(bytes_data, dtype=np.uint8)
        img = cv2.imdecode(numpy_array, cv2.IMREAD_COLOR)
        
    if img is None:
        raise ValueError(f"Failed to decode image from: {image_path}")
    return img


def save_image(img: np.ndarray, output_path: str) -> str:
    """Save cleaned image to disk, supporting Unicode/Windows paths."""
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    ext = os.path.splitext(output_path)[1]
    if not ext:
        ext = ".png"
        output_path += ext
    is_success, buffer = cv2.imencode(ext, img)
    if not is_success:
        raise IOError(f"Failed to encode image to {output_path}")
    with open(output_path, "wb") as f:
        f.write(buffer)
    return output_path


def deskew(gray: np.ndarray) -> np.ndarray:
    """Detect text angle and correct skew."""
    # Invert colors so text is white on black background
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    
    # Find all white pixels (text)
    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) < 100:
        return gray

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    elif angle > 45:
        angle = 90 - angle
    else:
        angle = -angle

    # Only rotate if tilt is significant (between 0.5 and 15 degrees)
    if 0.5 < abs(angle) < 15.0:
        (h, w) = gray.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )
        return rotated
    return gray


def clean_image_for_ocr(
    image_path: str,
    output_path: str = None,
    apply_clahe: bool = True,
    apply_denoise: bool = True,
    apply_threshold: bool = True,
    scale_factor: float = 1.5,
) -> np.ndarray:
    """
    Main image cleaning pipeline for document OCR.
    1. Resizing/Upscaling for higher character DPI
    2. Grayscale conversion
    3. Bilateral / Non-local Means Denoising to preserve character edges
    4. Contrast enhancement via CLAHE
    5. Deskewing
    6. Otsu adaptive binarization
    """
    img = load_image(image_path)

    # 1. Resize if image is low-res or small to improve Tesseract OCR accuracy
    h, w = img.shape[:2]
    if scale_factor != 1.0 or w < 1800:
        factor = scale_factor if scale_factor > 1.0 else (2000.0 / w)
        factor = min(factor, 2.5)  # cap scaling to prevent excessive memory usage
        new_w = int(w * factor)
        new_h = int(h * factor)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

    # 2. Convert to grayscale
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    # 3. Denoising while preserving sharp text edges
    if apply_denoise:
        # Bilateral filter smooths textures while keeping edges sharp
        gray = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

    # 4. Enhance contrast using CLAHE
    if apply_clahe:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

    # 5. Deskew
    gray = deskew(gray)

    # 6. Adaptive / Otsu Thresholding
    if apply_threshold:
        # Otsu thresholding creates high contrast black text on pure white paper
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        final_img = binary
    else:
        final_img = gray

    if output_path:
        save_image(final_img, output_path)

    return final_img


def extract_table_region(image_path: str, output_path: str = None) -> np.ndarray:
    """
    Optional helper to crop the bottom half / legend table of a timetable document
    if the top half schedule grid interferes with tabular reading.
    """
    img = load_image(image_path)
    h, w = img.shape[:2]
    # College timetable bottom legend table is typically in the bottom 60%
    bottom_crop = img[int(h * 0.35) : h, 0:w]
    if output_path:
        save_image(bottom_crop, output_path)
    return bottom_crop


def prepare_image_for_ollama(image_path: str, output_path: str = None) -> str:
    """
    Optimizes and crops attendance screenshots for Ollama Vision AI.
    Crops the active header, badges, and class table area so Ollama
    receives high character DPI without whole-screen downsampling.
    """
    img = load_image(image_path)
    h, w = img.shape[:2]

    # If mobile screenshot (height > 1.3 * width), focus on attendance content area
    if h / max(1, w) > 1.3:
        # Crop from 15% (subject header) to 85% (present table and absent list)
        cropped = img[int(h * 0.15) : int(h * 0.85), 0:w]
    else:
        cropped = img

    # Contrast enhancement with CLAHE on L-channel (preserving natural colors for vision models)
    lab = cv2.cvtColor(cropped, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_clahe = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge((l_clahe, a, b)), cv2.COLOR_LAB2BGR)

    if not output_path:
        base, ext = os.path.splitext(image_path)
        output_path = f"{base}_ollama_crop.jpg"

    save_image(enhanced, output_path)
    return output_path


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        inp = sys.argv[1]
        out = sys.argv[2] if len(sys.argv) > 2 else "cleaned_output.png"
        clean_image_for_ocr(inp, out)
        print(f"Cleaned image saved to: {out}")
    else:
        print("Usage: python opencv.py <input_image_path> [output_image_path]")
