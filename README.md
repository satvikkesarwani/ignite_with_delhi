# ⚡ Ignite Hackathon Stack (Monorepo)

An ultra-fast, zero-friction monorepo template built for hackathons.
Pre-configured with **React + Vite**, **Express Node.js**, **CORS**, **Auto-deploy CI/CD on Vercel & Render**, **Anti-Sleep Keep-Alive**, and **Pre-commit Automated Quality Checks**.

---

## 📁 Project Structure

```
ignite_with_delhi/
├── frontend/                  # React + Vite Client
│   ├── src/
│   │   ├── App.jsx            # Live Backend Monitor & API Playground
│   │   ├── index.css          # Glassmorphism Modern Dark UI
│   │   └── main.jsx
│   ├── vercel.json            # SPA rewrites & Vercel deployment config
│   └── package.json
│
├── backend/                   # Express.js REST API
│   ├── server.js              # Express server with /health, /api endpoints & CORS
│   ├── keepAlive.js           # Internal self-pinger to prevent Render sleep
│   └── package.json
│
├── .github/
│   └── workflows/
│       ├── ci.yml             # Code formatting & build verification on push
│       └── keep_alive.yml     # Cron job pinging Render every 10 min
│
├── scripts/
│   └── keep_alive.js          # Standalone ping script
│
├── render.yaml                # Render Infrastructure-as-Code Blueprint
├── .husky/                    # Git pre-commit hooks for auto-formatting
└── package.json               # Monorepo unified commands
```

---

## 🚀 Quick Start (Local Development)

### 1. Install All Dependencies

```bash
# In the root directory:
npm install
npm --prefix frontend install
npm --prefix backend install
```

### 2. Run Frontend + Backend Concurrently

```bash
npm run dev
```

- **Frontend UI**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:5001](http://localhost:5001)
- **Health Check**: [http://localhost:5001/health](http://localhost:5001/health)

---

## 🌐 1-Time Deployment Setup (Do This Once)

### 🅰️ Deploy Backend to Render (Free)

1. Go to [dashboard.render.com](https://dashboard.render.com/) and click **New +** -> **Web Service**.
2. Connect your GitHub repository: `satvikkesarwani-dotcom/ignite_with_delhi`.
3. Fill in these settings:
   - **Name**: `ignite-backend` (or your hackathon project name)
   - **Root Directory**: `backend` _(CRITICAL)_
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
4. Add Environment Variable (Optional for self-ping):
   - `RENDER_EXTERNAL_URL` = `https://your-service-name.onrender.com`
5. Click **Create Web Service**. Copy your backend URL once live!

---

### 🅱️ Deploy Frontend to Vercel (Free)

1. Go to [vercel.com/new](https://vercel.com/new) and import `satvikkesarwani-dotcom/ignite_with_delhi`.
2. In Project Settings:
   - **Root Directory**: Click edit and select `frontend` _(CRITICAL)_
   - **Framework Preset**: `Vite`
3. In **Environment Variables**:
   - `VITE_API_URL` = `https://your-backend-name.onrender.com` (Your live Render URL from step A)
4. Click **Deploy**.

---

## 🛡️ Render Anti-Sleep Keep-Alive Setup

Render free tier sleeps after 15 minutes of inactivity (causing 50s+ cold starts). We have 3 layers to prevent this:

1. **GitHub Actions Workflow** (Automated):
   - In your GitHub repo, go to **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.
   - Name: `RENDER_BACKEND_URL`
   - Value: `https://your-backend-name.onrender.com`
   - The workflow will automatically ping your backend every 10 minutes!
2. **Internal Self-Pinger**:
   - Backend automatically pings its own `/health` if `RENDER_EXTERNAL_URL` is set in Render environment.
3. **Local Runner Script**:
   - Run `node scripts/keep_alive.js https://your-backend-name.onrender.com` anywhere.

---

## 🔥 Hackathon Workflow (Tomorrow)

Whenever you make changes during the hackathon:

```bash
git add .
git commit -m "feat: added awesome feature"
git push origin main
```

1. **Pre-commit hook**: Automatically formats code and removes formatting issues.
2. **GitHub Actions CI**: Runs quality and build checks.
3. **Vercel & Render**: Automatically detect the push to `main` and deploy both frontend & backend in ~60 seconds!
