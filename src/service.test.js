jest.mock('./version.json', () => ({
  version: '1.2.3-test'
}));

const request = require('supertest');
const app = require('./service.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
//eslint-disable-next-line no-unused-vars
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  //eslint-disable-next-line no-unused-vars
  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
});
test('service returns error for unknown endpoint', async () => {
  const res = await request(app).get('/unknown-endpoint');
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({ message: 'unknown endpoint' });
});
test('service root endpoint', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ message: 'welcome to JWT Pizza', version: '1.2.3-test' });
});
test('service docs endpoint', async () => {
  const res = await request(app).get('/api/docs');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('version', '1.2.3-test');
  expect(res.body).toHaveProperty('endpoints');
  expect(Array.isArray(res.body.endpoints)).toBe(true);
  expect(res.body).toHaveProperty('config');
  expect(res.body.config).toHaveProperty('factory');
  expect(res.body.config).toHaveProperty('db');
});
