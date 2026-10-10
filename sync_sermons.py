#!/usr/bin/env python3
"""
VCF Sermons Synchronizer & YouTube Audit
-----------------------------------------
1. Validates all videos in sermons_youtube_archive_clean.json against YouTube API.
2. Removes any videos that were deleted, made private, or removed from YouTube.
3. Fetches recent uploads from the VCF YouTube channel (UCvizgathiFxH0H_EWYqlEbQ).
4. Adds any newly published videos not yet in the catalog.
5. Saves the updated clean catalog.
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime

ARCHIVE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sermons_youtube_archive_clean.json')
CHANNEL_ID = 'UCvizgathiFxH0H_EWYqlEbQ'
UPLOADS_PLAYLIST_ID = 'UUvizgathiFxH0H_EWYqlEbQ'
API_KEY = 'AIzaSyDPvG46UY92bIm9Uf5n1oGJ2CnT0LEAOOs'


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'VCF-Sermon-Sync/1.0'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))


def parse_metadata_from_text(title, description):
    meta = {
        'speaker': '',
        'passage': '',
        'title': title,
        'date': '',
        'preached_date': '',
        'display_date': '',
        'preached_timestamp': 0
    }

    # 1. Parse from description lines
    if description:
        for line in description.splitlines():
            line_str = line.strip()
            lower = line_str.lower()
            if any(lower.startswith(k) for k in ('speaker:', 'preacher:')) or 'speaker:' in lower or 'preacher:' in lower:
                val = line_str.split(':', 1)[1].strip()
                val = re.sub(r'[🎙️🗣️]', '', val).strip()
                if val:
                    meta['speaker'] = val
            elif any(lower.startswith(k) for k in ('main scripture:', 'passage:', 'scripture:', 'theme scripture:')) or 'scripture:' in lower:
                val = line_str.split(':', 1)[1].strip()
                val = re.sub(r'[📖✝️]', '', val).strip()
                if val and not meta['passage']:
                    meta['passage'] = val
            elif lower.startswith('date:') or lower.startswith('preached:'):
                val = line_str.split(':', 1)[1].strip()
                val = re.sub(r'[📅🗓️]', '', val).strip()
                if val:
                    meta['date'] = val

    # 2. Extract preacher from title e.g. "Title | Raymond Burkholder" or "Title - Corny Janzen (Date) | VCF"
    clean_title = title
    if not meta['speaker']:
        # Check pipe or hyphen separation
        m_pipe = re.search(r'\|\s*([A-Za-z\s]+?)(?:\s*\||\s*$)', title)
        if m_pipe and 'victory christian' not in m_pipe.group(1).lower() and 'vcf' not in m_pipe.group(1).lower():
            meta['speaker'] = m_pipe.group(1).strip()
        else:
            m_dash = re.search(r'-\s*([A-Za-z\s]+?)(?:\s*\(|\s*\||\s*$)', title)
            if m_dash and 'victory' not in m_dash.group(1).lower() and 'vcf' not in m_dash.group(1).lower():
                meta['speaker'] = m_dash.group(1).strip()
            else:
                m_paren = re.search(r'\(([A-Za-z\s]+?),\s*(?:[1-3]\s*)?[A-Za-z]+\s*\d+', title)
                if m_paren:
                    meta['speaker'] = m_paren.group(1).strip()

    # Clean clean_title of channel suffixes and preacher suffix
    clean_title = re.sub(r'\s*\|\s*Victory Christian Fellowship\s*$', '', clean_title, flags=re.I)
    clean_title = re.sub(r'\s*\|\s*VCF\s*$', '', clean_title, flags=re.I)
    if meta['speaker']:
        clean_title = re.sub(r'\s*\|\s*' + re.escape(meta['speaker']) + r'\s*$', '', clean_title, flags=re.I)
        clean_title = re.sub(r'\s*-\s*' + re.escape(meta['speaker']) + r'\s*(\(.*?\))?', '', clean_title, flags=re.I)
    clean_title = clean_title.strip()
    if clean_title:
        meta['title'] = clean_title

    # 3. Scripture fallback
    if not meta['passage']:
        m_scr = re.search(r'\b((?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1\s*Samuel|2\s*Samuel|1\s*Kings|2\s*Kings|1\s*Chronicles|2\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1\s*Corinthians|2\s*Corinthians|Galatians|Ephesians|Philippians|Colossians|1\s*Thessalonians|2\s*Thessalonians|1\s*Timothy|2\s*Timothy|Titus|Philemon|Hebrews|James|1\s*Peter|2\s*Peter|1\s*John|2\s*John|3\s*John|Jude|Revelation)\s+\d+(?::\d+(?:-\d+)?)?)', title, re.I)
        if m_scr:
            meta['passage'] = m_scr.group(1)

    return meta


def sync():
    if not os.path.exists(ARCHIVE_PATH):
        print(f"Archive file not found at {ARCHIVE_PATH}")
        return False

    with open(ARCHIVE_PATH, 'r', encoding='utf-8') as f:
        archive = json.load(f)

    print(f"Current catalog entries: {len(archive)}")

    # ── STEP 1: Audit existing catalog for dead/removed videos ────────────────
    video_keys = list(archive.keys())
    video_ids = [archive[k]['videoId'] for k in video_keys if 'videoId' in archive[k]]

    valid_ids = set()
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i+50]
        url = f"https://www.googleapis.com/youtube/v3/videos?part=id,status&id={','.join(batch)}&key={API_KEY}"
        try:
            res = fetch_json(url)
            for item in res.get('items', []):
                vid = item['id']
                privacy = item.get('status', {}).get('privacyStatus')
                upload_status = item.get('status', {}).get('uploadStatus')
                if privacy != 'private' and upload_status not in ('rejected', 'failed'):
                    valid_ids.add(vid)
        except Exception as e:
            print(f"Error checking video batch: {e}")

    removed_keys = []
    for k in video_keys:
        vid = archive[k].get('videoId')
        if vid and vid not in valid_ids:
            removed_keys.append(k)

    if removed_keys:
        print(f"\n[AUDIT] Found {len(removed_keys)} removed/dead video(s) on YouTube:")
        for k in removed_keys:
            v_info = archive[k]
            print(f"  - Removing: {v_info.get('videoId')} | {v_info.get('title')} ({v_info.get('speaker')})")
            del archive[k]
    else:
        print("\n[AUDIT] All existing catalog videos are active and valid on YouTube.")

    # ── STEP 2: Fetch recent uploads from channel ─────────────────────────────
    existing_video_ids = {v['videoId'] for v in archive.values() if 'videoId' in v}
    added_count = 0

    try:
        url = f"https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId={UPLOADS_PLAYLIST_ID}&maxResults=30&key={API_KEY}"
        pl_data = fetch_json(url)
        new_items = []
        for item in pl_data.get('items', []):
            snippet = item.get('snippet', {})
            vid = snippet.get('resourceId', {}).get('videoId')
            title = snippet.get('title', '')
            if vid and vid not in existing_video_ids:
                if 'deleted video' not in title.lower() and 'private video' not in title.lower():
                    new_items.append((vid, snippet))

        if new_items:
            # Fetch full snippet details for new items
            new_ids = [vid for vid, _ in new_items]
            detail_url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id={','.join(new_ids)}&key={API_KEY}"
            detail_data = fetch_json(detail_url)
            detail_map = {item['id']: item for item in detail_data.get('items', [])}

            print(f"\n[SYNC] Found {len(new_items)} new upload(s) to add to catalog:")
            for vid, _ in new_items:
                detail = detail_map.get(vid)
                if not detail:
                    continue
                snippet = detail.get('snippet', {})
                status = detail.get('status', {})
                if status.get('privacyStatus') == 'private':
                    continue

                raw_title = snippet.get('title', '')
                desc = snippet.get('description', '')
                published_at = snippet.get('publishedAt', '')

                meta = parse_metadata_from_text(raw_title, desc)

                # Determine preached date
                date_str = meta['date']
                if not date_str and published_at:
                    date_str = published_at[:10]

                date_obj = None
                try:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                except Exception:
                    try:
                        date_obj = datetime.strptime(date_str, '%B %d, %Y')
                    except Exception:
                        pass

                display_date = date_str
                if date_obj:
                    display_date = date_obj.strftime('%B %d, %Y')
                    short_date = date_obj.strftime('%b %d, %Y')
                    preached_date = date_obj.strftime('%Y-%m-%d')
                    ts = int(date_obj.timestamp() * 1000)
                else:
                    short_date = date_str
                    preached_date = date_str
                    ts = 0

                entry = {
                    "videoId": vid,
                    "title": meta['title'],
                    "speaker": meta['speaker'],
                    "passage": meta['passage'],
                    "date": display_date,
                    "uploadedAt": published_at.replace('T', ' ').replace('Z', ''),
                    "short_date": short_date,
                    "youtube_title": raw_title,
                    "preached_date": preached_date,
                    "display_date": display_date,
                    "preached_timestamp": ts,
                    "source": "YouTube"
                }

                key = f"youtube_{vid}"
                archive[key] = entry
                added_count += 1
                print(f"  + Added: {vid} | {entry['title']} ({entry['speaker']})")

    except Exception as e:
        print(f"Error checking recent channel uploads: {e}")

    # ── STEP 3: Write back updated catalog if changed ─────────────────────────
    if removed_keys or added_count > 0:
        with open(ARCHIVE_PATH, 'w', encoding='utf-8') as f:
            json.dump(archive, f, indent=2, ensure_ascii=False)
        print(f"\n[DONE] Archive updated successfully! ({len(removed_keys)} removed, {added_count} added, {len(archive)} total).")
        return True
    else:
        print(f"\n[DONE] Catalog is completely up-to-date. No changes needed.")
        return False


if __name__ == '__main__':
    changed = sync()
    sys.exit(0 if not changed else 0)
