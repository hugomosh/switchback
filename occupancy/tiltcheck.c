/* Reads "cells shifts dir" lines, prints the tilted cells, for comparison with engine.mjs. */
#include <stdio.h>
#include "occ.h"
int main(void) {
  occ_init(); binom_init();
  char cells[64], shifts[16], dir[8];
  while (scanf("%63s %15s %7s", cells, shifts, dir) == 3) {
    int s = 0; for (int r = 0; r < ROWS; r++) if (shifts[r] == '1') s |= 1 << r;
    int down = dir[0] == 'd', dest[CELLS];
    uint32_t x = 0; for (int i = 0; i < CELLS; i++) if (cells[i] != '0') x |= 1u << i;
    occ_tilt_perm(x, s, down, dest);
    char out[CELLS + 1]; for (int i = 0; i < CELLS; i++) out[i] = '0'; out[CELLS] = 0;
    for (int i = 0; i < CELLS; i++) if (x >> i & 1) out[dest[i]] = cells[i];
    uint32_t y = occ_tilt(x, s, down), z = 0;
    for (int i = 0; i < CELLS; i++) if (out[i] != '0') z |= 1u << i;
    if (y != z || occ_unrank(occ_rank(x)) != x) { printf("INCONSISTENT\n"); return 1; }
    printf("%s\n", out);
  }
  printf("unique settings %d\n", NUNIQUE);
  return 0;
}
