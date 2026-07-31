"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { revealVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

type StaggerProps = {
  children: ReactNode;
  className?: string;
  /** Renders as this element instead of a div — `ul`, `section`, `tbody`, … */
  as?: "div" | "ul" | "ol" | "section" | "tbody";
};

/**
 * Reveals its children in sequence on mount. Pair with <RevealItem> for each
 * child; a child without one simply appears with the container.
 *
 * Both components read `useReducedMotion()`, so callers never have to handle
 * the reduced-motion case themselves — the travel and the stagger collapse to
 * a plain cross-fade.
 */
export function Stagger({ children, className, as = "div" }: StaggerProps) {
  const reduced = useReducedMotion() ?? false;
  const { container } = revealVariants(reduced);
  const Component = motion[as];

  return (
    <Component
      className={className}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {children}
    </Component>
  );
}

type RevealItemProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "tr";
};

/** One child of a <Stagger>. */
export function RevealItem({
  children,
  className,
  as = "div",
}: RevealItemProps) {
  const reduced = useReducedMotion() ?? false;
  const { item } = revealVariants(reduced);
  const Component = motion[as];

  return (
    <Component className={className} variants={item}>
      {children}
    </Component>
  );
}

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before revealing — for a single element out of sequence. */
  delay?: number;
};

/** A standalone reveal, for an element that has no siblings to stagger with. */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduced = useReducedMotion() ?? false;
  const { item } = revealVariants(reduced);

  return (
    <motion.div
      className={cn(className)}
      variants={item}
      initial="hidden"
      animate="visible"
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}
