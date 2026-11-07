// Cat-in-colour-blocks puzzle engine (Queens / Star Battle 1-star rules). Pure JS.
const CatEngine = (() => {
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // count solutions: one cat per row, column, region; cats never touch (incl. diagonal)
  function solve(N, region, limit = 2) {
    const colUsed = new Uint8Array(N), regUsed = new Uint8Array(N), pos = new Int32Array(N);
    let count = 0, first = null;
    function rec(r) {
      if (count >= limit) return;
      if (r === N) { count++; if (!first) first = Array.from(pos); return; }
      for (let c = 0; c < N; c++) {
        if (colUsed[c]) continue;
        if (r > 0 && Math.abs(pos[r - 1] - c) <= 1) continue;
        const g = region[r * N + c];
        if (regUsed[g]) continue;
        colUsed[c] = 1; regUsed[g] = 1; pos[r] = c;
        rec(r + 1);
        colUsed[c] = 0; regUsed[g] = 0;
        if (count >= limit) return;
      }
    }
    rec(0);
    return { count, first };
  }
  function randPerm(N, R) {
    // permutation with no two consecutive rows in adjacent columns
    for (let t = 0; t < 2000; t++) {
      const p = [], used = new Uint8Array(N);
      let ok = true;
      for (let r = 0; r < N && ok; r++) {
        const opts = [];
        for (let c = 0; c < N; c++) if (!used[c] && (r === 0 || Math.abs(p[r - 1] - c) > 1)) opts.push(c);
        if (!opts.length) ok = false; else { const c = opts[(R() * opts.length) | 0]; p.push(c); used[c] = 1; }
      }
      if (ok) return p;
    }
    return null;
  }
  function growRegions(N, perm, R) {
    const region = new Int32Array(N * N).fill(-1);
    for (let r = 0; r < N; r++) region[r * N + perm[r]] = r;
    let left = N * N - N;
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (left > 0) {
      // pick a random unassigned cell next to a region and join it
      const g = (R() * N) | 0;
      const front = [];
      for (let i = 0; i < N * N; i++) if (region[i] === g) {
        const r = (i / N) | 0, c = i % N;
        for (const [a, b] of D) { const rr = r + a, cc = c + b; if (rr >= 0 && rr < N && cc >= 0 && cc < N && region[rr * N + cc] < 0) front.push(rr * N + cc); }
      }
      if (!front.length) continue;
      region[front[(R() * front.length) | 0]] = g; left--;
    }
    return region;
  }
  // improve uniqueness: when 2+ solutions, move a cell of the alt solution into a neighbouring region
  function generate(N, seed) {
    const R = rng(seed);
    for (let attempt = 0; attempt < 300; attempt++) {
      const perm = randPerm(N, R);
      if (!perm) continue;
      let region = growRegions(N, perm, R);
      for (let fix = 0; fix < 60; fix++) {
        const s = solve(N, region, 2);
        if (s.count === 1) {
          return { N, region: Array.from(region), solution: perm.slice(), seed, attempts: attempt + 1 };
        }
        // find a solution different from perm and break it by reassigning one of its cells
        let alt = null;
        // re-run to get a non-perm solution
        (function findAlt() {
          const colUsed = new Uint8Array(N), regUsed = new Uint8Array(N), pos = new Int32Array(N);
          function rec(r) {
            if (alt) return;
            if (r === N) { if (pos.some((c, i) => c !== perm[i])) alt = Array.from(pos); return; }
            for (let c = 0; c < N && !alt; c++) {
              if (colUsed[c] || (r > 0 && Math.abs(pos[r - 1] - c) <= 1)) continue;
              const g = region[r * N + c]; if (regUsed[g]) continue;
              colUsed[c] = 1; regUsed[g] = 1; pos[r] = c; rec(r + 1); colUsed[c] = 0; regUsed[g] = 0;
            }
          }
          rec(0);
        })();
        if (!alt) break;
        // cells of alt not on perm's cats: try moving one into a neighbouring region (keeping regions connected)
        const cand = [];
        for (let r = 0; r < N; r++) if (alt[r] !== perm[r]) cand.push(r * N + alt[r]);
        let moved = false;
        for (const i of cand.sort(() => R() - 0.5)) {
          const r = (i / N) | 0, c = i % N, from = region[i];
          const nbr = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [r + a, c + b])
            .filter(([rr, cc]) => rr >= 0 && rr < N && cc >= 0 && cc < N && region[rr * N + cc] !== from)
            .map(([rr, cc]) => region[rr * N + cc]);
          if (!nbr.length) continue;
          const to = nbr[(R() * nbr.length) | 0];
          const tryReg = region.slice(); tryReg[i] = to;
          if (connected(N, tryReg, from) && tryReg.some(v => v === from)) { region = tryReg; moved = true; break; }
        }
        if (!moved) break;
      }
    }
    return null;
  }
  function connected(N, region, g) {
    let start = -1, total = 0;
    for (let i = 0; i < N * N; i++) if (region[i] === g) { total++; if (start < 0) start = i; }
    if (start < 0) return false;
    const seen = new Uint8Array(N * N), st = [start]; seen[start] = 1; let n = 0;
    while (st.length) {
      const i = st.pop(); n++;
      const r = (i / N) | 0, c = i % N;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + a, cc = c + b, j = rr * N + cc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N && !seen[j] && region[j] === g) { seen[j] = 1; st.push(j); }
      }
    }
    return n === total;
  }

  // Rate how much reasoning a puzzle needs, by solving it the way a person would.
  // Returns { logical: true if solvable without guessing, score: higher = harder }
  function grade(N, region) {
    const cand = new Uint8Array(N * N).fill(1), cat = new Uint8Array(N * N);
    const groups = [];
    for (let r = 0; r < N; r++) groups.push([...Array(N).keys()].map(c => r * N + c));
    for (let c = 0; c < N; c++) groups.push([...Array(N).keys()].map(r => r * N + c));
    for (let g = 0; g < N; g++) { const a = []; for (let i = 0; i < N * N; i++) if (region[i] === g) a.push(i); groups.push(a); }
    const rowsG = groups.slice(0, N), colsG = groups.slice(N, 2 * N), regG = groups.slice(2 * N);
    const sees = (a, b) => { const ar = (a / N) | 0, ac = a % N, br = (b / N) | 0, bc = b % N; return a !== b && (ar === br || ac === bc || region[a] === region[b] || (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)); };
    let score = 0, placed = 0;
    const place = i => { cat[i] = 1; cand[i] = 0; placed++; for (let j = 0; j < N * N; j++) if (cand[j] && sees(i, j)) cand[j] = 0; };
    const open = g => g.filter(i => cand[i]);
    const hasCat = g => g.some(i => cat[i]);
    function combos(arr, k, start = 0, pre = [], out = []) { if (pre.length === k) { out.push(pre.slice()); return out; } for (let i = start; i < arr.length; i++) { pre.push(arr[i]); combos(arr, k, i + 1, pre, out); pre.pop(); } return out; }
    for (let guard = 0; guard < 500 && placed < N; guard++) {
      // 1) a row / column / colour with one spot left
      let done = false;
      for (const g of groups) { if (hasCat(g)) continue; const o = open(g); if (!o.length) return { logical: false, score: score + 100 }; if (o.length === 1) { place(o[0]); score += 1; done = true; break; } }
      if (done) continue;
      // 2) confinement: k colours that fit inside k rows (or columns) clear the rest of those rows; and the reverse
      for (let k = 1; k <= 3 && !done; k++) {
        const pairs = [[regG, rowsG], [regG, colsG], [rowsG, regG], [colsG, regG]];
        for (const [A, B] of pairs) {
          const live = A.map((g, ix) => ix).filter(ix => !hasCat(A[ix]));
          if (live.length < k) continue;
          for (const set of combos(live, k)) {
            const cells = set.flatMap(ix => open(A[ix]));
            const bs = new Set(); for (const i of cells) B.forEach((g, bi) => { if (g.includes(i)) bs.add(bi); });
            if (bs.size !== k) continue;
            const inSet = new Set(cells); let elim = 0;
            for (const bi of bs) for (const i of B[bi]) if (cand[i] && !inSet.has(i)) { cand[i] = 0; elim++; }
            if (elim) { score += 2 + 4 * (k - 1); done = true; break; }
          }
          if (done) break;
        }
      }
      if (done) continue;
      // 3) a spot that would leave some row / column / colour with no room
      for (let i = 0; i < N * N && !done; i++) {
        if (!cand[i]) continue;
        for (const g of groups) { if (hasCat(g) || g.includes(i)) continue; if (open(g).every(j => sees(i, j))) { cand[i] = 0; score += 5; done = true; break; } }
      }
      if (done) continue;
      return { logical: false, score: score + 100 }; // would need guessing
    }
    return { logical: placed === N, score };
  }
  function superHard(N, seed, tries) {
    let best = null;
    for (let t = 0; t < tries; t++) {
      const p = generate(N, seed + t * 7777); if (!p) continue;
      const g = grade(N, p.region); p.grade = g;
      const rank = (g.logical ? 0 : -1000) + g.score;
      if (!best || rank > best.rank) best = Object.assign(p, { rank });
    }
    return best;
  }
  function sizeForLevel(L) {
    if (L <= 3) return 5;
    if (L <= 10) return 6;
    if (L <= 25) return 7;
    if (L <= 50) return 8;
    if (L <= 100) return 9;
    return 10;
  }
  const isSuperHard = L => L >= 6 && L % 3 === 0;
  function levelPuzzle(L) {
    let N = sizeForLevel(L);
    const seed = L * 7919 + 13;
    let p;
    if (isSuperHard(L)) {
      N = Math.min(9, N + 1); // 9×9 max keeps it fast to build; hardness comes from the logic, not the size
      p = superHard(N, seed, 12);
    }
    if (!p) { let sd = seed; for (;;) { p = generate(N, sd); if (p) break; sd += 100003; } }
    p.level = L; p.superHard = isSuperHard(L);
    // after level 10, big boards sometimes start with one cat already in place
    const R = rng(seed + 31);
    if (!isSuperHard(L) && L > 10 && N >= 8 && R() < 0.5) { const r = (R() * N) | 0; p.given = r * N + p.solution[r]; }
    return p;
  }
  function dailyPuzzle(day) {
    let seed = day * 104729 + 7;
    for (;;) { const p = generate(8, seed); if (p) return p; seed += 100003; }
  }
  return { rng, solve, generate, levelPuzzle, dailyPuzzle, sizeForLevel, connected, grade, isSuperHard };
})();
if (typeof module !== 'undefined') module.exports = CatEngine;
