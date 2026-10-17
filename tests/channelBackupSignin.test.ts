// Signing in to Google Drive and Dropbox for continuous backups: the date
// Google will end a sign-in, when the authorization link is offered again,
// a new client's secret, and how a refused or missing sign-in is described.
//   npx tsx --test tests/channelBackupSignin.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  googleSigninEnds,
  googleTokenError,
  oauthClientSecret,
  oauthSignedIn,
} from '../startos/actions/configureChannelBackup'
import { describeFailures } from '../startos/channelBackupStatus'

test("the end of a sign-in comes from Google's refresh_token_expires_in", () => {
  const now = Date.UTC(2026, 9, 17, 12)
  assert.equal(
    googleSigninEnds({ refresh_token_expires_in: 604799 }, now)?.toISOString(),
    '2026-10-24T11:59:59.000Z',
  )
  // A published app's sign-in carries no end, and nothing else is one.
  for (const r of [
    {},
    { refresh_token_expires_in: 0 },
    { refresh_token_expires_in: 'soon' },
    { refresh_token_expires_in: null },
  ])
    assert.equal(googleSigninEnds(r, now), null, JSON.stringify(r))
})

test('a refused sign-in is offered the link again until a new one', () => {
  assert.equal(oauthSignedIn('{"refresh_token":"r"}', false, false), true)
  assert.equal(oauthSignedIn('{"refresh_token":"r"}', true, false), false)
  assert.equal(oauthSignedIn('{"refresh_token":"r"}', true, true), true)
  assert.equal(oauthSignedIn(null, false, false), false)
  assert.equal(oauthSignedIn(null, true, true), false)
})

test("a new client's secret is never the previous client's", () => {
  const prev = { clientId: 'old-id', clientSecret: 'old-secret' }
  assert.equal(oauthClientSecret(prev, 'old-id', '', true), 'old-secret')
  assert.equal(oauthClientSecret(prev, 'old-id', 'new', true), 'new')
  assert.equal(oauthClientSecret(prev, 'new-id', 'new', true), 'new')
  assert.throws(
    () => oauthClientSecret(prev, 'new-id', '', true),
    /a new Client ID needs its own Client Secret/,
  )
  assert.throws(
    () => oauthClientSecret(prev, 'new-key', '', false),
    /a new App Key needs its own App Secret/,
  )
  assert.equal(oauthClientSecret({}, 'first-id', '', true), '')
})

test("Google's invalid_client gets a plain message, other errors pass", () => {
  const refused = googleTokenError(
    new Error(
      'oauth2.googleapis.com responded 401: {\n  "error": "invalid_client",\n  "error_description": "Unauthorized"\n}',
    ),
  )
  assert.match(
    refused.message,
    /^Google refused this Client ID and Client Secret/,
  )
  const other = new Error(
    'oauth2.googleapis.com responded 400: {"error": "invalid_grant"}',
  )
  assert.equal(googleTokenError(other), other)
})

test('a refused or missing sign-in is described, not shown as a code', () => {
  const said = (target: string, code: string) =>
    describeFailures([{ target, code, detail: '' }])
  assert.match(
    said('gdrive', 'signin'),
    /^Google Drive: Google refused the saved sign-in\. Sign in again in Configure Channel Backups\. While the Google Cloud app is in Testing/,
  )
  assert.equal(
    said('dropbox', 'signin'),
    'Dropbox: the saved sign-in was refused. Sign in again in Configure Channel Backups.',
  )
  assert.equal(
    said('gdrive', 'nocreds'),
    'Google Drive: not signed in yet. Finish the sign-in in Configure Channel Backups.',
  )
  assert.equal(
    said('nextcloud', 'nocreds'),
    'Nextcloud: its saved settings are incomplete. Save it again in Configure Channel Backups.',
  )
})
