// Private rehearsal transport only. Never import this module into application code.
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const realGuid = value => typeof value === 'string' && guid.test(value) && value !== '00000000-0000-0000-0000-000000000000';
export function resolveCrudBrowserActor(fixture, alias) {
  if (!realGuid(fixture.actorId)) throw new Error('Protected maker identity required');
  if (alias === undefined) return fixture.actorId;
  // Exact fixed alias, protected manifest, genuine opt-in proof. No client-provided GUIDs or roles.
  const reviewer = fixture.actors?.systemReviewer;
  if (alias !== 'systemReviewer' || fixture.browserActorSwitch !== 'manifest-alias-v1'
    || fixture.production !== false || fixture.cliProofComplete !== true
    || !reviewer || !realGuid(reviewer.principalId) || reviewer.workerId !== null
    || reviewer.principalId.toLowerCase() === fixture.actorId.toLowerCase())
    throw new Error('Declared private actor alias required');
  return reviewer.principalId;
}
