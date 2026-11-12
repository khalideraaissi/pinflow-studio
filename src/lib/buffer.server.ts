const BUFFER_URL = "https://api.buffer.com";

export async function bufferGql<T = any>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(BUFFER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, variables }),
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Buffer ${res.status}: ${text.slice(0, 300)}`);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new Error(`Buffer ${res.status}: ${text.slice(0, 300)}`);
      const json = JSON.parse(text);
      if (json.errors?.length) throw new Error(`Buffer: ${json.errors.map((e: any) => e.message).join("; ")}`);
      return json.data as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && e.message.startsWith("Buffer") && !/Buffer (429|5\d\d)/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Buffer request failed");
}

export async function getOrganizations(apiKey: string) {
  const d = await bufferGql<{ account: { email?: string; organizations: { id: string; name: string }[] } }>(
    apiKey,
    `query { account { email organizations { id name } } }`,
  );
  return d.account;
}

export async function getPinterestChannels(apiKey: string, organizationId: string) {
  const d = await bufferGql<{ channels: { id: string; name: string; service: string; avatar?: string }[] }>(
    apiKey,
    `query($id: OrganizationId!) { channels(input: { organizationId: $id }) { id name service avatar } }`,
    { id: organizationId },
  );
  return d.channels.filter((c) => c.service?.toLowerCase() === "pinterest");
}

export async function getBoards(apiKey: string, channelId: string) {
  const d = await bufferGql<{ channel: { metadata: { boards?: { id: string; serviceId: string; name: string }[] } | null } }>(
    apiKey,
    `query($id: ChannelId!) { channel(input: { id: $id }) { metadata { ... on PinterestMetadata { boards { id serviceId name } } } } }`,
    { id: channelId },
  );
  return d.channel.metadata?.boards ?? [];
}

export async function addPinToQueue(apiKey: string, input: {
  channelId: string; text: string; imageUrl: string; boardServiceId: string; title: string; url: string;
}) {
  const d = await bufferGql<{ createPost: { post?: { id: string; status?: string; dueAt?: string }; message?: string } }>(
    apiKey,
    `mutation($input: CreatePostInput!) { createPost(input: $input) {
      ... on PostActionSuccess { post { id status dueAt } }
      ... on MutationError { message }
    } }`,
    {
      input: {
        channelId: input.channelId,
        text: input.text,
        schedulingType: "automatic",
        mode: "addToQueue",
        assets: [{ image: { url: input.imageUrl } }],
        metadata: { pinterest: { boardServiceId: input.boardServiceId, title: input.title.slice(0, 100), url: input.url } },
      },
    },
  );
  if (!d.createPost.post) throw new Error(d.createPost.message || "Buffer rejected the post");
  return d.createPost.post;
}
