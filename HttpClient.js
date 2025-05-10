/**
 * HTTP客户端 - 提供灵活的HTTP请求功能和钩子系统
 */
class HttpClient {
  #hooks; // 存储请求、成功和失败钩子
  #timeout; // 默认超时时间(秒)
  #coreHooks; // 核心钩子引用

  /**
   * 构造函数 - 返回对象函数实例
   *
   */
  constructor() {
    this.hooks = {
      req: new Set(), // 请求前钩子
      ok: new Set(), // 成功响应钩子
      fail: new Set(), // 失败响应钩子
    };

    this.#initDefaults(); // 初始化默认设置
    this.#initCoreHooks(); // 初始化核心钩子
    return this.#initHttpMethods(); // 初始化HTTP方法
  }

  /**
   * 工厂方法 - 创建并配置客户端实例
   * @param {Object} config - 配置选项
   * @returns {HttpClient} 客户端实例
   */
  static create(config = {}) {
    const client = new HttpClient(config.$timeout || 4);
    if (Object.keys(config).length) {
      client.config(config);
    }
    return client;
  }
  /**
   * 从当前实例创建新实例-继承配置
   * @param {Object} extraConfig - 额外配置(可选)
   * @returns {HttpClient} 新客户端实例
   */
  create(extraConfig) {
    // 调用静态create方法
    return this.constructor.create(extraConfig ?? this.defaults);
  }

  /**
   * 运行成功响应钩子
   * @private
   */
  #runOkHook(res, op) {
    return this.#runHooks("ok", res, op);
  }

  /**
   * 运行失败响应钩子
   * @private
   */
  #runFailHook(error, reject) {
    if (!this.hooks["fail"].size) return reject(error);
    return this.#runHooks("fail", error);
  }

  /**
   * 运行请求钩子
   * @private
   */
  #runReqHook(request) {
    return this.#runHooks("req", request);
  }

  /**
   * 通用钩子运行函数
   * @private
   */
  async #runHooks(type, ...args) {
    const value = args[0];
    for (let hook of this.hooks[type]) {
      const { isOn = true } = hook;
      if (!isOn) continue;
      args[0] = (await hook(...args)) ?? args[0];
    }

    if (value === args[0] && type === "fail") throw value;
    return args[0];
  }

  /**
   * 添加请求钩子
   */
  useReq(...args) {
    return this.addHook("req", ...args);
  }

  /**
   * 添加响应钩子
   */
  useRes(...args) {
    return this.addHook("ok", ...args);
  }

  /**
   * 添加错误钩子
   */
  useErr(...args) {
    return this.addHook("fail", ...args);
  }

  /**
   * 通用添加钩子方法
   * @private
   */
  addHook(type, ...args) {
    const fn = args.pop();
    if (typeof fn !== "function") return;
    if (args.includes("default")) fn.default = true;
    this.hooks[type].add(fn);
    return {
      remove: () => this.hooks[type].delete(fn),
      disable: (bool) => (fn.isOn = bool),
      status: () => fn.isOn ?? true,
    };
  }

  /**
   * 清除钩子
   * @param {string} type - 可选,指定钩子类型
   */
  clear(type) {
    if (type) this.hooks[type]?.clear();
    Object.values(this.hooks).forEach((hookSet) => {
      [...hookSet].filter((fn) => !fn.default).forEach((fn) => hookSet.delete(fn));
    });
  }

  /**
   * 初始化HTTP方法
   * @private
   */
  #initHttpMethods() {
    /**
     * 发送HTTP请求
     * @param {Object|string} opt - 请求选项或URL
     * @returns {Promise} 请求结果
     */
    const request = async (opt, t = 4) => {
      const { promise, resolve, reject } = Promise.withResolvers();
      // HTTP错误构造器
      const HTTPError = (e, res, req) =>
        Object.assign(new Error(e), {
          name: "HTTPError",
          request: req,
          response: res,
        });

      // 处理请求
      const op = await this.#runReqHook(opt);
      // 响应处理函数
      const handleRes = async (res) => {
        try {
          res.status ??= res.statusCode;
          res.json = () => JSON.parse(res.body);

          resolve(
            await (res.error || res.status < 200 || res.status > 307
              ? this.#runFailHook(HTTPError(res.error, res, op), reject)
              : this.#runOkHook(res, op))
          );
        } catch (e) {
          reject(e);
        }
      };

      // 设置超时
      const timer = setTimeout(
        () => reject(HTTPError("timeout", null, op)),
        (op.$timeout ?? t) * 1000
      );

      // 适配不同环境的HTTP客户端
      globalThis.$httpClient?.[op.metchod](op, (error, resp, body) => {
        handleRes({ error, ...resp, body });
      });

      globalThis.$task?.fetch(op).then(handleRes, handleRes);

      // 返回promise并清理超时定时器
      return promise.finally(() => clearTimeout(timer));
    };

    //创建请求方法
    const methods = ["get", "post", "put", "delete", "head", "patch", "options"];
    methods.forEach((method) => {
      request[method] = (op, t) => {
        op.url ?? (op = { url: op });
        return request({ ...op, method }, t);
      };
    });

    //骚操作 返返回一个函数并修改原型为HttpClient实例
    Object.setPrototypeOf(request, this);
    return request;
  }

  /**
   * 初始化核心钩子
   * @private
   */
  #initCoreHooks() {
    this.#coreHooks = {
      // 处理默认选项
      useDefaultOpt: this.useReq("default", (req) => {
        if (!req.url) req = { url: req };
        const { headers = {}, $auto = true } = req;
        return {
          metchod: "get",
          "auto-redirect": $auto,
          opts: { redirection: $auto },
          insecure: true,
          headers,
          ...this.defaults,
          ...req,
        };
      }),

      // 处理基础URL
      useBaseURL: this.useReq("default", (req) => {
        if (!req.baseURL && this.defaults?.baseURL) {
          req.baseURL = this.defaults.baseURL;
        }
        if (req.baseURL && req.url && !req.url.match(/^https?:\/\//)) {
          const base = req.baseURL.endsWith("/") ? req.baseURL.slice(0, -1) : req.baseURL;
          const path = req.url.startsWith("/") ? req.url : "/" + req.url;
          req.url = base + path;
        }
        return req;
      }),

      // 规范化响应头
      useNormHeaders: this.useRes("default", (res) => {
        const { headers = {} } = res;
        const newHeaders = {};
        for (let key in headers) {
          newHeaders[key.toLowerCase()] = headers[key];
        }
        res.headers = newHeaders;
        return res;
      }),

      // 自动处理二进制响应的钩子
      useBinaryResponse: this.useRes("default", (res, req) => {
        const { bodyBytes } = res;
        if (req.headers["binary-mode"] && bodyBytes) {
          res.body = new Uint8Array(bodyBytes);
        }
        return res;
      }),

      // 自动JSON解析
      useAutoJson: this.useRes("default", (res) => {
        const { headers = {} } = res;
        const content = headers["content-type"] ?? headers["Content-Type"];
        if (content?.includes("application/json")) {
          try {
            res.body = res.json();
          } catch {}
        }
        return res;
      }),
    };
  }

  /**
   * 初始化默认设置
   * @private
   */
  #initDefaults() {
    const hookMap = {};
    const coreHooks = this.coreHooks;

    this.defaults = new Proxy(
      {
        // 暴露钩子添加方法
        transformReq: this.useReq.bind(this),
        transformRes: this.useRes.bind(this),
        transformErr: this.useErr.bind(this),
      },
      {
        set(target, key, value, receiver) {
          if (key.startsWith("transform")) {
            hookMap[key]?.remove?.();
            value === "remove" ||
              (hookMap[key] = Reflect.get(target, key, receiver)(value));
            return true;
          }
          coreHooks.get(key)?.disable(value);
          return Reflect.set(...arguments);
        },
      }
    );
  }

  /**
   * 核心钩子访问器
   */
  get coreHooks() {
    const set = (obj) => Object.assign(this.#coreHooks, obj);
    const get = (input) => {
      if (input) return this.#coreHooks[input];

      return Object.fromEntries(
        Object.entries(this.#coreHooks).map(([key, value]) => [key, value.status()])
      );
    };

    return { set, get };
  }

  /**
   * 配置客户端
   * @param {Object} opts - 配置选项
   * @returns {HttpClient} 客户端实例(链式调用)
   */
  config(opts) {
    Object.assign(this.defaults, opts);
    return this;
  }
}

/**
 * 使用示例 - 创建汇率API客户端
 */
// const $http = HttpClient.create({
//   baseURL: "https://api.exchangerate-api.com/v4/latest",
//   useAutoJson: false,
//   $timeout: 2,
//   transformRes(res) {
//     return res.body;
//   },
// });

// // 发送请求获取人民币汇率
// $http
//   .config({
//     headers: {
//       "User-Agent":
//         "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36",
//     },
//   })
//   .get("/CNY")
//   .then((data) => {
//     console.log(data);
//     $done();
//   })
//   .catch((e) => {
//     console.log(e);
//     $done();
//   });

// const $api = $http.create({});

// $api("https://www.baidu.com")
//   .then((res) => {
//     console.log(res.body);
//     $done();
//   })
//   .catch((e) => {
//     console.log(e);
//     $done();
//   });
