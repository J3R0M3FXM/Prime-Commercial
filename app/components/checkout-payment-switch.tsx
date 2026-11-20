"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export default function CheckoutPaymentSwitch({ showPicker, picker, selection }: {
  showPicker: boolean;
  picker: ReactNode;
  selection: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return <div className="relative min-w-0">
    <AnimatePresence initial={false}>
      <motion.div key={showPicker ? "picker" : "selection"}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        exit={{ opacity: 0, position: "absolute", top: 0, width: "100%", pointerEvents: "none" }}
        transition={{ duration: reduceMotion ? 0 : 0.18 }} className="min-w-0 space-y-2.5">
        {showPicker ? picker : selection}
      </motion.div>
    </AnimatePresence>
  </div>;
}
