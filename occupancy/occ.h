/*
 * Occupancy graph of the full 8x4 Switchback board, in C for speed.
 *
 * A node is which of the 32 holes are filled (a 32-bit mask, bit = row*4+slot).
 * An edge is one tilt under one slider setting. Slides never change a row's
 * contents, so between tilts the sliders can be set freely: all 256 settings
 * are available from every node.
 *
 * A tilt never changes a marble's column, and within a column's connected run
 * of holes it packs the marbles to one end, in order. So a tilt is, per run,
 * "count the marbles, put that many at the far end" — a table lookup.
 * occ_selftest() checks this against the engine's reference output.
 */
#include <stdint.h>
#include <string.h>

#define ROWS 8
#define SLOTS 4
#define CELLS 32
#define MARBLES 24
#define NSET 256

typedef struct {
  int nchain;
  uint32_t chained;           /* every cell that lies on some run of length >= 2 */
  uint32_t mask[9 * 2];       /* run cells */
  int len[9 * 2];
  int cell[9 * 2][ROWS];      /* run cells in row order, top to bottom */
  uint32_t pack[2][9 * 2][ROWS + 1]; /* [dir][run][count]: 0 = up, 1 = down */
} Setting;

static Setting SET[NSET];
static int UNIQUE[NSET], NUNIQUE;   /* settings with distinct run structure */

static int column_of(int row, int slot, int shift) { return 2 * slot + (row & 1) + shift; }

static void occ_init(void) {
  for (int s = 0; s < NSET; s++) {
    Setting *S = &SET[s];
    memset(S, 0, sizeof *S);
    for (int c = 0; c < 9; c++) {
      int run[ROWS], n = 0;
      for (int r = 0; r <= ROWS; r++) {
        int idx = -1;
        if (r < ROWS)
          for (int j = 0; j < SLOTS; j++)
            if (column_of(r, j, (s >> r) & 1) == c) idx = r * SLOTS + j;
        if (idx >= 0) { run[n++] = idx; continue; }
        if (n >= 2) {
          int k = S->nchain++;
          S->len[k] = n;
          for (int i = 0; i < n; i++) { S->cell[k][i] = run[i]; S->mask[k] |= 1u << run[i]; }
          S->chained |= S->mask[k];
          for (int cnt = 0; cnt <= n; cnt++) {
            uint32_t u = 0, d = 0;
            for (int i = 0; i < cnt; i++) { u |= 1u << run[i]; d |= 1u << run[n - 1 - i]; }
            S->pack[0][k][cnt] = u; S->pack[1][k][cnt] = d;
          }
        }
        n = 0;
      }
    }
  }
  NUNIQUE = 0;
  for (int s = 0; s < NSET; s++) {
    int dup = 0;
    for (int u = 0; u < NUNIQUE && !dup; u++) {
      Setting *A = &SET[s], *B = &SET[UNIQUE[u]];
      if (A->nchain != B->nchain || A->chained != B->chained) continue;
      int same = 1;
      for (int k = 0; k < A->nchain && same; k++) {
        int found = 0;
        for (int m = 0; m < B->nchain; m++) if (A->mask[k] == B->mask[m]) found = 1;
        same = found;
      }
      dup = same;
    }
    if (!dup) UNIQUE[NUNIQUE++] = s;
  }
}

static inline uint32_t occ_tilt(uint32_t x, int s, int down) {
  const Setting *S = &SET[s];
  uint32_t r = x & ~S->chained;
  for (int k = 0; k < S->nchain; k++)
    r |= S->pack[down][k][__builtin_popcount(x & S->mask[k])];
  return r;
}

/* Where each marble goes: dest[cell] for every filled cell (order within a run is kept). */
static void occ_tilt_perm(uint32_t x, int s, int down, int dest[CELLS]) {
  const Setting *S = &SET[s];
  for (int i = 0; i < CELLS; i++) dest[i] = i;
  for (int k = 0; k < S->nchain; k++) {
    int n = S->len[k], src[ROWS], m = 0;
    for (int i = 0; i < n; i++) if (x >> S->cell[k][i] & 1) src[m++] = S->cell[k][i];
    for (int i = 0; i < m; i++)
      dest[src[i]] = down ? S->cell[k][n - m + i] : S->cell[k][i];
  }
}

/* Rank of a 24-of-32 mask by its 8 empty holes, in the combinatorial number system. */
#define NNODES 10518300u
static uint32_t BINOM[33][9];
static void binom_init(void) {
  for (int n = 0; n <= 32; n++) for (int k = 0; k <= 8; k++)
    BINOM[n][k] = k == 0 ? 1 : n == 0 ? 0 : BINOM[n - 1][k - 1] + BINOM[n - 1][k];
}
static inline uint32_t occ_rank(uint32_t x) {
  uint32_t e = ~x, r = 0; int i = 1;
  while (e) { int p = __builtin_ctz(e); r += BINOM[p][i++]; e &= e - 1; }
  return r;
}
static inline uint32_t occ_unrank(uint32_t r) {
  uint32_t e = 0;
  for (int i = 8; i >= 1; i--) {
    int p = i - 1;
    while (BINOM[p + 1][i] <= r) p++;
    r -= BINOM[p][i]; e |= 1u << p;
  }
  return ~e;
}

static uint32_t occ_parse(const char *code) {
  uint32_t x = 0;
  for (int i = 0; i < CELLS; i++) if (code[i] != '0') x |= 1u << i;
  return x;
}
