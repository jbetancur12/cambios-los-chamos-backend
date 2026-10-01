# Tests

Integration tests for the money flows. They run the real services against a real PostgreSQL database
(`cambios_los_chamos_test`), because the bugs that matter here live in transactions and balances.

```bash
npm test                  # every test file
npm test giro.create      # only files whose path contains "giro.create"
npm run test:check        # type-checks src/ and tests/ (the runner itself does not type-check)
```

## How it works

- `tests/run.js` runs Node's built-in test runner through `ts-node`, the same runtime as the app, one
  file at a time (the files share one database).
- `tests/helpers/env.ts` points the app at `cambios_los_chamos_test` (override with `TEST_DB_NAME`) and turns
  off Sentry. `tests/helpers/db.ts` creates that database if it is missing, rebuilds its schema from the
  entities, and **refuses to run if the database name does not end in `_test`**.
- Every test starts from empty tables. `dbTest()` runs a test inside a MikroORM request context, like one HTTP
  request would; use `inContext()` to simulate several concurrent requests.
- `tests/helpers/factories.ts` builds users, minoristas, transferencistas, banks, accounts and rates.
- External services are mocked in the test files (for example WhatsApp), never called.

## Known bugs are recorded as `todo`

A test marked `{ todo: '...' }` asserts the **correct** behavior and currently fails because of a bug listed in
the improvement report. It does not break the run; when the bug is fixed the test starts passing and the
`todo` option should be removed.

## What is covered

- `giro.create.test.ts`: minorista discount and balance in favor, insufficient credit, profit split, admin
  giros, assignment in turns, and concurrent giros.
- `giro.lifecycle.test.ts`: execute, return and cancel, with the resulting minorista and bank account balances.
