FROM node:20-bookworm-slim

WORKDIR /app

# Install Python 3, OpenCV system dependencies, and Tesseract OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Set up virtual environment and install OpenCV + Pytesseract
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir opencv-python-headless numpy pytesseract

# Install Node.js production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy all source files
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Ensure uploads directory exists
RUN mkdir -p uploads

EXPOSE 4000

# Push DB schema on startup and launch server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]
