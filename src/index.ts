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
import fs from 'fs'
import path from 'path'
import { CacheWorker } from './cache-worker'

void start()

async function start() {
  let pagination: number | undefined
  if (process.env.PAGINATION == undefined) {
    pagination = undefined
  } else {
    pagination = parseInt(process.env.PAGINATION)
  }
  if (pagination !== undefined && pagination <= 0) {
    throw new Error('pagination has to be a positive number')
  }

  const cacheWorker = new CacheWorker({
    apiEndpoint: process.env.SERLO_ORG_HOST,
    secret: process.env.SECRET,
    service: process.env.SERVICE,
    pagination,
  })
  
  const cacheKeysPath = path.join(__dirname, 'cache-keys.json')
  const data = fs.readFileSync(cacheKeysPath, 'utf8')
  const cacheKeys = JSON.parse(data) as string[]
  
  const { errorLog } = await cacheWorker.update(cacheKeys)

  if (cacheWorker.hasSucceeded()) {
    console.log('Cache successfully updated')
  } else {
    console.warn('Cache updated with the following errors', errorLog)
  }
}
