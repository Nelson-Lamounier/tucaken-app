/** @format */
import type { AdminApiConfig } from '../config.js';
import { revalidatePortfolioArticle } from '../portfolio-revalidate.js';

const cfg = (secret: string | undefined): AdminApiConfig =>
    ({
        portfolioRevalidateUrl:    'http://nextjs.nextjs-app.svc.cluster.local:3000',
        portfolioRevalidateSecret: secret,
    } as unknown as AdminApiConfig);

describe('revalidatePortfolioArticle', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = realFetch; });

    it('skips (does not call fetch) when the secret is not configured', async () => {
        let called = 0;
        globalThis.fetch = (async () => { called += 1; return {} as Response; }) as unknown as typeof fetch;
        const r = await revalidatePortfolioArticle(cfg(undefined), 'my-slug');
        expect(r).toEqual({ ok: false, skipped: true });
        expect(called).toBe(0);
    });

    it('POSTs {secret, slug} to /api/revalidate and returns ok on 2xx', async () => {
        const calls: Array<{ url: string; body: unknown }> = [];
        globalThis.fetch = (async (url: string, init: RequestInit) => {
            calls.push({ url, body: JSON.parse(String(init.body)) });
            return { ok: true, status: 200 } as Response;
        }) as unknown as typeof fetch;

        const r = await revalidatePortfolioArticle(cfg('s3cr3t'), 'eks-golden-path');
        expect(r).toEqual({ ok: true, status: 200 });
        expect(calls[0]?.url).toBe('http://nextjs.nextjs-app.svc.cluster.local:3000/api/revalidate');
        expect(calls[0]?.body).toEqual({ secret: 's3cr3t', slug: 'eks-golden-path' });
    });

    it('returns ok:false with the status on a non-2xx response (no throw)', async () => {
        globalThis.fetch = (async () => ({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
        const r = await revalidatePortfolioArticle(cfg('s3cr3t'), 'my-slug');
        expect(r).toEqual({ ok: false, status: 500 });
    });

    it('never throws when fetch rejects — publish must be unaffected', async () => {
        globalThis.fetch = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
        await expect(revalidatePortfolioArticle(cfg('s3cr3t'), 'my-slug')).resolves.toEqual({ ok: false });
    });
});
