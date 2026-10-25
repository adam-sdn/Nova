// Nova Systems brand marks, from the supplied logo files in public/brand.
// The files have white backgrounds and generous padding. Each mark is cropped to its artwork, and the
// SVG filter below turns brightness into transparency (white -> clear, artwork -> brand navy), so the
// logo sits cleanly on glass, white or dark surfaces. Render <BrandFilters /> once per page (layout.tsx).

/** Brand navy, sampled from the supplied logo. */
export const NOVA_NAVY = "#1b2b3c";

export function BrandFilters() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <filter id="nova-ink" colorInterpolationFilters="sRGB">
        {/* RGB -> brand navy; alpha = 1.46 - 1.5 x luminance (near-white goes fully clear). */}
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.106  0 0 0 0 0.169  0 0 0 0 0.235  -0.5 -0.5 -0.5 0 1.46"
        />
      </filter>
      <filter id="nova-ink-white" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.5 -0.5 -0.5 0 1.46" />
      </filter>
    </svg>
  );
}

interface Crop {
  src: string;
  /** Image size in px. */
  w: number;
  h: number;
  /** The artwork's box inside the image, in px. */
  box: { x: number; y: number; w: number; h: number };
}

const MARK: Crop = { src: "/brand/nova-mark.webp", w: 1254, h: 1254, box: { x: 230, y: 190, w: 820, h: 850 } };
const LOGO: Crop = { src: "/brand/nova-logo.webp", w: 2000, h: 779, box: { x: 250, y: 135, w: 1500, h: 530 } };

function Cropped({ crop, height, alt, white }: { crop: Crop; height: number; alt: string; white?: boolean }) {
  const { box } = crop;
  const scale = height / box.h;
  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className="relative inline-block shrink-0 overflow-hidden"
      style={{ width: Math.round(box.w * scale), height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, cropped by position */}
      <img
        src={crop.src}
        alt=""
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{
          filter: `url(#${white ? "nova-ink-white" : "nova-ink"})`,
          width: crop.w * scale,
          height: crop.h * scale,
          left: -box.x * scale,
          top: -box.y * scale,
        }}
      />
    </span>
  );
}

/** The star mark on its own. Decorative unless given a label. */
export function NovaMark({ size = 40, label = "", white }: { size?: number; label?: string; white?: boolean }) {
  return <Cropped crop={MARK} height={size} alt={label} white={white} />;
}

/** The full logo: mark plus "NOVA SYSTEMS". */
export function NovaLogo({ height = 40, white }: { height?: number; white?: boolean }) {
  return <Cropped crop={LOGO} height={height} alt="Nova Systems" white={white} />;
}
