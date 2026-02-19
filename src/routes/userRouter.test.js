const request = require('supertest');
const express = require('express');

const mockAuth = jest.fn((req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'unauthorized' });
  }
  
  req.user = {
    id: 1,
    name: 'u',
    email: 't@test.com',
    roles: [{ role: 'admin' }],
    isRole: (r) => r === 'admin',
  };
  next();
});

const mockSetAuth = jest.fn().mockResolvedValue('token123');

jest.mock('../database/database.js', () => ({
  Role: { Admin: 'admin' },
  DB: {
    updateUser: jest.fn(),
  },
}));

jest.mock('./authRouter.js', () => ({
  authRouter: {
    authenticateToken: (req, res, next) => mockAuth(req, res, next),
  },
  setAuth: (...args) => mockSetAuth(...args),
}));

jest.mock('../endpointHelper.js', () => ({
  asyncHandler: (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next),
}));

const { DB } = require('../database/database.js');
const userRouter = require('./userRouter.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/user', userRouter);

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('GET /api/user/me returns authenticated user', async () => {
  const res = await request(makeApp())
  .get('/api/user/me')
  .set('Authorization', 'Bearer dummy-token');;

  expect(res.status).toBe(200);
  expect(res.body.email).toBe('t@test.com');
});

test('PUT /api/user/:userId updates user and returns new token', async () => {
  DB.updateUser.mockResolvedValue({
    id: 1,
    name: 'newName',
    email: 'newEmail',
    roles: [{ role: 'admin' }],
  });

  const res = await request(makeApp())
    .put('/api/user/1')
    .set('Authorization', 'Bearer dummy-token')
    .send({
      name: 'newName',
      email: 'newEmail',
      password: 'newPass',
    });

  expect(res.status).toBe(200);
  expect(DB.updateUser).toHaveBeenCalledWith(
    1,
    'newName',
    'newEmail',
    'newPass'
  );
  expect(mockSetAuth).toHaveBeenCalled();
  expect(res.body.user.name).toBe('newName');
  expect(res.body.token).toBe('token123');
});

test('list users unauthorized', async () => {
  const listUsersRes = await request(makeApp()).get('/api/user');
  expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
  const listUsersRes = await request(makeApp())
    .get('/api/user')
    .set('Authorization', 'Bearer dummy-token'); 
  expect(listUsersRes.status).toBe(200);
});

async function registerUser(service) {
  const testUser = {
    name: 'pizza diner',
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const registerRes = await service.post('/api/auth').send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}
