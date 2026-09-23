/* Level sizes of forward and backward BFS from a hole pattern. */
#include <stdio.h>
#include <stdlib.h>
#include "occ.h"
static uint8_t *seenF, *seenB;
static uint32_t *q1, *q2;
/* enumerate predecessors of y under (s,d): same per-run counts, not packed. */
static uint64_t npred;
static void unpack(const Setting *S, int k, uint32_t base, uint32_t y, int s, int d, void (*cb)(uint32_t)) {
  if (k == S->nchain) { if (base != y) cb(base); return; }
  int n = S->len[k], c = __builtin_popcount(y & S->mask[k]);
  if (c == 0 || c == n) { unpack(S, k + 1, base | (y & S->mask[k]), y, s, d, cb); return; }
  for (uint32_t m = 0; m < (1u << n); m++) if (__builtin_popcount(m) == c) {
    uint32_t b = 0; for (int i = 0; i < n; i++) if (m >> i & 1) b |= 1u << S->cell[k][i];
    unpack(S, k + 1, base | b, y, s, d, cb);
  }
}
static uint32_t *nq; static uint32_t nn;
static void addB(uint32_t x) { uint32_t r = occ_rank(x); npred++; if (!seenB[r]) { seenB[r] = 1; nq[nn++] = x; } }
int main(int argc, char **argv) {
  occ_init(); binom_init();
  seenF = calloc(NNODES, 1); seenB = calloc(NNODES, 1);
  q1 = malloc(4ull * NNODES); q2 = malloc(4ull * NNODES);
  uint32_t b = occ_parse(argv[1]);
  int depth = atoi(argv[2]);
  uint32_t n = 1; q1[0] = b; seenF[occ_rank(b)] = 1;
  printf("forward:");
  for (int d = 1; d <= depth && n; d++) {
    uint32_t m = 0;
    for (uint32_t i = 0; i < n; i++) for (int e = 0; e < NUNIQUE * 2; e++) {
      uint32_t y = occ_tilt(q1[i], UNIQUE[e >> 1], e & 1), r = occ_rank(y);
      if (!seenF[r]) { seenF[r] = 1; q2[m++] = y; }
    }
    uint32_t *t = q1; q1 = q2; q2 = t; n = m; printf(" %u", n); fflush(stdout);
  }
  printf("\nbackward:");
  n = 1; q1[0] = b; seenB[occ_rank(b)] = 1;
  for (int d = 1; d <= depth && n; d++) {
    nq = q2; nn = 0;
    for (uint32_t i = 0; i < n; i++) for (int s = 0; s < NSET; s++) for (int dd = 0; dd < 2; dd++)
      if (occ_tilt(q1[i], s, dd) == q1[i]) unpack(&SET[s], 0, q1[i] & ~SET[s].chained, q1[i], s, dd, addB);
    uint32_t *t = q1; q1 = q2; q2 = t; n = nn; printf(" %u", n); fflush(stdout);
  }
  uint32_t both = 0; for (uint32_t r = 0; r < NNODES; r++) both += seenF[r] && seenB[r];
  printf("\nin both: %u (pred enumerations %llu)\n", both, (unsigned long long)npred);
}
