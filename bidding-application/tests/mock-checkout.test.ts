import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('development mock checkout safeguards', () => {
  it('is production-disabled and isolated from Razorpay integration code', async () => {
    const source = await readFile(
      path.join(root, 'app/api/payments/mock/checkout/route.ts'),
      'utf8',
    );
    expect(source).toContain("process.env.NODE_ENV === 'production'");
    expect(source).not.toMatch(/from ['"].*razorpay['"]/i);
    expect(source).not.toContain('createRazorpayOrder');
    expect(source).not.toContain('fetchRazorpayPayment');
  });

  it('updates inventory conditionally inside a serializable transaction', async () => {
    const source = await readFile(
      path.join(root, 'app/api/payments/mock/checkout/route.ts'),
      'utf8',
    );
    expect(source).toContain('stockQuantity: { gte: item.quantity }');
    expect(source).toContain('stockQuantity: { decrement: item.quantity }');
    expect(source).toContain('TransactionIsolationLevel.Serializable');
    expect(source).toContain("status: 'PAID'");
    expect(source).toContain('tx.cartItem.deleteMany');
  });
});
