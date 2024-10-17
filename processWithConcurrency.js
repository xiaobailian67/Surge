/**
 * 异步处理并发任务，支持并发限制、重试策略以及等待时间设置。
 * 该函数可以接收任意类型的任务列表，但只有返回Promise的函数才能使用重试功能。
* @param {Function} stop - stop回调函数，传递给每个被函数封装的任务。用于在任务执行过程中，中断所有任务(包括重试任务和未完成任务)。
 * @param {Array<any>} tasks - 任务列表，每个元素都被视为一个任务。可以是任意类型，但重试功能仅对返回Promise的函数有效。
 * @param {number} [concurrencyLimit=10] - 允许的最大并发数，默认为 10。
 * @param {number} [maxRetry=2] - 任务失败后允许的最大重试次数，默认为 2。注意：仅适用于任务列表中的返回Promise的函数。
 * @param {number} [waitTime=0] - 重试任务之前的等待时间（秒），默认为 0 秒，即无需等待。
 * @returns {Promise<Array>} 处理后的任务结果数组，其中包含解决(resolve)或拒绝(reject)的 Promise。
 */

async function processWithConcurrency(...args) {
  //处理传参
  let [tasks, concurrencyLimit = 10, maxRetry = 2, waitTime = 0] = exampleFunction(args);
  const results = []; // 存储任务结果: 类型为Promise
  const fulfilled_indexes = new Set(); // 存储已完成的任务索引
  let shouldStop = false;
  const stop = (message) => {
    shouldStop = true;
    if (message) throw new Error(message);
  };

  //重试可能出现的失败任务
  while (maxRetry--) {
    if (shouldStop) break;
    // 执行任务 返回任务状态
    const isFulfilled = await executeTasksWithLimit(
      results,
      tasks,
      concurrencyLimit,
      fulfilled_indexes
    );

    // 如果任务全部成功，退出循环
    if (isFulfilled) {
      break;
    } else {
      // 当尝试次数不超过最大重试次数时
      await delay(waitTime); // 等待指定时间后重试
    }
  }

  // 所有任务完成后，解析Promise 返回结果
  return resolvePromises(results);

  // 异步函数，用于处理一组 Promise 对象，分别收集它们的解决结果或错误
  async function resolvePromises(promiseArray) {
    // 如果输入数组为空，则直接直接返回
    if (promiseArray.length === 0) return promiseArray;

    // 初始化两个数组用于存储成功的结果和错误
    const reject = [],
      resolve = [];

    // 遍历 Promise 数组
    for (const promise of promiseArray) {
      try {
        // 解析Promise
        const result = await promise;
        resolve.push(result);
      } catch (error) {
        reject.push(error.toString());
      }
    }

    // 判断并返回相应的结果
    if (resolve.length > 0 && reject.length === 0) {
      // 只有成功的结果
      return { resolve };
    } else if (reject.length > 0 && resolve.length === 0) {
      // 只有失败的结果
      return { reject };
    }

    // 既有成功也有失败的情况
    return { resolve, reject };
  }

  // 执行任务数组，限制并发数
  async function executeTasksWithLimit(
    results,
    tasks,
    concurrencyLimit,
    fulfilled_indexes
  ) {
    const executing = new Set(); // 当前正在执行的任务集合

    for (let i = 0; i < tasks.length; i++) {
      if (shouldStop) return;

      if (fulfilled_indexes.has(i)) continue; //筛选有效任务;
      const task = tasks[i]; // 获取任务
      const p = isPromise(task) ? task : Promise.resolve().then(() => task(stop)); // 把每个任务转换为Promise对象
      results[i] = p; // 存储Promise以便后续处理

      // 当任务完成后，从执行中的任务Set中移除并添加成功任务索引
      const e = p.then(() => {
        executing.delete(e);
        fulfilled_indexes.add(i);
      });

      executing.add(e); // 将该任务加入执行中的Set

      //达到并发上限,等待任务完成，释放一个并发槽位
      if (executing.size >= concurrencyLimit) {
        await Promise.race(executing).catch(() => {});
      }
    }

    // 所有任务都启动后，使用Promise.allSettled等待所有任务结束
    await Promise.allSettled(results);

    // 检查是否所有任务都已完成
    return fulfilled_indexes.size >= tasks.length;
  }

  // 重写迭代器进行参数预处理
  function exampleFunction(args) {
    args[Symbol.iterator] = function* () {
      let i = 0;
      for (;;) {
        yield handleRest.call(this, i++);
      }
    };
    return args;

    function handleRest(i) {
      const value = this[i];
      if (value === null) {
        //处理默认值
        return void 0;
      }

      if (i === 0) {
        //处理任务list
        return value.map(normalizeTask);
      }

      return value;
    }
  }

  // 参数归一化处理，确保任务是函数形式并可以处理Promise对象
  function normalizeTask(task) {
    // 如果任务是Promise，直接返回Promise对象
    if (isPromise(task)) {
      return task;
    }
    // 如果任务不是函数类型，包装为函数
    if (typeof task !== "function") {
      return () => task;
    }

    return task;
  }

  // 延时函数（秒）
  function delay(seconds) {
    if (!seconds) return;
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  // 判断是否为Promise对象
  function isPromise(value) {
    return Boolean(typeof value.then === "function");
  }
}
