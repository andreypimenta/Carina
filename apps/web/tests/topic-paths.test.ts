// Decoded controls in topic paths must not become server errors or injected response headers.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { startWebServer, type WebServer } from './web-server.ts';

let web: WebServer;
const api = createServer((_req, res) => {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 'not_found' }));
});
before(async () => { web = await startWebServer(api); });
after(() => web?.stop());

test('decoded controls in topic paths return 404 without injecting response headers', async () => {
  for (const slug of ['abc%0D%0AX-Evil:1', 'abc%0A', 'abc%0D', 'abc%0A%09X-Evil:1', '%0AX-Evil:1']) {
    for (const suffix of ['', '/page/1', '/page/2']) {
      const response = await fetch(`${web.origin}/topics/${slug}${suffix}`, { redirect: 'manual' });
      assert.equal(response.status, 404, `${slug}${suffix}: ${web.logs()}`);
      assert.equal(response.headers.get('x-evil'), null);
      assert.equal(response.headers.get('location'), null);
    }
  }
});

test('ordinary first topic page keeps its permanent redirect', async () => {
  const response = await fetch(`${web.origin}/topics/exemplo/page/1`, { redirect: 'manual' });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/topics/exemplo');
});
