# Daily Plan

A small static site that turns the weekly task file (`WEEKLY_TASKS_*.md` in the
Development Plan folder) into a daily cockpit: a **Today** view (deadlines,
decision callouts, the day's tasks + standing dailies, admin items) and a
**Week** view. Checkmarks persist in the browser via `localStorage`.

- **Live:** https://leyes-daily-plan.netlify.app
- **Repo:** https://github.com/donne4real/daily-plan (private)
- **Netlify admin:** https://app.netlify.com/projects/leyes-daily-plan
- **Data:** `data/tasks.json` — the single source of truth for the site
- **No framework, no build step** — plain HTML/CSS/JS; Netlify only runs the
  validator at deploy time

## Weekly update workflow

When a new week's plan is written (from `SEPTEMBER_2026_PLAN.md` + whatever's
changed), regenerate `data/tasks.json` for that week and replace the file. The
JSON is the structured companion to the markdown file — generation-time
structure beats parsing freeform markdown, which drifts week to week.

Then deploy:

```
netlify deploy --prod
```

(or push to the connected git repo if one is linked — Netlify runs
`node scripts/validate.js` as the build command, so a malformed week file
blocks the deploy instead of shipping a broken site.)

## Run locally

```
cd daily-plan
python -m http.server 8000    # or: npx serve
# open http://localhost:8000
```

Opening `index.html` directly (file://) won't work — fetch of the JSON is
blocked by the browser on file://.

## The data contract (`data/tasks.json`)

```jsonc
{
  "schemaVersion": 1,
  "generated": "2026-08-30",
  "week": {
    "id": "2026-08-30",            // unique per week — scopes task check state
    "label": "Aug 30 – Sep 5, 2026",
    "startDate": "2026-08-30",     // must equal days[0].date
    "planVersion": "...", "context": "...", "lookingAhead": "..."
  },
  "days": [                        // exactly 7, contiguous, Sun→Sat
    {
      "date": "2026-08-30", "label": "Sun Aug 30", "dow": 0,
      "special": "free",           // optional: renders a FREE DAY chip
      "callout": {                 // optional: decision/warning box
        "title": "...", "body": "...",
        "options": [{ "label": "...", "detail": "..." }]
      },
      "tasks": [
        {
          "id": "d22-recording",   // unique across days + adminItems
          "title": "...", "detail": "...",        // detail optional
          "when": "5:30–6:30 PM",                 // display string
          "sort": "17:30",        // optional HH:MM — orders the day's timeline
          "category": "project",  // faith|health|learn|project|career|family|home|review|admin
          "emoji": "🎙️",
          "flag": "hard",          // optional: hard|rerun|overdue → badge
          "conditional": "Only if Option A"  // optional: dashed style, excluded from progress totals
        }
      ]
    }
  ],
  "standingDailies": [             // repeat weekly, keyed by day-of-week
    { "id": "devotion", "title": "...", "when": "4:00–5:15 AM", "sort": "04:00",
      "days": [0,1,2,3,4,5,6], "category": "faith", "emoji": "📖" }
  ],
  "adminItems":  [ { "id": "...", "title": "...", "detail": "...", "category": "admin", "emoji": "...", "flag": "overdue" } ],
  "deadlines":   [ { "date": "2026-09-05", "label": "...", "severity": "hard" } ],  // shown when ≤7 days out
  "reminders":   [ "..." ],
  "risks":       [ "..." ]         // week view only
}
```

### Check-state keys (sync-ready)

- Task: `t:{week.id}:{task.id}` — week-scoped, so a new week starts clean
- Daily: `d:{date}:{daily.id}` — date-scoped, so habits reset every day
- Admin: `a:{week.id}:{item.id}`

These stable keys are deliberate: if cross-device sync is ever wanted, a
Netlify Function + [Netlify Blobs](https://docs.netlify.com/blobs/overview/)
can store the same key→timestamp map and the front end barely changes.

## Notes & decisions

- **Privacy:** the plan contains personal details (devotion times, weight,
  family schedule). The repo is private and the page sends `noindex, nofollow`,
  but the URL itself is unauthenticated — anyone who has it can view the plan.
  Real password protection is a Netlify paid feature; rename the site in the
  Netlify dashboard any time.
- **Markdown stays the plan, the site is the tracker.** Check state is NOT
  written back to the `.md` files — that's the brittle path.
- **Noindex:** the page sends `noindex, nofollow` so search engines skip it.
