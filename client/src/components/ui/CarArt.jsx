import { assetUrl } from '../../lib/api';
import { stockPhotoFor } from './carPhotos';

// Ilustrasi mobil SVG (dibuat sendiri, tanpa aset pihak lain). Dipakai jika belum ada foto unggahan admin maupun foto bawaan.
const SHAPES = {
  HATCHBACK: { rear: 34, front: 206, roofRear: 46, roofFront: 136, roofY: 30, belt: 52, bottom: 74, wheels: [64, 176], r: 15 },
  SEDAN: { rear: 16, front: 224, roofRear: 74, roofFront: 154, roofY: 33, belt: 54, bottom: 74, wheels: [58, 184], r: 15 },
  MPV: { rear: 18, front: 222, roofRear: 26, roofFront: 150, roofY: 25, belt: 52, bottom: 74, wheels: [58, 184], r: 15 },
  SUV: { rear: 18, front: 222, roofRear: 24, roofFront: 156, roofY: 19, belt: 50, bottom: 72, wheels: [58, 184], r: 17 },
  VAN: { rear: 10, front: 230, roofRear: 12, roofFront: 192, roofY: 12, belt: 48, bottom: 74, wheels: [52, 192], r: 15 },
  PREMIUM: { rear: 12, front: 228, roofRear: 16, roofFront: 182, roofY: 14, belt: 50, bottom: 74, wheels: [54, 188], r: 16 },
};

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 170;
}

export function CarSvg({ category = 'MPV', color = '#0f766e', className = '' }) {
  const s = SHAPES[category] || SHAPES.MPV;
  const { rear, front, roofRear, roofFront, roofY, belt, bottom } = s;
  const body = `M${rear},${bottom} L${rear},${belt + 6} Q${rear},${belt - 2} ${rear + 8},${belt - 4} L${roofRear},${roofY + 8} Q${roofRear + 2},${roofY} ${roofRear + 12},${roofY} L${roofFront - 12},${roofY} Q${roofFront - 4},${roofY} ${roofFront + 4},${roofY + 6} L${roofFront + 30},${belt - 4} L${front - 16},${belt} Q${front},${belt + 3} ${front},${belt + 14} L${front},${bottom} Z`;
  const glass = `M${roofRear + 8},${belt - 5} L${roofRear + 6},${roofY + 9} Q${roofRear + 7},${roofY + 5} ${roofRear + 14},${roofY + 5} L${roofFront - 13},${roofY + 5} Q${roofFront - 7},${roofY + 5} ${roofFront},${roofY + 10} L${roofFront + 22},${belt - 5} Z`;
  const pillar = (roofRear + roofFront) / 2 + 6;
  const stroke = isLight(color) ? '#94a3b8' : 'transparent';
  return (
    <svg viewBox="0 0 240 96" className={className} role="img" aria-hidden>
      <ellipse cx="120" cy="88" rx="104" ry="5" className="fill-slate-900/10 dark:fill-black/40" />
      <path d={body} fill={color} stroke={stroke} strokeWidth="1.2" />
      <path d={glass} className="fill-slate-800/80 dark:fill-slate-950/80" />
      <rect x={pillar} y={roofY + 4} width="4" height={belt - roofY - 8} fill={color} />
      <rect x={front - 10} y={belt + 4} width="8" height="5" rx="2" fill="#fde68a" />
      <rect x={rear} y={belt + 4} width="5" height="6" rx="1.5" fill="#ef4444" />
      <rect x={rear + 2} y={bottom - 6} width={front - rear - 4} height="4" rx="2" className="fill-slate-900/20" />
      {s.wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={bottom} r={s.r} className="fill-slate-900 dark:fill-slate-950" />
          <circle cx={cx} cy={bottom} r={s.r * 0.55} fill="#cbd5e1" />
          <circle cx={cx} cy={bottom} r={s.r * 0.18} fill="#475569" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Foto tipe mobil: foto unggahan admin -> foto contoh bawaan untuk model populer -> ilustrasi SVG.
 * `credit` = tampilkan nama fotografer kecil di pojok (wajib untuk foto CC BY-SA yang tampil besar).
 */
export function CarImage({ type, className = '', credit = false, sizes = '(min-width: 640px) 400px, 100vw' }) {
  const stock = type.imagePath ? null : stockPhotoFor(type);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-b from-brand-50 to-stone-100 dark:from-slate-800 dark:to-slate-900 ${className}`}>
      {type.imagePath ? (
        <img src={assetUrl(type.imagePath)} alt={type.name} loading="lazy" className="h-full w-full object-cover" />
      ) : stock ? (
        <>
          <img src={stock.src} srcSet={`${stock.srcSmall} 400w, ${stock.src} 800w`} sizes={sizes} alt={type.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          {credit && (
            <a href={stock.source} target="_blank" rel="noreferrer" className="absolute right-1.5 bottom-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[10px] leading-tight text-white/90 hover:bg-black/60">
              © {stock.author} · {stock.license}
            </a>
          )}
        </>
      ) : (
        <CarSvg category={type.category} color={type.color} className="absolute inset-x-[8%] bottom-[10%] w-[84%]" />
      )}
    </div>
  );
}
