"use client";

import { useEffect, useMemo, useState } from "react";

export function useModalDirtyState<T>(open: boolean, value: T) {
  const serializedValue = useMemo(() => JSON.stringify(value), [value]);
  const [initialValue, setInitialValue] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (open) {
        setInitialValue(serializedValue);
        return;
      }

      setInitialValue("");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, serializedValue]);

  return open && initialValue !== "" && initialValue !== serializedValue;
}
