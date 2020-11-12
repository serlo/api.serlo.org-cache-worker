/**
 * This file is part of Serlo.org API
 *
 * Copyright (c) 2020 Serlo Education e.V.
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @copyright Copyright (c) 2020 Serlo Education e.V.
 * @license   http://www.apache.org/licenses/LICENSE-2.0 Apache License 2.0
 * @link      https://github.com/serlo-org/api.serlo.org for the canonical source repository
 */
import { graphql } from 'msw'

import { CacheWorker } from '../src/cache-worker'

const fakeCacheKeys = [...Array(25).keys()].map(
  (x) => `de.serlo.org/api/key${x}`
)

let cacheWorker: CacheWorker

const apiEndpoint = 'https://api.serlo.org/graphql'

const serloApi = graphql.link(apiEndpoint)

const EXTENDED_JEST_TIMEOUT = 20000

beforeEach(() => {
  cacheWorker = new CacheWorker({
    apiEndpoint: apiEndpoint,
    service: 'Cache Service',
    secret: 'blllkjadf',
    pagination: 10, // default is 100, 10 is just for making less overhead by testing
  })

  global.server.use(
    serloApi.mutation('_updateCache', (_req, res, ctx) => {
      return res(
        ctx.data(
          { http: { headers: {} }, data: { _updateCache: null } } // successful response
        )
      )
    })
  )
})

describe('Update-cache worker', () => {
  test('successfully calls _updateCache', async () => {
    await cacheWorker.update(fakeCacheKeys)
    expect(cacheWorker.hasSucceeded()).toBeTruthy()
  })
  test(
    'does not crash if _updateCache does not work',
    async () => {
      global.server.use(
        serloApi.mutation('_updateCache', (_req, res, ctx) => {
          return res(
            ctx.errors([
              {
                message: "_updateCache didn't work at all, but be cool",
              },
            ])
          )
        })
      )
      await cacheWorker.update([...fakeCacheKeys])
      expect(cacheWorker.okLog.length).toEqual(0)
      expect(cacheWorker.hasSucceeded()).toBeFalsy()
      expect(cacheWorker.errorLog[0].message).toContain(
        "_updateCache didn't work at all, but be cool"
      )
    },
    EXTENDED_JEST_TIMEOUT
  )
  test(
    'does not crash if it receives an error object',
    async () => {
      global.server.use(
        serloApi.mutation('_updateCache', () => {
          throw Error('Something went really wrong, but be cool')
        })
      )
      await cacheWorker.update([...fakeCacheKeys])
      expect(cacheWorker.okLog.length).toEqual(0)
      expect(cacheWorker.hasSucceeded()).toBeFalsy()
      expect(cacheWorker.errorLog[0].message).toContain(
        'Something went really wrong, but be cool'
      )
    },
    EXTENDED_JEST_TIMEOUT
  )
  test(
    'does not crash if a cache value does not get updated for some reason',
    async () => {
      global.server.use(
        serloApi.mutation('_updateCache', (req, res, ctx) => {
          /* eslint-disable @typescript-eslint/no-unsafe-call */
          if (req.body?.variables!.includes('de.serlo.org/api/key20')) {
            return res(
              ctx.errors([
                {
                  message:
                    'Something went wrong while updating value of "de.serlo.org/api/key20", but keep calm',
                },
              ])
            )
          }
          return res(
            ctx.data({ http: { headers: {} }, data: { _updateCache: null } })
          )
        })
      )
      await cacheWorker.update([...fakeCacheKeys])
      expect(cacheWorker.hasSucceeded()).toBeFalsy()
      expect(cacheWorker.errorLog[0].message).toContain(
        'Something went wrong while updating value of "de.serlo.org/api/key20", but keep calm'
      )
    },
    EXTENDED_JEST_TIMEOUT
  )
  test(
    'does not crash even though it had a problem with some values',
    async () => {
      global.server.use(
        serloApi.mutation('_updateCache', (req, res, ctx) => {
          return res(
            ctx.errors([
              {
                message: 'keyInexistent is not a valid key',
              },
            ])
          )
        })
      )
      await cacheWorker.update([
        'de.serlo.org/api/key0',
        'de.serlo.org/api/keyInexistent',
        'de.serlo.org/api/key10',
        'de.serlo.org/api/keyWrong',
      ])
      expect(cacheWorker.hasSucceeded()).toBeFalsy()
    },
    EXTENDED_JEST_TIMEOUT
  )

  // TODO: add test for pagination
})
