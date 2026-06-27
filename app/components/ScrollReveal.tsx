"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

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
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: yOffset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: 0.7,
        ease: [0.21, 0.47, 0.32, 0.98], // Apple-like smooth spring ease
        delay: delay,
      }}
    >
      {children}
    </motion.div>
  );
}
