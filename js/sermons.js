/**
 * ─────────────────────────────────────────────────────────
 *  VCF Sermon Library — YouTube Data API Integration
 * ─────────────────────────────────────────────────────────
 *
 *  DESCRIPTION CONVENTION
 *  ───────────────────────
 *  When uploading a sermon to YouTube, include these lines
 *  anywhere in the video description for auto-tagging:
 *
 *      Preacher: Jake Siemens
 *      Topic: The Gospel of Grace
 *      Scripture: Romans 1:16–17
 *
 *  All three are optional — videos without them still appear,
 *  just without filter tags.
 * ─────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────
    let allSermons = [];        // full fetched list
    let filtered   = [];        // after search / filter / sort

    // ── DOM References (set after DOMContentLoaded) ────────
    let grid, searchInput, sortSelect, preacherSelect, emptyState, loadingEl;

    // ── Helpers ────────────────────────────────────────────
    function parseMeta(description, title) {
        const meta = { preacher: '', topic: '', scripture: '', date: '', dateObj: null };
        if (description) {
            const lines = description.split('\n');
            for (const line of lines) {
                const lower = line.toLowerCase().trim();
                if (lower.includes('preached:') || lower.startsWith('date:')) {
                    meta.date = line.split(':').slice(1).join(':').replace(/[📅🗓️]/g, '').trim();
                }
                if (lower.startsWith('preacher:') || lower.startsWith('speaker:') || lower.includes('preacher:')) {
                    meta.preacher = line.split(':').slice(1).join(':').replace(/[🎙️🗣️]/g, '').trim();
                }
                if (lower.startsWith('topic:')) {
                    meta.topic = line.split(':').slice(1).join(':').trim();
                }
                if (lower.startsWith('scripture:') || lower.includes('scripture:')) {
                    meta.scripture = line.split(':').slice(1).join(':').replace(/[📖✝️]/g, '').trim();
                }
            }
        }

        // Fallback: extract date from title e.g. "(Aug 16, 2026)" or "(2024)"
        if (!meta.date && title) {
            const m = title.match(/\(([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{4})\)/);
            if (m) meta.date = m[1];
        }

        if (meta.date) {
            const parsed = new Date(meta.date);
            if (!isNaN(parsed.getTime())) {
                meta.dateObj = parsed;
            }
        }
        return meta;
    }

    function formatDate(iso) {
        return new Date(iso).toLocaleDateString('en-CA', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    function tag(text, cls) {
        if (!text) return '';
        return `<span class="sermon-tag sermon-tag--${cls}">${text}</span>`;
    }

    // ── Render a single sermon card ────────────────────────
    function renderCard(s) {
        const ytSrc = `https://www.youtube.com/embed/${s.videoId}`;
        return `
        <article class="sermon-card" data-id="${s.videoId}">
            <div class="sermon-card-header">
                ${s.isLive ? '<div class="sermon-card-meta-top"><span class="sermon-live-badge">Live Recording</span></div>' : ''}
                <h3 class="sermon-title">${s.title}</h3>
                <div class="sermon-tags">
                    ${tag(s.meta.preacher,  'preacher')}
                    ${tag(s.meta.scripture, 'scripture')}
                    ${tag(s.meta.topic,     'topic')}
                </div>
            </div>
            <div class="yt-wrap">
                <iframe
                    src="${ytSrc}"
                    title="${s.title}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen
                    loading="lazy">
                </iframe>
            </div>
        </article>`;
    }

    // ── Re-render the grid from `filtered` ─────────────────
    function renderGrid() {
        if (filtered.length === 0) {
            grid.innerHTML = '';
            emptyState.hidden = false;
        } else {
            emptyState.hidden = true;
            grid.innerHTML = filtered.map(renderCard).join('');
        }
    }

    // ── Populate preacher dropdown from fetched data ────────
    function buildPreacherDropdown() {
        const preachers = [...new Set(
            allSermons.map(s => s.meta.preacher).filter(Boolean)
        )].sort();

        preacherSelect.innerHTML = '<option value="">All Preachers</option>' +
            preachers.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // ── Apply current filter + sort state ──────────────────
    function applyFilters() {
        const query    = searchInput.value.toLowerCase().trim();
        const sortVal  = sortSelect.value;
        const preacher = preacherSelect.value;

        filtered = allSermons.filter(s => {
            const matchSearch = !query ||
                s.title.toLowerCase().includes(query) ||
                s.meta.preacher.toLowerCase().includes(query) ||
                s.meta.topic.toLowerCase().includes(query) ||
                s.meta.scripture.toLowerCase().includes(query);

            const matchPreacher = !preacher || s.meta.preacher === preacher;

            return matchSearch && matchPreacher;
        });

        filtered.sort((a, b) => {
            const timeA = (a.meta.dateObj ? a.meta.dateObj.getTime() : new Date(a.publishedAt).getTime());
            const timeB = (b.meta.dateObj ? b.meta.dateObj.getTime() : new Date(b.publishedAt).getTime());
            if (sortVal === 'date-asc')  return timeA - timeB;
            if (sortVal === 'date-desc') return timeB - timeA;
            if (sortVal === 'preacher')  return (a.meta.preacher || 'zzz').localeCompare(b.meta.preacher || 'zzz');
            return 0;
        });

        renderGrid();
    }

    // ── Fetch full video details (description) for a batch ─
    async function fetchVideoDetails(videoIds) {
        const ids   = videoIds.join(',');
        const url   = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${VCF_CONFIG.API_KEY}`;
        const resp  = await fetch(url);
        const data  = await resp.json();
        return data.items || [];
    }

    // ── Fetch uploads playlist ID from channel ─────────────
    async function fetchUploadsPlaylistId() {
        const url  = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${VCF_CONFIG.CHANNEL_ID}&key=${VCF_CONFIG.API_KEY}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.items || data.items.length === 0) throw new Error('Channel not found. Check your CHANNEL_ID.');
        return data.items[0].contentDetails.relatedPlaylists.uploads;
    }

    // ── Fetch all videos from uploads playlist ─────────────
    async function fetchAllUploads(playlistId) {
        let videos    = [];
        let pageToken = '';

        do {
            const url  = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&pageToken=${pageToken}&key=${VCF_CONFIG.API_KEY}`;
            const resp = await fetch(url);
            const data = await resp.json();

            const items = (data.items || []).filter(
                item => item.snippet.resourceId.kind === 'youtube#video'
            );
            videos = videos.concat(items);
            pageToken = data.nextPageToken || '';
        } while (pageToken);

        return videos;
    }

    // ── Demo sermon cards (shown until real videos exist) ──────
    function showDemoSermons() {
        const demoSermons = [
            {
                videoId: 'demo1',
                title: 'Walking in the Spirit — A Life Set Free',
                publishedAt: '2026-04-27T09:30:00Z',
                meta: { preacher: 'Jake Siemens', topic: 'The Holy Spirit', scripture: 'Galatians 5:16–25' },
                isDemo: true,
            },
            {
                videoId: 'demo2',
                title: 'The Prodigal Son — Grace Beyond Measure',
                publishedAt: '2026-04-23T19:00:00Z',
                meta: { preacher: 'Jake Siemens', topic: 'Grace & Forgiveness', scripture: 'Luke 15:11–32' },
                isDemo: true,
            },
            {
                videoId: 'demo3',
                title: 'Faith Without Works Is Dead',
                publishedAt: '2026-04-20T09:30:00Z',
                meta: { preacher: 'Jake Siemens', topic: 'Living Faith', scripture: 'James 2:14–26' },
                isDemo: true,
            },
        ];

        loadingEl.hidden = true;
        buildPreacherDropdownFromList(demoSermons);
        allSermons = demoSermons;
        filtered = [...demoSermons];

        grid.innerHTML = demoSermons.map(s => {
            return `
            <article class="sermon-card" data-id="${s.videoId}">
                <div class="sermon-card-header">
                    <div class="sermon-card-meta-top">
                        <span class="sermon-live-badge" style="background:rgba(45,100,45,0.12);color:#2a5e2a;">Preview</span>
                    </div>
                    <h3 class="sermon-title">${s.title}</h3>
                    <div class="sermon-tags">
                        ${tag(s.meta.preacher,  'preacher')}
                        ${tag(s.meta.scripture, 'scripture')}
                        ${tag(s.meta.topic,     'topic')}
                    </div>
                </div>
                <div class="yt-wrap" style="background:#1a1a1a; display:flex; align-items:center; justify-content:center;">
                    <div style="text-align:center; color:rgba(255,255,255,0.5); padding:40px;">
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin:0 auto 16px;display:block;opacity:0.4">
                            <circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/>
                        </svg>
                        <p style="font-size:0.9rem;">Your sermon video will appear here</p>
                    </div>
                </div>
            </article>`;
        }).join('');
    }

    function buildPreacherDropdownFromList(list) {
        const preachers = [...new Set(list.map(s => s.meta.preacher).filter(Boolean))].sort();
        preacherSelect.innerHTML = '<option value="">All Preachers</option>' +
            preachers.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // ── Main fetch + build ─────────────────────────────────
    async function loadSermons() {
        try {
            // ── Demo mode: show placeholder cards if no real videos yet ──
            if (VCF_CONFIG.API_KEY === 'YOUR_API_KEY_HERE' || VCF_CONFIG.CHANNEL_ID === 'YOUR_CHANNEL_ID_HERE') {
                showDemoSermons();
                return;
            }

            const playlistId   = await fetchUploadsPlaylistId();
            const uploadItems  = await fetchAllUploads(playlistId);

            // Chunk into batches of 50 for the videos endpoint
            const videoIds = uploadItems.map(i => i.snippet.resourceId.videoId);
            const chunks   = [];
            for (let i = 0; i < videoIds.length; i += 50) {
                chunks.push(videoIds.slice(i, i + 50));
            }

            const detailItems = (await Promise.all(chunks.map(fetchVideoDetails))).flat();
            const detailMap   = Object.fromEntries(detailItems.map(d => [d.id, d]));

            allSermons = uploadItems.map(item => {
                const videoId    = item.snippet.resourceId.videoId;
                const detail     = detailMap[videoId];
                const desc       = detail?.snippet?.description || '';
                const publishedAt = item.snippet.publishedAt;

                return {
                    videoId,
                    title: item.snippet.title,
                    publishedAt,
                    meta: parseMeta(desc, item.snippet.title),
                    isLive: item.snippet.title.toLowerCase().includes('live') ||
                            (detail?.snippet?.liveBroadcastContent === 'none' && false),
                };
            });

            // Default: newest preached first
            allSermons.sort((a, b) => {
                const timeA = (a.meta.dateObj ? a.meta.dateObj.getTime() : new Date(a.publishedAt).getTime());
                const timeB = (b.meta.dateObj ? b.meta.dateObj.getTime() : new Date(b.publishedAt).getTime());
                return timeB - timeA;
            });

            // If channel has no videos yet, show demo cards
            if (allSermons.length === 0) {
                showDemoSermons();
                return;
            }

            loadingEl.hidden = true;
            buildPreacherDropdown();

            filtered = [...allSermons];
            renderGrid();

        } catch (err) {
            console.warn('[VCF Sermons] YouTube Data API failed, falling back to preview mode:', err);
            showDemoSermons();
        }
    }

    // ── Boot ───────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        grid           = document.getElementById('sermon-grid');
        searchInput    = document.getElementById('sermon-search');
        sortSelect     = document.getElementById('sermon-sort');
        preacherSelect = document.getElementById('sermon-preacher');
        emptyState     = document.getElementById('sermon-empty');
        loadingEl      = document.getElementById('sermon-loading');

        searchInput.addEventListener('input',  applyFilters);
        sortSelect.addEventListener('change',  applyFilters);
        preacherSelect.addEventListener('change', applyFilters);

        loadSermons();
    });
})();
