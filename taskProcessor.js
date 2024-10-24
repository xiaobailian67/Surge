class TaskProcessor {
  #fulfilledIndexes; // 已完成任务的索引集合
  #results; // 所有任务的执行结果
  #shouldStopAll; //停止所有任务
  #stopCount; //已停止任务的数量

  /**
   * 状态初始化函数
   * @private
   */

  #initializeState() {
    this.#fulfilledIndexes = new Set();
    this.#results = [];
    this.#shouldStopAll = false;
    this.#stopCount = 0;
  }

  /**
   * 停止所有任务
   * @param {string} [message]
   */
  stopAll(message = "") {
    this.#shouldStopAll = true;
    throw new Error(message);
  }

  /**
   * 停止单个任务
   * @param {string} [message]
   */
  stop(message = "") {
    this.#stopCount++;
    throw new Error(message);
  }

  /**
   * 创建延时Promise
   * @param {number} seconds - 延时秒数
   * @returns {Promise<void>}
   */
  #delay(seconds) {
    return seconds
      ? new Promise((resolve) => setTimeout(resolve, seconds * 1000))
      : Promise.resolve();
  }

  /**
   * 检查值是否为Promise
   * @param {any} value
   * @returns {boolean}
   */
  #isPromise(value) {
    return Boolean(value && typeof value.then === "function");
  }

  /**
   * 任务标准化
   * @param {Function|Promise|any} task
   * @returns {Function}
   */
  #normalizeTask(task) {
    if (this.#isPromise(task)) return task;
    if (typeof task === "function") return task;
    return () => task;
  }
  
    /**
   * 处理Promise数组，分类收集成功和失败结果
   * @param {Array<Promise>} promiseArray - Promise数组
   * @returns {Promise<{resolve?: Array, reject?: Array}>}
   */
  async #resolvePromises(promiseArray) {
    const reject = [];
    const resolve = [];

    for (const promise of promiseArray) {
      try {
        resolve.push(await promise);
      } catch (error) {
        reject.push(error);
      }
    }

    if (resolve.length && !reject.length) return { resolve };
    if (reject.length && !resolve.length) return { reject };
    return { resolve, reject };
  }


  /**
   * 执行限制并发数的任务组
   * @param {Array} tasks - 任务数组
   * @param {number} concurrencyLimit - 并发限制
   * @returns {Promise<boolean>} 是否所有任务都已完成
   */
  async #executeTasksWithLimit(tasks, concurrencyLimit) {
    const executing = new Set();

    for (let i = 0; i < tasks.length; i++) {
      // 检查是否需要中断所有任务处理
      if (this.#shouldStopAll) return false;
      // 如果该任务已完成，继续下一个任务
      if (this.#fulfilledIndexes.has(i)) continue;

      const task = tasks[i];
      const p = this.#isPromise(task) ? task : Promise.resolve().then(task);
      this.#results[i] = p;

      const e = p.then(() => {
        executing.delete(e);
        this.#fulfilledIndexes.add(i);
      });

      executing.add(e);

      executing.size >= concurrencyLimit && (await Promise.race(executing).catch());
    }

    await Promise.allSettled(this.#results);
    return this.#fulfilledIndexes.size + this.#stopCount >= tasks.length;
  }


  /**
   * 处理并发任务的主函数
   * @param {Array} tasks - 任务数组
   * @param {number} [concurrencyLimit=10] - 并发限制
   * @param {number} [maxRetry=2] - 最大重试次数
   * @param {number} [waitTime=0] - 重试等待时间(秒)
   * @returns {Promise<{resolve?: Array, reject?: Array}>}
   */
  async runTasks({ tasks = [], concurrencyLimit = 10, maxRetry = 2, waitTime = 0 }) {
    this.#initializeState();
    tasks = tasks.map(this.#normalizeTask, this);

    while (maxRetry-- && !this.#shouldStopAll) {
      const isFulfilled = await this.#executeTasksWithLimit(tasks, concurrencyLimit);
      if (isFulfilled) break;
      maxRetry && (await this.#delay(waitTime));
    }

    return this.#resolvePromises(this.#results);
  }
}
