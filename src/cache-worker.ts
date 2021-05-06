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
/* eslint-disable import/no-extraneous-dependencies */
import { GraphQLResponse } from 'apollo-server-types'
import { GraphQLClient, gql } from 'graphql-request'
import jwt from 'jsonwebtoken'
import { splitEvery } from 'ramda'

/**
 * Cache Worker of Serlo's API
 * makes the API to update cache values of some chosen keys.
 * The user has to edit the file cache-keys.json for that.
 * Add environment variable PAGINATION in order to determine
 * how many keys are going to be requested to be updated
 * each time
 */
export class CacheWorker {
  private grahQLClient: GraphQLClient

  private errors: ErrorResult[] = []

  private pagination: number

  private waitTime: number

  private tasks: Stack<Task> = []

  public constructor({
    apiEndpoint,
    service,
    secret,
    pagination,
    waitTime,
  }: {
    apiEndpoint: string
    service: string
    secret: string
    pagination: number
    waitTime: number
  }) {
    this.grahQLClient = new GraphQLClient(apiEndpoint, {
      headers: {
        Authorization: `Serlo Service=${getToken({ service, secret })}`,
      },
    })
    this.pagination = pagination
    this.waitTime = waitTime
  }

  /**
   * Requests Serlo's API to update its cache according to chosen keys.
   * @param keys an array of keys(strings) whose values should be cached
   */
  public async update(keys: string[]): Promise<ErrorResult[]> {
    if (keys.length === 0) {
      throw new Error('EmptyCacheKeysError: no cache key was provided')
    }
    splitEvery(this.pagination, keys).forEach((keys) => {
      this.tasks.push({ keys, numberOfRetries: 0 })
    })
    await this.makeRequests()
    return this.errors
  }

  private async makeRequests() {
    while (this.tasks.length) {
      const MAX_RETRIES = 3
      const BISECT_LIMIT = 1
      const task = this.tasks.pop() as Task
      const result = await this.runTask(task)

      if (result !== undefined) {
        if (task.keys.length > BISECT_LIMIT) {
          this.bisect(task)
        } else if (task.numberOfRetries < MAX_RETRIES) {
          this.tasks.push({
            ...task,
            numberOfRetries: task.numberOfRetries + 1,
          })

          await wait(this.waitTime)
        } else {
          this.errors.push({ keys: task.keys, error: result })
        }
      }
    }
  }

  private async runTask(task: Task): Promise<TaskResult> {
    try {
      await this.requestUpdateCache(task.keys)
    } catch (error) {
      return toError(error)
    }
  }

  private async requestUpdateCache(
    cacheKeys: string[]
  ): Promise<GraphQLResponse> {
    if (cacheKeys.length === 0) {
      throw new Error('EmptyCacheKeysError: no cache key was provided')
    }
    const query = gql`
      mutation updateCache($cacheUpdate: CacheRemoveInput!) {
        update(input: $cacheUpdate) {
          success
        }
      }
    `
    const variables = { cacheUpdate: { keys: cacheKeys } }
    return this.grahQLClient.request(query, variables)
  }

  private bisect(task: Task) {
    // TODO: make easier to change the division from 2 to 3, 4 etc.
    splitEvery(task.keys.length / 2, task.keys).forEach((keys) => {
      this.tasks.push({ keys, numberOfRetries: 0 })
    })
  }
}

type Stack<T> = Pick<Array<T>, 'push' | 'pop' | 'length'>

interface Task {
  keys: string[]
  numberOfRetries: number
}

type TaskResult = Error | undefined

interface ErrorResult {
  error: Error
  keys: string[]
}

async function wait(seconds = 1) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function getToken({ secret, service }: { secret: string; service: string }) {
  return jwt.sign({}, secret, {
    expiresIn: '2h',
    audience: 'api.serlo.org',
    issuer: service,
  })
}
