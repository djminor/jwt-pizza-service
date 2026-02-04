const request = require('supertest');
const express = require('express');

const mockAuth = jest.fn((req, res, next) => {
  req.user = {
    id: 1,
    name: 'u',
    email: 't@test.com',
    roles: [{ role: 'admin' }],
    isRole: (r) => r === 'admin',
  };
  next();   // FIX
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
  const res = await request(makeApp()).get('/api/user/me');

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
