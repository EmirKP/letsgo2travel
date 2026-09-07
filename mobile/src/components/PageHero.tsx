import type { ReactNode } from "react";

export type HeroScene = "coast" | "journey" | "passport" | "airport" | "events" | "city";

/** Real text above a decorative photograph; shared by every mobile screen. */
export function PageHero({ title, subtitle, scene = "coast", note, children }: {
  title: string;
  subtitle: string;
  scene?: HeroScene;
  note?: string;
  children?: ReactNode;
}) {
  return <header className={`page-hero scene-${scene}`}>
    {note && <span className="page-hero-note" aria-hidden="true">{note}</span>}
    <div className="page-hero-copy"><h1>{title}</h1><p>{subtitle}</p></div>
    {children && <div className="page-hero-action">{children}</div>}
  </header>;
}
