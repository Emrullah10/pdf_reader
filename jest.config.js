export default {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testPathIgnorePatterns: ['/node_modules/', '/test/services/.*/integration/'],
      testMatch: ['**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['**/test/services/**/integration/**/*.test.js'],
    },
  ],
};
