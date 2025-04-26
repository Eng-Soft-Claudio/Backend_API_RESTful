// jest.config.js
import dotenv from 'dotenv';

dotenv.config({ path: './.env.test' });

export default {
  transform: {
    '^.+\\.(js|cjs)$': 'babel-jest',
  },
  moduleNameMapper: {'^../utils/cloudinary.js$': '<rootDir>/src/utils/__mocks__/cloudinary.js'},
  preset: '@shelf/jest-mongodb',
  testEnvironment: 'node',
  testTimeout: 60000,
  watchPathIgnorePatterns: ['globalConfig'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: true,
  coverageDirectory: "coverage",
  roots: ['<rootDir>/src/tests'],
};