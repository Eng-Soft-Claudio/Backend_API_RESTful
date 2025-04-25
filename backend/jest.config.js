// jest.config.js
import dotenv from 'dotenv';

dotenv.config({ path: './.env.test' });

export default {
  testEnvironment: 'node',
  preset: '@shelf/jest-mongodb',
  roots: ['<rootDir>/src/tests'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: true,
  coverageDirectory: "coverage",
  transform: {
    '^.+\\.(js|cjs)$': 'babel-jest',
  },
  preset: '@shelf/jest-mongodb',
  watchPathIgnorePatterns: ['globalConfig'],
  testEnvironment: 'node',
  testTimeout: 60000,
};