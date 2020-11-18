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
/* eslint-disable import/no-extraneous-dependencies*/
import { GraphQLResponse } from 'apollo-server-types'
import { GraphQLClient, gql } from 'graphql-request'
import jwt from 'jsonwebtoken'
import { splitEvery } from 'ramda'

import { AbstractCacheWorker, Task } from './types'
import { wait, Stack } from './utils'

/**
 * Cache Worker of Serlo's API
 * makes the API to cache values of some chosen keys.
 * The user has to edit the file cache-keys.json for that.
 * Add environment variable PAGINATION in order to detemine
 * how many keys are going to be requested to be updated
 * each time
 */
export class CacheWorker implements AbstractCacheWorker {
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

  private stackOfTasks!: Stack<Task>

  public constructor({
    apiEndpoint,
    service,
    secret,
    pagination = 100,
  }: {
    apiEndpoint: string
    service?: string
    secret?: string
    pagination?: number
  }) {
    this.grahQLClient = new GraphQLClient(
      apiEndpoint,
      secret === undefined
        ? {}
        : {
            headers: {
              Authorization: `Serlo Service=${jwt.sign({}, secret, {
                expiresIn: '2h',
                audience: 'api.serlo.org',
                issuer: service,
              })}`,
            },
          }
    )
    this.pagination = pagination
  }

  /**
   * Requests Serlo's API to update its cache according to chosen keys.
   * @param keys an array of keys(strings) whose values should to be cached
   */
  public async update(keys: string[]): Promise<void> {
    if (keys.length === 0)
      throw new Error('EmptyCacheKeysError: no cache key was provided')
    this.stackOfTasks = this.makeStackOutOfKeys(keys, this.pagination)
    await this.makeRequests()
  }

  private makeStackOutOfKeys(keys: string[], pagination: number): Stack<Task> {
    const chunksOfKeys = splitEvery(pagination, keys)
    const stackOfTasks = new Stack<Task>()
    chunksOfKeys.forEach((chunk) => {
      const task = { keys: chunk, numberOfRetries: 0 }
      stackOfTasks.push(task)
    })
    return stackOfTasks
  }

  private async makeRequests() {
    while (!this.stackOfTasks.isEmpty()) {
      const task = this.stackOfTasks.peekAndPop()
      const { response, hasError } = await this.getResponse(task)
      if (hasError && task.keys.length > 1) {
        this.bisect(task)
      } else if (hasError && task.keys.length === 1) {
        await this.retry(task)
      } else {
        this.fillLogs(response)
      }
    }
  }

  private bisect(task: Task) {
    const splittedKeys = splitEvery(task.keys.length / 2, task.keys)
    splittedKeys.forEach((keys) => {
      const task = { keys, numberOfRetries: 0 }
      this.stackOfTasks.push(task)
    })
  }

  private async getResponse(
    task: Task
  ): Promise<{ response: GraphQLResponse | Error; hasError: boolean }> {
    let response: GraphQLResponse = {}
    let hasError = false
    try {
      response = await this.requestUpdateCache(task.keys)
      if (response.errors) {
        hasError = true
        return { response, hasError }
      }
    } catch (error) {
      hasError = true
      return { response: error as Error, hasError }
    }
    return { response, hasError }
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
    const variables = cacheKeys
    return this.grahQLClient.request(query, variables)
  }

  private async retry(task: Task) {
    const MAX_RETRIES = 3
    const { response, hasError } = await this.getResponse(task)
    if (!hasError || task.numberOfRetries >= MAX_RETRIES) {
      this.fillLogs(response)
      return
    }
    task.numberOfRetries++
    await this.retry(task)
    await wait(1)
  }

  private fillLogs(graphQLResponse: GraphQLResponse | Error): void {
    if (graphQLResponse instanceof Error) {
      this.errorLog.push(graphQLResponse)
    } else {
      this.okLog.push(graphQLResponse)
    }
  }

  /**
   * Evaluate if the cache worker has succeeded updating the values of
   * of all requested keys or not, in case of any error.
   * See the errorLog for a more detailed description of the errors.
   */
  public hasSucceeded(): boolean {
    if (this.errorLog.length > 0 || this.okLog.length == 0) {
      return false
    }
    return true
  }
}
