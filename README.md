# Multilevel Queue Scheduling Simulator

Full-stack implementation of the Multilevel Queue Scheduling PRD.

| Layer | Tech | Location |
|---|---|---|
| Frontend | HTML/CSS/JS (static) | `public/index.html` |
| API | Vercel serverless function (Node) | `api/schedule.js` |
| Scheduling engine | **C** | `backend/scheduler.c` |

The browser posts JSON to `/api/schedule`. The function validates it, pipes it to the compiled C binary (`bin/scheduler`), and returns the binary's JSON (Gantt chart, per-process metrics, averages).

## Run locally
```bash
npm start        # compiles the C code, serves http://localhost:3000
```
Requires `gcc` and Node 18+.

## Deploy: GitHub + Vercel
```bash
git init && git add . && git commit -m "Multilevel queue scheduler"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
Then on vercel.com: **Add New → Project → import the repo → Deploy**. No settings to change; `vercel.json` sets the build command (`gcc` compile) and bundles `bin/scheduler` into the function.

If the Vercel build ever lacks `gcc`, deploy the same code with the included `Dockerfile` on Render, Railway or Fly.io instead.

## Scheduling rules
- Queue 1 is the highest priority. A lower queue runs only when every higher queue is empty.
- Policies per queue: `FCFS`, `RR` (with quantum), `PRIORITY` (lower number runs first).
- Preemption toggle: when on, a process arriving in a higher queue interrupts a running lower-queue process.
- TAT = CT - AT, WT = TAT - BT, RT = first start - AT. Context-switch time is ignored.
