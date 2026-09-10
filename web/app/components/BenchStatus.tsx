"use client";

import { useEffect, useState } from "react";

type State = "checking" | "online" | "offline";

export default function BenchStatus() {
  const [state, setState] = useState<State>("checking");
  const [agent, setAgent] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/bench/status")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setState(d.online ? "online" : "offline");
        // Only when the agent is the bench. Naming the account it spends from
        // is the difference between claiming it pays and showing who does.
        if (d.online && d.paid && d.agent) setAgent(d.agent);
        if (d.online && d.discovery === "ens") setParent(d.parent);
      })
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
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="label !text-dim">
        {state === "checking" && "checking the bench"}
        {state === "online" && "bench online — craft something"}
        {state === "offline" &&
          "bench offline — showing the last thing it crafted"}
      </span>
      {agent && (
        <span className="label !text-faint">
          · agent <span className="font-mono text-amber">{agent}</span> pays per
          stage
        </span>
      )}
      {parent && (
        <span className="label !text-faint">
          · services resolved from{" "}
          <span className="font-mono text-amber">{parent}</span>
        </span>
      )}
    </p>
  );
}
