import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

describe('Server logs issue fixes', () => {
  it('DATABASE_URL uses sslmode=verify-full to avoid node pg security warnings', () => {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    expect(envContent).toContain('sslmode=verify-full');
    expect(envContent).not.toContain('sslmode=require');
  });

  it('Root layout specifies data-scroll-behavior="smooth" for Next.js transition support', () => {
    const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
    const layoutContent = fs.readFileSync(layoutPath, 'utf8');
    expect(layoutContent).toContain('data-scroll-behavior="smooth"');
  });

  it('POST /api/auth/login handles empty or malformed JSON gracefully', async () => {
    const { POST } = await import('../app/api/auth/login/route');
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: 'invalid-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('email and password are required');
  });

  it('GET /api/products/user-space delegates correctly when called via dynamic route [id]', async () => {
    const { GET } = await import('../app/api/products/[id]/route');
    const req = new NextRequest('http://localhost:3000/api/products/user-space');
    const res = await GET(req, { params: Promise.resolve({ id: 'user-space' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('products');
  });
});
