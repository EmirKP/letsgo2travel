import { useLayoutEffect, type ReactNode } from "react";

/** Activity disconnects this effect when hidden, then restores the scroll on return. */
export function NavigationPane({ children, restoreTop, direction }: {
  children: ReactNode;
  restoreTop: number;
  direction: "forward" | "back";
}) {
  useLayoutEffect(() => {
    window.scrollTo({ top: restoreTop, behavior: "instant" });
  }, []);

  return <div className="navigation-pane" data-direction={direction}>{children}</div>;
}
