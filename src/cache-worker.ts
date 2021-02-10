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

  /** The successful responses from Serlo's API */
  public okLog: GraphQLResponse[] = []
  /**
   *  The errors that ocurred while trying
   *  to update values of given keys.
   *  They can be caused by the client or
   *  by the server as well as from other
   *  origins.
   */
  public errorLog: Error[] = []

  private pagination: number

  private tasks: Stack<Task> = []

  public constructor({
    apiEndpoint,
    service,
    secret,
    pagination,
  }: {
    apiEndpoint: string
    service: string
    secret: string
    pagination: number
  }) {
    this.grahQLClient = new GraphQLClient(apiEndpoint, {
      headers: {
        Authorization: `Serlo Service=${getToken({ service, secret })}`,
      },
    })
    this.pagination = pagination
  }

  /**
   * Requests Serlo's API to update its cache according to chosen keys.
   * @param keys an array of keys(strings) whose values should to be cached
   */
  public async update(
    keys: string[]
  ): Promise<{ errorLog: Error[]; okLog: GraphQLResponse[] }> {
    if (keys.length === 0) {
      throw new Error('EmptyCacheKeysError: no cache key was provided')
    }
    splitEvery(this.pagination, keys).forEach((keys) => {
      this.tasks.push({ keys, numberOfRetries: 0 })
    })
    await this.makeRequests()
    return { errorLog: this.errorLog, okLog: this.okLog }
  }

  private async makeRequests() {
    while (this.tasks.length) {
      const MAX_RETRIES = 3
      const BISECT_LIMIT = 1
      const task = this.tasks.pop() as Task
      const result = await this.getResponse(task)

      if (result.success) {
        this.okLog.push(result.response)
      } else {
        if (task.keys.length > BISECT_LIMIT) {
          this.bisect(task)
        } else if (task.numberOfRetries < MAX_RETRIES) {
          this.tasks.push({
            ...task,
            numberOfRetries: task.numberOfRetries + 1,
          })

          await wait(1)
        } else {
          this.errorLog.push(result.error)
        }
      }
    }
  }

  private async getResponse(task: Task): Promise<Result> {
    try {
      const response = await this.requestUpdateCache(task.keys)
      return { response, success: true }
    } catch (error) {
      return { error: error as Error, success: false }
    }
  }

  private async requestUpdateCache(
    cacheKeys: string[]
  ): Promise<GraphQLResponse> {
    if (cacheKeys.length === 0) {
      throw new Error('EmptyCacheKeysError: no cache key was provided')
    }
    const query = gql`
      mutation _updateCache($cacheKeys: [String!]!) {
        _updateCache(keys: $cacheKeys)
      }
    `
    const variables = { cacheKeys }
    return this.grahQLClient.request(query, variables)
  }

  private bisect(task: Task) {
    // TODO: make easier to change the division from 2 to 3, 4 etc.
    splitEvery(task.keys.length / 2, task.keys).forEach((keys) => {
      this.tasks.push({ keys, numberOfRetries: 0 })
    })
  }

  /**
   * Evaluate if the cache worker has succeeded updating the values of
   * of all requested keys or not, in case of any error.
   * See the errorLog for a more detailed description of the errors.
   */
  public hasSucceeded(): boolean {
    // TODO: when the cache worker is stable enough
    // change it to simply `return this.errorLog.length === 0` or
    // deprecate it.
    // The okLog check is still necessary in case an error occur before
    // anything has been logged.
    if (this.errorLog.length > 0 || this.okLog.length === 0) {
      return false
    }
    return true
  }
}

interface Task {
  keys: string[]
  numberOfRetries: number
}

type Stack<T> = Pick<Array<T>, 'push' | 'pop' | 'length'>
interface SuccessResult {
  success: true
  response: GraphQLResponse
}
interface ErrorResult {
  success: false
  error: Error
}
type Result = ErrorResult | SuccessResult

async function wait(seconds = 1) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

function getToken({ secret, service }: { secret: string; service: string }) {
  return jwt.sign({}, secret, {
    expiresIn: '2h',
    audience: 'api.serlo.org',
    issuer: service,
  })
}
