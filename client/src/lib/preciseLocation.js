// Ambil lokasi GPS seakurat mungkin (dipakai checkout pelanggan & dashboard driver).
//
// Titik pertama dari browser sering masih kasar (dari WiFi/BTS, ±100–2000 m) karena chip GPS
// belum "mengunci" satelit. Jadi posisi dipantau beberapa detik dengan akurasi tinggi,
// titik dengan akurasi terbaik disimpan, dan pencarian berhenti begitu akurasinya cukup
// (≤ targetAccuracy meter) atau waktu habis (pakai titik terbaik yang didapat).

/** Akurasi yang dianggap sudah tepat untuk titik jemput / posisi driver (meter). */
export const TARGET_ACCURACY_M = 20;
/** Di atas ini lokasi ditandai "kurang akurat" (meter). */
export const LOW_ACCURACY_M = 100;

const toFix = (pos) => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy,
  timestamp: new Date(pos.timestamp || Date.now()).toISOString(),
});

/**
 * @param {object} [opts]
 * @param {number} [opts.targetAccuracy]  berhenti lebih awal bila akurasi ≤ nilai ini (m)
 * @param {number} [opts.maxWaitMs]       batas waktu mencari
 * @param {(fix) => void} [opts.onProgress]  dipanggil tiap ada titik yang lebih akurat
 * @returns {Promise<{lat, lng, accuracy, timestamp}>}  error punya `code` (1 izin ditolak, 2 sinyal, 3 waktu habis)
 */
export function getPreciseLocation({ targetAccuracy = TARGET_ACCURACY_M, maxWaitMs = 20000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const err = new Error('unsupported');
      err.code = 0;
      reject(err);
      return;
    }

    let best = null;
    let done = false;
    let watchId = null;
    let timer = null;

    const finish = (fn) => {
      if (done) return;
      done = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      fn();
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = toFix(pos);
        if (!best || fix.accuracy < best.accuracy) {
          best = fix;
          onProgress?.(fix);
        }
        if (fix.accuracy <= targetAccuracy) finish(() => resolve(fix));
      },
      (err) => {
        // Izin ditolak → langsung berhenti. Error lain: tunggu, mungkin titik berikutnya masuk
        // (bila sampai waktu habis tetap tidak ada, timer di bawah yang menolak).
        if (err.code === 1) finish(() => reject(err));
      },
      // maximumAge 0: selalu posisi baru, bukan sisa cache.
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
    );

    timer = setTimeout(() => {
      finish(() => {
        if (best) resolve(best);
        else {
          const err = new Error('timeout');
          err.code = 3;
          reject(err);
        }
      });
    }, maxWaitMs);
  });
}

/**
 * Untuk pemantauan terus-menerus: terima titik baru hanya jika tidak jauh lebih buruk
 * dari titik terakhir yang masih segar, supaya bacaan kasar sesaat tidak menimpa posisi akurat.
 */
export function isBetterFix(next, prev, freshMs = 30000) {
  if (!prev) return true;
  const age = Date.now() - new Date(prev.timestamp).getTime();
  return age > freshMs || next.accuracy <= Math.max(prev.accuracy * 1.5, TARGET_ACCURACY_M);
}
