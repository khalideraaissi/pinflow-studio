import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bufferOverview, saveSettings } from "@/lib/pins.functions";
import { settingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Pin Queue" },
      { name: "description", content: "Connect Buffer, choose your Pinterest channel and board, and set image options." },
      { property: "og:title", content: "Settings — Pin Queue" },
      { property: "og:description", content: "Connect Buffer and configure Pinterest pin images." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  component: SettingsPage,
});

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-xl">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const { data: s } = useSuspenseQuery(settingsQuery);
  const save = useServerFn(saveSettings);
  const overview = useServerFn(bufferOverview);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const buffer = useQuery({
    queryKey: ["buffer", s.organization_id, s.channel_id, s.has_key],
    queryFn: () => overview({ data: {} }),
    enabled: s.has_key,
    staleTime: 60_000,
  });

  async function update(patch: Parameters<typeof save>[0]["data"], msg?: string) {
    setBusy(true);
    try {
      await save({ data: patch });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["buffer"] });
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const b = buffer.data;
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <h1 className="text-3xl">Settings</h1>

        <Section title="Buffer" hint="Your key stays on the server. Find it in Buffer → Settings → API.">
          <div className="space-y-2">
            <Label htmlFor="key">API key {s.api_key_hint && <span className="text-muted-foreground">(saved: {s.api_key_hint})</span>}</Label>
            <div className="flex gap-2">
              <Input id="key" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste a new Buffer API key" />
              <Button disabled={!key || busy} onClick={async () => { await update({ buffer_api_key: key.trim(), organization_id: null, channel_id: null, default_board_id: null }, "Key saved"); setKey(""); }}>Save</Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 text-sm">
            <span>
              {!s.has_key ? "Not connected" : buffer.isFetching ? "Testing connection…" : b?.connected ? <>Connected{b.email ? ` as ${b.email}` : ""}</> : <span className="text-destructive">{b?.error ?? "Not connected"}</span>}
            </span>
            <Button size="sm" variant="outline" disabled={!s.has_key || buffer.isFetching} onClick={() => buffer.refetch()}>Test connection</Button>
          </div>

          {b?.connected && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Organization</Label>
                <Select value={b.organizationId ?? undefined} onValueChange={(v) => update({ organization_id: v, channel_id: null, default_board_id: null })}>
                  <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>{b.organizations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pinterest channel</Label>
                <Select value={s.channel_id ?? undefined} onValueChange={(v) => update({ organization_id: b.organizationId, channel_id: v, default_board_id: null }, "Channel saved")}>
                  <SelectTrigger><SelectValue placeholder={b.channels.length ? "Choose" : "No Pinterest channels"} /></SelectTrigger>
                  <SelectContent>{b.channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default board</Label>
                <Select value={s.default_board_id ?? undefined} disabled={!s.channel_id} onValueChange={(v) => update({ default_board_id: v }, "Board saved")}>
                  <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>{b.boards.map((x) => <SelectItem key={x.serviceId} value={x.serviceId}>{x.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
        </Section>

        <Section title="AI images" hint="Images are made with Lovable AI — no extra key or account needed.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Input value="Lovable AI" disabled />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={s.image_model} onValueChange={(v) => update({ image_model: v }, "Model saved")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai/gpt-image-2.5-sunburst">GPT Image 2.5 (best quality)</SelectItem>
                  <SelectItem value="openai/gpt-image-2">GPT Image 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        <Section title="Image & pin options">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Dimensions</Label>
              <Input value="1000 × 1500 (2:3 vertical)" disabled />
            </div>
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={s.image_format} onValueChange={(v) => update({ image_format: v as "png" | "jpeg" }, "Format saved")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="png">PNG</SelectItem><SelectItem value="jpeg">JPEG</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Add tags as hashtags at the end of the description</span>
            <Switch checked={s.append_hashtags} onCheckedChange={(v) => update({ append_hashtags: v })} />
          </label>
        </Section>

        <Section title="Image storage" hint="Generated images are saved in Lovable Cloud storage automatically. No credentials needed." >
          <p className="text-sm text-muted-foreground">Each image link given to Buffer stays valid for one year.</p>
        </Section>
      </main>
    </div>
  );
}
