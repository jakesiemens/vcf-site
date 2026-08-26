/**
 * ─────────────────────────────────────────────────────────
 *  VCF YouTube Sermon Library — Configuration
 * ─────────────────────────────────────────────────────────
 *
 *  SETUP INSTRUCTIONS
 *  ──────────────────
 *  Step 1 — Create a YouTube Channel
 *    1. Sign in to youtube.com with a Google account.
 *    2. Click your profile icon → "Create a channel".
 *    3. Name it "Victory Christian Fellowship" and save.
 *
 *  Step 2 — Get your Channel ID
 *    1. In YouTube Studio, go to Settings → Channel → Advanced Settings.
 *    2. Copy the "Channel ID" (starts with "UC…").
 *    3. Paste it as the value of CHANNEL_ID below.
 *
 *  Step 3 — Get a YouTube Data API v3 Key
 *    1. Go to https://console.cloud.google.com/
 *    2. Create a new project (e.g. "VCF Website").
 *    3. Go to "APIs & Services" → "Enable APIs" → search "YouTube Data API v3" → Enable.
 *    4. Go to "Credentials" → "+ Create Credentials" → "API Key".
 *    5. Click "Edit" on the new key → under "Application restrictions" choose
 *       "HTTP referrers" and add your GitHub Pages domain:
 *         https://your-username.github.io/*
 *    6. Copy the key and paste it as the value of API_KEY below.
 *
 *  The free tier of the YouTube Data API gives you 10,000 units/day,
 *  which is more than enough for a church website.
 * ─────────────────────────────────────────────────────────
 */

const VCF_CONFIG = {
    // ← Paste your YouTube Data API v3 key here
    API_KEY: 'AIzaSyDPvG46UY92bIm9Uf5n1oGJ2CnT0LEAOOs',

    // ← Paste your YouTube Channel ID here (starts with UC...)
    CHANNEL_ID: 'UCvizgathiFxH0H_EWYqlEbQ',

    // Maximum number of sermons to fetch per page load (max 50)
    MAX_RESULTS: 50,
};
