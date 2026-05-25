import Stage1 from "./Stage1";
import { AlertTriangle } from "lucide-react";

export default function Stage1Archived() {
  return (
    <div>
      <div className="border-b bg-amber-50/70 px-4 py-2 flex items-center gap-2 text-amber-800 text-sm">
        <AlertTriangle className="h-4 w-4" />
        <span>
          <strong>Preliminary First 5 Jobs Dashboard — Archived.</strong>{" "}
          Read-only reference. The active dashboard is at <a className="underline" href="/stage-1">/stage-1</a>.
        </span>
      </div>
      <Stage1 />
    </div>
  );
}