jest.mock('mysql2/promise');
jest.mock('bcrypt');

jest.mock('../config.js', () => ({
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
  StatusCodeError: class StatusCodeError extends Error {
    constructor(msg, code) {
      super(msg);
      this.statusCode = code;
    }
  },
}));

jest.mock('../model/model.js', () => ({
  Role: {
    Admin: 'admin',
    Franchisee: 'franchisee',
    Diner: 'diner',
  },
}));

jest.mock('./dbModel.js', () => ({
  tableCreateStatements: ['CREATE TABLE x(id int)'],
}));

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

let connectionMock;
let executeMock;
let queryMock;
let DB;

beforeEach(() => {
  jest.clearAllMocks();

  executeMock = jest.fn().mockResolvedValue([[]]);
  queryMock = jest.fn().mockResolvedValue([[]]);

  connectionMock = {
    execute: executeMock,
    query: queryMock,
    end: jest.fn().mockResolvedValue(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
  };

  mysql.createConnection.mockResolvedValue(connectionMock);
  bcrypt.hash.mockResolvedValue('hashed');
  bcrypt.compare.mockResolvedValue(true);

  jest.isolateModules(() => {
    DB = require('./database.js').DB;
  });
});

afterEach(async () => {
  await DB.initialized;
});

test('initializeDatabase creates schema + tables', async () => {
  executeMock.mockResolvedValueOnce([[{ SCHEMA_NAME: 'testdb' }]]);

  await DB.initialized;

  expect(mysql.createConnection).toHaveBeenCalledWith(
    expect.objectContaining({ decimalNumbers: true })
  );

  expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('CREATE DATABASE'));
  expect(queryMock).toHaveBeenCalledWith('CREATE TABLE x(id int)');
  expect(connectionMock.end).toHaveBeenCalled();
});
test('initializeDatabase handles error', async () => {
    mysql.createConnection.mockRejectedValueOnce(new Error('boom'));
  
    jest.isolateModules(() => {
      require('./database.js');
    });
});
test('getMenu', async () => {
    executeMock.mockResolvedValueOnce([[{ id: 1 }]]);
    const rows = await DB.getMenu();
    expect(rows[0].id).toBe(1);
});
test('addMenuItem', async () => {
    executeMock.mockResolvedValueOnce([{ insertId: 7 }]);
    const r = await DB.addMenuItem({ title: 't', description: 'd', image: 'i', price: 3 });
    expect(r.id).toBe(7);
});
test('addUser default role', async () => {
    executeMock
      .mockResolvedValueOnce([{ insertId: 2 }]) // user insert
      .mockResolvedValue([{ insertId: 3 }]);
  
    await DB.addUser({
      name: 'n',
      email: 'e',
      password: 'p',
      roles: [{ role: 'diner' }],
    });
  
    expect(bcrypt.hash).toHaveBeenCalled();
});
  
test('addUser franchisee role branch', async () => {
    executeMock
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([[{ id: 9 }]]) // getID
      .mockResolvedValue([]);
  
    await DB.addUser({
      name: 'n',
      email: 'e',
      password: 'p',
      roles: [{ role: 'franchisee', object: 'F' }],
    });
});
