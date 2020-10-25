# Cache Worker for api.serlo.org

<img src="https://assets.serlo.org/meta/logo.png" alt="Serlo logo" title="Serlo" align="right" height="60" />

This repository defines the cache worker for updating the cache of Serlo's Graphql API.

## Development

- `yarn` to install all dependencies
- `yarn test` runs the unit tests

## Directory structure

- `__tests__` contains the unit tests
- `src/` defines the cache worker

## Configuration
- edit `src/cache-keys.json` to set the keys you want to update.
- Set environment variable PAGINATION (integer) to determine how many keys are going to be updated at each call.