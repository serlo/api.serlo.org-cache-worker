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

export async function wait(seconds = 1) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, seconds * 1000)
  })
}

export class Stack<T> {
  private stack: T[]

  public constructor() {
    this.stack = new Array<T>()
  }

  public push(element: T) {
    this.stack.push(element)
  }

  public pop() {
    if (this.isEmpty()) throw new StackUnderflowError('Stack is empty')
    return this.stack.pop()
  }

  public peek() {
    if (this.isEmpty()) throw new StackUnderflowError('Stack is empty')
    return this.stack[this.stack.length - 1]
  }

  public isEmpty() {
    return !this.stack.length
  }

  public peekAndPop() {
    const itemOnTop = this.peek()
    this.pop()
    return itemOnTop
  }
}

class StackUnderflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StackUnderflowError'
  }
}
