import { useCallback, useEffect, useRef, useState } from "react";
import {
  EVIDENCE_TYPES,
  addEvidence,
  deleteEvidence,
  getEvidenceUrl,
  listEvidence,
  type EvidenceLinkType,
  type EvidenceRecord,
  type EvidenceType,
} from "@/lib/stage1Evidence";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { FileText, Paperclip, Download, Trash2, Loader2 } from "lucide-react";

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attach supporting paperwork to a single transaction line. Maturity-oriented:
 * paperwork is recommended, never required, and missing paperwork never blocks
 * the job. Attachments persist in Lovable Cloud (private `stage1-evidence`
 * storage bucket + `stage1_evidence` metadata), survive refresh and sign-out,
 * are available on any device, and can be re-opened / downloaded.
 */
export function Stage1EvidenceAttachments({
  runId,
  linkType,
  linkRef,
  linkLabel,
  defaultEvidenceType,
  title,
  readOnly = false,
}: {
  runId: string | null;
  linkType: EvidenceLinkType;
  linkRef: string;
  linkLabel: string;
  defaultEvidenceType: EvidenceType;
  title: string;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>(defaultEvidenceType);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!runId) {
      setItems([]);
      return;
    }
    try {
      setItems(await listEvidence(runId, linkType, linkRef));
    } catch {
      setItems([]);
    }
  }, [runId, linkType, linkRef]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onPick = async (file: File | undefined) => {
    if (!file || !runId) return;
    setBusy(true);
    try {
      await addEvidence({ runId, linkType, linkRef, linkLabel, evidenceType, file });
      await refresh();
      toast({ title: "Paperwork attached", description: `${file.name} saved to ${linkLabel}.` });
    } catch {
      toast({ title: "Could not attach", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onOpen = async (rec: EvidenceRecord, download: boolean) => {
    try {
      const res = await getEvidenceUrl(rec.id);
      if (!res) return;
      const a = document.createElement("a");
      a.href = res.url;
      if (download) a.download = rec.fileName;
      else a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(res.url), 60_000);
    } catch {
      toast({ title: "Could not open file", variant: "destructive" });
    }
  };

  const onRemove = async (rec: EvidenceRecord) => {
    try {
      await deleteEvidence(rec.id);
      await refresh();
      toast({ title: "Paperwork removed" });
    } catch {
      toast({ title: "Could not remove", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Paperclip className="h-4 w-4" /> {title}
        <span className="ml-auto text-[11px] font-normal text-muted-foreground">
          Supporting paperwork recommended
        </span>
      </div>

      {!readOnly && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Evidence type</Label>
            <Select value={evidenceType} onValueChange={(v) => setEvidenceType(v as EvidenceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVIDENCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Attach file / photo</Label>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              disabled={busy || !runId}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
              onChange={(e) => onPick(e.target.files?.[0] ?? undefined)}
            />
          </div>
        </div>
      )}

      {busy && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving paperwork…
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No paperwork attached yet. Adding it is recommended but not required — the job is never blocked.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((rec) => (
            <li
              key={rec.id}
              className="flex items-center gap-2 rounded border bg-background px-2 py-1.5 text-xs"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{rec.fileName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {rec.evidenceType} · {rec.linkLabel} · {new Date(rec.uploadedAt).toLocaleDateString()}
                  {rec.size ? ` · ${fmtSize(rec.size)}` : ""}
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpen(rec, false)}>
                Open
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpen(rec, true)}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              {!readOnly && (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-red-600" onClick={() => onRemove(rec)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
