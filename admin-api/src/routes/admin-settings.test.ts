import { jest } from '@jest/globals';

const getChatbotEnabledMock = jest.fn<() => Promise<boolean>>();
const setChatbotEnabledMock = jest.fn<() => Promise<boolean>>();
const getPortfolioOwnerIdMock = jest.fn<() => Promise<string | null>>();
jest.unstable_mockModule('../lib/repositories/users.js', () => ({
  getChatbotEnabled: getChatbotEnabledMock,
  setChatbotEnabled: setChatbotEnabledMock,
  getPortfolioOwnerId: getPortfolioOwnerIdMock,
}));
const connectMock = jest.fn(async () => ({
  query: jest.fn(async () => ({ rows: [], rowCount: 1 })),
  release: jest.fn(),
}));
jest.unstable_mockModule('../lib/pg.js', () => ({ getPool: () => ({ connect: connectMock }) }));

const { createAdminSettingsRouter } = await import('./admin-settings.js');
const CONFIG = {} as never;
const OWNER = '1d4c645a-447e-4b5b-924d-19a3c75a84db';

describe('/api/admin/settings/chatbot', () => {
  beforeEach(() => {
    // Owner resolved from the DB (migration 113), not from an env var.
    getPortfolioOwnerIdMock.mockResolvedValue(OWNER);
  });

  it('PATCH sets the flag on the DB-resolved owner and returns updated', async () => {
    setChatbotEnabledMock.mockResolvedValueOnce(true);
    const app = createAdminSettingsRouter(CONFIG);
    const res = await app.request('/chatbot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatbotEnabled: true }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: true });
    expect(setChatbotEnabledMock).toHaveBeenCalledWith(expect.anything(), OWNER, true);
  });

  it('PATCH rejects a non-boolean body with 400', async () => {
    const app = createAdminSettingsRouter(CONFIG);
    const res = await app.request('/chatbot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatbotEnabled: 'yes' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET returns the owner flag', async () => {
    getChatbotEnabledMock.mockResolvedValueOnce(true);
    const app = createAdminSettingsRouter(CONFIG);
    const res = await app.request('/chatbot');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ chatbotEnabled: true });
    expect(getChatbotEnabledMock).toHaveBeenCalledWith(expect.anything(), OWNER);
  });

  it('returns 500 when no portfolio owner is set', async () => {
    getPortfolioOwnerIdMock.mockResolvedValueOnce(null);
    const app = createAdminSettingsRouter(CONFIG);
    const res = await app.request('/chatbot');
    expect(res.status).toBe(500);
  });
});
