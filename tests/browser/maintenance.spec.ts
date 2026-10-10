import { test, expect } from '@playwright/test';

const password = 'local-browser-test-password';

test('maintenance redirects anonymous visitors without blocking the login page', async ({ page, request }) => {
  const response = await request.get('/', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location).pathname).toBe('/maintenance');

  const login = await page.goto('/login');
  expect(login?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
});

test('an administrator can log in through the browser during maintenance', async ({ page }) => {
  await page.goto('/login?redirect=/admin');
  await page.getByLabel('Username', { exact: true }).fill('browser-admin');
  await page.getByLabel('Password', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
  await page.locator('button[type="submit"]').click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/admin$/);

  // Exercise the authenticated session, not just a successful client redirect.
  const status = await page.request.get('/api/admin/maintenance');
  expect(status.status()).toBe(200);
  expect(await status.json()).toMatchObject({ enabled: true });
  expect((await page.request.get('/', { maxRedirects: 0 })).status()).toBe(200);
});

test('login still validates passwords and non-admin users remain gated', async ({ request }) => {
  const invalid = await request.post('/api/auth/login', {
    data: { username: 'browser-user', password: 'wrong-password' },
  });
  expect(invalid.status()).toBe(401);

  const login = await request.post('/api/auth/login', {
    data: { username: 'browser-user', password },
  });
  expect(login.status()).toBe(200);
  const session = await request.get('/api/auth/session');
  expect(session.status()).toBe(200);
  expect(await session.json()).toMatchObject({ user: { username: 'browser-user', isAdmin: false } });
  expect((await request.get('/', { maxRedirects: 0 })).status()).toBe(307);
  expect((await request.get('/api/admin/maintenance', { maxRedirects: 0 })).status()).toBe(307);
});
