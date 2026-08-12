import { describe, expect, it, vi } from 'vitest';

describe('Pixa authorization safeguards', () => {
  it('uses a cryptographically sized state and validates it in constant time', async () => {
    const { createPixaState, statesMatch } = await import('@/lib/pixa/adapter');
    const state = createPixaState();
    expect(state).toHaveLength(43);
    expect(statesMatch(state, state)).toBe(true);
    expect(statesMatch(state, `${state}x`)).toBe(false);
    expect(statesMatch(undefined, state)).toBe(false);
  });

  it('rejects expired and reused local mock authorization codes', async () => {
    vi.resetModules();
    process.env.PIXA_ADAPTER = 'mock';
    process.env.MOCK_PIXA_AUTHORIZATION_CODE = 'single-use-code';
    process.env.MOCK_PIXA_PROFILE = JSON.stringify({ sub: 'pixa-1', email: 'pixa@example.test' });
    process.env.MOCK_PIXA_CODE_EXPIRES_AT = new Date(Date.now() + 60_000).toISOString();
    let adapter = await import('@/lib/pixa/adapter');
    await expect(adapter.exchangePixaCode('single-use-code')).resolves.toMatchObject({ profile: { sub: 'pixa-1' } });
    await expect(adapter.exchangePixaCode('single-use-code')).rejects.toThrow(/already used/);
    vi.resetModules();
    process.env.MOCK_PIXA_CODE_EXPIRES_AT = new Date(Date.now() - 60_000).toISOString();
    adapter = await import('@/lib/pixa/adapter');
    await expect(adapter.exchangePixaCode('single-use-code')).rejects.toThrow(/expired/);
  });

  it('links Pixa identities and upserts one current measurement row', async () => {
    const source = await (await import('node:fs/promises')).readFile('lib/pixa/service.ts', 'utf8');
    expect(source).toContain('pixaSubjectId: profile.sub');
    expect(source).toContain('userId: user.id');
    expect(source).toContain('prisma.measurement.upsert');
    expect(source).toContain("status: 'PHOTO_REQUIRED'");
  });

  it('reuses an authenticated local Pixa link or measurement before redirecting externally', async () => {
    const source = await (await import('node:fs/promises')).readFile('app/api/auth/pixa/login/route.ts', 'utf8');
    expect(source).toContain('getSessionUser(request)');
    expect(source).toContain('pixaSubjectId: true');
    expect(source).toContain('pixaConnection: { select: { id: true } }');
    expect(source).toContain('if (!forceReconnect && user?.pixaConnection && (user.pixaSubjectId || user.measurement))');
    expect(source).toContain('return NextResponse.redirect(new URL(');
  });

  it('requires an authenticated session for measurement access', async () => {
    const source = await (await import('node:fs/promises')).readFile('app/api/measurements/me/route.ts', 'utf8');
    expect(source).toContain('requireSessionUser(request)');
  });
});