// Online scores + global standing (Firebase Auth anonymous + Firestore Lite).
// Bundled by build.js into window.MeowCloud. Everything fails soft: the game works offline.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, runTransaction, collection, query, orderBy, limit, where, getDocs, getCount, serverTimestamp } from 'firebase/firestore/lite';
import { firebaseConfig } from './firebase-config.js';

const MAX_STEP = 20000; // must match the Firestore rule (largest score jump per write)
let app, auth, db, ready;

function init() {
  if (ready) return ready;
  ready = (async () => {
    app = initializeApp(firebaseConfig);
    auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence] });
    db = getFirestore(app);
    const user = await new Promise(res => { const off = onAuthStateChanged(auth, u => { off(); res(u); }); });
    if (!user) await signInAnonymously(auth);
    return auth.currentUser;
  })();
  ready.catch(() => { ready = null; }); // allow a retry later (e.g. phone was offline)
  return ready;
}

const withTimeout = (p, ms = 12000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function uid() { const u = await withTimeout(init()); return u.uid; }

// Save total score / level / name. Climbs in allowed steps if the player earned a lot offline.
async function pushPlayer({ name, score, level, country }) {
  const id = await uid();
  const ref = doc(db, 'players', id);
  const snap = await withTimeout(getDoc(ref));
  let remote = snap.exists() ? snap.data().score : 0;
  if (snap.exists() && remote > score) score = remote; // never go backwards (e.g. after a reinstall)
  let target = Math.min(score, 100000000);
  do {
    const next = snap.exists() ? Math.min(target, remote + MAX_STEP) : target;
    await withTimeout(setDoc(ref, { name, score: Math.floor(next), level: Math.max(1, Math.floor(level)), country: country || '', updatedAt: serverTimestamp() }));
    remote = next;
    if (!snap.exists()) break;
  } while (remote < target);
  return { uid: id, score: remote };
}

async function topPlayers(n = 50) {
  await uid();
  const q = query(collection(db, 'players'), orderBy('score', 'desc'), limit(n));
  const res = await withTimeout(getDocs(q));
  return res.docs.map(d => ({ id: d.id, ...d.data(), updatedAt: undefined }));
}

async function myStanding(score) {
  const id = await uid();
  const [above, total] = await Promise.all([
    withTimeout(getCount(query(collection(db, 'players'), where('score', '>', score)))),
    withTimeout(getCount(collection(db, 'players')))
  ]);
  return { uid: id, rank: above.data().count + 1, total: Math.max(total.data().count, above.data().count + 1) };
}

async function pushDaily(day, { name, time, stars, country }) {
  const id = await uid();
  const ref = doc(db, 'daily', String(day), 'times', id);
  const snap = await withTimeout(getDoc(ref));
  if (snap.exists()) return { uid: id, existing: snap.data() }; // one result per day, first one counts
  await withTimeout(setDoc(ref, { name, time: Math.max(5, Math.floor(time)), stars, country: country || '', at: serverTimestamp() }));
  return { uid: id };
}

async function dailyTop(day, n = 50) {
  await uid();
  const q = query(collection(db, 'daily', String(day), 'times'), orderBy('time', 'asc'), limit(n));
  const res = await withTimeout(getDocs(q));
  return res.docs.map(d => ({ id: d.id, ...d.data(), at: undefined }));
}

async function dailyStanding(day, time) {
  const id = await uid();
  const col = collection(db, 'daily', String(day), 'times');
  const [above, total] = await Promise.all([
    withTimeout(getCount(query(col, where('time', '<', time)))),
    withTimeout(getCount(col))
  ]);
  return { uid: id, rank: above.data().count + 1, total: Math.max(total.data().count, above.data().count + 1) };
}

// ---------- Global Challenge rooms ----------
// rooms/{id}: { status, startAt (ms), seed, size, createdAt, players: { uid: {name, country, joinedAt, placed, mistakes, done, out} } }
const ROOM_MAX = 20, LOBBY_MS = 20000;
async function joinChallenge({ name, country, size, pace }) {
  const id = await uid();
  const me = { name, country: country || '', pace: pace || 150, joinedAt: Date.now(), placed: 0, mistakes: 0, done: 0, out: false };
  // 1) an open room that starts in more than 4 s
  const q = query(collection(db, 'rooms'), where('startAt', '>', Date.now() + 4000), orderBy('startAt'), limit(5));
  const res = await withTimeout(getDocs(q));
  for (const d of res.docs) {
    const r = d.data();
    if (r.size !== size || Object.keys(r.players || {}).length >= ROOM_MAX) continue;
    try {
      const ok = await withTimeout(runTransaction(db, async tx => {
        const snap = await tx.get(d.ref);
        const cur = snap.data();
        if (!cur || Object.keys(cur.players || {}).length >= ROOM_MAX || cur.startAt < Date.now() + 3000) return false;
        tx.update(d.ref, { ['players.' + id]: me });
        return true;
      }));
      if (ok) { const snap = await getDoc(d.ref); return { roomId: d.id, uid: id, room: snap.data() }; }
    } catch (e) { /* room filled up or changed — try the next one */ }
  }
  // 2) nobody waiting: open a new room
  const ref = doc(collection(db, 'rooms'));
  const room = { status: 'waiting', startAt: Date.now() + LOBBY_MS, seed: Math.floor(Math.random() * 1e9), size, createdAt: serverTimestamp(), players: { [id]: me } };
  await withTimeout(setDoc(ref, room));
  return { roomId: ref.id, uid: id, room: { ...room, createdAt: null } };
}
async function getRoom(roomId) {
  const snap = await withTimeout(getDoc(doc(db, 'rooms', roomId)), 8000);
  return snap.exists() ? snap.data() : null;
}
async function updateMe(roomId, patch) {
  const id = await uid();
  const upd = {};
  for (const k of Object.keys(patch)) upd['players.' + id + '.' + k] = patch[k];
  await withTimeout(updateDoc(doc(db, 'rooms', roomId), upd), 8000);
}

window.MeowCloud = { joinChallenge, getRoom, updateMe, init, uid, pushPlayer, topPlayers, myStanding, pushDaily, dailyTop, dailyStanding };
