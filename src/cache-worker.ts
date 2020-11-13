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

import { AbstractCacheWorker } from './types'
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
    const stackOfKeys = this.makeStackOutOfKeys(keys, this.pagination)
    await this.dispatchKeys(stackOfKeys)
  }

  private makeStackOutOfKeys(
    keys: string[],
    pagination: number
  ): Stack<string[]> {
    const chunksOfKeys = splitEvery(pagination, keys)
    const stackOfKeys = new Stack<string[]>()
    chunksOfKeys.forEach((chunk) => stackOfKeys.push(chunk))
    return stackOfKeys
  }

  private async dispatchKeys(stackOfKeys: Stack<string[]>) {
    while (!stackOfKeys.isEmpty()) {
      const currentKeys = stackOfKeys.peekAndPop()
      const updateCachePromise = this.requestUpdateCache(currentKeys)
      await this.handleError(updateCachePromise, currentKeys)
    }
  }

  private async requestUpdateCache(
    cacheKeys: string[]
  ): Promise<GraphQLResponse> {
    const query = gql`
      mutation _updateCache($cacheKeys: [String!]!) {
        _updateCache(keys: $cacheKeys)
      }
    `
    const variables = cacheKeys
    return this.grahQLClient.request(query, variables)
  }

  private async handleError(
    updateCachePromise: Promise<GraphQLResponse>,
    currentKeys: string[]
  ) {
    await updateCachePromise
      .then(async (graphQLResponse) => {
        if (graphQLResponse.errors) {
          await this.retry(currentKeys)
          return
        }
        this.fillLogs(graphQLResponse)
      })
      .catch(async () => {
        await this.retry(currentKeys)
      })
  }

  private async retry(currentKeys: string[]) {
    let keepTrying = true
    const MAX_RETRIES = 4
    for (let i = 0; keepTrying; i++) {
      try {
        const graphQLResponse = await this.requestUpdateCache(currentKeys)
        if (!graphQLResponse.errors || i >= MAX_RETRIES) {
          keepTrying = false
          this.fillLogs(graphQLResponse)
        }
      } catch (error) {
        if (i >= MAX_RETRIES) {
          keepTrying = false
          this.fillLogs(error)
        }
      }
      await wait(1)
    }
  }

  // TODO: bisect()

  private fillLogs(graphQLResponse: GraphQLResponse | Error): void {
    if (graphQLResponse instanceof Error) {
      this.errorLog.push(graphQLResponse)
      return
    }
    if (graphQLResponse.errors) {
      // TODO: splited for coverage controll, put it back or delete
      this.errorLog.push(graphQLResponse as Error)
      return
    }
    this.okLog.push(graphQLResponse)
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
