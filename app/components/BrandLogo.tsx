import Image from "next/image";
import { useId } from "react";
import styles from "./BrandLogo.module.css";

export default function BrandLogo({ priority = false, onLight = false }: { priority?: boolean; onLight?: boolean }) {
  const filterId = `l2t-brand-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return <>
    {onLight && <svg className={styles.colorFilter} width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id={filterId} colorInterpolationFilters="sRGB">
          {/* Map white to navy while preserving yellow and the PNG's alpha. */}
          <feColorMatrix type="matrix" values="1 0 -0.97255 0 0  0 1 -0.89412 0 0  0 0 0.2 0 0  0 0 0 1 0" />
        </filter>
      </defs>
    </svg>}
    <Image src="/brand/letsgo2travel-20260910.png" width={2172} height={724}
      className={styles.logo} style={onLight ? { filter: `url(#${filterId})` } : undefined}
      alt="LetsGo2Travel · Daha fazla keşfet" priority={priority} unoptimized />
  </>;
}
