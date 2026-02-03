---
name: scheduler
description: Create periodic tasks (cron/launchd) to trigger Loong agent runs.
license: Internal
---

# Scheduler

Use this skill to set up periodic triggers that call Loong's `/api/ask` endpoint.
**Pick the section that matches your OS.**

## macOS (launchd)
Create a plist and load it with `launchctl`.

```bash
PLIST=~/Library/LaunchAgents/loong.wugang.rss.plist
PORT=${LOONG_PORT:-17800}
PASS=${LOONG_PASSWORD:-""}
AUTH=""
if [ -n "$PASS" ]; then
  AUTH="-u user:$PASS"
fi

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>loong.wugang.rss</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>-lc</string>
      <string>curl -sS ${AUTH} -H "content-type: application/json" -X POST http://localhost:${PORT}/api/ask -d '{"message":"执行RSS推送","agentId":"wugang"}'</string>
    </array>
    <key>StartInterval</key><integer>3600</integer>
    <key>RunAtLoad</key><true/>
  </dict>
</plist>
PLIST

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
```

## Linux (cron)
```bash
( crontab -l 2>/dev/null; \
  echo "0 * * * * curl -sS -H 'content-type: application/json' -X POST http://localhost:17800/api/ask -d '{\"message\":\"执行RSS推送\",\"agentId\":\"wugang\"}'" ) | crontab -
```

## Notes
- Adjust `StartInterval` or cron expression for frequency
- Ensure Loong is running and reachable at the chosen port
