/*
 * Multilevel Queue Scheduling simulator (backend engine).
 *
 * Reads a plain-text job description on stdin, writes JSON on stdout.
 *
 * Input lines:
 *   CONFIG <num_queues 1-5> <preemptive 0|1>
 *   QUEUE  <index 1..n> <FCFS|RR|PRIORITY> <quantum>
 *   PROC   <id> <arrival> <burst> <priority> <queue>
 *
 * Rules:
 *   - Queue 1 has the highest priority; lower queues run only when all higher ones are empty.
 *   - preemptive=1: a newly ready process in a higher queue preempts a running lower-queue process.
 *   - preemptive=0: a running process is only switched out at the end of its Round Robin slice or on completion.
 *   - PRIORITY policy: lower number = higher priority (non-preemptive within the queue).
 *   - Time is simulated in 1-unit steps. Context-switch cost is ignored.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define MAX_P 100
#define MAX_Q 5
#define MAX_SEG 120000
#define MAX_T 200000

typedef enum { FCFS, RR, PRIO } Policy;

typedef struct {
    char id[16];
    int at, bt, pr, q;
    int rem, start, ct, tat, wt, rt, queued;
} Proc;

typedef struct { int pid, s, e; } Seg;
typedef struct { Policy pol; int quantum; int items[MAX_P]; int n; } Queue;

static Proc procs[MAX_P];
static Queue qs[MAX_Q];
static Seg segs[MAX_SEG];
static int nproc = 0, nq = 0, nseg = 0, preemptive = 0;
static int order[MAX_P];

static void fail(const char *msg) {
    printf("{\"error\":\"%s\"}\n", msg);
    exit(1);
}

static void q_push_back(int q, int p)  { qs[q].items[qs[q].n++] = p; }
static void q_push_front(int q, int p) {
    memmove(&qs[q].items[1], &qs[q].items[0], sizeof(int) * qs[q].n);
    qs[q].items[0] = p;
    qs[q].n++;
}
static int q_remove_at(int q, int pos) {
    int p = qs[q].items[pos];
    memmove(&qs[q].items[pos], &qs[q].items[pos + 1], sizeof(int) * (qs[q].n - pos - 1));
    qs[q].n--;
    return p;
}

static void add_seg(int pid, int s, int e) {
    if (nseg > 0 && segs[nseg - 1].pid == pid && segs[nseg - 1].e == s) { segs[nseg - 1].e = e; return; }
    if (nseg >= MAX_SEG) fail("Timeline too long");
    segs[nseg].pid = pid; segs[nseg].s = s; segs[nseg].e = e; nseg++;
}

static void admit_arrivals(int t) {
    for (int k = 0; k < nproc; k++) {
        int i = order[k];
        if (!procs[i].queued && procs[i].at <= t) { procs[i].queued = 1; q_push_back(procs[i].q, i); }
    }
}

/* pick the next process from queue q according to its policy; returns queue position */
static int select_pos(int q) {
    if (qs[q].pol != PRIO) return 0;
    int best = 0;
    for (int k = 1; k < qs[q].n; k++) {
        Proc *a = &procs[qs[q].items[k]], *b = &procs[qs[q].items[best]];
        if (a->pr < b->pr || (a->pr == b->pr && a->at < b->at)) best = k;
    }
    return best;
}

static const char *pol_name(Policy p) { return p == FCFS ? "FCFS" : p == RR ? "RR" : "PRIORITY"; }

static int cmp_arrival(const void *x, const void *y) {
    int a = *(const int *)x, b = *(const int *)y;
    if (procs[a].at != procs[b].at) return procs[a].at - procs[b].at;
    return a - b;
}

int main(void) {
    char cmd[32];
    int defined[MAX_Q] = {0};

    while (scanf("%31s", cmd) == 1) {
        if (!strcmp(cmd, "CONFIG")) {
            if (scanf("%d %d", &nq, &preemptive) != 2 || nq < 1 || nq > MAX_Q) fail("Number of queues must be 1 to 5");
        } else if (!strcmp(cmd, "QUEUE")) {
            int idx, quantum; char pol[16];
            if (scanf("%d %15s %d", &idx, pol, &quantum) != 3 || idx < 1 || idx > MAX_Q) fail("Invalid queue definition");
            Queue *q = &qs[idx - 1];
            if (!strcmp(pol, "FCFS")) q->pol = FCFS;
            else if (!strcmp(pol, "RR")) q->pol = RR;
            else if (!strcmp(pol, "PRIORITY")) q->pol = PRIO;
            else fail("Unknown scheduling policy");
            if (q->pol == RR && quantum < 1) fail("Round Robin quantum must be at least 1");
            q->quantum = quantum; q->n = 0; defined[idx - 1] = 1;
        } else if (!strcmp(cmd, "PROC")) {
            if (nproc >= MAX_P) fail("Too many processes (max 100)");
            Proc *p = &procs[nproc];
            if (scanf("%15s %d %d %d %d", p->id, &p->at, &p->bt, &p->pr, &p->q) != 5) fail("Invalid process definition");
            for (char *c = p->id; *c; c++) if (!isalnum((unsigned char)*c) && *c != '_' && *c != '-') fail("Process IDs may only use letters, digits, - and _");
            if (p->at < 0 || p->bt < 1 || p->bt > 1000 || p->at > 10000) fail("Arrival must be >= 0 and burst between 1 and 1000");
            if (p->q < 1) fail("Queue number must be at least 1");
            p->q--; p->rem = p->bt; p->start = -1; p->queued = 0;
            for (int j = 0; j < nproc; j++) if (!strcmp(procs[j].id, p->id)) fail("Duplicate process ID");
            nproc++;
        } else fail("Unknown command");
    }

    if (nq == 0) fail("Missing CONFIG");
    if (nproc == 0) fail("Add at least one process");
    for (int i = 0; i < nq; i++) if (!defined[i]) fail("Every queue needs a policy");
    for (int i = 0; i < nproc; i++) if (procs[i].q >= nq) fail("Process refers to a queue that does not exist");

    for (int i = 0; i < nproc; i++) order[i] = i;
    qsort(order, nproc, sizeof(int), cmp_arrival);

    int t = 0, done = 0, running = -1, slice = 0, busy = 0;

    while (done < nproc) {
        if (t > MAX_T) fail("Simulation exceeded time limit");
        admit_arrivals(t);

        if (running != -1 && preemptive) {
            for (int h = 0; h < procs[running].q; h++) {
                if (qs[h].n > 0) { q_push_front(procs[running].q, running); running = -1; break; }
            }
        }
        if (running == -1) {
            for (int q = 0; q < nq; q++) {
                if (qs[q].n > 0) {
                    running = q_remove_at(q, select_pos(q));
                    slice = 0;
                    if (procs[running].start < 0) procs[running].start = t;
                    break;
                }
            }
        }
        if (running == -1) { add_seg(-1, t, t + 1); t++; continue; }

        add_seg(running, t, t + 1);
        procs[running].rem--; slice++; busy++; t++;
        admit_arrivals(t);

        if (procs[running].rem == 0) {
            procs[running].ct = t; done++; running = -1;
        } else if (qs[procs[running].q].pol == RR && slice >= qs[procs[running].q].quantum) {
            q_push_back(procs[running].q, running); running = -1;
        }
    }

    double sum_wt = 0, sum_tat = 0, sum_rt = 0;
    for (int i = 0; i < nproc; i++) {
        Proc *p = &procs[i];
        p->tat = p->ct - p->at; p->wt = p->tat - p->bt; p->rt = p->start - p->at;
        sum_wt += p->wt; sum_tat += p->tat; sum_rt += p->rt;
    }

    printf("{\"preemptive\":%s,\"queues\":[", preemptive ? "true" : "false");
    for (int i = 0; i < nq; i++)
        printf("%s{\"queue\":%d,\"policy\":\"%s\",\"quantum\":%d}", i ? "," : "", i + 1, pol_name(qs[i].pol), qs[i].quantum);
    printf("],\"processes\":[");
    for (int i = 0; i < nproc; i++) {
        Proc *p = &procs[i];
        printf("%s{\"id\":\"%s\",\"arrival\":%d,\"burst\":%d,\"priority\":%d,\"queue\":%d,"
               "\"completion\":%d,\"turnaround\":%d,\"waiting\":%d,\"response\":%d}",
               i ? "," : "", p->id, p->at, p->bt, p->pr, p->q + 1, p->ct, p->tat, p->wt, p->rt);
    }
    printf("],\"gantt\":[");
    for (int i = 0; i < nseg; i++) {
        if (segs[i].pid < 0) printf("%s{\"id\":\"IDLE\",\"queue\":0,\"start\":%d,\"end\":%d}", i ? "," : "", segs[i].s, segs[i].e);
        else printf("%s{\"id\":\"%s\",\"queue\":%d,\"start\":%d,\"end\":%d}", i ? "," : "", procs[segs[i].pid].id, procs[segs[i].pid].q + 1, segs[i].s, segs[i].e);
    }
    printf("],\"summary\":{\"avgWaiting\":%.2f,\"avgTurnaround\":%.2f,\"avgResponse\":%.2f,"
           "\"totalTime\":%d,\"cpuUtilization\":%.2f,\"throughput\":%.3f}}\n",
           sum_wt / nproc, sum_tat / nproc, sum_rt / nproc, t, 100.0 * busy / t, (double)nproc / t);
    return 0;
}
