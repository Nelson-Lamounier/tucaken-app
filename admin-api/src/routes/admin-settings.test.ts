import { jest } from '@jest/globals';

const getChatbotEnabledMock = jest.fn<() => Promise<boolean>>();
const setChatbotEnabledMock = jest.fn<() => Promise<boolean>>();
jest.unstable_mockModule('../lib/repositories/users.js', () => ({
  getChatbotEnabled: getChatbotEnabledMock,
  setChatbotEnabled: setChatbotEnabledMock,
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
  beforeAll(() => { process.env['PORTFOLIO_OWNER_USER_ID'] = OWNER; });

  it('PATCH sets the flag on the owner and returns updated', async () => {
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
});
