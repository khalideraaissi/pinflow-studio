import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, Eye, ImagePlus, Pencil, RefreshCw, RotateCcw, Send, Trash2, Upload } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  bufferOverview, deletePins, listPins, generatePinImage, importPins, saveSettings, sendPinToBuffer, setBoardForPins, updatePin,
} from "@/lib/pins.functions";
import { pinsQuery, settingsQuery } from "@/lib/queries";
import { REQUIRED_COLUMNS, STATUS_LABEL, buildPinDescription, validateRow } from "@/lib/pin-text";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pin Queue — Spreadsheet to Pinterest via Buffer" },
      { name: "description", content: "Upload a CSV or Excel file, generate vertical pin images, and add every Pin to your Buffer queue." },
      { property: "og:title", content: "Pin Queue — Spreadsheet to Pinterest via Buffer" },
      { property: "og:description", content: "Upload a spreadsheet, generate pin images, and queue them in Buffer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(pinsQuery), context.queryClient.ensureQueryData(settingsQuery)]),
  component: Dashboard,
});

type Pin = Awaited<ReturnType<typeof listPins>>[number];
type Row = { title: string; description: string; tags: string; image_prompt: string; article_url: string };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  generating: "bg-warning/25 text-foreground animate-pulse",
  image_ready: "bg-secondary text-secondary-foreground",
  sending: "bg-warning/25 text-foreground animate-pulse",
  added: "bg-success text-success-foreground",
  failed: "bg-destructive/15 text-destructive",
};

async function parseFile(file: File): Promise<{ rows: Row[]; missing: string[] }> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) return { rows: [], missing: [...REQUIRED_COLUMNS] };
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const norm = (k: string) => k.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const headers = new Set(Object.keys(raw[0] ?? {}).map(norm));
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.has(c));
  const rows = raw
    .map((r) => {
      const o: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) o[norm(k)] = String(v ?? "").trim();
      return { title: o["title"] ?? "", description: o["description"] ?? "", tags: o["tags"] ?? "", image_prompt: o["image_prompt"] ?? "", article_url: o["article_url"] ?? "" };
    })
    .filter((r) => Object.values(r).some(Boolean));
  return { rows, missing };
}

function Dashboard() {
  const qc = useQueryClient();
  const { data: pins } = useSuspenseQuery(pinsQuery);
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const overview = useServerFn(bufferOverview);
  const buffer = useQuery({ queryKey: ["buffer", settings.organization_id, settings.channel_id, settings.has_key], queryFn: () => overview({ data: {} }), enabled: settings.has_key, staleTime: 60_000 });
  const boards = buffer.data?.connected ? buffer.data.boards : [];
  const boardName = (id?: string | null) => boards.find((b) => b.serviceId === id)?.name;

  const doImport = useServerFn(importPins);
  const doUpdate = useServerFn(updatePin);
  const doDelete = useServerFn(deletePins);
  const doGen = useServerFn(generatePinImage);
  const doSend = useServerFn(sendPinToBuffer);
  const doBoards = useServerFn(setBoardForPins);
  const doSave = useServerFn(saveSettings);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState(false);
  const [editing, setEditing] = useState<Pin | null>(null);
  const [preview, setPreview] = useState(false);
  const [run, setRun] = useState<{ label: string; done: number; total: number } | null>(null);
  const running = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["pins"] });
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of pins) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [pins]);
  const invalidCount = pins.filter((p) => validateRow(p).length).length;

  async function onFile(file?: File): Promise<void> {
    if (!file) return;
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return void toast.error("Please upload a .csv or .xlsx file");
    try {
      const { rows, missing } = await parseFile(file);
      if (missing.length) return void toast.error(`Missing columns: ${missing.join(", ")}`);
      if (!rows.length) return void toast.error("No rows found in the file");
      for (let i = 0; i < rows.length; i += 200) await doImport({ data: { batchName: file.name, rows: rows.slice(i, i + 200) } });
      toast.success(`Imported ${rows.length} rows from ${file.name}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file");
    }
  }

  async function process(ids: string[], kind: "generate" | "send"): Promise<void> {
    if (running.current) return void toast.info("Already processing — please wait");
    if (!ids.length) return void toast.info("No rows to process");
    if (kind === "send" && (!settings.channel_id)) return void toast.error("Choose a Pinterest channel in Settings first");
    if (kind === "send") {
      const noBoard = pins.filter((p) => ids.includes(p.id) && !p.board_id && !settings.default_board_id).length;
      if (noBoard) return void toast.error("Pick a board (default or per row) before sending");
    }
    running.current = true;
    setRun({ label: kind === "generate" ? "Generating images" : "Sending to Buffer", done: 0, total: ids.length });
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const id = ids[i]!;
        const r = kind === "generate" ? await doGen({ data: { id } }) : await doSend({ data: { id } });
        if ("error" in r && r.error) failed++;
        if ("error" in r && r.error && kind === "send" && !("skipped" in r)) { toast.error(r.error); break; }
      } catch { failed++; }
      setRun((s) => (s ? { ...s, done: i + 1 } : s));
      refresh();
    }
    running.current = false;
    setRun(null);
    refresh();
    failed ? toast.warning(`${failed} row(s) failed — use Retry Failed Rows`) : toast.success(kind === "generate" ? "Images ready" : "All Pins added to the Buffer queue");
  }

  const order = (list: Pin[]) => list.map((p) => p.id);
  const selectedPins = pins.filter((p) => selected.has(p.id));
  const sendable = (list: Pin[]) => order(list.filter((p) => p.status !== "added" && !validateRow(p).length));
  const busy = !!run;

  async function downloadImage(p: Pin) {
    if (!p.image_url) return;
    const blob = await (await fetch(p.image_url)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${p.title.slice(0, 50).replace(/[^\w-]+/g, "-") || "pin"}.${blob.type.includes("jpeg") ? "jpg" : "png"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadResults() {
    const ws = XLSX.utils.json_to_sheet(pins.map((p) => ({
      title: p.title, description: p.description, tags: p.tags, image_prompt: p.image_prompt, article_url: p.article_url,
      board: boardName(p.board_id || settings.default_board_id) ?? "", image_url: p.image_url ?? "",
      status: STATUS_LABEL[p.status] ?? p.status, buffer_post_id: p.buffer_post_id ?? "", error: p.error ?? "",
    })));
    const csv = XLSX.utils.sheet_to_csv(ws);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "pin-results.csv";
    a.click();
  }

  const doneCount = counts["added"] ?? 0;
  const pct = run ? (run.done / run.total) * 100 : pins.length ? (doneCount / pins.length) * 100 : 0;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Setup strip */}
        <section className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4 text-sm">
          <span className={cn("h-2.5 w-2.5 rounded-full", buffer.data?.connected ? "bg-success" : "bg-destructive")} />
          <span>{!settings.has_key ? "Buffer not connected" : buffer.isLoading ? "Checking Buffer…" : buffer.data?.connected ? `Buffer: ${buffer.data.channels.find((c) => c.id === settings.channel_id)?.name ?? "no Pinterest channel chosen"}` : "Buffer connection failed"}</span>
          {buffer.data?.connected && settings.channel_id && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Default board</span>
              <Select value={settings.default_board_id ?? ""} onValueChange={async (v) => { await doSave({ data: { default_board_id: v } }); qc.invalidateQueries({ queryKey: ["settings"] }); }}>
                <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Choose a board" /></SelectTrigger>
                <SelectContent>{boards.map((b) => <SelectItem key={b.serviceId} value={b.serviceId}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <Link to="/settings" className="ml-auto text-primary hover:underline">Settings →</Link>
        </section>

        {/* Upload */}
        <section
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          className={cn("cursor-pointer rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors", drag ? "border-primary bg-accent" : "hover:border-primary/60")}
        >
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Upload className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 text-2xl">Drop your CSV or Excel file</h2>
          <p className="mt-1 text-sm text-muted-foreground">Columns: {REQUIRED_COLUMNS.join(", ")}</p>
        </section>

        {/* Actions + progress */}
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={busy || !pins.length} onClick={() => process(order(pins.filter((p) => !p.image_url && p.status !== "added" && p.image_prompt.trim())), "generate")}><ImagePlus />Generate All Images</Button>
            <Button variant="outline" disabled={!pins.length} onClick={() => setPreview(true)}><Eye />Preview Pins</Button>
            <Button disabled={busy || !selected.size} onClick={() => process(sendable(selectedPins), "send")}><Send />Send Selected ({selected.size})</Button>
            <Button disabled={busy || !pins.length} onClick={() => process(sendable(pins), "send")}><Send />Send All to Buffer</Button>
            <Button variant="outline" disabled={busy || !counts["failed"]} onClick={() => process(order(pins.filter((p) => p.status === "failed")), settings.channel_id ? "send" : "generate")}><RotateCcw />Retry Failed ({counts["failed"] ?? 0})</Button>
            <Button variant="ghost" disabled={!pins.length} onClick={downloadResults}><Download />Results CSV</Button>
            {selected.size > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <Select disabled={busy} onValueChange={async (v) => { await doBoards({ data: { ids: [...selected], board_id: v === "__default" ? null : v } }); refresh(); toast.success("Board assigned"); }}>
                  <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Set board for selected" /></SelectTrigger>
                  <SelectContent><SelectItem value="__default">Use default board</SelectItem>{boards.map((b) => <SelectItem key={b.serviceId} value={b.serviceId}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="ghost" size="icon" disabled={busy} aria-label="Delete selected" onClick={async () => { if (!confirm(`Delete ${selected.size} row(s)?`)) return; await doDelete({ data: { ids: [...selected] } }); setSelected(new Set()); refresh(); }}><Trash2 /></Button>
              </div>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>{run ? `${run.label}: ${run.done} of ${run.total} — ${run.total - run.done} remaining` : `${doneCount} of ${pins.length} added to Buffer · ${pins.length - doneCount} remaining`}</span>
              <span>{pins.length} rows{invalidCount ? ` · ${invalidCount} need fixing` : ""}</span>
            </div>
            <Progress value={pct} />
          </div>
        </section>

        {/* Table */}
        <section className="overflow-x-auto rounded-xl border bg-card">
          {!pins.length ? (
            <p className="p-10 text-center text-muted-foreground">No rows yet — upload a spreadsheet to begin.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3"><Checkbox checked={selected.size === pins.length} onCheckedChange={(v) => setSelected(v ? new Set(pins.map((p) => p.id)) : new Set())} aria-label="Select all" /></th>
                  <th className="p-3">Image</th><th className="p-3">Title</th><th className="p-3">Description</th><th className="p-3">Image prompt</th>
                  <th className="p-3">Article URL</th><th className="p-3">Board</th><th className="p-3">Status</th><th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {pins.map((p) => {
                  const errs = validateRow(p);
                  const locked = p.status === "generating" || p.status === "sending";
                  return (
                    <tr key={p.id} className="border-b align-top last:border-0">
                      <td className="p-3"><Checkbox checked={selected.has(p.id)} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(p.id) : n.delete(p.id); return n; })} /></td>
                      <td className="p-3">
                        {p.image_url ? <img src={p.image_url} alt={p.title} className="h-24 w-16 rounded object-cover" loading="lazy" /> : <div className="grid h-24 w-16 place-items-center rounded bg-muted text-[10px] text-muted-foreground">no image</div>}
                      </td>
                      <td className="max-w-[180px] p-3 font-medium">{p.title || <em className="text-destructive">missing</em>}</td>
                      <td className="max-w-[220px] p-3 text-muted-foreground"><p className="line-clamp-3">{p.description}</p></td>
                      <td className="max-w-[200px] p-3 text-muted-foreground"><p className="line-clamp-3">{p.image_prompt}</p></td>
                      <td className="max-w-[160px] truncate p-3"><a href={p.article_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{p.article_url}</a></td>
                      <td className="p-3">
                        <Select value={p.board_id ?? "__default"} disabled={locked || p.status === "added"} onValueChange={async (v) => { await doUpdate({ data: { id: p.id, board_id: v === "__default" ? null : v } }); refresh(); }}>
                          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="__default">Default{boardName(settings.default_board_id) ? ` (${boardName(settings.default_board_id)})` : ""}</SelectItem>{boards.map((b) => <SelectItem key={b.serviceId} value={b.serviceId}>{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[p.status])}>{STATUS_LABEL[p.status] ?? p.status}</span>
                        {errs.length > 0 && <p className="mt-1 text-xs text-destructive">Fix: {errs.join(", ")}</p>}
                        {p.error && <p className="mt-1 max-w-[200px] text-xs text-destructive">{p.error}</p>}
                        {p.buffer_post_id && <p className="mt-1 text-[10px] text-muted-foreground">ID {p.buffer_post_id}</p>}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-0.5">
                          <Button size="icon" variant="ghost" aria-label="Edit" disabled={locked || p.status === "added"} onClick={() => setEditing(p)}><Pencil /></Button>
                          <Button size="icon" variant="ghost" aria-label="Regenerate image" disabled={busy || locked || p.status === "added"} onClick={() => process([p.id], "generate")}><RefreshCw /></Button>
                          <Button size="icon" variant="ghost" aria-label="Download image" disabled={!p.image_url} onClick={() => downloadImage(p)}><Download /></Button>
                          <Button size="icon" variant="ghost" aria-label="Delete" disabled={locked} onClick={async () => { await doDelete({ data: { ids: [p.id] } }); refresh(); }}><Trash2 /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <EditDialog pin={editing} onClose={() => setEditing(null)} onSave={async (patch) => { await doUpdate({ data: patch }); refresh(); setEditing(null); toast.success("Row updated"); }} />

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
          <DialogHeader><DialogTitle>Pin preview</DialogTitle></DialogHeader>
          <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
            {pins.map((p) => (
              <div key={p.id} className="mb-4 break-inside-avoid">
                {p.image_url ? <img src={p.image_url} alt={p.title} className="aspect-[2/3] w-full rounded-2xl object-cover" /> : <div className="grid aspect-[2/3] w-full place-items-center rounded-2xl bg-muted text-xs text-muted-foreground">Image not generated</div>}
                <p className="mt-2 text-sm font-semibold leading-snug">{p.title}</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{buildPinDescription(p.description, p.tags, settings.append_hashtags)}</p>
                <p className="mt-1 truncate text-[11px] text-primary">{p.article_url}</p>
                <p className="text-[11px] text-muted-foreground">Board: {boardName(p.board_id || settings.default_board_id) ?? "—"}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditDialog({ pin, onClose, onSave }: { pin: Pin | null; onClose: () => void; onSave: (p: Row & { id: string }) => Promise<void> }) {
  const [form, setForm] = useState<Row | null>(null);
  const current = form ?? (pin ? { title: pin.title, description: pin.description, tags: pin.tags, image_prompt: pin.image_prompt, article_url: pin.article_url } : null);
  const set = (k: keyof Row) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...current!, [k]: e.target.value });
  return (
    <Dialog open={!!pin} onOpenChange={(o) => { if (!o) { setForm(null); onClose(); } }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Edit row</DialogTitle></DialogHeader>
        {current && (
          <div className="space-y-3">
            <div className="space-y-1"><Label>Title</Label><Input value={current.title} onChange={set("title")} /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea rows={4} value={current.description} onChange={set("description")} /></div>
            <div className="space-y-1"><Label>Tags (comma separated)</Label><Input value={current.tags} onChange={set("tags")} /></div>
            <div className="space-y-1"><Label>Image prompt</Label><Textarea rows={3} value={current.image_prompt} onChange={set("image_prompt")} /></div>
            <div className="space-y-1"><Label>Article URL</Label><Input value={current.article_url} onChange={set("article_url")} /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setForm(null); onClose(); }}>Cancel</Button>
          <Button onClick={async () => { if (pin && current) { await onSave({ id: pin.id, ...current }); setForm(null); } }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
