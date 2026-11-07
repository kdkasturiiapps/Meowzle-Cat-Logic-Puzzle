// Online scores + global standing (Firebase Auth anonymous + Firestore Lite).
// Bundled by build.js into window.MeowCloud. Everything fails soft: the game works offline.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, where, getDocs, getCount, serverTimestamp } from 'firebase/firestore/lite';
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

window.MeowCloud = { init, uid, pushPlayer, topPlayers, myStanding, pushDaily, dailyTop, dailyStanding };
