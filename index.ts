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
import cacheKeys from "./cache-keys.json";
import { CacheWorker } from "./src/cache-worker";

start();

function start() {
  const cacheWorker = new CacheWorker({
    apiEndpoint: process.env.SERLO_ORG_HOST,
    secret: process.env.SECRET,
    service: process.env.SERVICE,
    pagination: parseInt(process.env.PAGINATION as string),
  });

  console.log("Updating cache values of the following keys:", cacheKeys);

  run({
    cacheWorker,
    cacheKeys,
  });
}

interface Config {
  cacheWorker: CacheWorker;
  cacheKeys: string[];
}

async function run(config: Config): Promise<void> {
  const { cacheWorker, cacheKeys } = config;
  await cacheWorker.update(cacheKeys);
  if (cacheWorker.hasFailed()) {
    declareFailure(cacheWorker.errorLog);
    return;
  }
  declareSuccess();
}

function declareFailure(errors: Error[]) {
  console.warn(
    "Cache update was run but the following errors were found",
    errors
  );
}

function declareSuccess() {
  console.log("Cache successfully updated");
}
