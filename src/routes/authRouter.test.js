const request = require('supertest');
const express = require('express');

jest.mock('../database/database.js');
jest.mock('jsonwebtoken');
jest.mock('../config.js', () => ({
    jwtSecret: 'secret',
    db: {
      listPerPage: 5,
      connection: {
        host: 'h',
        user: 'u',
        password: 'p',
        database: 'testdb',
        connectTimeout: 1000,
      },
    },
}));
jest.mock('../endpointHelper.js', () => ({
  asyncHandler: (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next),
}));
jest.mock('mysql2/promise', () => ({
    createConnection: jest.fn().mockResolvedValue({
      query: jest.fn(),
      execute: jest.fn().mockResolvedValue([[]]),
      end: jest.fn(),
    }),
}));

const jwt = require('jsonwebtoken');
const { DB, Role } = require('../database/database.js');

let authRouter;
let setAuthUser;
let setAuth;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(setAuthUser);
  app.use('/api/auth', authRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();

  DB.addUser = jest.fn();
  DB.getUser = jest.fn();
  DB.loginUser = jest.fn();
  DB.logoutUser = jest.fn();
  DB.isLoggedIn = jest.fn();

  jwt.sign.mockReturnValue('signed.token.sig');
  jwt.verify.mockReturnValue({
    id: 1,
    roles: [{ role: 'admin' }],
  });

  // reload module after mocks
  jest.isolateModules(() => {
    const mod = require('./authRouter.js'); // <-- adjust filename if different
    authRouter = mod.authRouter;
    setAuthUser = mod.setAuthUser;
    setAuth = mod.setAuth;
  });
});
test('POST /api/auth success', async () => {
  DB.addUser.mockResolvedValue({ id: 2, name: 'n', email: 'e', roles: [{ role: Role.Diner }] });

  const app = makeApp();

  const res = await request(app)
    .post('/api/auth')
    .send({ name: 'n', email: 'e', password: 'p' });

  expect(res.status).toBe(200);
  expect(DB.addUser).toHaveBeenCalled();
  expect(jwt.sign).toHaveBeenCalled();
  expect(DB.loginUser).toHaveBeenCalledWith(2, 'signed.token.sig');
});
test('POST /api/auth missing fields → 400', async () => {
    const app = makeApp();
  
    const res = await request(app)
      .post('/api/auth')
      .send({ email: 'e' });
  
    expect(res.status).toBe(400);
});  
