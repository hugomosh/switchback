/*
 * Colour solver: route any board to a target by working on hole patterns.
 *
 *   groupsolve <target cells> [maxGenerators] < starts
 *
 * Every tilt moves each marble to a determined hole whatever its colour, so a
 * sequence of (slider setting, tilt) steps that leaves the target's hole
 * pattern and comes back to it rearranges the marbles by a fixed permutation.
 * Those loops compose, and a finite set of permutations closed under
 * composition is a group, so the colourings reachable at the target's hole
 * pattern are exactly an orbit of the group they generate.
 *
 *  1. Loops: forward and backward BFS around the target's hole pattern; every
 *     hole pattern found in both closes a loop. Distinct permutations become
 *     generators.
 *  2. Orbit: a shortest-path search over all C(24,12) colourings of the
 *     target's holes, run backwards from the target colouring. If it reaches
 *     all 2,704,156, every colouring there can be turned into the target: this
 *     is the proof that colour is no obstacle for this target.
 *  3. Routes: for each start, a path of hole patterns onto the target's (BFS
 *     until it meets the backward region), then the loops the orbit search
 *     picked to fix the colours.
 *
 * Prints, per start line, the primitive moves in the app's alphabet (slides
 * as row digits 1-8, tilts U/D), or FAIL. Every route is replayed through the
 * JS engine by the caller before it is trusted.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "occ.h"

#define UNSEEN 255
#define NCOL 2704156u
static uint8_t *bdist, *bset, *fdist, *fset;
static uint32_t *bnext, *fpar;
static uint32_t BIN24[25][13];

/* ---------- backward BFS over hole patterns ---------- */
static uint32_t *nq; static uint32_t nn, curY; static int curS, curD, curDepth;
static uint8_t *bdir;
static void addB2(uint32_t x) {
  uint32_t r = occ_rank(x);
  if (bdist[r] != UNSEEN) return;
  bdist[r] = curDepth; bnext[r] = curY; bset[r] = curS; bdir[r] = curD;
  nq[nn++] = x;
}
static void unpack(const Setting *S, int k, uint32_t base, uint32_t y) {
  if (k == S->nchain) { if (base != y) addB2(base); return; }
  int n = S->len[k], c = __builtin_popcount(y & S->mask[k]);
  if (c == 0 || c == n) { unpack(S, k + 1, base | (y & S->mask[k]), y); return; }
  for (uint32_t m = 0; m < (1u << n); m++) if (__builtin_popcount(m) == c) {
    uint32_t b = 0; for (int i = 0; i < n; i++) if (m >> i & 1) b |= 1u << S->cell[k][i];
    unpack(S, k + 1, base | b, y);
  }
}

/* ---------- steps and emission ---------- */
typedef struct { uint32_t x; uint8_t s, d; } Step;   /* tilt x under setting s, direction d */

/* Primitive moves for a step list, choosing for each tilt the slider setting
   closest to the current one that has exactly the same effect. */
static int emit(const Step *st, int n, int *shift, char *out, uint8_t *colours) {
  int len = 0;
  for (int i = 0; i < n; i++) {
    int want[CELLS], got[CELLS];
    occ_tilt_perm(st[i].x, st[i].s, st[i].d, want);
    int best = st[i].s, bestc = 99;
    for (int s = 0; s < NSET; s++) {
      int c = __builtin_popcount(s ^ *shift);
      if (c >= bestc) continue;
      occ_tilt_perm(st[i].x, s, st[i].d, got);
      int same = 1;
      for (int j = 0; j < CELLS && same; j++) if (st[i].x >> j & 1) same = want[j] == got[j];
      if (same) { best = s; bestc = c; }
    }
    for (int r = 0; r < ROWS; r++) if ((best ^ *shift) >> r & 1) { if (out) out[len] = '1' + r; len++; }
    *shift = best;
    if (out) out[len] = st[i].d ? 'D' : 'U';
    len++;
    if (colours) {
      uint8_t nc[CELLS]; memset(nc, 0, CELLS);
      for (int j = 0; j < CELLS; j++) if (st[i].x >> j & 1) nc[want[j]] = colours[j];
      memcpy(colours, nc, CELLS);
    }
  }
  return len;
}
static int to_rest(int *shift, char *out) {
  int len = 0;
  for (int r = 0; r < ROWS; r++) if (*shift >> r & 1) { if (out) out[len] = '1' + r; len++; }
  *shift = 0; return len;
}

/* ---------- colourings of the target's 24 holes ---------- */
static inline uint32_t col_rank(uint32_t c) {
  uint32_t r = 0; int i = 1;
  while (c) { int p = __builtin_ctz(c); r += BIN24[p][i++]; c &= c - 1; }
  return r;
}
static inline uint32_t col_unrank(uint32_t r) {
  uint32_t c = 0;
  for (int i = 12; i >= 1; i--) {
    int p = i - 1; while (BIN24[p + 1][i] <= r) p++;
    r -= BIN24[p][i]; c |= 1u << p;
  }
  return c;
}

typedef struct { int nsteps; Step *st; uint8_t perm[MARBLES]; int cost; uint32_t T[3][256], I[3][256]; } Loop;
static int loop_cmp(const void *a, const void *b) { return ((const Loop *)a)->cost - ((const Loop *)b)->cost; }
static inline uint32_t apply(const uint32_t T[3][256], uint32_t c) {
  return T[0][c & 255] | T[1][c >> 8 & 255] | T[2][c >> 16];
}

int main(int argc, char **argv) {
  occ_init(); binom_init();
  for (int n = 0; n <= 24; n++) for (int k = 0; k <= 12; k++)
    BIN24[n][k] = k == 0 ? 1 : n == 0 ? 0 : BIN24[n - 1][k - 1] + BIN24[n - 1][k];
  const char *tcode = argv[1];
  int maxGen = argc > 2 ? atoi(argv[2]) : 600;
  uint32_t B = occ_parse(tcode), rB = occ_rank(B);
  int hole[MARBLES], idxOf[CELLS], h = 0;
  for (int i = 0; i < CELLS; i++) { idxOf[i] = -1; if (B >> i & 1) { idxOf[i] = h; hole[h++] = i; } }
  uint32_t targetCol = 0;
  for (int i = 0; i < MARBLES; i++) if (tcode[hole[i]] == '1') targetCol |= 1u << i;

  bdist = malloc(NNODES); bset = malloc(NNODES); bdir = malloc(NNODES); bnext = malloc(4ull * NNODES);
  fdist = malloc(NNODES); fset = malloc(NNODES); fpar = malloc(4ull * NNODES);
  uint8_t *fdir = malloc(NNODES);
  memset(bdist, UNSEEN, NNODES); memset(fdist, UNSEEN, NNODES);
  uint32_t *q1 = malloc(4ull * NNODES), *q2 = malloc(4ull * NNODES);

  /* backward region: grow until it holds ~1.5M hole patterns */
  uint32_t n = 1, total = 1; q1[0] = B; bdist[rB] = 0; int bdepth = 0;
  while (n && total < 1500000 && bdepth < 6) {
    nq = q2; nn = 0; curDepth = ++bdepth;
    for (uint32_t i = 0; i < n; i++) for (int s = 0; s < NSET; s++) for (int d = 0; d < 2; d++)
      if (occ_tilt(q1[i], s, d) == q1[i]) { curY = q1[i]; curS = s; curD = d; unpack(&SET[s], 0, q1[i] & ~SET[s].chained, q1[i]); }
    uint32_t *t = q1; q1 = q2; q2 = t; n = nn; total += n;
  }
  /* forward region, three tilts deep */
  n = 1; q1[0] = B; fdist[rB] = 0; int fdepth = 3;
  for (int dd = 1; dd <= fdepth; dd++) {
    uint32_t m = 0;
    for (uint32_t i = 0; i < n; i++) for (int e = 0; e < NUNIQUE * 2; e++) {
      int s = UNIQUE[e >> 1], d = e & 1;
      uint32_t y = occ_tilt(q1[i], s, d), r = occ_rank(y);
      if (fdist[r] == UNSEEN) { fdist[r] = dd; fpar[r] = q1[i]; fset[r] = s; fdir[r] = d; q2[m++] = y; }
    }
    uint32_t *t = q1; q1 = q2; q2 = t; n = m;
  }

  /* loops through every hole pattern in both regions */
  int cap = 1 << 16, nloops = 0;
  Loop *L = malloc(sizeof(Loop) * cap);
  Step path[64];
  for (uint32_t r = 0; r < NNODES; r++) {
    if (r == rB || fdist[r] == UNSEEN || bdist[r] == UNSEEN) continue;
    int k = fdist[r], len = 0;
    uint32_t v = r;
    for (int i = k - 1; i >= 0; i--) { path[i].x = fpar[v]; path[i].s = fset[v]; path[i].d = fdir[v]; v = occ_rank(fpar[v]); }
    len = k;
    uint32_t x = occ_unrank(r);
    while (x != B) { uint32_t q = occ_rank(x); path[len].x = x; path[len].s = bset[q]; path[len].d = bdir[q]; len++; x = bnext[q]; }
    /* permutation of the 24 marbles */
    uint8_t lab[CELLS]; memset(lab, 0xff, CELLS);
    for (int i = 0; i < MARBLES; i++) lab[hole[i]] = i;
    for (int i = 0; i < len; i++) {
      int dest[CELLS]; occ_tilt_perm(path[i].x, path[i].s, path[i].d, dest);
      uint8_t nl[CELLS]; memset(nl, 0xff, CELLS);
      for (int j = 0; j < CELLS; j++) if (path[i].x >> j & 1) nl[dest[j]] = lab[j];
      memcpy(lab, nl, CELLS);
    }
    Loop lp; lp.nsteps = len;
    int ident = 1;
    for (int j = 0; j < CELLS; j++) if (lab[j] != 0xff) { lp.perm[lab[j]] = idxOf[j]; if (lab[j] != idxOf[j]) ident = 0; }
    if (ident) continue;
    int dup = -1;
    for (int i = 0; i < nloops && dup < 0; i++) if (!memcmp(L[i].perm, lp.perm, MARBLES)) dup = i;
    int shift = 0;
    lp.cost = emit(path, len, &shift, NULL, NULL); lp.cost += to_rest(&shift, NULL);
    if (dup >= 0) { if (L[dup].cost <= lp.cost) continue; free(L[dup].st); L[dup] = L[--nloops]; }
    if (nloops == cap) break;
    lp.st = malloc(sizeof(Step) * len); memcpy(lp.st, path, sizeof(Step) * len);
    L[nloops++] = lp;
  }
  qsort(L, nloops, sizeof(Loop), loop_cmp);
  /* Generators: the cheapest loops alone can all live in a small subgroup
     (they tend to stir only the holes nearest the gaps), so half are the
     cheapest and half are spread evenly over the rest. If the orbit is not
     complete, double the count and search again, up to every loop found. */
  uint16_t *cdist = malloc(2ull * NCOL); uint16_t *cgen = malloc(2ull * NCOL);
  uint32_t reached = 0; int maxdist = 0, ngen = 0;
  for (int want = maxGen < nloops ? maxGen : nloops;; want = want * 2 < nloops ? want * 2 : nloops) {
    int cheap = want / 2, rest = nloops - cheap, spread = want - cheap;
    for (int k = 0; k < spread; k++) {          /* move the sampled loops up behind the cheap ones */
      int from = cheap + (int)((long long)k * rest / spread);
      Loop t = L[cheap + k]; L[cheap + k] = L[from]; L[from] = t;
    }
    ngen = want;
    for (int g = 0; g < ngen; g++) {
      memset(L[g].T, 0, sizeof L[g].T); memset(L[g].I, 0, sizeof L[g].I);
      for (int b = 0; b < 3; b++) for (int v = 0; v < 256; v++)
        for (int i = 0; i < 8; i++) if (v >> i & 1) {
          L[g].T[b][v] |= 1u << L[g].perm[b * 8 + i];
        }
      /* inverse: marble at index perm[i] came from i */
      uint8_t inv[MARBLES]; for (int i = 0; i < MARBLES; i++) inv[L[g].perm[i]] = i;
      for (int b = 0; b < 3; b++) for (int v = 0; v < 256; v++)
        for (int i = 0; i < 8; i++) if (v >> i & 1) L[g].I[b][v] |= 1u << inv[b * 8 + i];
    }

    /* orbit search, backwards from the target colouring, by move count (Dial) */
    for (uint32_t i = 0; i < NCOL; i++) cdist[i] = 0xffff;
    int maxc = 0; for (int g = 0; g < ngen; g++) if (L[g].cost > maxc) maxc = L[g].cost;
    int nb = maxc + 1;
    uint32_t **bucket = malloc(sizeof(uint32_t *) * nb); uint32_t *bn = calloc(nb, 4), *bc = malloc(4 * nb);
    for (int i = 0; i < nb; i++) { bc[i] = 1024; bucket[i] = malloc(4 * 1024); }
    uint32_t t0 = col_rank(targetCol); cdist[t0] = 0; cgen[t0] = 0xffff;
    bucket[0][bn[0]++] = targetCol;
    reached = 0; maxdist = 0;
    for (int d = 0, empty = 0; empty < nb; d++) {
      int bi = d % nb;
      if (!bn[bi]) { empty++; continue; }
      empty = 0;
      while (bn[bi]) {
        uint32_t c = bucket[bi][--bn[bi]], rc = col_rank(c);
        if (cdist[rc] != d) continue;
        reached++; maxdist = d;
        for (int g = 0; g < ngen; g++) {
          uint32_t p = apply(L[g].I, c), rp = col_rank(p);   /* applying g to p gives c */
          int nd = d + L[g].cost;
          if (nd < cdist[rp]) {
            cdist[rp] = nd; cgen[rp] = g;
            int b2 = nd % nb;
            if (bn[b2] == bc[b2]) { bc[b2] *= 2; bucket[b2] = realloc(bucket[b2], 4ull * bc[b2]); }
            bucket[b2][bn[b2]++] = p;
          }
        }
      }
    }

    if (reached == NCOL || ngen == nloops) break;
    fprintf(stderr, "  %d generators give an orbit of %u; retrying with more\n", ngen, reached);
    qsort(L, nloops, sizeof(Loop), loop_cmp);
  }
  fprintf(stderr, "target %s: backward depth %d (%u patterns), %d distinct loops, %d generators, "
          "orbit %u of %u colourings, farthest %d moves\n",
          tcode, bdepth, total, nloops, ngen, reached, NCOL, maxdist);
  printf("ORBIT %u %u %d %d\n", reached, NCOL, nloops, maxdist);

  /* routes */
  uint32_t *vis = calloc(NNODES, 4), stamp = 0;
  uint32_t *par = malloc(4ull * NNODES); uint8_t *ps = malloc(NNODES), *pd = malloc(NNODES);
  char line[128];
  static char out[1 << 20];
  Step *steps = malloc(sizeof(Step) * 100000);
  while (scanf("%127s", line) == 1) {
    stamp++;
    uint8_t colours[CELLS]; int shift = 0;
    for (int i = 0; i < CELLS; i++) colours[i] = line[i] - '0';
    for (int r = 0; r < ROWS; r++) if (line[33 + r] == '1') shift |= 1 << r;
    uint32_t A = occ_parse(line), rA = occ_rank(A);
    /* hole-pattern route: forward BFS from A until it meets the backward region */
    
    
    uint32_t hit = 0xffffffffu;
    if (bdist[rA] != UNSEEN) hit = A;
    uint32_t n1 = 1; q1[0] = A; vis[rA] = stamp;
    while (hit == 0xffffffffu && n1) {
      uint32_t m = 0;
      for (uint32_t i = 0; i < n1 && hit == 0xffffffffu; i++) for (int e = 0; e < NUNIQUE * 2; e++) {
        int s = UNIQUE[e >> 1], d = e & 1;
        uint32_t y = occ_tilt(q1[i], s, d), r = occ_rank(y);
        if (vis[r] == stamp) continue;
        vis[r] = stamp; par[r] = q1[i]; ps[r] = s; pd[r] = d; q2[m++] = y;
        if (bdist[r] != UNSEEN) { hit = y; break; }
      }
      uint32_t *t = q1; q1 = q2; q2 = t; n1 = m;
    }
    if (hit == 0xffffffffu) { printf("FAIL no-path\n"); fflush(stdout); continue; }
    int ns = 0;
    for (uint32_t v = hit; v != A;) { uint32_t r = occ_rank(v); steps[ns].x = par[r]; steps[ns].s = ps[r]; steps[ns].d = pd[r]; ns++; v = par[r]; }
    for (int i = 0; i < ns / 2; i++) { Step t = steps[i]; steps[i] = steps[ns - 1 - i]; steps[ns - 1 - i] = t; }
    for (uint32_t x = hit; x != B;) { uint32_t r = occ_rank(x); steps[ns].x = x; steps[ns].s = bset[r]; steps[ns].d = bdir[r]; ns++; x = bnext[r]; }
    int len = emit(steps, ns, &shift, out, colours);
    /* colour fix-up by loops */
    uint32_t c = 0;
    for (int i = 0; i < MARBLES; i++) if (colours[hole[i]] == 1) c |= 1u << i;
    int ok = 1;
    for (int guard = 0; c != targetCol; guard++) {
      uint32_t rc = col_rank(c);
      if (cdist[rc] == 0xffff || guard > 100000) { ok = 0; break; }
      Loop *lp = &L[cgen[rc]];
      len += emit(lp->st, lp->nsteps, &shift, out + len, colours);
      c = apply(lp->T, c);
    }
    len += to_rest(&shift, out + len);
    out[len] = 0;
    if (!ok) printf("FAIL colour-orbit\n"); else printf("%s\n", out);
    fflush(stdout);
  }
  return 0;
}
