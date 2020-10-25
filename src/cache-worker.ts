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

import { GraphQLResponse } from "apollo-server-types";
import { GraphQLError } from "graphql";
import { GraphQLClient, gql } from "graphql-request";
import jwt from "jsonwebtoken";

import { wait } from "./utils";

export class CacheWorker {
  private grahQLClient: GraphQLClient;

  public okLog: GraphQLResponse[] = [];
  public errorLog: Error[] = [];

  private pagination: number;

  public constructor({
    apiEndpoint,
    service,
    secret,
    pagination = 100,
  }: {
    apiEndpoint: string;
    service?: string;
    secret?: string;
    pagination?: number;
  }) {
    this.grahQLClient = new GraphQLClient(
      apiEndpoint,
      secret === undefined
        ? {}
        : {
            headers: {
              Authorization: `Serlo Service=${jwt.sign({}, secret, {
                expiresIn: "2h",
                audience: "api.serlo.org",
                issuer: service,
              })}`,
            },
          }
    );
    this.pagination = pagination;
  }

  public async update(keys: string[]): Promise<void> {
    const keysBlocks = this.splitKeysIntoBlocks(keys, this.pagination);
    await this.requestUpdateByBlocksOfKeys(keysBlocks);
  }

  private splitKeysIntoBlocks(keys: string[], pagination: number): string[][] {
    const keysClone = [...keys];
    const blocksOfKeys: string[][] = [];
    while (keysClone.length) {
      const temp = keysClone.splice(0, pagination);
      blocksOfKeys.push(temp);
    }
    return blocksOfKeys;
  }

  private async requestUpdateByBlocksOfKeys(keysBlocks: string[][]) {
    for (const block of keysBlocks) {
      const updateCachePromise = this.requestUpdateCache(block);
      await this.handleError(updateCachePromise, block);
    }
  }

  private async requestUpdateCache(
    cacheKeys: string[]
  ): Promise<GraphQLResponse> {
    const query = gql`
      mutation _updateCache($cacheKeys: [String!]!) {
        _updateCache(keys: $cacheKeys)
      }
    `;
    const variables = cacheKeys;
    return this.grahQLClient.request(query, variables);
  }

  private async handleError(
    updateCachePromise: Promise<GraphQLResponse>,
    currentKeys: string[]
  ) {
    await updateCachePromise
      .then(async (graphQLResponse) => {
        if (graphQLResponse.errors) {
          await this.retry(currentKeys);
        }
        this.fillLogs(graphQLResponse);
      })
      .catch(async (error: GraphQLError) => {
        await this.retry(currentKeys);
        this.fillLogs(error);
      });
  }

  private async retry(currentKeys: string[]) {
    let keepTrying = true;
    const MAX_RETRIES = 4;
    for (let i = 0; keepTrying; i++) {
      try {
        const graphQLResponse = await this.requestUpdateCache(currentKeys);
        if (!graphQLResponse.errors || i === MAX_RETRIES) {
          keepTrying = false;
        }
      } catch (e) {
        if (i === MAX_RETRIES) {
          keepTrying = false;
        }
      }
      // TODO: make longer than 0 when timeout of jest is configured
      // to be longer than 5000 ms for the tests of this module
      await wait(0);
    }
  }

  private fillLogs(graphQLResponse: GraphQLResponse | Error): void {
    if (graphQLResponse instanceof Error || graphQLResponse.errors) {
      this.errorLog.push(graphQLResponse as Error);
      return;
    }
    this.okLog.push(graphQLResponse);
  }

  public hasFailed(): boolean {
    if (this.errorLog !== []) {
      return true;
    }
    return false;
  }
}
