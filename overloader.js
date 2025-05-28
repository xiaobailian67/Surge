/**
 * @module overloader
 * @description 一个强大的函数重载工具，支持基于类型签名的函数调用。
 * 允许根据参数类型和数量定义多个函数实现，并在运行时自动选择匹配的实现。
 * 支持复杂的类型匹配，包括基本类型、联合类型、数组、对象和字面量类型。
 */

/**
 * 增强版类型检测函数
 * @param {*} arg - 要检测类型的值
 * @returns {string} 返回值的类型字符串
 * @description 比原生 typeof 更精确，可以区分 null、undefined、array 等类型
 */
const myTypeof = (arg) => {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (Array.isArray(arg)) return "array";
  const type = typeof arg;
  if (type === "function") return "Function";
  return type;
};
/**
 * 智能分割任意符号 - 处理字符串中的分隔符
 * @param {string} SYMBOL - 分隔符
 * @returns {Function} 返回一个接受字符串并按分隔符分割的函数
 * @description 考虑引号、括号嵌套等复杂情况，智能分割字符串
 */
const splitAny = (SYMBOL) => (str) => {
  let depth = 0;
  let start = 0;
  let canSplit = true; // 默认允许切割
  let quoteChar;
  let result = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    // 处理引号 - 核心逻辑
    if (/["']/.test(char)) {
      if (quoteChar && quoteChar === char) {
        canSplit = true;
        quoteChar = false;
      } else {
        quoteChar ||= char;
        canSplit = false;
      }
    }

    if (/[\[{(]/.test(char)) depth++;
    else if (/[\]})]/.test(char)) depth--;
    else if (canSplit && char === SYMBOL && depth === 0) {
      result.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }

  result.push(str.slice(start).trim());
  return result;
};

/**
 * 智能分割联合类型（考虑所有括号嵌套）
 * @type {Function}
 * @param {string} str - 包含联合类型的字符串
 * @returns {string[]} 分割后的类型字符串数组
 */
const splitUnionTypes = splitAny("|");

/**
 * 智能分割数组元素
 * @type {Function}
 * @param {string} str - 包含数组元素的字符串
 * @returns {string[]} 分割后的数组元素字符串
 */
const splitArrayElements = splitAny(",");

/**
 * 智能分割对象属性
 * @type {Function}
 * @param {string} str - 包含对象属性的字符串
 * @returns {string[]} 分割后的对象属性字符串数组
 */
const splitObjectProperties = splitArrayElements;

/**
 * 找到属性的冒号位置（考虑嵌套）- 改进版
 * @param {string} str - 属性字符串
 * @returns {number} 冒号的位置索引，如果没找到则返回-1
 * @description 考虑引号、括号嵌套等复杂情况，准确找到属性冒号位置
 */
const findPropertyColon = (str) => {
  let depth = 0;
  let inQuotes = false;
  let quoteChar = "";
  let bracketDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = "";
    }

    if (!inQuotes) {
      if (char === "{" || char === "(") depth++;
      else if (char === "}" || char === ")") depth--;
      else if (char === "[") bracketDepth++;
      else if (char === "]") bracketDepth--;
      else if (char === ":" && depth === 0 && bracketDepth === 0) {
        return i;
      }
    }
  }

  return -1;
};

/**
 * 递归解析复杂类型 - 将类型字符串解析为结构化的类型信息对象
 * @param {string} typeStr - 类型字符串
 * @returns {Object} 解析后的类型信息对象
 * @description 支持解析基本类型、联合类型、数组类型、对象类型和字面量类型
 */
const parseType = Object.assign(
  (typeStr) => {
    for (const fn of parseType.parses) {
      const result = fn(typeStr.trim());
      if (result) return result;
    }
  },
  {
    //缓存解析结果
    cache: {},
    cached(typePattern) {
      const cache = parseType.cache[typePattern];
      if (cache) return cache;
      const parsed = parseType(typePattern);
      parseType.cache[typePattern] = parsed;
      return parsed;
    },
    parses: [
      // 联合类型解析 - 处理 string|number 格式
      (typeStr) => {
        if (!typeStr.includes("|")) return;

        const unionTypes = splitUnionTypes(typeStr);
        if (unionTypes.length <= 1) return;

        return {
          kind: "union",
          types: unionTypes.map((t) => parseType(t)),
        };
      },

      // 数组类型解析 - 处理 string[] 格式
      (typeStr) => {
        if (!typeStr.endsWith("[]")) return;

        let elementTypeStr = typeStr.slice(0, -2) || "array";

        // 如果元素类型被括号包围，去掉括号
        if (elementTypeStr.startsWith("(") && elementTypeStr.endsWith(")")) {
          elementTypeStr = elementTypeStr.slice(1, -1);
        }

        return {
          kind: "array",
          elementType: parseType(elementTypeStr),
          isHomogeneous: true,
        };
      },

      // 异质数组/字面量数组解析 - 处理 [a,b,c] 格式
      (typeStr) => {
        if (!typeStr.startsWith("[") || !typeStr.endsWith("]")) return;

        const content = typeStr.slice(1, -1);
        const elements = splitArrayElements(content);

        // 检查是否为字面量数组
        const isLiteral = elements.every(
          (el) => /^-?\d+(\.\d+)?$/.test(el.trim()) || /^['"].*['"]$/.test(el.trim())
        );

        return isLiteral
          ? // 字面量数组：[1,2,3] 或 ["a","b"]
            {
              kind: "literalArray",
              values: elements.map((el) => {
                const trimmed = el.trim();
                if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
                  return Number(trimmed);
                } else if (/^['"].*['"]$/.test(trimmed)) {
                  return trimmed.slice(1, -1);
                }
                return trimmed;
              }),
            }
          : // 异质数组：[string,number,boolean]
            {
              kind: "array",
              elementTypes: elements.map((el) => parseType(el)),
              isHomogeneous: false,
            };
      },

      // 对象类型解析 - 处理 {key:value} 格式
      (typeStr) => {
        if (!typeStr.startsWith("{") || !typeStr.endsWith("}")) return;

        const content = typeStr.slice(1, -1);

        // 检查是否为索引签名：{[key:string]:number}
        const indexSignatureMatch = content.match(/^\s*\[(.+?):\s*(.+?)\]\s*:\s*(.+)$/);
        if (indexSignatureMatch) {
          const keyType = parseType(indexSignatureMatch[2].trim());
          const valueType = parseType(indexSignatureMatch[3].trim());

          return {
            kind: "object",
            indexSignature: {
              keyType,
              valueType,
            },
          };
        }

        // 具体属性对象：{prop1:type1, prop2?:type2}
        const properties = {};
        const props = splitObjectProperties(content);

        props.forEach((prop) => {
          const colonIndex = findPropertyColon(prop);
          if (colonIndex > 0) {
            const key = prop.slice(0, colonIndex).trim();
            const type = prop.slice(colonIndex + 1).trim();

            const isOptional = key.endsWith("?");
            const cleanKey = isOptional ? key.slice(0, -1) : key;

            properties[cleanKey] = {
              type: parseType(type),
              optional: isOptional,
            };
          }
        });

        return {
          kind: "object",
          properties,
        };
      },

      // 字面量类型解析 - 处理具体值 1, "hello", true
      (typeStr) => {
        // 数字字面量
        if (/^-?\d+(\.\d+)?$/.test(typeStr)) {
          return {
            kind: "literal",
            value: Number(typeStr),
          };
        }

        // 字符串字面量
        if (/^['"].*['"]$/.test(typeStr)) {
          return {
            kind: "literal",
            value: typeStr.slice(1, -1),
          };
        }

        // 布尔字面量
        if (typeStr === "true" || typeStr === "false") {
          return {
            kind: "literal",
            value: typeStr === "true",
          };
        }
      },

      // 基础类型解析 - 处理 string, number, boolean 和可选类型
      (typeStr) => {
        const isOptional = typeStr.endsWith("?");
        return {
          kind: "primitive",
          type: typeStr,
          optional: isOptional,
        };
      },
    ],
  }
);

/**
 * 递归匹配 - 检查实际值是否符合类型规则
 * @param {*} actual - 实际值
 * @param {Object} typeInfo - 类型信息对象
 * @returns {boolean} 是否匹配
 * @description 根据类型信息递归检查值是否符合类型规则
 */
const matchesTypeRecursive = Object.assign(
  (actual, typeInfo) => matchesTypeRecursive[typeInfo.kind]?.(actual, typeInfo),
  {
    // 联合类型匹配 - 匹配多个类型中的任意一个 (string|number, "red"|"green"|"blue")
    union(actual, typeInfo) {
      return typeInfo.types.some((t) => matchesTypeRecursive(actual, t));
    },

    // 数组类型匹配 - 处理同质数组(string[])和异质数组([string,number])
    array(actual, typeInfo) {
      if (myTypeof(actual) !== "array") return false;
      if (!actual.length && !/array|any/.test(typeInfo.elementType.type)) return false;
      if (typeInfo.isHomogeneous) {
        return actual.every((item) => matchesTypeRecursive(item, typeInfo.elementType));
      }
      // 异质数组：按位置匹配不同类型，长度必须一致
      if (actual.length !== typeInfo.elementTypes.length) return false;
      return actual.every((item, i) =>
        matchesTypeRecursive(item, typeInfo.elementTypes[i])
      );
    },

    // 字面量数组匹配 - 精确匹配特定值的数组 ([1,2,3], ["a","b"])
    literalArray(actual, typeInfo) {
      if (myTypeof(actual) !== "array") return false;
      if (actual.length !== typeInfo.values.length) return false;
      return actual.every((item, i) => item === typeInfo.values[i]);
    },

    // 字面量类型匹配 - 只匹配特定的值 (1, "hello", true)
    literal(actual, typeInfo) {
      return actual === typeInfo.value;
    },

    // 对象类型匹配 - 处理索引签名对象和具体属性对象
    object(actual, typeInfo) {
      if (myTypeof(actual) !== "object") return false;

      if (typeInfo.indexSignature) {
        // 索引签名对象：{[key:string]:number} - 动态键名，固定类型
        return Object.entries(actual).every(([key, value]) => {
          const keyMatches = matchesTypeRecursive(key, typeInfo.indexSignature.keyType);
          const valueMatches = matchesTypeRecursive(
            value,
            typeInfo.indexSignature.valueType
          );

          return keyMatches && valueMatches;
        });
      } else if (typeInfo.properties) {
        // 具体属性对象：{name:string, age?:number} - 固定属性名和类型
        return Object.keys(typeInfo.properties).every((key) => {
          const propInfo = typeInfo.properties[key];
          const hasProperty = actual.hasOwnProperty(key);
          // 可选属性可以不存在
          if (propInfo.optional && !hasProperty) {
            return true;
          }

          // 必需属性必须存在且类型匹配
          const propMatches =
            hasProperty && matchesTypeRecursive(actual[key], propInfo.type);

          return propMatches;
        });
      }
    },

    // 基础类型匹配 - 匹配原始类型 (string, number, boolean等)
    primitive(actual, typeInfo) {
      const actualType = myTypeof(actual);
      let { type } = typeInfo;
      // 处理可选类型：string? -> string|undefined
      if (typeInfo.optional) {
        type = type.replace("?", "|undefined").trim();
      }

      // 支持联合基础类型：string|number|any
      const types = type.split("|");
      return types.includes("any") || types.includes(actualType);
    },
  }
);

/**
 * 主匹配函数 - 检查值是否匹配类型模式
 * @param {*} actual - 实际值
 * @param {string} typePattern - 类型模式字符串
 * @returns {boolean} 是否匹配
 * @description 将类型模式解析为类型信息，然后检查值是否匹配
 */
const matchesType = (actual, typePattern) => {
  // 获取缓存或解析
  const typeInfo = parseType.cached(typePattern);
  return matchesTypeRecursive(actual, typeInfo);
};

/**
 * 检查参数列表是否匹配类型模式列表
 * @param {Array} actuals - 实际参数列表
 * @param {string[]} typePatterns - 类型模式列表
 * @returns {boolean} 是否匹配
 * @description 检查参数数量和类型是否符合签名要求
 */
const matchesSignature = (actuals, typePatterns) => {
  // 提前验证必需参数数量
  const requiredCount = typePatterns.filter((pattern) => !pattern.includes("?")).length;

  if (actuals.length < requiredCount) {
    console.log(`参数不足: 需要至少 ${requiredCount} 个，实际 ${actuals.length} 个`);
    return false;
  }

  if (actuals.length > typePatterns.length) {
    console.log(
      `参数过多: 最多接受 ${typePatterns.length} 个，实际 ${actuals.length} 个`
    );
    return false;
  }

  // 使用索引遍历，避免不必要的计算
  for (let i = 0; i < actuals.length; i++) {
    if (!matchesType(actuals[i], typePatterns[i])) {
      return false;
    }
  }

  return true;
};

/**
 * 创建一个函数重载器
 * @returns {Function} 返回一个支持重载的函数
 * @description 创建一个可以根据参数类型和数量选择不同实现的函数
 */
const overloader = () => {
  return Object.assign(
    /**
     * 重载函数 - 根据参数匹配合适的实现
     * @param {...*} args - 函数参数
     * @returns {*} 匹配的函数实现的返回值
     * @throws {Error} 如果没有找到匹配的实现则抛出错误
     */
    function overloade(...args) {
      const { any, ...signatures } = overloade.signatures;

      for (const [signature, fn] of Object.entries(signatures)) {
        const typePatterns = signature.split("-");
        if (matchesSignature(args, typePatterns)) {
          return fn(...args);
        }
      }

      // 将 any fallback 放到最后兜底
      if (any) return any(...args);

      throw new Error(`没有找到匹配签名 '${JSON.stringify(args)}' 的函数实现`);
    },
    {
      /**
       * 签名表：类型签名字符串 → 函数
       * 例如：{ "string-number": fn1, "any": fnFallback }jin
       */
      signatures: Object.create(null),

      /**
       * 添加一个函数实现
       * @param {...string} args - 类型模式，最后一个参数是函数实现
       * @returns {Function} 返回重载函数本身，支持链式调用
       * @example
       * // 添加一个接受字符串和数字的实现
       * fn.add('string', 'number', (str, num) => str.repeat(num));
       */
      add(...args) {
        const fn = args.pop();
        const key = args.map((txt) => txt.replace(/[\r\n\s]/g, "")).join("-");
        this.signatures[key] = fn;
        return this;
      },
    }
  );
};

/**
 * 导出重载器函数
 * @exports overloader
 */
export default overloader;

/**
 * 使用示例：
 *
 * // 创建一个支持重载的计算函数
 * const calc = overloader();
 *
 * // 添加处理两个数字的实现
 * calc.add('number', 'number', (a, b) => a + b);
 *
 * // 添加处理字符串和数字的实现
 * calc.add('string', 'number', (str, count) => str.repeat(count));
 *
 * // 添加处理数组的实现
 * calc.add('array', (arr) => arr.reduce((sum, val) => sum + val, 0));
 *
 * // 添加处理复杂对象的实现
 * calc.add("{[key:string]: number[]|string|number}[]", (objArray) => {
 *   console.log("匹配成功");
 *   return JSON.stringify(objArray);
 * });
 *
 * // 使用重载函数
 * calc(1, 2);                // 返回 3
 * calc("hello", 3);         // 返回 "hellohellohello"
 * calc([1, 2, 3, 4]);       // 返回 10
 * calc([{ name: "张三", hobbies: [1], age: 18 }]); // 匹配复杂对象实现
 */

// 测试代码
// const calc = overloader();

// calc.add("{[key:string]: number[]|string|number}[]", (...args) => {
//   console.log("匹配成功");
//   console.log(JSON.stringify(args));
// });
// calc([
//   {
//     name: "张三",
//     hobbies: [1],
//     age: 18,
//   },
// ]);
// $done();
