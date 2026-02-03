---
name: web-search
description: Web searching, source collection, and lightweight data extraction using curl/python. Use for tasks that require external sources or online data gathering.
license: Internal
---

# Web Search & Data Collection

Use this skill when the user requests online research, source lookup, or web-based data collection.

## Workflow
1. **Clarify the query**: confirm keywords, timeframe, region, and preferred sources.
2. **Collect sources**: use `curl -L` to fetch pages, or Python for multi-step retrieval.
3. **Extract signal**: summarize only relevant parts; keep citations (URL + title + date).
4. **Deliver result**: provide a concise summary + source list.

## Tools
- `curl -L <url>` for direct fetch
- Python for batch fetch or parsing

## Example: Quick Fetch
```bash
curl -L "https://example.com" -o /tmp/page.html
```

## Example: Batch Fetch (Python)
```bash
python - <<'PY'
import requests
urls = [
    "https://example.com",
    "https://example.org",
]
for url in urls:
    r = requests.get(url, timeout=20)
    print(url, r.status_code, len(r.text))
PY
```

## Notes
- If network access is blocked, **report clearly** and ask for alternative sources or user-provided files.
- When extracting data, keep a small raw cache file in `/tmp` or the workspace for traceability.
- Always return citations with URLs and retrieval dates.
