# Deployment Guide: Project Management App to Vercel

The application has been optimized for Vercel and TiDB Cloud. Follow these steps to deploy.

## 1. Prepare Your Environment Variables

You must add the following variables to your Vercel Project (Settings > Environment Variables). You can copy the values from your local `.env` file.

| Variable Name | Description |
| :--- | :--- |
| `DB_HOST` | Your TiDB Cloud Gateway host |
| `DB_USER` | Your TiDB Cloud username |
| `DB_PASSWORD` | Your TiDB Cloud password |
| `DB_NAME` | Database name (e.g., `test`) |
| `DB_SSL` | Set to `true` |
| `SESSION_SECRET` | A secure random string for sessions |
| `NODE_ENV` | Set to `production` |

## 2. Deployment Steps

### Option A: Via GitHub (Recommended)
1. Push your code to your GitHub repository.
2. Go to [Vercel Dashboard](https://vercel.com/dashboard).
3. Click **Add New** > **Project**.
4. Import your repository.
5. In the **Environment Variables** section, add the variables listed above.
6. Click **Deploy**.

### Option B: Via Vercel CLI
If you have Vercel CLI installed locally, run:
```bash
vercel
```
Then follow the prompts to link your project and add environment variables.

## 3. Verify Deployment

Once deployed, visit your Vercel URL with the `/debug-db` path:
`https://your-app-name.vercel.app/debug-db`

If you see `{"success": true, ... "message": "Successfully connected"}`, your app is live and connected to the database!

---
> [!IMPORTANT]
> **SSL Certificate**: The file `isrgrootx1.pem` must be present in the root directory for the database connection to work in production. This file is already included in your repository.
