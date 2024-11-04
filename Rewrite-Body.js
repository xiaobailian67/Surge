/*
 * Surge 脚本实现 loon 的 body 重写类型
 * 使用举例
 * 1.添加或替换属性 $表示对象根路径
 * add  user.name 小明   user.age 30
 * user.名字  $.user.name
 *
 * 2.删除属性
 * del  user.name  user.age
 *
 * 3.正则替换
 * reg  小明 大哥
 *
 * 4.混合操作
 * @del user.age
 * @add user.gender 人妖
 * @reg 小明 小红
 */

/**
 * @常量 methodMapping - 用于将输入的命令字符串映射到具体的处理方法。
 *
 * 这个对象的作用是将不同形式的命令（字符串形式）映射到对应的处理函数名称，以便在后续代码中
 * 根据传入的命令动态选择并调用相应的方法。
 */
const methodMapping = {
	"response-body-json-replace": "repProperty",
	"request-body-json-replace": "repProperty",
	rep: "repProperty",

	"request-body-json-add": "addProperty",
	"response-body-json-add": "addProperty",
	add: "addProperty",

	"response-body-json-del": "deleteProperty",
	"request-body-json-del": "deleteProperty",
	del: "deleteProperty",

	"response-body-json-regex": "regexReplace",
	"request-body-json-regex": "regexReplace",
	reg: "regexReplace",
};

const methods = {
	/**
	 * 根据路径获取嵌套属性并执行回调
	 * @param {Array} [path, value] - 属性路径和对应的值
	 * @param {Function} callback - 在找到目标属性时执行的回调
	 */
	getNestedProperty([path, value, isAdd], callback) {
		const keys = path.split(".");
		const lastKey = keys.pop();

		const targetObj = keys.reduce((currentObj, key) => {
			let val = currentObj?.[key];

			if (isAdd && !val && (val ?? true)) {
				currentObj[key] = val = {};
			}

			return val;
		}, this.body);

		return targetObj && callback(targetObj, lastKey, value);
	},

	/**
	 * 替换 JSON 属性
	 * @param {Array} pathAndValue - 包含路径和新值的数组
	 */
	repProperty(pathAndValue) {
		this.getNestedProperty(pathAndValue, (obj, key, val) => {
			obj[key] = toJson(
				val?.startsWith("$.")
					? this.getNestedProperty(val.slice(2), (o, k) => o[k])
					: val
			);
		});
	},

	/**
	 * 新增 JSON 属性
	 * @param {Array} pathAndValue - 包含路径和新值的数组
	 */
	addProperty(pathAndValue) {
		this.repProperty([...pathAndValue, true]);
	},

	/**
	 * 删除指定的 JSON 属性
	 * @param {String} path - 要删除的属性路径
	 */
	deleteProperty(path) {
		this.getNestedProperty([path], (obj, key) =>
			isNaN(key) ? delete obj[key] : obj.splice(key, 1)
		);
	},

	/**
	 * 使用正则表达式替换 JSON 字符串中的内容
	 * @param {Array} [pattern, replacement] - 正则表达式模式和替换值
	 */
	regexReplace([pattern, replacement]) {
		const regex = new RegExp(pattern, "g");
		this.body = this.body.replace(regex, replacement);
	},
};

/**
 * 将数组按照指定的大小分割成多个小数组
 * @param {Array} arr - 需要分割的数组
 * @param {Number} num - 每个小数组的大小，默认为2
 * @returns {Array} - 分割后的新数组
 */
const splitArray = (arr, num = 2) => {
	const newArray = [];
	while (arr.length) {
		newArray.push(arr.splice(0, num));
	}
	return newArray;
};

const toStr = (obj) => {
	try {
		if (typeof obj === "string") return obj;
		return JSON.stringify(obj);
	} catch (_) {
		return obj;
	}
};

const toJson = (str) => {
	try {
		if (typeof str === "object") return str;
		return JSON.parse(str);
	} catch (_) {
		return str;
	}
};

/**
 * 处理响应体，根据 $argument 执行相应的操作
 * @returns {String} - 修改后的 JSON 字符串
 */
const handleBody = () => {
	methods.body = (this.$response ?? $request).body;

	const re = new RegExp(`@(?=${Object.keys(methodMapping).join("|")})`, "g");

	$argument = $argument.replace(/\[(.+?)\]/g, ".$1");

	$argument.split(re).forEach(($arg) => {
		let [funName, ...tasks] = $arg.trim().split(/\s+/);

		const methodName = methodMapping[funName];

		methods.body =
			methodName !== "regexReplace"
				? toJson(methods.body)
				: toStr(methods.body);

		if (methodName !== "deleteProperty") {
			tasks = splitArray(tasks);
		}

		tasks.forEach((task) => {
			methods[methodName]?.(task);
		});
	});

	return toStr(methods.body);
};

try {
	const body = handleBody();
	$done({ body });
} catch (e) {
	console.log("Error: " + e);
	$done();
}
