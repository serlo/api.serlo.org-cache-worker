/**
 * This file is part of Serlo.org API
 *
 * Copyright (c) 2021 Serlo Education e.V.
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
 * @copyright Copyright (c) 2021 Serlo Education e.V.
 * @license   http://www.apache.org/licenses/LICENSE-2.0 Apache License 2.0
 * @link      https://github.com/serlo-org/api.serlo.org for the canonical source repository
 */
import { graphql } from 'msw'
import { range } from 'ramda'

import { CacheWorker } from '../src/cache-worker'

const apiEndpoint = 'https://api.serlo.org/graphql'
let cacheWorker: CacheWorker
const fakeCacheKeys = range(0, 11).map((x) => `de.serlo.org/api/key${x}`)

beforeEach(() => {
  cacheWorker = new CacheWorker({
    apiEndpoint: apiEndpoint,
    service: 'Cache Service',
    secret: 'blllkjadf',
    pagination: 5, // default is 100, 5 is just to speed up tests
    waitTime: 0,
  })
})

describe('Update-cache worker', () => {
  test('successfully calls _cache', async () => {
    setUpErrorsAtApi([])

    const errors = await cacheWorker.update(fakeCacheKeys)

    expect(errors).toHaveLength(0)
  })

  test('bisect requests with error in order to update all others that are ok', async () => {
    setUpErrorsAtApi([fakeCacheKeys[1], fakeCacheKeys[7]])

    const errors = await cacheWorker.update(fakeCacheKeys)

    expect(errors.map((error) => error.keys)).toEqual([
      [fakeCacheKeys[7]],
      [fakeCacheKeys[1]],
    ])
  })

  test('retries to update value if updating fails maximum twice', async () => {
    setUpErrorsAtApi([fakeCacheKeys[10]], 2)

    const errors = await cacheWorker.update(fakeCacheKeys)

    expect(errors).toHaveLength(0)
  })
})

function setUpErrorsAtApi(wrongKeys: string[], maxRetriesBeforeWorking = 0) {
  let numberOfRetries = 0

  global.server.use(
    graphql.link(apiEndpoint).mutation('_cache', (req, res, ctx) => {
      const cacheKeys = req.body?.variables!.cacheKeys as string[]

      if (wrongKeys.some((wrongKey) => cacheKeys.includes(wrongKey))) {
        if (numberOfRetries >= maxRetriesBeforeWorking) {
          numberOfRetries++

          return res(ctx.errors([{ message: `An error occurred` }]))
        }
      }
      return res(ctx.data({ data: { _cache: { set: { success: true } } } }))
    })
  )
}
