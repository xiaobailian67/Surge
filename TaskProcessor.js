export default class TaskProcessor {
	#fulfilledData;
	#pendingData;
	#failedIndexes;
	#shouldStopAll;

	#initializeState() {
		this.#fulfilledData = new Map();
		this.#pendingData = new Map();
		this.#failedIndexes = new Set();
		this.#shouldStopAll = false;
	}

	halt() {
		this.#shouldStopAll = true;
	}

	abort(message = "中止所有任务") {
		this.#shouldStopAll = true;
		throw new Error(message);
	}

	cancel(i, message = "取消任务") {
		this.#failedIndexes.add(i);
		throw new Error(message);
	}

	delay(seconds) {
		return seconds
			? new Promise((resolve) => setTimeout(resolve, seconds * 1000))
			: Promise.resolve();
	}

	#isPromise(value) {
		return Boolean(value && typeof value.then === "function");
	}

	#normalizeTask(task) {
		if (this.#isPromise(task)) return task;
		if (typeof task === "function") return task;
		return () => task;
	}

	async #resolvePromises() {
		return {
			fulfilled: [...this.#fulfilledData.values()],
			rejected: [...this.#pendingData.values()],
		};
	}

	async #executeTasksWithLimit(tasks, concurrencyLimit) {
		const { promise, resolve } = Promise.withResolvers();
		const executing = new Set();

		const checkCompletion = () => {
			if (this.#shouldStopAll) {
				resolve(true);
				return;
			}

			// 计算逻辑：成功数 + (待定与失败的并集数)
			const notFulfilledCount = new Set([
				...this.#pendingData.keys(),
				...this.#failedIndexes,
			]).size;

			if (this.#fulfilledData.size + notFulfilledCount >= tasks.length) {
				resolve(
					this.#fulfilledData.size + this.#failedIndexes.size >= tasks.length
				);
			}
		};

		for (let i = 0; i < tasks.length; i++) {
			if (this.#fulfilledData.has(i) || this.#failedIndexes.has(i)) continue;

			const task = tasks[i];
			const p = this.#isPromise(task) ? task : Promise.resolve().then(task);

			const e = p
				.then((result) => {
					executing.delete(e);
					this.#pendingData.delete(i);
					this.#fulfilledData.set(i, result);
				})
				.catch((err) => this.#pendingData.set(i, err.message ?? err))
				.finally(checkCompletion);

			executing.add(e);
			executing.size >= concurrencyLimit &&
				(await Promise.race(executing).catch(() => {}));

			if (this.#shouldStopAll) break;
		}
		checkCompletion();

		return promise;
	}

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
