import Image from "next/image";
import styles from "./BrandLogo.module.css";

export default function BrandLogo({ priority = false }: { priority?: boolean }) {
  return <Image src="/brand/letsgo2travel-20260910.png" width={2172} height={724}
    className={styles.logo} alt="LetsGo2Travel · Daha fazla keşfet" priority={priority} unoptimized />;
}
