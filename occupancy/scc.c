/*
 * Strongly connected components of the full-board occupancy graph.
 *
 *   scc <hole pattern codes...>
 *
 * Iterative Tarjan over all 10,518,300 hole patterns, with successors
 * regenerated on the fly (the edge list would not fit in memory). Prints the
 * component structure and, for each code given, which component it lies in.
 */
#include <stdio.h>
#include <stdlib.h>
#include "occ.h"

#define NONE 0xffffffffu
static uint32_t *IDX, *LOW, *STK; static uint8_t *ON;

int main(int argc, char **argv) {
  occ_init(); binom_init();
  IDX = malloc(4ull * NNODES); LOW = malloc(4ull * NNODES);
  STK = malloc(4ull * NNODES); ON = calloc(NNODES, 1);
  uint32_t *fnode = malloc(4ull * NNODES); uint16_t *fit = malloc(2ull * NNODES);
  for (uint32_t i = 0; i < NNODES; i++) IDX[i] = NONE;
  uint32_t counter = 0, sp = 0, ncomp = 0;
  uint32_t *compsize = malloc(4ull * NNODES);
  const int NE = NUNIQUE * 2;

  for (uint32_t root = 0; root < NNODES; root++) {
    if (IDX[root] != NONE) continue;
    uint32_t fp = 0;
    fnode[fp] = root; fit[fp] = 0; fp++;
    IDX[root] = LOW[root] = counter++; STK[sp++] = root; ON[root] = 1;
    while (fp) {
      uint32_t v = fnode[fp - 1];
      if (fit[fp - 1] < NE) {
        int e = fit[fp - 1]++;
        uint32_t x = occ_unrank(v);
        uint32_t y = occ_tilt(x, UNIQUE[e >> 1], e & 1);
        if (y == x) continue;
        uint32_t w = occ_rank(y);
        if (IDX[w] == NONE) {
          IDX[w] = LOW[w] = counter++; STK[sp++] = w; ON[w] = 1;
          fnode[fp] = w; fit[fp] = 0; fp++;
        } else if (ON[w] && IDX[w] < LOW[v]) LOW[v] = IDX[w];
      } else {
        fp--;
        if (fp && LOW[v] < LOW[fnode[fp - 1]]) LOW[fnode[fp - 1]] = LOW[v];
        if (LOW[v] == IDX[v]) {
          uint32_t w, n = 0;
          do { w = STK[--sp]; ON[w] = 0; IDX[w] = ncomp; n++; } while (w != v);
          /* IDX now holds the component id; mark as finished with ON = 2. */
          compsize[ncomp++] = n;
        }
      }
    }
  }
  /* IDX[w] was overwritten with component ids as components closed, which is
     safe: a closed node is never on the stack again, and Tarjan only compares
     IDX of nodes that are on the stack. */
  uint32_t giant = 0;
  for (uint32_t c = 0; c < ncomp; c++) if (compsize[c] > compsize[giant]) giant = c;

  /* In-degree, outgoing edges per component, and whether the giant leaks. */
  uint8_t *hasin = calloc(NNODES, 1), *compin = calloc(ncomp, 1), *compout = calloc(ncomp, 1);
  uint64_t giantleak = 0;
  for (uint32_t v = 0; v < NNODES; v++) {
    uint32_t x = occ_unrank(v);
    for (int e = 0; e < NE; e++) {
      uint32_t y = occ_tilt(x, UNIQUE[e >> 1], e & 1);
      if (y == x) continue;
      uint32_t w = occ_rank(y);
      hasin[w] = 1;
      if (IDX[w] != IDX[v]) { compout[IDX[v]] = 1; compin[IDX[w]] = 1; if (IDX[v] == giant) giantleak++; }
    }
  }
  uint32_t eden = 0, sources = 0, sinks = 0, singletons = 0;
  for (uint32_t v = 0; v < NNODES; v++) if (!hasin[v]) eden++;
  for (uint32_t c = 0; c < ncomp; c++) {
    if (!compin[c]) sources++;
    if (!compout[c]) sinks++;
    if (compsize[c] == 1) singletons++;
  }
  printf("nodes %u\ncomponents %u\ngiant %u\ngiant_leaks %llu\n", NNODES, ncomp, compsize[giant],
         (unsigned long long)giantleak);
  printf("singletons %u\nsources %u\nsinks %u\nno_predecessor %u\n", singletons, sources, sinks, eden);
  /* size histogram of the non-giant components */
  uint32_t hist[16] = {0};
  for (uint32_t c = 0; c < ncomp; c++) if (c != giant) {
    int b = 0; uint32_t s = compsize[c]; while (s > 1) { s >>= 1; b++; } hist[b]++;
  }
  for (int b = 0; b < 16; b++) if (hist[b]) printf("small_components_size_%u_to_%u %u\n", 1u << b, (2u << b) - 1, hist[b]);
  for (int a = 1; a < argc; a++) {
    uint32_t v = occ_rank(occ_parse(argv[a]));
    printf("pattern %s component %u size %u giant %d has_predecessor %d\n", argv[a], IDX[v],
           compsize[IDX[v]], IDX[v] == giant, hasin[v]);
  }
  return 0;
}
