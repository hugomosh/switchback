/**
 * Pattern-to-pattern solutions, as a sparse matrix keyed "from>to".
 *
 * GENERATED FILE — produced by gen_solutions.mjs from results/solutions.json,
 * which sweep.mjs writes. Every solved entry was replayed through the engine
 * and landed on its target before it was stored. Moves use the replay alphabet:
 * slides 1-8, tilts U and D.
 *
 * Solver settings for these runs: {"beamWidth":900,"maxStates":250000,"restarts":2,"maxDepth":400,"perimeter":{"depth":9,"maxStates":200000}}
 */

/**
 * Patterns no other marble arrangement can reach. Proved by searching backwards:
 * their backward region is exactly their own 256 slider settings.
 */
export const SEALED = [2,5];

export const SOLUTIONS = [
 {
  "from": 0,
  "to": 1,
  "solved": true,
  "source": "hand",
  "length": 260,
  "moves": "6U47D45D3D67U4D42D3U326D2768U672D674D768U8642D5U52D36547U657D6D4D5D45D35435D456U647U73U3D5456U53D3D345U4D324U451D2U2U4365D435U321D142D546U635U432U52D216U53D54U45352D2563D34D2354U3D435U23U4U43485678U875U78U674D67U67D767D567U54D67D6D5D67D8767467U45D54U45D54U45D5",
  "note": "the opening board to pattern 1"
 },
 {
  "from": 0,
  "to": 4,
  "solved": true,
  "source": "hand",
  "length": 495,
  "moves": "1312D21243U32D2545D45U7U853U435U57D87U87D8545767D3D38D4642U24U32D13D1D4313U2U23541D14D4U587U76D8D5D4656U87457U564321D45312U45467D767DU5U58D7D865D6758U765D675785D6U5U454D4D4567U8786567D54DU465U5764321D432175U7581U2U3213654U4U434U3578764D34U43D421D218D87U78D7D57U6787656D5D563U37D76D656U54321D43215U45321D643217854U45786463U43678U768676574D547D76U67D76U67D76D56U6D6D4U564U64524D2U6543216D56543217D674321D4536U65215U56D6878U75U5687D6784321D4D3D1234U2134212D12132U5678U5687323U34U45678D87653D4U32D24",
  "note": "the opening board to pattern 4"
 },
 {
  "from": 1,
  "to": 2,
  "solved": false,
  "source": "proof",
  "impossible": true,
  "reason": "no tilt can produce pattern 2; only its own slider settings reach it"
 },
 {
  "from": 2,
  "to": 3,
  "solved": false,
  "source": "solver",
  "best": 8
 },
 {
  "from": 3,
  "to": 4,
  "solved": false,
  "source": "solver",
  "best": 4
 },
 {
  "from": 4,
  "to": 5,
  "solved": false,
  "source": "proof",
  "impossible": true,
  "reason": "no tilt can produce pattern 5; only its own slider settings reach it"
 },
 {
  "from": 5,
  "to": 6,
  "solved": false,
  "source": "solver",
  "best": 6
 },
 {
  "from": 6,
  "to": 7,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 7,
  "to": 8,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 8,
  "to": 9,
  "solved": false,
  "source": "solver",
  "best": 3
 },
 {
  "from": 9,
  "to": 10,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 10,
  "to": 11,
  "solved": false,
  "source": "solver",
  "best": 8
 },
 {
  "from": 11,
  "to": 12,
  "solved": false,
  "source": "solver",
  "best": 6
 },
 {
  "from": 12,
  "to": 13,
  "solved": true,
  "source": "solver",
  "length": 222,
  "moves": "14U5D436D64D136U4U5U67D768U87D78U87D74D463D312U3U56U54D4D1234U467D768U6835D3214U1246U58D6834D41D3462U48U268U12D21U2U253D527U3U27156U54U4D5D563D32D23U34U43D4U3D42D23U32D24U3U3412D123U356U5D64D3D36D46132U31265U54D435U75U76D3"
 },
 {
  "from": 13,
  "to": 14,
  "solved": false,
  "source": "solver",
  "best": 8
 },
 {
  "from": 14,
  "to": 15,
  "solved": false,
  "source": "solver",
  "best": 6
 },
 {
  "from": 15,
  "to": 16,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 16,
  "to": 17,
  "solved": false,
  "source": "solver",
  "best": 11
 },
 {
  "from": 17,
  "to": 18,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 18,
  "to": 19,
  "solved": false,
  "source": "solver",
  "best": 7
 },
 {
  "from": 19,
  "to": 20,
  "solved": true,
  "source": "solver",
  "length": 173,
  "moves": "357D524U4D2D35D54U75U512U5U68U287D7D6D5D3D1368U87D78U87D7D46123U34D43U4U123487U76D67U7U87D8U7U87D6D675U6U6D6D6578U76D65U6U87D7D631D5314U435U368U87D7D6D53D312U2U12D1U23D2U231"
 },
 {
  "from": 20,
  "to": 21,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 21,
  "to": 22,
  "solved": false,
  "source": "solver",
  "best": 3
 },
 {
  "from": 22,
  "to": 23,
  "solved": false,
  "source": "solver",
  "best": 4
 },
 {
  "from": 23,
  "to": 24,
  "solved": false,
  "source": "solver",
  "best": 3
 },
 {
  "from": 24,
  "to": 25,
  "solved": false,
  "source": "solver",
  "best": 6
 },
 {
  "from": 25,
  "to": 26,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 26,
  "to": 27,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 27,
  "to": 28,
  "solved": false,
  "source": "solver",
  "best": 4
 },
 {
  "from": 28,
  "to": 29,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 29,
  "to": 30,
  "solved": false,
  "source": "solver",
  "best": 5
 },
 {
  "from": 30,
  "to": 31,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 31,
  "to": 32,
  "solved": false,
  "source": "solver",
  "best": 9
 },
 {
  "from": 32,
  "to": 33,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 33,
  "to": 34,
  "solved": false,
  "source": "solver",
  "best": 6
 },
 {
  "from": 34,
  "to": 35,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 35,
  "to": 36,
  "solved": false,
  "source": "solver",
  "best": 3
 },
 {
  "from": 36,
  "to": 37,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 37,
  "to": 38,
  "solved": false,
  "source": "solver",
  "best": 4
 },
 {
  "from": 38,
  "to": 39,
  "solved": false,
  "source": "solver",
  "best": 10
 },
 {
  "from": 39,
  "to": 40,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 40,
  "to": 41,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 41,
  "to": 42,
  "solved": false,
  "source": "solver",
  "best": 4
 },
 {
  "from": 42,
  "to": 43,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 43,
  "to": 44,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 44,
  "to": 45,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 45,
  "to": 46,
  "solved": true,
  "source": "solver",
  "length": 101,
  "moves": "1U127D3D3D16U12674U45U58D86U7U678D87D78U846D4635U34D5D43U4U42D31D24D4235U34U124536D64D4D4U356U4U57U67"
 },
 {
  "from": 46,
  "to": 47,
  "solved": false,
  "source": "solver",
  "best": 4
 },
 {
  "from": 47,
  "to": 48,
  "solved": false,
  "source": "solver",
  "best": 3
 },
 {
  "from": 48,
  "to": 49,
  "solved": false,
  "source": "solver",
  "best": 5
 },
 {
  "from": 49,
  "to": 50,
  "solved": true,
  "source": "solver",
  "length": 225,
  "moves": "3U46U8U38D47D78U3U47U6785D35D42U3U4U45D3D251U2U256D6D54D43U4U157U346D78U8D6D54D43U4U67U6U34753U5D34D5D5D45U5467D45U53U7645D456U65D54U6D6435U56U623D1U32U12D21U2U12467U4765D4D46U547D45U53U6754D5D4D46D4365U6U12U26513D2D21U1D2D23"
 },
 {
  "from": 50,
  "to": 51,
  "solved": false,
  "source": "solver",
  "best": 7
 },
 {
  "from": 51,
  "to": 52,
  "solved": false,
  "source": "solver",
  "best": 2
 },
 {
  "from": 52,
  "to": 0,
  "solved": false,
  "source": "solver",
  "best": 10
 }
];

export const solutionFor = (from, to) =>
  SOLUTIONS.find((e) => e.from === from && e.to === to);
