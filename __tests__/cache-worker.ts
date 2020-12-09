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
import { range } from 'ramda'
import { CacheWorker } from '../src/cache-worker'

const fakeCacheKeys = range(0, 11).map((x) => `de.serlo.org/api/key${x}`)

let cacheWorker: CacheWorker

const apiEndpoint = 'https://api.serlo.org/graphql'

const serloApi = graphql.link(apiEndpoint)

beforeEach(() => {
  cacheWorker = new CacheWorker({
    apiEndpoint: apiEndpoint,
    service: 'Cache Service',
    secret: 'blllkjadf',
    pagination: 5, // default is 100, 5 is just to speed up tests
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
    expect(cacheWorker.okLog.length).toEqual(3)
    expect(cacheWorker.hasSucceeded()).toBeTruthy()
  })

  // Not possible to make it faster due to the wait function in the cache worker
  const EXTENDED_TIMEOUT = 10000

  test(
    'bisect requests with error in order to update all others that are ok',
    async () => {
      setUpErrorsAtApi(['de.serlo.org/api/key1', 'de.serlo.org/api/key8'])
      await cacheWorker.update([...fakeCacheKeys])
      expect(cacheWorker.hasSucceeded()).toBeFalsy()
      expect(cacheWorker.errorLog[0].message).toContain(
        'Something went wrong while updating value of "de.serlo.org/api/key8"'
      )
      expect(cacheWorker.errorLog[1].message).toContain(
        'Something went wrong while updating value of "de.serlo.org/api/key1"'
      )
      expect(cacheWorker.errorLog.length).not.toBeGreaterThan(2)
    },
    EXTENDED_TIMEOUT
  )
  test('retries to update value if updating fails sometimes', async () => {
    setUpErrorsAtApi(['de.serlo.org/api/key10'], 2)
    await cacheWorker.update([...fakeCacheKeys])
    expect(cacheWorker.okLog.length).toEqual(3)
    expect(cacheWorker.hasSucceeded()).toBeTruthy()
  })
})

function setUpErrorsAtApi(wrongKeys: string[], maxRetriesBeforeWorking = 0) {
  let numberOfRetries = 0
  global.server.use(
    serloApi.mutation('_updateCache', (req, res, ctx) => {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      const cacheKeys = req.body?.variables!.cacheKeys
      if (
        /* eslint-disable @typescript-eslint/no-unsafe-member-access */
        wrongKeys.some((wrongKey) =>
          req.body?.variables!.cacheKeys!.includes(wrongKey)
        )
      ) {
        if (numberOfRetries >= maxRetriesBeforeWorking) {
          numberOfRetries++
          return res(
            ctx.errors([
              {
                /* eslint-disable @typescript-eslint/restrict-template-expressions */
                message: `Something went wrong while updating value of "${cacheKeys}"`,
              },
            ])
          )
        }
      }
      return res(
        ctx.data({ http: { headers: {} }, data: { _updateCache: null } })
      )
    })
  )
}
