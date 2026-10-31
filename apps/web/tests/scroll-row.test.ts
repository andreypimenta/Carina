// The section tabs scroll sideways on phones; the chosen tab must land inside the visible row.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { centeredScrollLeft } from '../app/lib/scroll-row.ts';

const row = (scrollLeft: number) => ({ scrollLeft, clientWidth: 300, scrollWidth: 700, getBoundingClientRect: () => ({ left: 16 }) });
const tab = (left: number, width: number) => ({ getBoundingClientRect: () => ({ left, width }) });

test('centres an off-screen tab and stays within the row', () => {
  assert.equal(centeredScrollLeft(row(0), tab(16 + 500, 100)), 400);
  assert.equal(centeredScrollLeft(row(0), tab(16 + 650, 50)), 400);
  assert.equal(centeredScrollLeft(row(200), tab(16 - 200, 100)), 0);
  assert.equal(centeredScrollLeft(row(0), tab(16 + 200, 100)), 100);
});
