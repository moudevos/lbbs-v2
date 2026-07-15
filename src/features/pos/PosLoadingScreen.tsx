"use client";

import { useEffect, useState } from "react";

type PosLoadingScreenProps = {
  label: string;
  storageKey: string;
  fallbackMs?: number;
};

const HISTORY_SIZE = 5;
const SLOW_THRESHOLD_MS = 5000;
const VERY_SLOW_THRESHOLD_MS = 10000;

function readAverageDuration(storageKey: string, fallbackMs: number) {
  if (typeof window === "undefined") return fallbackMs;
  try {
    const raw = window.localStorage.getItem(`pos-loading-avg:${storageKey}`);
    if (!raw) return fallbackMs;
    const history = JSON.parse(raw) as number[];
    if (!Array.isArray(history) || history.length === 0) return fallbackMs;
    const avg = history.reduce((sum, value) => sum + value, 0) / history.length;
    return avg > 0 ? avg : fallbackMs;
  } catch {
    return fallbackMs;
  }
}

function recordDuration(storageKey: string, durationMs: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(`pos-loading-avg:${storageKey}`);
    const history: number[] = raw ? JSON.parse(raw) : [];
    const nextHistory = [...history, durationMs].slice(-HISTORY_SIZE);
    window.localStorage.setItem(`pos-loading-avg:${storageKey}`, JSON.stringify(nextHistory));
  } catch {
    // Si localStorage no esta disponible, simplemente no se guarda el historial.
  }
}

export function PosLoadingScreen({ label, storageKey, fallbackMs = 2000 }: PosLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const estimatedMs = readAverageDuration(storageKey, fallbackMs);

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      setElapsedMs(elapsed);
      setProgress(Math.min(90, (elapsed / estimatedMs) * 90));
    }, 100);

    return () => {
      window.clearInterval(interval);
      recordDuration(storageKey, Date.now() - startTime);
    };
    // Solo debe correr una vez, al montar/desmontar esta pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const message =
    elapsedMs >= VERY_SLOW_THRESHOLD_MS
      ? "Tomate un cafe, esto tomara un poco mas de tiempo..."
      : elapsedMs >= SLOW_THRESHOLD_MS
        ? "Esto esta tardando mas de lo normal..."
        : label;

  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <p className="text-sm font-medium text-slate-600">{message}</p>

      <div className="h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${progress}%`,
            backgroundImage:
              "repeating-linear-gradient(-45deg, #dc2626 0px, #dc2626 10px, #ffffff 10px, #ffffff 20px, #1d4ed8 20px, #1d4ed8 30px)",
            backgroundSize: "42px 100%",
            animation: "pos-barber-pole 0.6s linear infinite",
          }}
        />
      </div>

      <style jsx>{`
        @keyframes pos-barber-pole {
          from {
            background-position: 0 0;
          }
          to {
            background-position: 42px 0;
          }
        }
      `}</style>
    </div>
  );
}