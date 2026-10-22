import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCrudBrowserActor } from './crud-browser-actors.mjs';
const maker = '00000000-0000-4000-8000-000000000001';
const reviewer = '00000000-0000-4000-8000-000000000002';
const fixture = { actorId: maker, production: false, cliProofComplete: true,
  browserActorSwitch: 'manifest-alias-v1', actors: { systemReviewer: { principalId: reviewer, workerId: null } } };
test('existing default stays the protected maker without any switch opt-in', () => {
  assert.equal(resolveCrudBrowserActor({ actorId: maker }, undefined), maker);
});
test('only the fixed declared reviewer alias resolves to its manifest identity', () => {
  assert.equal(resolveCrudBrowserActor(fixture, 'systemReviewer'), reviewer);
  for (const alias of [reviewer, maker, '', 'erp_admin', 'systemReviewer,systemReviewer', ['systemReviewer']])
    assert.throws(() => resolveCrudBrowserActor(fixture, alias));
});
test('switching fails closed without complete private proof and distinct system identity', () => {
  for (const changed of [ { production: true }, { cliProofComplete: false }, { browserActorSwitch: undefined },
    { actors: undefined }, { actors: { systemReviewer: { principalId: maker, workerId: null } } },
    { actors: { systemReviewer: { principalId: reviewer, workerId: maker } } },
    { actors: { systemReviewer: { principalId: '00000000-0000-0000-0000-000000000000', workerId: null } } } ])
    assert.throws(() => resolveCrudBrowserActor({ ...fixture, ...changed }, 'systemReviewer'));
});
