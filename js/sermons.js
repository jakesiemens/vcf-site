/**
 * ─────────────────────────────────────────────────────────
 *  VCF Sermon Library — YouTube Data API Integration
 * ─────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────
    let allSermons = [];        // full fetched list
    let filtered   = [];        // after search / filter / sort

    // ── DOM References ─────────────────────────────────────
    let grid, searchInput, sortSelect, preacherSelect, emptyState, loadingEl;
    let filterStatus, filterStatusText, filterResetBtn;

    // ── Helpers ────────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function parseMeta(description, title, tags) {
        const meta = {
            preacher: '',
            topic: '',
            scripture: '',
            date: '',
            dateObj: null,
            searchKeywords: ''
        };

        const kwParts = [];
        if (title) kwParts.push(title);
        if (description) kwParts.push(description);
        if (Array.isArray(tags)) kwParts.push(tags.join(' '));

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
                if (lower.startsWith('topic:') || lower.includes('topic:')) {
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

        // Fallback: extract preacher from title if not set
        if (!meta.preacher && title) {
            const mPreacher = title.match(/-\s*([A-Za-z\s]+?)\s*(\([A-Za-z0-9,\s]+\)|\|)/);
            if (mPreacher) {
                const cand = mPreacher[1].trim();
                if (!cand.toLowerCase().includes('victory') && !cand.toLowerCase().includes('fellowship')) {
                    meta.preacher = cand;
                }
            }
        }

        // Fallback: extract scripture from title if not set
        if (!meta.scripture && title) {
            const mScripture = title.match(/\b((?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1\s*Samuel|2\s*Samuel|1\s*Kings|2\s*Kings|1\s*Chronicles|2\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1\s*Corinthians|2\s*Corinthians|Galatians|Ephesians|Philippians|Colossians|1\s*Thessalonians|2\s*Thessalonians|1\s*Timothy|2\s*Timothy|Titus|Philemon|Hebrews|James|1\s*Peter|2\s*Peter|1\s*John|2\s*John|3\s*John|Jude|Revelation)\s+\d+(?::\d+(?:-\d+)?)?)/i);
            if (mScripture) {
                meta.scripture = mScripture[1];
            }
        }

        if (meta.date) {
            const parsed = new Date(meta.date);
            if (!isNaN(parsed.getTime())) {
                meta.dateObj = parsed;
            }
        }

        if (meta.preacher) kwParts.push(meta.preacher);
        if (meta.scripture) kwParts.push(meta.scripture);
        if (meta.topic) kwParts.push(meta.topic);
        if (meta.date) kwParts.push(meta.date);

        meta.searchKeywords = kwParts.join(' ').toLowerCase();
        return meta;
    }

    function formatDate(iso) {
        return new Date(iso).toLocaleDateString('en-CA', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    // ── Render a single sermon card ────────────────────────
    function renderCard(s) {
        const ytSrc = `https://www.youtube.com/embed/${s.videoId}`;
        const preacherBtn = s.meta.preacher
            ? `<button type="button" class="sermon-tag sermon-tag--preacher" data-preacher="${escapeHtml(s.meta.preacher)}" title="Filter sermons by ${escapeHtml(s.meta.preacher)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${escapeHtml(s.meta.preacher)}
               </button>`
            : '';
        const scriptureTag = s.meta.scripture
            ? `<span class="sermon-tag sermon-tag--scripture" title="Scripture passage">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                ${escapeHtml(s.meta.scripture)}
               </span>`
            : '';

        return `
        <article class="sermon-card" data-id="${s.videoId}">
            <div class="sermon-card-header">
                ${s.isLive ? '<div class="sermon-card-meta-top"><span class="sermon-live-badge">Live Recording</span></div>' : ''}
                <h3 class="sermon-title">${escapeHtml(s.title)}</h3>
                <div class="sermon-tags">
                    ${preacherBtn}
                    ${scriptureTag}
                </div>
            </div>
            <div class="yt-wrap">
                <iframe
                    src="${ytSrc}"
                    title="${escapeHtml(s.title)}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen
                    loading="lazy">
                </iframe>
            </div>
        </article>`;
    }

    // ── Re-render the grid from \`filtered\` ─────────────────
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
        )].filter(p => !p.toLowerCase().includes('victory christian')).sort();

        preacherSelect.innerHTML = '<option value="">All Preachers</option>' +
            preachers.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    }

    // ── Apply current filter + sort state ──────────────────
    function applyFilters() {
        const query    = searchInput.value.toLowerCase().trim();
        const sortVal  = sortSelect.value;
        const preacher = preacherSelect.value;

        filtered = allSermons.filter(s => {
            let matchSearch = true;
            if (query) {
                const words = query.split(/\s+/).filter(Boolean);
                matchSearch = words.every(w => s.meta.searchKeywords.includes(w));
            }

            const matchPreacher = !preacher || s.meta.preacher.toLowerCase() === preacher.toLowerCase();
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

        // Update active filter indicator
        if (filterStatus && filterStatusText) {
            const activeConditions = [];
            if (preacher) activeConditions.push(`Preacher: <strong>${escapeHtml(preacher)}</strong>`);
            if (query) activeConditions.push(`Search: <strong>"${escapeHtml(query)}"</strong>`);

            if (activeConditions.length > 0) {
                filterStatusText.innerHTML = `Showing ${filtered.length} sermon${filtered.length === 1 ? '' : 's'} (${activeConditions.join(' · ')})`;
                filterStatus.hidden = false;
            } else {
                filterStatus.hidden = true;
            }
        }

        renderGrid();
    }

    // ── Fetch full video details (description, tags) for a batch ─
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

    // ── Demo sermon cards ──────────────────────────────────
    function showDemoSermons() {
        const demoSermons = [
            {
                videoId: 'demo1',
                title: 'Walking in the Spirit — A Life Set Free (Apr 27, 2026)',
                publishedAt: '2026-04-27T09:30:00Z',
                meta: { preacher: 'Jake Siemens', topic: 'The Holy Spirit', scripture: 'Galatians 5:16–25', searchKeywords: 'jake siemens walking holy spirit galatians 5' },
                isDemo: true,
            },
            {
                videoId: 'demo2',
                title: 'The Prodigal Son — Grace Beyond Measure (Apr 23, 2026)',
                publishedAt: '2026-04-23T19:00:00Z',
                meta: { preacher: 'Jake Siemens', topic: 'Grace & Forgiveness', scripture: 'Luke 15:11–32', searchKeywords: 'jake siemens prodigal son grace luke 15' },
                isDemo: true,
            },
            {
                videoId: 'demo3',
                title: 'Faith Without Works Is Dead (Apr 20, 2026)',
                publishedAt: '2026-04-20T09:30:00Z',
                meta: { preacher: 'Jake Siemens', topic: 'Living Faith', scripture: 'James 2:14–26', searchKeywords: 'jake siemens faith works dead james 2' },
                isDemo: true,
            },
        ];

        loadingEl.hidden = true;
        buildPreacherDropdownFromList(demoSermons);
        allSermons = demoSermons;
        filtered = [...demoSermons];
        renderGrid();
    }

    function buildPreacherDropdownFromList(list) {
        const preachers = [...new Set(list.map(s => s.meta.preacher).filter(Boolean))].sort();
        preacherSelect.innerHTML = '<option value="">All Preachers</option>' +
            preachers.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    }

    // ── Main fetch + build ─────────────────────────────────
    async function loadSermons() {
        try {
            if (VCF_CONFIG.API_KEY === 'YOUR_API_KEY_HERE' || VCF_CONFIG.CHANNEL_ID === 'YOUR_CHANNEL_ID_HERE') {
                showDemoSermons();
                return;
            }

            const playlistId   = await fetchUploadsPlaylistId();
            const uploadItems  = await fetchAllUploads(playlistId);

            const videoIds = uploadItems.map(i => i.snippet.resourceId.videoId);
            const chunks   = [];
            for (let i = 0; i < videoIds.length; i += 50) {
                chunks.push(videoIds.slice(i, i + 50));
            }

            const detailItems = (await Promise.all(chunks.map(fetchVideoDetails))).flat();
            const detailMap   = Object.fromEntries(detailItems.map(d => [d.id, d]));

            allSermons = uploadItems.map(item => {
                const videoId     = item.snippet.resourceId.videoId;
                const detail      = detailMap[videoId];
                const desc        = detail?.snippet?.description || '';
                const tags        = detail?.snippet?.tags || [];
                const publishedAt = item.snippet.publishedAt;

                return {
                    videoId,
                    title: item.snippet.title,
                    publishedAt,
                    meta: parseMeta(desc, item.snippet.title, tags),
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
        grid             = document.getElementById('sermon-grid');
        searchInput      = document.getElementById('sermon-search');
        sortSelect       = document.getElementById('sermon-sort');
        preacherSelect   = document.getElementById('sermon-preacher');
        emptyState       = document.getElementById('sermon-empty');
        loadingEl        = document.getElementById('sermon-loading');
        filterStatus     = document.getElementById('sermon-filter-status');
        filterStatusText = document.getElementById('sermon-filter-status-text');
        filterResetBtn   = document.getElementById('sermon-filter-reset');

        searchInput.addEventListener('input',  applyFilters);
        sortSelect.addEventListener('change',  applyFilters);
        preacherSelect.addEventListener('change', applyFilters);

        if (filterResetBtn) {
            filterResetBtn.addEventListener('click', () => {
                searchInput.value = '';
                preacherSelect.value = '';
                applyFilters();
            });
        }

        // Delegate clicks on preacher tags to filter by that preacher
        if (grid) {
            grid.addEventListener('click', (e) => {
                const btn = e.target.closest('.sermon-tag--preacher');
                if (btn && btn.dataset.preacher) {
                    const preacherName = btn.dataset.preacher;
                    if (preacherSelect) {
                        preacherSelect.value = preacherName;
                        applyFilters();
                        const toolbar = document.querySelector('.sermon-toolbar');
                        if (toolbar) {
                            toolbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                }
            });
        }

        loadSermons();
    });
})();
