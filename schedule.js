// Vercel serverless function: validates the request, then runs the C scheduler binary.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const POLICIES = ['FCFS', 'RR', 'PRIORITY'];
let binPath = null;

function getBinary() {
  if (binPath && fs.existsSync(binPath)) return binPath;
  const src = [path.join(process.cwd(), 'bin', 'scheduler'), path.join(__dirname, '..', 'bin', 'scheduler')]
    .find((p) => fs.existsSync(p));
  if (!src) throw new Error('Scheduler binary not found. Run "npm run build" first.');
  const dest = path.join(os.tmpdir(), 'mlq-scheduler'); // /tmp is writable on Vercel
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  return (binPath = dest);
}

function buildInput(b) {
  const lines = [`CONFIG ${b.queues.length} ${b.preemptive ? 1 : 0}`];
  b.queues.forEach((q, i) => lines.push(`QUEUE ${i + 1} ${q.policy} ${q.quantum || 1}`));
  b.processes.forEach((p) => lines.push(`PROC ${p.id} ${p.arrival} ${p.burst} ${p.priority} ${p.queue}`));
  return lines.join('\n') + '\n';
}

function validate(b) {
  if (!b || !Array.isArray(b.queues) || !Array.isArray(b.processes)) return 'Request must include queues and processes.';
  if (b.queues.length < 1 || b.queues.length > 5) return 'Use between 1 and 5 queues.';
  if (b.processes.length < 1 || b.processes.length > 100) return 'Use between 1 and 100 processes.';
  for (const q of b.queues) {
    if (!POLICIES.includes(q.policy)) return 'Each queue needs a policy: FCFS, RR or PRIORITY.';
    if (q.policy === 'RR' && !(Number.isInteger(q.quantum) && q.quantum >= 1)) return 'Round Robin needs a whole-number quantum of at least 1.';
  }
  const seen = new Set();
  for (const p of b.processes) {
    if (seen.has(String(p.id))) return `Duplicate process ID "${p.id}".`;
    seen.add(String(p.id));
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(String(p.id))) return `Process ID "${p.id}" is invalid. Use up to 12 letters, digits, - or _.`;
    for (const k of ['arrival', 'burst', 'priority', 'queue']) {
      if (!Number.isInteger(p[k])) return `${p.id}: ${k} must be a whole number.`;
    }
    if (String(p.id).toUpperCase() === 'IDLE') return 'Process ID "IDLE" is reserved.';
    if (p.arrival < 0) return `${p.id}: arrival time cannot be negative.`;
    if (p.burst < 1 || p.burst > 1000) return `${p.id}: burst time must be between 1 and 1000.`;
    if (p.arrival > 10000) return `${p.id}: arrival time cannot exceed 10000.`;
    if (p.queue < 1 || p.queue > b.queues.length) return `${p.id}: queue must be between 1 and ${b.queues.length}.`;
  }
  return null;
}

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const body = req.body;
  const problem = validate(body);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const out = spawnSync(getBinary(), [], { input: buildInput(body), encoding: 'utf8', timeout: 5000, maxBuffer: 32 * 1024 * 1024 });
    if (out.error) throw out.error;
    const data = JSON.parse(out.stdout || '{"error":"Scheduler returned no output."}');
    return res.status(out.status === 0 ? 200 : 400).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
