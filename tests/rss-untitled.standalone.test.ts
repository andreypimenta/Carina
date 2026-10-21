// RSS 2.0 items may carry only a description (social posts such as Bluesky profiles): its opening becomes the title.
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchRss } from "@aihot/backend/sources/rss";

const long = "Novo ensaio randomizado no NEJM AI mostra que o escriba ambiental reduziu o tempo de documentação em consultas de atenção primária sem piorar a qualidade das notas clínicas";
const item = (inner: string) => `<item><link>https://bsky.app/profile/someone/post/${Math.abs(inner.length)}</link><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate>${inner}</item>`;
const feed = `<rss version="2.0"><channel><title>Perfil</title><link>https://bsky.app/profile/someone</link>${[
  item("<description>Post curto sobre IA na radiologia</description>"),
  item(`<description>${long}</description>`),
  item("<title>Com título</title><description>Corpo</description>"),
  item("<description>   </description>"),
].join("")}</channel></rss>`;
const server = http.createServer((_req, res) => {
  res.setHeader("content-type", "application/rss+xml");
  res.end(feed);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const root = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const previousPrivateFetch = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => {
  config.allowPrivateNetworkFetch = previousPrivateFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("an untitled item takes its description as the title, cut at a word boundary when long", async () => {
  const titles = (await fetchRss({ config: { feedUrl: `${root}/feed.xml` }, participation_mode: "editorial" } as never)).candidates.map((c) => c.title);
  assert.equal(titles.length, 3);
  assert.equal(titles[0], "Post curto sobre IA na radiologia");
  assert.ok(titles[1]!.endsWith("…") && titles[1]!.length <= 121 && long.startsWith(titles[1]!.slice(0, -1)));
  assert.ok(!titles[1]!.slice(0, -1).endsWith(" "));
  assert.equal(titles[2], "Com título");
});
