import * as preset from 'ts-jest/presets';

export default {
  ...preset.defaultsESM,
  testEnvironment: 'node',
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        useESM: true,
      },
    ],
  },
};
