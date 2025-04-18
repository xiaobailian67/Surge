class TaskProcessor {
  #fulfilledData; // 已完成任务的索引集合
  #pendingData; // 待定任务集合
  #failedIndexes; //已失败任务的索引
  #promises; // 所有任务的执行结果
  #shouldStopAll; //停止所有任务
  #stop; //停止单个任务

  /**
   * 状态初始化函数
   * @private
   */
  #initializeState() {
    this.#fulfilledData = new Map();
    this.#pendingData = new Map();
    this.#failedIndexes = new Set();
    this.#promises = [];
    this.#shouldStopAll = false;
  }

  /**
   * 停止所有任务 是否抛出错误用户自己决定
   * @param {string} [message]
   */
  halt() {
    this.#shouldStopAll = true;
  }

  /**
   * 停止所有任务并抛出错误
   * @param {string} [message] - 错误信息
   */
  abort(message = "中止所有任务") {
    this.#shouldStopAll = true;
    throw new Error(message);
  }

  /**
   * 停止单个任务并抛出错误
   * @param {string} [message]
   */
  cancel(message = "取消任务") {
    this.#stop();
    throw new Error(message);
  }

  /**
   * 创建延时Promise
   * @param {number} seconds - 延时秒数
   * @returns {Promise<void>}
   */
  delay(seconds) {
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
   * @returns {Promise<{fulfilled?: Array, rejected?: Array}>}
   */
  async #resolvePromises() {
    return {
      fulfilled: [...this.#fulfilledData.values()],
      rejected: [...this.#pendingData.values()],
    };
  }

  /**
   * 执行限制并发数的任务组
   * @param {Array} tasks - 任务数组
   * @param {number} concurrencyLimit - 并发限制
   * @returns {Promise<boolean>} 是否所有任务都已完成
   */
  async #executeTasksWithLimit(tasks, concurrencyLimit) {
    const { promise, resolve } = Promise.withResolvers();
    const executing = new Set();

    for (let i = 0; i < tasks.length; i++) {
      this.#stop = () => this.#failedIndexes.add(i);

      // 如果该任务已完成，继续下一个任务
      if (this.#fulfilledData.has(i) || this.#failedIndexes.has(i)) continue;

      const task = tasks[i];
      const p = this.#isPromise(task) ? task : Promise.resolve().then(task);
      this.#promises[i] = p;

      const e = p
        .then((result) => {
          executing.delete(e);
          this.#pendingData.delete(i);
          this.#fulfilledData.set(i, result);
        })
        .catch((err) => this.#pendingData.set(i, err.message ?? err))
        .finally(() => {
          if (this.#shouldStopAll) {
            resolve(true);
          } else if (
            this.#fulfilledData.size + this.#pendingData.size ===
            this.#promises.length
          ) {
            resolve(
              this.#fulfilledData.size + this.#failedIndexes.size >=
                tasks.length
            );
          }
        });

      executing.add(e);
      executing.size >= concurrencyLimit &&
        (await Promise.race(executing).catch(() => {}));
      if (this.#shouldStopAll) break;
    }

    return promise;
  }

  /**
   * 处理并发任务的主函数
   * @param {Array} tasks - 任务数组
   * @param {number} [concurrencyLimit=10] - 并发限制
   * @param {number} [maxRetry=2] - 最大重试次数
   * @param {number} [waitTime=0] - 重试等待时间(秒)
   * @returns {Promise<{resolve?: Array, reject?: Array}>}
   */
  async runTasks({
    tasks = [],
    concurrencyLimit = 10,
    maxRetry = 2,
    waitTime = 0,
  }) {
    if (!tasks.length) return {};
    this.#initializeState();
    tasks = tasks.map(this.#normalizeTask, this);

    while (maxRetry-- && !this.#shouldStopAll) {
      const isFulfilled = await this.#executeTasksWithLimit(
        tasks,
        concurrencyLimit
      );

      if (isFulfilled) break;
      maxRetry && (await this.delay(waitTime));
    }

    return this.#resolvePromises();
  }
}

/*
//使用范例

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms * 1000));
}

const taskProcessor = new TaskProcessor();

const test = async () => {
  const tasks = [
    async () => {
      await sleep(1);
      $.log('执行1');
      return 1;
    },

    async () => {
      await sleep(5);
      $.log('执行5');
      return 5;
    },

    async () => {
      await sleep(2);
      $.log('执行2');
      //taskProcessor.halt("2 停止所有任务");
      taskProcessor.abort('2 停止所有任务并抛出错误');
      //taskProcessor.cancel("2 停止单个任务并抛出错误");
      //throw 2
    },
  ];

  const result = await taskProcessor.runTasks({
    tasks,
    maxRetry: 2, //重复执行错误任务次数
  });

  $.log(result);
};

test();
*/
