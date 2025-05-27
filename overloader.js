const myTypeof = (arg) => {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (Array.isArray(arg)) return "[]";
  const type = typeof arg;
  if (type === "function") return "Function";
  return type === "object" ? "{}" : type;
};

// 智能分割联合类型（考虑所有括号嵌套）
const splitUnionTypes = (str) => {
  const result = [];
  let current = "";
  let depth = 0;
  let inQuotes = false;
  let quoteChar = "";

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
      // 考虑所有类型的括号
      if (char === "[" || char === "{" || char === "(") depth++;
      else if (char === "]" || char === "}" || char === ")") depth--;
      else if (char === "|" && depth === 0) {
        result.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
};

// 智能分割数组元素
const splitArrayElements = (str) => {
  const result = [];
  let current = "";
  let depth = 0;
  let inQuotes = false;
  let quoteChar = "";

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
      if (char === "[" || char === "{" || char === "(") depth++;
      else if (char === "]" || char === "}" || char === ")") depth--;
      else if (char === "," && depth === 0) {
        result.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
};

// 智能分割对象属性
const splitObjectProperties = (str) => {
  const result = splitArrayElements(str); // 逻辑相同

  return result;
};

// 找到属性的冒号位置（考虑嵌套）- 改进版
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

// 递归解析复杂类型 - 数组版本优化
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

        let elementTypeStr = typeStr.slice(0, -2);

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

      // 括号类型解析 - 处理 (type) 格式
      (typeStr) => {
        if (!typeStr.startsWith("(") || !typeStr.endsWith(")")) return;

        return parseType(typeStr.slice(1, -1));
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

// 递归匹配-传参match传参类型规则
const matchesTypeRecursive = Object.assign(
  (actual, typeInfo) => matchesTypeRecursive[typeInfo.kind]?.(actual, typeInfo),
  {
    // 联合类型匹配 - 匹配多个类型中的任意一个 (string|number, "red"|"green"|"blue")
    union(actual, typeInfo) {
      return typeInfo.types.some((t) => matchesTypeRecursive(actual, t));
    },

    // 数组类型匹配 - 处理同质数组(string[])和异质数组([string,number])
    array(actual, typeInfo) {
      if (myTypeof(actual) !== "[]") return false;
      if (typeInfo.isHomogeneous) {
        // 同质数组：所有元素必须是同一类型
        !actual.length && actual.push(undefined); // 处理空数组情况

        return actual.every((item) => matchesTypeRecursive(item, typeInfo.elementType));
      } else {
        // 异质数组：按位置匹配不同类型，长度必须一致
        if (actual.length !== typeInfo.elementTypes.length) return false;
        return actual.every((item, i) =>
          matchesTypeRecursive(item, typeInfo.elementTypes[i])
        );
      }
    },

    // 字面量数组匹配 - 精确匹配特定值的数组 ([1,2,3], ["a","b"])
    literalArray(actual, typeInfo) {
      if (myTypeof(actual) !== "[]") return false;
      if (actual.length !== typeInfo.values.length) return false;
      return actual.every((item, i) => item === typeInfo.values[i]);
    },

    // 字面量类型匹配 - 只匹配特定的值 (1, "hello", true)
    literal(actual, typeInfo) {
      return actual === typeInfo.value;
    },

    // 对象类型匹配 - 处理索引签名对象和具体属性对象
    object(actual, typeInfo) {
      if (myTypeof(actual) !== "{}") return false;

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

      // 处理可选类型：string? -> string|undefined
      if (typeInfo.optional) {
        typeInfo.type = typeInfo.type.replace("?", "|undefined").trim();
      }

      // 支持联合基础类型：string|number|any
      const types = typeInfo.type.split("|");
      return types.includes("any") || types.includes(actualType);
    },
  }
);

// 主匹配函数
const matchesType = (actual, typePattern) => {
  // 获取缓存或解析
  const typeInfo = parseType.cached(typePattern);
  const result = matchesTypeRecursive(actual, typeInfo);

  return result;
};

// 检查参数列表是否匹配类型模式列表
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

const overloader = () => {
  return Object.assign(
    function overloade(...args) {
      for (const [signature, fn] of overloade.signatures) {
        const typePatterns = signature.split("-");
        if (signature === "any" || matchesSignature(args, typePatterns)) {
          return fn(...args);
        }
      }

      throw new Error(`没有找到匹配签名 '${JSON.stringify(args)}' 的函数实现`);
    },
    {
      signatures: new Set(),
      add(...args) {
        const fn = args.pop().bind(this);
        const key = args.join("-");
        this.signatures.add([key, fn]);
        return this;
      },
    }
  );
};

export default overloader;
