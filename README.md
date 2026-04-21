# CFMTIS

Cyber Fraud Money Trail Intelligence System.

CFMTIS is a case-centric investigation platform for cyber-fraud teams. It helps officers register complaints, upload evidence, analyze money movement from workbook data, visualize trails, assess risk, support account freeze workflows, and track recovery.

## What This Project Includes

- Case registration and workspace management
- Evidence upload and storage
- Analyzer pipeline (TypeScript + Python)
- Money-trail graph generation
- Risk scoring and freeze recommendations
- Recovery tracking dashboard
- JWT-based officer authentication

## Tech Stack

### Backend
- Node.js + Express
- Prisma ORM + PostgreSQL
- JWT auth middleware
- Python bridge for workbook-heavy analysis

### Frontend
- React + Vite + TypeScript
- Zustand for state management
- D3/Recharts-based visualization components

### Python Analyzer
- pandas
- openpyxl
- networkx

## Repository Structure

```text
cfmtis/
  client/   # React frontend
  server/   # Express API + Prisma + analyzer integration
```

Key backend files:
- `server/src/app.ts`
- `server/src/prisma/schema.prisma`
- `server/src/jobs/analysisJob.ts`
- `server/src/services/analyzerService.ts`
- `server/python/analyzer_engine.py`

Key frontend files:
- `client/src/App.tsx`
- `client/src/pages/Dashboard.tsx`
- `client/src/pages/CaseWorkspace.tsx`
- `client/src/pages/CaseGraphTab.tsx`

## Prerequisites

- Node.js 20+
- npm
- Python 3.10+
- PostgreSQL

## Quick Start (Local)

From the repository root (`cfmtis/`), run the following.

### 1) Install backend dependencies

```bash
cd server
npm install
python -m pip install -r python/requirements.txt
```

### 2) Configure backend environment

Create `server/.env`:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
JWT_SECRET=change-this-to-a-long-random-secret
JWT_EXPIRES_IN=8h
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=50
CLIENT_ORIGIN=http://localhost:5173
```

Environment validation is handled in `server/src/utils/env.ts`.

### 3) Run database migrations

```bash
cd server
npx prisma migrate dev --schema src/prisma/schema.prisma
```

### 4) Seed initial users/data

```bash
cd server
npm run seed
```

### 5) Start backend API

```bash
cd server
npm run dev
```

### 6) Install frontend dependencies

```bash
cd client
npm install
```

### 7) Configure frontend environment

Create `client/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

### 8) Start frontend app

```bash
cd client
npm run dev
```

Frontend default URL is typically `http://localhost:5173`.

## Default Seed Login

- Badge Number: `CID-001`
- Password: `Admin@1234`

## Build Commands

### Backend build

```bash
cd server
npm run build
```

### Frontend build

```bash
cd client
npm run build
```

## Analyzer Flow

1. Investigator creates a case.
2. Evidence workbook is uploaded.
3. Analysis job is queued.
4. Backend materializes workbook content.
5. Analyzer generates:
   - summary/analysis output
   - graph data
   - risk output
   - recovery output

## Core Analyzer Endpoints

- `POST /api/cases/:id/analyze`
- `GET /api/cases/:id/status`
- `GET /api/cases/:id/graph`
- `GET /api/cases/:id/risk`
- `GET /api/cases/:id/recovery`

## Deployment

### Backend (Render)

Deploy the `server/` folder as a Web Service.

- Root Directory: `server`
- Build Command:

```bash
npm install && python3 -m pip install -r python/requirements.txt && npm run build
```

- Start Command:

```bash
node dist/app.js
```

- Pre-Deploy Command:

```bash
npx prisma migrate deploy --schema src/prisma/schema.prisma
```

Recommended environment variables:

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://...
JWT_SECRET=your-long-random-secret
JWT_EXPIRES_IN=8h
CLIENT_ORIGIN=https://your-frontend-domain.vercel.app
UPLOAD_DIR=/var/data/uploads
MAX_FILE_SIZE_MB=50
```

Optional one-time seed in new environments:

```bash
npm run seed
```

### Frontend (Vercel)

Deploy the `client/` folder.

- Root Directory: `client`
- Build Command:

```bash
npm install && npm run build
```

- Output Directory: `dist`
- Environment Variable:

```env
VITE_API_BASE_URL=https://your-backend-domain.com/api
```

SPA route refresh support is configured in `client/vercel.json`.

## Troubleshooting

### Error: `Officer` table does not exist

```bash
cd server
npx prisma migrate dev --schema src/prisma/schema.prisma
npm run seed
```

### Login returns `401`

Check these values and redeploy if needed:
- `VITE_API_BASE_URL`
- `CLIENT_ORIGIN`
- JWT-related backend environment values

### Login returns `429`

Login is rate-limited. Wait for the current limit window, then try again.

### Vercel route refresh returns `404`

Ensure `client/vercel.json` is included in deployment.

### Analyzer pages look empty after upload

Check backend logs for these markers:
- `ANALYSIS REQUESTED`
- `ANALYZER STARTED`
- `VICTIM FOUND`
- `GRAPH BUILT`
- `RISK CALCULATED`

If logs show delayed completion, the issue is likely request timing between frontend tabs and analyzer completion.

## Operational Notes

- Redis is not currently used.
- Docker is not currently used.
- Backend accepts bearer tokens from the frontend.
- Sample datasets are served from backend upload storage.

