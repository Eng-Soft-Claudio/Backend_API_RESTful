// jest.config.js
export default {
    testEnvironment: 'node',
    preset: '@shelf/jest-mongodb',
    roots: ['<rootDir>/src/tests'],
    testPathIgnorePatterns: ['/node_modules/'],
    collectCoverage: true,
    coverageDirectory: "coverage",
    transform: {
      '^.+\\.js$': 'babel-jest', 
    },
  };