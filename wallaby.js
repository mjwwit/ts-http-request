module.exports = () => {
  return {
    files: ['src/**/*.ts'],

    tests: ['test/**/*.spec.ts'],

    env: {
      type: 'node',
    },

    testFramework: 'tape',

    workers: { recycle: true },
  }
}
