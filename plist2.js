// 完全 ESM 化的 plist.js，功能和原版 plist@3.0.1 一样
// 包含 parse / build 的全部能力

import { DOMParser } from "xmldom";
import * as base64js from "base64-js";
import XMLBuilder from "xmlbuilder";

// -------------------------------
// build
// -------------------------------
export function build(obj, opts = {}) {
  const xmlDec = { version: "1.0", encoding: "UTF-8" };
  const dtd = {
    pubid: "-//Apple//DTD PLIST 1.0//EN",
    sysid: "http://www.apple.com/DTDs/PropertyList-1.0.dtd",
  };

  const root = XMLBuilder.create("plist");
  root.dec(xmlDec.version, xmlDec.encoding);
  root.dtd(dtd.pubid, dtd.sysid);
  root.att("version", "1.0");

  writeValue(obj, root);

  opts.pretty = opts.pretty !== false;
  return root.end(opts);
}

function writeValue(val, xml) {
  const type = Object.prototype.toString.call(val).match(/\[object (.*)\]/)[1];

  if (type === "Array") {
    const a = xml.ele("array");
    for (const item of val) writeValue(item, a);
  } else if (val instanceof ArrayBuffer) {
    xml.ele("data").raw(base64js.fromByteArray(new Uint8Array(val)));
  } else if (Buffer.isBuffer(val)) {
    xml.ele("data").raw(val.toString("base64"));
  } else if (type === "Object") {
    const d = xml.ele("dict");
    for (const k in val) {
      if (val.hasOwnProperty(k)) {
        d.ele("key").txt(k);
        writeValue(val[k], d);
      }
    }
  } else if (type === "Number") {
    const t = val % 1 === 0 ? "integer" : "real";
    xml.ele(t).txt(val.toString());
  } else if (type === "Date") {
    xml.ele("date").txt(val.toISOString());
  } else if (type === "Boolean") {
    xml.ele(val ? "true" : "false");
  } else if (type === "String") {
    xml.ele("string").txt(val);
  } else {
    throw new Error("Unsupported plist value: " + type);
  }
}

// -------------------------------
// parse
// -------------------------------
export function parse(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText);
  if (doc.documentElement.nodeName !== "plist") {
    throw new Error("Malformed plist. Root should be <plist>");
  }

  const result = parseNode(doc.documentElement);
  return Array.isArray(result) && result.length === 1 ? result[0] : result;
}

function parseNode(node) {
  if (!node) return null;

  const name = node.nodeName;

  switch (name) {
    case "plist":
      return children(node).map(parseNode);

    case "dict": {
      const obj = {};
      const nodes = children(node);
      for (let i = 0; i < nodes.length; i += 2) {
        const keyNode = nodes[i];
        const valNode = nodes[i + 1];
        obj[keyNode.textContent] = parseNode(valNode);
      }
      return obj;
    }

    case "array":
      return children(node).map(parseNode);

    case "string":
      return node.textContent || "";

    case "integer":
      return parseInt(node.textContent, 10);

    case "real":
      return parseFloat(node.textContent);

    case "true":
      return true;

    case "false":
      return false;

    case "date":
      return new Date(node.textContent);

    case "data":
      return Buffer.from(node.textContent.replace(/\s+/g, ""), "base64");

    default:
      return null;
  }
}

function children(node) {
  const list = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const n = node.childNodes[i];
    if (n.nodeType === 1) list.push(n); // element
  }
  return list;
}

// 默认导出
export default { parse, build };
