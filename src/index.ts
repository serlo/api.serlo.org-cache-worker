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
import fs from 'fs'
import path from 'path'

import { CacheWorker } from './cache-worker'

void start()

async function start() {
  const pagination = parseInt(process.env.PAGINATION ?? '100')

  if (Number.isNaN(pagination) || pagination <= 0) {
    throw new Error('pagination has to be a positive number')
  }

  const cacheWorker = new CacheWorker({
    apiEndpoint: process.env.API_HOST,
    secret: process.env.SECRET,
    service: process.env.SERVICE,
    pagination,
    waitTime: 1,
  })

  const cacheKeysPath = path.join(__dirname, 'config', 'cache-keys.json')
  const data = fs.readFileSync(cacheKeysPath, 'utf8')
  const cacheKeys = JSON.parse(data) as string[]

  console.log('Updating cache values of the following keys:', cacheKeys)

  const errors = await cacheWorker.update(cacheKeys)

  if (errors.length === 0) {
    console.log('Cache successfully updated')
  } else {
    for (const error of errors) {
      console.warn('Error while updating the keys', error.keys)
      console.warn('The following error was thrown', error.error)
    }
  }
}
