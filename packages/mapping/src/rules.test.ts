import { describe, expect, it } from 'vitest';
import { attendeeDomains, emailDomain, ruleMatches, sameName } from './rules.ts';
import { commit, meeting, note, rule } from './testkit.ts';

describe('ruleMatches — repo', () => {
  it('matches the exact repository name, case insensitively', () => {
    expect(ruleMatches(rule('cli-acme', 'repo', 'acme-api'), commit())).toBe(true);
    expect(ruleMatches(rule('cli-acme', 'repo', 'ACME-API'), commit())).toBe(true);
    expect(ruleMatches(rule('cli-acme', 'repo', ' acme-api '), commit())).toBe(true);
  });

  it('does not match a fragment, another repository or a missing repo', () => {
    expect(ruleMatches(rule('cli-acme', 'repo', 'acme'), commit())).toBe(false);
    expect(ruleMatches(rule('cli-acme', 'repo', 'northwind-portal'), commit())).toBe(false);
    expect(ruleMatches(rule('cli-acme', 'repo', 'acme-api'), meeting())).toBe(false);
  });
});

describe('ruleMatches — remote-contains', () => {
  it('matches a substring of the remote', () => {
    expect(ruleMatches(rule('cli-acme', 'remote-contains', 'acme/api'), commit())).toBe(true);
    expect(ruleMatches(rule('cli-acme', 'remote-contains', 'ACME'), commit())).toBe(true);
  });

  it('does not match an unrelated fragment', () => {
    expect(ruleMatches(rule('cli-acme', 'remote-contains', 'globex'), commit())).toBe(false);
    expect(ruleMatches(rule('cli-acme', 'remote-contains', 'acme'), commit({ remote: undefined }))).toBe(false);
  });
});

describe('ruleMatches — attendee-domain', () => {
  it('matches the domain of an attendee', () => {
    expect(ruleMatches(rule('cli-acme', 'attendee-domain', 'acme.example.org'), meeting())).toBe(true);
    expect(ruleMatches(rule('cli-acme', 'attendee-domain', '@ACME.example.org'), meeting())).toBe(true);
  });

  it('matches the domain of the organizer', () => {
    const event = meeting({ attendees: [], organizerEmail: 'sofia@northwind.example.com' });
    expect(ruleMatches(rule('cli-northwind', 'attendee-domain', 'northwind.example.com'), event)).toBe(true);
  });

  it('does not match another domain or a meeting without attendee', () => {
    expect(ruleMatches(rule('cli-acme', 'attendee-domain', 'globex.example.net'), meeting())).toBe(false);
    expect(ruleMatches(rule('cli-acme', 'attendee-domain', 'acme.example.org'), commit())).toBe(false);
  });

  it('collects attendee and organizer domains without duplicates', () => {
    const event = meeting({ attendees: [{ email: 'sarah@acme.example.org', partStat: 'accepted' }] });
    expect(attendeeDomains(event)).toEqual(['acme.example.org', 'example.com']);
    expect(emailDomain('not-an-address')).toBe('');
  });
});

describe('ruleMatches — title-contains', () => {
  it('matches a word or a fragment of the meeting title', () => {
    expect(ruleMatches(rule('cli-acme', 'title-contains', 'Weekly'), meeting())).toBe(true);
    expect(ruleMatches(rule('cli-acme', 'title-contains', 'review'), meeting())).toBe(true);
  });

  it('does not match an absent or unrelated title', () => {
    expect(ruleMatches(rule('cli-acme', 'title-contains', 'Acme'), meeting())).toBe(false);
    expect(ruleMatches(rule('cli-acme', 'title-contains', 'Weekly'), commit())).toBe(false);
  });
});

describe('ruleMatches — note-tag', () => {
  it('matches the tag of a note, normalized', () => {
    expect(ruleMatches(rule('cli-globex', 'note-tag', 'globex'), note())).toBe(true);
    expect(ruleMatches(rule('cli-globex', 'note-tag', 'Globex'), note())).toBe(true);
  });

  it('does not match another tag or an evidence without tag', () => {
    expect(ruleMatches(rule('cli-globex', 'note-tag', 'acme'), note())).toBe(false);
    expect(ruleMatches(rule('cli-globex', 'note-tag', 'globex'), commit())).toBe(false);
  });
});

describe('ruleMatches — manual', () => {
  it('matches the exact evidence id only', () => {
    expect(ruleMatches(rule('cli-acme', 'manual', 'git:acme-api:3ab91c0'), commit())).toBe(true);
    expect(ruleMatches(rule('cli-acme', 'manual', 'git:acme-api'), commit())).toBe(false);
    expect(ruleMatches(rule('cli-acme', 'manual', 'git:acme-api:3ab91c0'), commit({ id: 'other' }))).toBe(false);
  });
});

describe('ruleMatches — guards', () => {
  it('never matches on an empty rule value', () => {
    for (const type of ['repo', 'remote-contains', 'attendee-domain', 'title-contains', 'note-tag'] as const) {
      expect(ruleMatches(rule('cli-acme', type, '   '), commit())).toBe(false);
    }
  });

  it('compares names without case or surrounding spaces', () => {
    expect(sameName(' Acme-API ', 'acme-api')).toBe(true);
    expect(sameName(undefined, 'acme-api')).toBe(false);
  });
});
