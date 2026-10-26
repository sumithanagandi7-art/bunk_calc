# 🎓 Bunk Calculator

**Never miss what matters.** Smart attendance tracking for college students.

A full-stack web application that helps students track attendance across subjects, calculate how many classes they can safely skip before hitting MSE-1 (75%) and MSE-2 (85%) thresholds, and manage their academic calendar.

---

## ✨ Features

- **3D Animated UI** — Three.js particle field, floating orbs, Framer Motion page transitions
- **Per-Subject Bunk Calculation** — Real-time safe/tight/at_risk status for both checkpoints
- **OCR Upload** — Drop an attendance screenshot to auto-import records
- **Academic Calendar** — Track MSE-1/MSE-2 windows, countdown timers
- **Secure Auth** — JWT + bcrypt, row-level data isolation
- **Auto Backups** — Daily pg_dump, 7-day retention

---

## 🏗 Architecture

```
┌─────────────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│  React + Vite       │    │  Node.js + Express   │    │  PostgreSQL 15     │
│  Tailwind + Three.js│◄──►│  Prisma ORM          │◄──►│  Docker managed    │
│  Framer Motion      │    │  JWT + bcrypt        │    │  Daily pg_dump     │
└─────────────────────┘    └──────────────────────┘    └────────────────────┘
         :3000                      :4000                       :5432
```

---

## 🚀 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- OR Node.js 20+ and PostgreSQL 15+ installed locally

### Option A — Docker (Recommended)

```bash
# 1. Clone / navigate to project
cd D:\BunkCalculator

# 2. Copy environment file
cp backend/.env.example backend/.env

# 3. Edit secrets in backend/.env (CHANGE JWT_SECRET and JWT_REFRESH_SECRET!)

# 4. Start everything
docker-compose up -d

# 5. Open in browser
#    App:      http://localhost:3000
#    API:      http://localhost:4000
#    pgAdmin:  http://localhost:5050  (admin@bunkcalc.local / admin)
```

### Option B — Local Development

```bash
# ── Backend ──────────────────────────────────────────
cd D:\BunkCalculator\backend

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your Postgres connection string and JWT secrets

# Run database migrations
npx prisma migrate dev --name init

# Seed default institution
npm run db:seed

# Start dev server
npm run dev
# API running at http://localhost:4000

# ── Frontend ─────────────────────────────────────────
cd D:\BunkCalculator\frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
# App running at http://localhost:3000
```

---

## 📁 Project Structure

```
BunkCalculator/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma     # 6-table schema
│   │   └── seed.js           # Default institution seed
│   ├── src/
│   │   ├── middleware/       # auth.js, errorHandler.js
│   │   ├── routes/           # auth, subjects, attendance, bunk, calendar
│   │   ├── services/         # bunkCalculator.js, ocr.js
│   │   └── index.js          # Express app
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── three/        # ParticleField, FloatingOrbs
│   │   │   ├── ui/           # GlassCard, SubjectCard, Modal, etc.
│   │   │   └── layout/       # Navbar, Sidebar
│   │   ├── pages/            # Landing, Auth, Dashboard, Subjects, Attendance, Calendar
│   │   ├── store/            # Zustand stores
│   │   ├── hooks/            # useAuth, useBunk, useSubjects
│   │   └── lib/              # api.js (axios instance)
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── backups/                  # Auto-generated daily pg_dumps
├── docker-compose.yml
└── README.md
```

---

## 🗄 Database Schema

```
institutions ──────────────────────────────┐
                                           │
academic_calendars ── institution_id ──────┘

users
  └── subjects ── user_id
        ├── attendance_records ── subject_id  (INDEX on subject_id, class_date)
        └── bunk_calculations ── subject_id   (UNIQUE on subject_id + checkpoint)
```

**Key constraints:**
- `attendance_records`: UNIQUE on `(subject_id, class_date, time_slot)` — prevents duplicates
- `subjects`: UNIQUE on `(user_id, subject_code)` — one subject per code per user
- All FKs with `ON DELETE CASCADE` — clean user/subject deletion

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new student |
| POST | `/api/v1/auth/login` | Login, returns JWT |
| GET | `/api/v1/auth/me` | Get current user profile |
| DELETE | `/api/v1/auth/me` | Delete account + all data |
| GET | `/api/v1/auth/export` | Export all data as JSON |
| GET | `/api/v1/subjects` | List all subjects (user-scoped) |
| POST | `/api/v1/subjects` | Create subject |
| PUT | `/api/v1/subjects/:id` | Update subject |
| DELETE | `/api/v1/subjects/:id` | Delete subject (cascades) |
| GET | `/api/v1/attendance/:subjectId` | Get attendance records |
| POST | `/api/v1/attendance/:subjectId` | Add single record |
| POST | `/api/v1/attendance/:subjectId/batch` | Batch insert (atomic transaction) |
| GET | `/api/v1/bunk` | Get all bunk calculations |
| POST | `/api/v1/bunk/:subjectId/recalculate` | Force recalculate |
| POST | `/api/v1/calendar/upload` | Upload + OCR parse calendar |
| POST | `/api/v1/calendar/confirm` | Save confirmed calendar |

---

## 🛡 Security

- Passwords hashed with **bcrypt** (12 rounds) — never stored plaintext
- All data queries scoped by `user_id` at the application layer
- **JWT** access tokens (7 day) + refresh tokens (30 day)
- **Helmet** security headers on all API responses
- **Rate limiting**: 200 req/15min general, 20 req/15min on auth routes
- Full account deletion cascades through all tables

---

## 🔢 Bunk Formula

```
bunks_remaining = floor(planned_classes × (1 − threshold) − absent_classes)

Where:
  threshold = 0.75 for MSE-1  |  0.85 for MSE-2
  absent_classes = total − (present + condoned)

Status:
  safe     = bunks_remaining > 5
  tight    = bunks_remaining 0–5
  at_risk  = bunks_remaining < 0  (already below threshold)
```

---

## 💾 Backups

The `backup` service in Docker runs daily and saves `pg_dump` files to `./backups/`.
Only the 7 most recent backups are retained.

To restore a backup:
```bash
psql -h localhost -U bunk_user bunk_calculator < backups/bunk_20240101_000000.sql
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Run `npm run lint` before committing
4. Open a PR

---

## 🌐 Cloud Deployment (Vercel + Render)

### Backend Deployment (Render Blueprint)
1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** → **Blueprint**.
2. Connect your GitHub repository: `https://github.com/sumithanagandi7-art/bunk_calc`.
3. Render will read `render.yaml` and automatically configure:
   - **PostgreSQL Database**: Free managed instance (`bunk-calculator-db`).
   - **Web Service API**: Free web service (`bunk-calculator-api`) running `npm install && npx prisma generate && npx prisma db push`.
4. Copy your backend service URL (e.g. `https://bunk-calculator-api.onrender.com`).

### Frontend Deployment (Vercel)
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New...** → **Project**.
2. Import `sumithanagandi7-art/bunk_calc`.
3. In **Project Settings**:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
4. In **Environment Variables**, add:
   - `VITE_API_URL` = `https://bunk-calculator-api.onrender.com` (your Render backend URL)
5. Click **Deploy**.

### Final Touch: CORS Sync
In your Render backend service settings:
- Update the `FRONTEND_URL` environment variable to your Vercel URL (e.g. `https://bunk-calc.vercel.app`) to ensure seamless CORS requests.

---

*Built with ❤️ for students who walk the fine line between attendance and freedom.*
