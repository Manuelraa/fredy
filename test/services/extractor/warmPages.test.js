/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const { acquireWarmPage } = await import('../../../lib/services/extractor/warmPages.js');

/**
 * The condition the warm-up hands to `page.waitForFunction`, with the arguments it passes along.
 *
 * @returns {Promise<{predicate: Function, args: any[], options: any}>}
 */
async function settleCondition() {
  let captured = null;
  const page = {
    isClosed: () => false,
    goto: async () => {},
    close: async () => {},
    waitForFunction: async (predicate, options, ...args) => {
      captured = { predicate, options, args };
    },
  };
  await acquireWarmPage({ newPage: async () => page }, 'https://www.immowelt.de');
  return captured;
}

/**
 * Evaluate the condition against one state of the page.
 *
 * @param {{cookie: string, challenge: boolean, loadedFor: number}} state the document's cookie,
 *   whether DataDome's challenge iframe is shown, and how long the document has been loaded in ms
 * @returns {Promise<boolean>}
 */
async function settledAt({ cookie, challenge, loadedFor }) {
  const { predicate, args } = await settleCondition();
  vi.stubGlobal('document', { cookie, querySelector: () => (challenge ? {} : null) });
  vi.stubGlobal('performance', { now: () => loadedFor });
  try {
    return predicate(...args);
  } finally {
    vi.unstubAllGlobals();
  }
}

// DataDome's tag hands out its first cookie with the 403 of the page's own first API call, then
// runs its device check in an iframe and reloads the page. A request sent before that is refused.
describe('#warm pages', () => {
  it('does not count the first datadome cookie as a settled session', async () => {
    expect(await settledAt({ cookie: 'datadome=first', challenge: false, loadedFor: 1_500 })).toBe(false);
  });

  it('waits while DataDome shows its device check', async () => {
    expect(await settledAt({ cookie: 'datadome=first', challenge: true, loadedFor: 6_000 })).toBe(false);
  });

  it('waits for a datadome cookie', async () => {
    expect(await settledAt({ cookie: 'other=1', challenge: false, loadedFor: 6_000 })).toBe(false);
  });

  it('counts a document that has kept its cookie and shown no challenge for a while as settled', async () => {
    expect(await settledAt({ cookie: 'other=1; datadome=checked', challenge: false, loadedFor: 4_000 })).toBe(true);
  });
});
