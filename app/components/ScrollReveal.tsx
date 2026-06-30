"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

export default function ScrollReveal({
  children,
  delay = 0,
  yOffset = 40,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  yOffset?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-50px 0px", threshold: 0.08 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`l2t-reveal${visible ? " l2t-reveal-visible" : ""}${className ? ` ${className}` : ""}`}
      style={{
        "--l2t-reveal-y": `${yOffset}px`,
        "--l2t-reveal-delay": `${Math.max(0, delay) * 1000}ms`,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
