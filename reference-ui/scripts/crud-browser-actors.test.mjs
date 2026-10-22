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

test('recurring planner requires its exact opt-in fixture kind and genuine declared Core identity', () => {
  const recurring = { ...fixture, fixtureKind: 'recurring-purchases-v1', actors: { ...fixture.actors,
    recurringPlanner: { principalId: reviewer, workerId: null } } };
  assert.equal(resolveCrudBrowserActor(recurring, 'recurringPlanner'), reviewer);
  for (const changed of [{ fixtureKind: undefined }, { fixtureKind: 'invoice-unit-review-v1' },
    { browserActorSwitch: undefined }, { cliProofComplete: false }, { production: true },
    { actors: {} }, { actors: { recurringPlanner: { principalId: maker, workerId: null } } },
    { actors: { recurringPlanner: { principalId: reviewer, workerId: maker } } }])
    assert.throws(() => resolveCrudBrowserActor({ ...recurring, ...changed }, 'recurringPlanner'));
  for (const alias of ['recurringPlanner,systemReviewer', reviewer, ['recurringPlanner'], 'recurringAdmin'])
    assert.throws(() => resolveCrudBrowserActor(recurring, alias));
});
