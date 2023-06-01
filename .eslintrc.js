module.exports = {
  extends: ['shellscape/typescript', 'plugin:import/typescript'],
  overrides: [
    {
      files: ['**/fixtures/**', '**/scripts/**', '**/test/**'],
      rules: {
        'import/extensions': 'off',
        'import/no-extraneous-dependencies': 'off',
        'import/no-unresolved': 'off',
        'no-console': 'off'
      }
    }
  ],
  parserOptions: {
    project: ['./tsconfig.eslint.json', './*/tsconfig.json'],
    tsconfigRootDir: __dirname
  },
  rules: {
    '@typescript-eslint/member-ordering': 'off',
    'class-methods-use-this': 'off',
    'no-multi-assign': 'off',
    'no-useless-constructor': 'off',
    'sort-keys': 'off'
  }
};
