# 🚀 Public Deployment Guide: AI Glowup Coach

Follow this guide to deploy your **AI Glowup Coach** application online for free using **Supabase** (Database), **Render** (FastAPI Backend), and **Vercel** (Vite React Frontend).

---

## 🗄️ Step 1: Set up your Supabase Database (PostgreSQL)

Supabase provides a free, fully managed PostgreSQL database that is highly performant and secure.

1. **Create a Supabase Account**:
   * Go to [supabase.com](https://supabase.com/) and sign up or sign in.
2. **Create a New Project**:
   * Click **New Project** and choose/create an organization.
   * Enter a project name (e.g., `glowup-coach-db`).
   * Generate or set a secure **Database Password** (keep this safe!).
   * Select a region closest to your target users.
   * Choose the **Free Plan** tier.
3. **Get the Connection String**:
   * Once the project is provisioned, go to **Project Settings** (gear icon on the left sidebar) -> **Database**.
   * Scroll down to the **Connection string** section.
   * Click on the **URI** tab.
   * Copy the connection string. It will look like this:
     ```text
     postgresql://postgres.[YOUR-PROJECT-ID]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
     ```
   * Replace `[YOUR-PASSWORD]` with the database password you set in step 2.
   * *Keep this connection string ready for Render.*

---

## ⚙️ Step 2: Deploy your Backend to Render

Render will host the FastAPI application. Since the tables are automatically created on startup via `Base.metadata.create_all`, deploying the backend will immediately provision your database schema.

1. **Create a Render Account**:
   * Sign up at [render.com](https://render.com/) and link your GitHub account.
2. **Deploy via the Blueprints File (Recommended)**:
   * We have created a `render.yaml` file in the root of your project.
   * In the Render Dashboard, click **New** -> **Blueprint Route**.
   * Connect your GitHub repository.
   * Render will automatically parse the `render.yaml` configuration.
   * Under **DATABASE_URL**, paste the connection string you copied from Supabase.
   * Under **JWT_SECRET**, Render will generate a safe default secret automatically, or you can paste a custom random string.
   * Click **Apply**.
3. **Alternative: Deploy manually as a Web Service**:
   * Click **New** -> **Web Service**.
   * Connect your GitHub repository.
   * Configure the settings:
     * **Name**: `glowup-coach-backend`
     * **Language**: `Python`
     * **Root Directory**: `backend`
     * **Build Command**: `pip install -r requirements.txt`
     * **Start Command**: `python run.py` (or `uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
     * **Instance Type**: `Free`
   * Under **Environment Variables**, click **Add Environment Variable**:
     * `DATABASE_URL` = *Your Supabase Connection String*
     * `JWT_SECRET` = *A long secure random string*
     * `ENV` = `production`
   * Click **Deploy Web Service**.
4. **Copy the API URL**:
   * Once Render completes the build and the service status turns green (**Live**), copy your public API URL from the top of the dashboard (e.g. `https://glowup-coach-backend.onrender.com`).

---

## 🎨 Step 3: Deploy your Frontend to Vercel

Vercel will build and serve your static Vite React application, linking it to your Render backend via environment variables.

1. **Create a Vercel Account**:
   * Go to [vercel.com](https://vercel.com/) and sign up using GitHub.
2. **Import your Repository**:
   * Click **Add New** -> **Project**.
   * Import your GitHub repository containing the codebase.
3. **Configure Project Settings**:
   * **Root Directory**: Click *Edit* and select the `frontend` folder.
   * **Framework Preset**: `Vite` (Vercel auto-detects this).
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
4. **Configure Environment Variables**:
   * Under **Environment Variables**, add:
     * **Key**: `VITE_API_URL`
     * **Value**: *Your public Render API URL* (e.g., `https://glowup-coach-backend.onrender.com`)
   * *Note: Do not append a trailing slash to the Render URL.*
5. **Deploy**:
   * Click **Deploy**.
   * Within a minute, your Vite site will be live! Vercel will provide you with a deployment URL (e.g., `https://glowup-coach.vercel.app`).

---

## 🔌 Step 4: Verification of Secure WebSockets & Analytics

We have optimized the codebase to support production protocols dynamically:

1. **Static REST API calls**:
   * Endpoint calls for Authentication, Me verification, and Leaderboards fetch URLs prefixed with your `VITE_API_URL`.
2. **WebSocket Real-time Scan Connections**:
   * In [ScanPage.jsx](file:///Users/a1989/Documents/facescani/frontend/src/components/ScanPage.jsx), the socket resolves protocols dynamically:
     * `https` matches secure WebSockets (`wss://`).
     * `http` matches normal WebSockets (`ws://`).
   * This guarantees that when hosted on Render (`https`), the client connects securely over `wss://` without throwing security blockages or mixed-content exceptions.
3. **Database migrations**:
   * When Render starts, it executes `create_all(bind=engine)`. If you access Supabase, you will see the `users` and `scores` tables generated inside your project's **Table Editor**.
