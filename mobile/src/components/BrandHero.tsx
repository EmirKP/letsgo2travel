import type { ReactNode } from "react";

export type HeroKind = "coast" | "traveler" | "passport" | "events" | "airport";
export function BrandHero({ title, subtitle, kind = "coast", children }: { title: string; subtitle?: string; kind?: HeroKind; children?: ReactNode }) {
  return <section className={`brand-hero brand-hero--${kind}`}>
    <div className="brand-hero-copy"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}{children}</div>
  </section>;
}
