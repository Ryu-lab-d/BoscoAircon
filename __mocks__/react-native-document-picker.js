module.exports = {
  __esModule: true,
  default: {
    pickSingle: jest.fn(() => Promise.reject(new Error('not mocked in this test'))),
    pick: jest.fn(() => Promise.reject(new Error('not mocked in this test'))),
    pickDirectory: jest.fn(() => Promise.reject(new Error('not mocked in this test'))),
    releaseSecureAccess: jest.fn(() => Promise.resolve()),
    isCancel: jest.fn(() => false),
    isInProgress: jest.fn(() => false),
    types: {
      allFiles: '*/*',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
    },
  },
  isCancel: jest.fn(() => false),
  isInProgress: jest.fn(() => false),
  types: {
    allFiles: '*/*',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
  },
};
