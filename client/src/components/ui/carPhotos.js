// Foto contoh bawaan untuk model mobil populer (Dev 2).
// Dipakai jika admin belum mengunggah foto sendiri untuk tipe mobil tersebut.
// Sumber: Wikimedia Commons. File di client/public/cars/ sudah dipotong 16:9 dan diperkecil (800 & 400 px, WebP).
// Lisensi CC BY-SA 4.0 wajib mencantumkan nama fotografer: lihat halaman /kredit-foto.

const BY_SA = { license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
const CC0 = { license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };
const commons = (file) => `https://commons.wikimedia.org/wiki/File:${file}`;

export const CAR_PHOTOS = [
  { key: 'avanza', match: /avanza/i, model: 'Toyota Avanza', author: 'Ethan Llamas', source: commons('Toyota_Avanza_1.5_G_2022.jpg'), ...BY_SA },
  { key: 'xpander', match: /xpander/i, model: 'Mitsubishi Xpander', author: 'Bahnfrend', source: commons('Mitsubishi_Xpander_Ultimate,_Surabaya,_2025_(01).jpg'), ...BY_SA },
  { key: 'innova', match: /innova|zenix/i, model: 'Toyota Kijang Innova Zenix', author: 'Andra Febrian', source: commons('2022_Toyota_Kijang_Innova_Zenix_V_(Indonesia)_front_view.jpg'), ...BY_SA },
  { key: 'brio', match: /brio/i, model: 'Honda Brio Satya', author: 'Alex Neman', source: commons('2023_Honda_Brio_Satya_E_(facelift).jpg'), ...BY_SA },
  { key: 'rush', match: /rush/i, model: 'Toyota Rush GR Sport', author: 'Andra Febrian', source: commons('2024_Toyota_Rush_GR_Sport_(Indonesia)_front_view.jpg'), ...CC0 },
  { key: 'fortuner', match: /fortuner/i, model: 'Toyota Fortuner VRZ', author: 'Alex Neman', source: commons('2016_Toyota_Fortuner_(AN160)_VRZ,_West_Surabaya.jpg'), ...BY_SA },
  { key: 'hiace', match: /hiace/i, model: 'Toyota HiAce Premio', author: 'オーバードライブ83', source: commons('2019_Toyota_HiAce_Premio_2.8_GDH322R_(20190722).jpg'), ...BY_SA },
  { key: 'alphard', match: /alphard/i, model: 'Toyota Alphard', author: 'TTTNIS', source: commons('2018-2023_Toyota_Alphard_X.jpg'), ...CC0 },
];

/** Foto bawaan yang cocok dengan nama tipe mobil, atau null. */
export function stockPhotoFor(type) {
  if (!type) return null;
  const label = `${type.brand || ''} ${type.name || ''}`;
  const p = CAR_PHOTOS.find((x) => x.match.test(label));
  return p ? { ...p, src: `/cars/${p.key}.webp`, srcSmall: `/cars/${p.key}-400.webp` } : null;
}
