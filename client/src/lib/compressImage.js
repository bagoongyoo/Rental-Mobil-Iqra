/**
 * Kompres foto di browser sebelum upload (hemat kuota pengguna).
 * Sisi terpanjang maks. 1600 px, JPEG kualitas 0.8. Foto KTP 4 MB biasanya jadi 200-400 KB.
 * Server tetap mengompres ulang ke WebP dengan sharp.
 */
export async function compressImage(file, { maxSize = 1600, quality = 0.8 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) return file; // format tidak didukung browser (mis. HEIC): kirim apa adanya, server yang kompres
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
