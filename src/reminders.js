// Reminder planner: pure logic, uses the phone's local clock and time zone.
const Reminders = (() => {
  const H = 3600e3;
  const CFG = { gapHours: 3, quietFrom: 21, quietTo: 7, streakHours: [16, 18], daysAhead: 3 };
  const dayOf = ms => { const d = new Date(ms); return Math.floor((ms - d.getTimezoneOffset() * 60000) / 864e5); };
  const allowed = ms => { const h = new Date(ms).getHours(); return h >= CFG.quietTo && h < CFG.quietFrom; }; // 7:00–20:59 local
  const atLocal = (baseMs, dayOffset, hour) => { const d = new Date(baseMs); d.setDate(d.getDate() + dayOffset); d.setHours(hour, 0, 0, 0); return d.getTime(); };

  const TEXT = {
    en: {
      play: [['🐱 Your cats miss you!', 'A new puzzle is waiting. Come find their spots.'], ['🐾 Quick puzzle break?', 'Just one level. The cats are ready.'], ['😺 Meow! Time to play', 'Can you beat your score today?'], ['🧩 Brain break time', 'One cat in every colour. You got this!']],
      streak: ['🔥 Don\'t lose your {n}-day streak!', 'Play today\'s Daily Puzzle before midnight.'],
      daily: ['📅 Today\'s Daily Puzzle is waiting', 'Same puzzle for everyone. Start a streak today!']
    },
    hi: {
      play: [['🐱 आपकी बिल्लियाँ आपको याद कर रही हैं!', 'नई पहेली तैयार है। आइए उनकी जगह ढूँढें।'], ['🐾 छोटा सा पज़ल ब्रेक?', 'बस एक लेवल। बिल्लियाँ तैयार हैं।'], ['😺 म्याऊँ! खेलने का समय', 'क्या आज आप अपना स्कोर तोड़ सकते हैं?']],
      streak: ['🔥 अपनी {n} दिन की स्ट्रीक मत खोइए!', 'आधी रात से पहले आज की डेली पहेली खेलें।'],
      daily: ['📅 आज की डेली पहेली इंतज़ार कर रही है', 'सबके लिए एक ही पहेली। आज से स्ट्रीक शुरू करें!']
    },
    bn: {
      play: [['🐱 তোমার বিড়ালরা তোমাকে মিস করছে!', 'নতুন ধাঁধা অপেক্ষা করছে। এসো ওদের জায়গা খুঁজে দাও।'], ['🐾 একটু ধাঁধার বিরতি?', 'মাত্র একটা লেভেল। বিড়ালরা তৈরি।'], ['😺 মিয়াঁও! খেলার সময়', 'আজ কি নিজের স্কোর ছাড়াতে পারবে?']],
      streak: ['🔥 তোমার {n} দিনের স্ট্রিক হারিও না!', 'মাঝরাতের আগে আজকের ডেইলি ধাঁধাটা খেলো।'],
      daily: ['📅 আজকের ডেইলি ধাঁধা অপেক্ষা করছে', 'সবার জন্য একই ধাঁধা। আজই স্ট্রিক শুরু করো!']
    },
    es: {
      play: [['🐱 ¡Tus gatos te extrañan!', 'Hay un nuevo puzle esperando. Ven a encontrar su lugar.'], ['🐾 ¿Un descanso rápido?', 'Solo un nivel. Los gatos están listos.'], ['😺 ¡Miau! Hora de jugar', '¿Puedes superar tu puntuación hoy?']],
      streak: ['🔥 ¡No pierdas tu racha de {n} días!', 'Juega el puzle diario antes de medianoche.'],
      daily: ['📅 El puzle diario te espera', 'El mismo puzle para todos. ¡Empieza una racha hoy!']
    },
    pt: {
      play: [['🐱 Seus gatos sentem sua falta!', 'Um novo quebra-cabeça está esperando.'], ['🐾 Uma pausa rápida?', 'Só um nível. Os gatos estão prontos.'], ['😺 Miau! Hora de jogar', 'Consegue bater sua pontuação hoje?']],
      streak: ['🔥 Não perca sua sequência de {n} dias!', 'Jogue o desafio diário antes da meia-noite.'],
      daily: ['📅 O desafio diário está esperando', 'O mesmo desafio para todos. Comece uma sequência hoje!']
    },
    id: {
      play: [['🐱 Kucingmu kangen!', 'Teka-teki baru sudah menunggu.'], ['🐾 Istirahat sebentar?', 'Satu level saja. Kucing-kucing sudah siap.'], ['😺 Meong! Waktunya main', 'Bisa kalahkan skormu hari ini?']],
      streak: ['🔥 Jangan putus streak {n} harimu!', 'Mainkan teka-teki harian sebelum tengah malam.'],
      daily: ['📅 Teka-teki harian menunggumu', 'Teka-teki yang sama untuk semua. Mulai streak hari ini!']
    }
  };
  const langOf = l => { l = (l || 'en').slice(0, 2).toLowerCase(); return TEXT[l] ? l : 'en'; };

  // returns [{at, kind, title, body}] sorted by time
  function plan({ now, lastPlay, dailyDoneDay, streak, lang }) {
    const T = TEXT[langOf(lang)], out = [];
    const today = dayOf(now);
    // streak / daily reminders at 4 PM and 6 PM local, on days the daily isn't done yet
    for (let d = 0; d < CFG.daysAhead; d++) for (const h of CFG.streakHours) {
      const at = atLocal(now, d, h);
      if (at <= now) continue;
      if (dayOf(at) === dailyDoneDay) continue; // already played that day
      // tomorrow's streak only survives if today's daily gets done, so count it as at-risk either way
      const n = d === 0 ? streak : (dailyDoneDay === today ? streak + 1 : 0);
      const [title, body] = n > 0 ? [T.streak[0].replace('{n}', n), T.streak[1]] : T.daily;
      out.push({ at, kind: 'streak', title, body });
    }
    // "come back" reminders every 3 hours after the last play, skipping 9 PM–7 AM
    let k = 0;
    for (let at = lastPlay + CFG.gapHours * H; at < now + CFG.daysAhead * 24 * H; at += CFG.gapHours * H) {
      if (at <= now || !allowed(at)) continue;
      if (out.some(o => o.kind === 'streak' && Math.abs(o.at - at) < 45 * 60e3)) continue; // don't double up
      const [title, body] = T.play[k++ % T.play.length];
      out.push({ at, kind: 'play', title, body });
    }
    return out.sort((a, b) => a.at - b.at);
  }
  return { plan, CFG, allowed, dayOf, langOf };
})();
if (typeof module !== 'undefined') module.exports = Reminders;
