const express = require('express');
const request = require('supertest');

jest.mock('../database/database.js', () => ({
  DB: {
    getMenu: jest.fn(),
    addMenuItem: jest.fn(),
    getOrders: jest.fn(),
    addDinerOrder: jest.fn(),
  },
  Role: {
    Admin: 'admin',
  },
}));

// mock config
jest.mock('../config.js', () => ({
  factory: {
    url: 'http://factory.test',
    apiKey: 'factory-key',
  },
}));

// mock auth middleware
const mockAuth = jest.fn((req, res, next) => {
  req.user = {
    id: 1,
    name: 'Test User',
    email: 'test@test.com',
    isRole: (r) => r === 'admin',
  };
  next();
});

jest.mock('./authRouter.js', () => ({
  authRouter: {
    authenticateToken: (req, res, next) => mockAuth(req, res, next),
  },
}));

// async handler passthrough + error class
jest.mock('../endpointHelper.js', () => ({
  asyncHandler: (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next),
  StatusCodeError: class StatusCodeError extends Error {
    constructor(msg, code) {
      super(msg);
      this.statusCode = code;
    }
  },
}));

// mock fetch (node18+ global or polyfilled)
global.fetch = jest.fn();

const { DB } = require('../database/database.js');
const orderRouter = require('./orderRouter.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/order', orderRouter);

  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('GET /api/order/menu returns menu', async () => {
  DB.getMenu.mockResolvedValue([{ id: 1, title: 'Veggie' }]);

  const res = await request(makeApp()).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(DB.getMenu).toHaveBeenCalled();
});
test('PUT /api/order/menu adds item when admin', async () => {
    DB.getMenu.mockResolvedValue([{ id: 2 }]);
    DB.addMenuItem.mockResolvedValue();
  
    const res = await request(makeApp())
      .put('/api/order/menu')
      .send({ title: 'New Pizza' });
  
    expect(res.status).toBe(200);
    expect(DB.addMenuItem).toHaveBeenCalledWith({ title: 'New Pizza' });
    expect(DB.getMenu).toHaveBeenCalled();
});
test('PUT /api/order/menu rejects non-admin', async () => {
    mockAuth.mockImplementationOnce((req, res, next) => {
      req.user = { isRole: () => false };
      next();
    });
  
    const res = await request(makeApp())
      .put('/api/order/menu')
      .send({ title: 'Bad Pizza' });
  
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/unable to add menu item/);
});
  