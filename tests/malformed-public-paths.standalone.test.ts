// Observed nonexistent share-card names must not become server errors.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import Fastify from 'fastify';
import { closeDb } from '@aihot/backend/db';
import { registerOg } from '../apps/api/src/routes/og.ts';

const app = Fastify();
registerOg(app);
after(async () => { await app.close(); await closeDb(); });

test('inherited object names are nonexistent share cards', async () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '__defineGetter__', 'missing']) {
    const response = await app.inject(`/og/pages/${name}.png`);
    assert.equal(response.statusCode, 404, `${name}: ${response.body}`);
  }
});

test('ordinary share cards keep their PNG and conditional cache responses', async () => {
  const response = await app.inject('/og/pages/topics.png');
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers['content-type'], 'image/png');
  assert.deepEqual([...response.rawPayload.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  const cached = await app.inject({ url: '/og/pages/topics.png', headers: { 'if-none-match': response.headers.etag! } });
  assert.equal(cached.statusCode, 304);
});
