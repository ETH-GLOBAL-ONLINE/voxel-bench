"use client";

import { useEffect, useState } from "react";

type State = "checking" | "online" | "offline";

export default function BenchStatus() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let alive = true;
    fetch("/api/bench/status")
      .then((r) => r.json())
      .then((d) => alive && setState(d.online ? "online" : "offline"))
      .catch(() => alive && setState("offline"));
    return () => {
      alive = false;
    };
  }, []);

  const dot =
    state === "online"
      ? "bg-sap"
      : state === "offline"
        ? "bg-faint"
        : "bg-bench-600";

  return (
    <p className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="label !text-dim">
        {state === "checking" && "checking the bench"}
        {state === "online" && "bench online — craft something"}
        {state === "offline" &&
          "bench offline — showing the last thing it crafted"}
      </span>
    </p>
  );
}
