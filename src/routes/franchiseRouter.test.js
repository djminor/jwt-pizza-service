const express = require('express');
const request = require('supertest');

jest.mock('../database/database.js', () => ({
  DB: {
    getFranchises: jest.fn(),
    getUserFranchises: jest.fn(),
    createFranchise: jest.fn(),
    deleteFranchise: jest.fn(),
    getFranchise: jest.fn(),
    createStore: jest.fn(),
    deleteStore: jest.fn(),
  },
  Role: {
    Admin: 'admin',
  },
}));

// auth middleware mock — injects req.user
const mockAuth = jest.fn((req, res, next) => {
  req.user = {
    id: 1,
    isRole: (r) => r === 'admin',
  };
  next();
});

jest.mock('./authRouter.js', () => ({
  authRouter: {
    authenticateToken: (req, res, next) => mockAuth(req, res, next),
  },
}));

jest.mock('../endpointHelper.js', () => ({
  StatusCodeError: class StatusCodeError extends Error {
    constructor(msg, code) {
      super(msg);
      this.statusCode = code;
    }
  },
  asyncHandler: (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next),
}));

const { DB } = require('../database/database.js');
const franchiseRouter = require('./franchiseRouter.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (!req.user) {
      req.user = { id: 99, isRole: () => false };
    }
    next();
  });
  app.use('/api/franchise', franchiseRouter);

  // error handler
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('GET /api/franchise returns franchises list', async () => {
  DB.getFranchises.mockResolvedValue([
    [{ id: 1, name: 'pizzaPocket' }],
    true,
  ]);

  const res = await request(makeApp())
    .get('/api/franchise?page=0&limit=10&name=x');

  expect(res.status).toBe(200);
  expect(res.body.franchises).toHaveLength(1);
  expect(res.body.more).toBe(true);

  expect(DB.getFranchises).toHaveBeenCalled();
});
test('GET /api/franchise/:userId returns data when user matches', async () => {
    DB.getUserFranchises.mockResolvedValue([{ id: 2 }]);
  
    mockAuth.mockImplementationOnce((req, res, next) => {
      req.user = { id: 5, isRole: () => false };
      next();
    });
  
    const res = await request(makeApp()).get('/api/franchise/5');
  
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(DB.getUserFranchises).toHaveBeenCalledWith(5);
});
test('GET /api/franchise/:userId returns empty when unauthorized', async () => {
    mockAuth.mockImplementationOnce((req, res, next) => {
      req.user = { id: 2, isRole: () => false };
      next();
    });
  
    const res = await request(makeApp()).get('/api/franchise/9');
  
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(DB.getUserFranchises).not.toHaveBeenCalled();
});
test('POST /api/franchise creates franchise for admin', async () => {
    DB.createFranchise.mockResolvedValue({ id: 3, name: 'newF' });
  
    const res = await request(makeApp())
      .post('/api/franchise')
      .send({ name: 'newF' });
  
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(3);
    expect(DB.createFranchise).toHaveBeenCalled();
});
test('POST /api/franchise rejects non-admin', async () => {
    mockAuth.mockImplementationOnce((req, res, next) => {
      req.user = { id: 1, isRole: () => false };
      next();
    });
  
    const res = await request(makeApp())
      .post('/api/franchise')
      .send({ name: 'x' });
  
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/unable to create/);
});
  
  