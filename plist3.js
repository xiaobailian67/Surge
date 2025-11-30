/**
 * plist-lite - ES Module Version
 * A lightweight plist parser and builder
 */

// ============ Parser ============

export function parse(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  
  if (doc.documentElement.nodeName === 'parsererror') {
    throw new Error('Invalid XML document');
  }
  
  const plistNode = doc.documentElement;
  if (plistNode.nodeName !== 'plist') {
    throw new Error('Not a valid plist document');
  }
  
  const children = getChildElements(plistNode);
  return children.length === 1 ? parseNode(children[0]) : children.map(parseNode);
}

function getChildElements(node) {
  const children = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 1) { // ELEMENT_NODE
      children.push(child);
    }
  }
  return children;
}

function parseNode(node) {
  const nodeName = node.nodeName;
  
  switch (nodeName) {
    case 'dict':
      return parseDict(node);
    case 'array':
      return parseArray(node);
    case 'string':
      return getTextContent(node);
    case 'integer':
      return parseInt(getTextContent(node), 10);
    case 'real':
      return parseFloat(getTextContent(node));
    case 'true':
      return true;
    case 'false':
      return false;
    case 'date':
      return new Date(getTextContent(node));
    case 'data':
      return parseBase64(getTextContent(node));
    default:
      return null;
  }
}

function parseDict(node) {
  const dict = {};
  const children = getChildElements(node);
  
  for (let i = 0; i < children.length; i += 2) {
    const keyNode = children[i];
    const valueNode = children[i + 1];
    
    if (keyNode.nodeName !== 'key') {
      throw new Error('Expected key element in dict');
    }
    
    const key = getTextContent(keyNode);
    const value = valueNode ? parseNode(valueNode) : null;
    dict[key] = value;
  }
  
  return dict;
}

function parseArray(node) {
  const array = [];
  const children = getChildElements(node);
  
  for (let i = 0; i < children.length; i++) {
    array.push(parseNode(children[i]));
  }
  
  return array;
}

function getTextContent(node) {
  let text = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 3 || child.nodeType === 4) { // TEXT_NODE or CDATA
      text += child.nodeValue;
    }
  }
  return text.trim();
}

function parseBase64(str) {
  // Remove whitespace
  const cleanStr = str.replace(/\s+/g, '');
  
  // In browser environment
  if (typeof atob !== 'undefined') {
    const binaryStr = atob(cleanStr);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }
  
  // In Node.js environment
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(cleanStr, 'base64');
  }
  
  throw new Error('Base64 decoding not supported in this environment');
}

// ============ Builder ============

export function build(obj, options = {}) {
  const pretty = options.pretty !== false;
  const indent = options.indent || '  ';
  const newline = pretty ? '\n' : '';
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>' + newline;
  xml += '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' + newline;
  xml += '<plist version="1.0">' + newline;
  xml += buildNode(obj, pretty ? 1 : 0, indent, newline);
  xml += '</plist>' + newline;
  
  return xml;
}

function buildNode(value, level, indent, newline) {
  const spaces = indent.repeat(level);
  const type = getType(value);
  
  switch (type) {
    case 'object':
      return buildDict(value, level, indent, newline);
    case 'array':
      return buildArray(value, level, indent, newline);
    case 'string':
      return spaces + '<string>' + escapeXml(value) + '</string>' + newline;
    case 'number':
      return buildNumber(value, spaces, newline);
    case 'boolean':
      return spaces + (value ? '<true/>' : '<false/>') + newline;
    case 'date':
      return spaces + '<date>' + formatDate(value) + '</date>' + newline;
    case 'buffer':
      return spaces + '<data>' + newline + formatBase64(value, level + 1, indent, newline) + spaces + '</data>' + newline;
    default:
      return '';
  }
}

function buildDict(obj, level, indent, newline) {
  const spaces = indent.repeat(level);
  let xml = spaces + '<dict>' + newline;
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      xml += spaces + indent + '<key>' + escapeXml(key) + '</key>' + newline;
      xml += buildNode(obj[key], level + 1, indent, newline);
    }
  }
  
  xml += spaces + '</dict>' + newline;
  return xml;
}

function buildArray(arr, level, indent, newline) {
  const spaces = indent.repeat(level);
  let xml = spaces + '<array>' + newline;
  
  for (let i = 0; i < arr.length; i++) {
    xml += buildNode(arr[i], level + 1, indent, newline);
  }
  
  xml += spaces + '</array>' + newline;
  return xml;
}

function buildNumber(value, spaces, newline) {
  if (Number.isInteger(value)) {
    return spaces + '<integer>' + value + '</integer>' + newline;
  } else {
    return spaces + '<real>' + value + '</real>' + newline;
  }
}

function getType(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return 'buffer';
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return 'buffer';
  return typeof value;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(date) {
  const pad = (n) => (n < 10 ? '0' + n : n);
  
  return date.getUTCFullYear() + '-' +
    pad(date.getUTCMonth() + 1) + '-' +
    pad(date.getUTCDate()) + 'T' +
    pad(date.getUTCHours()) + ':' +
    pad(date.getUTCMinutes()) + ':' +
    pad(date.getUTCSeconds()) + 'Z';
}

function formatBase64(data, level, indent, newline) {
  let base64;
  
  // Convert to base64
  if (typeof btoa !== 'undefined') {
    // Browser environment
    if (data instanceof Uint8Array) {
      let binary = '';
      for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
      }
      base64 = btoa(binary);
    } else {
      base64 = btoa(String(data));
    }
  } else if (typeof Buffer !== 'undefined') {
    // Node.js environment
    base64 = Buffer.from(data).toString('base64');
  } else {
    throw new Error('Base64 encoding not supported in this environment');
  }
  
  // Format with line breaks every 68 characters
  const spaces = indent.repeat(level);
  const lines = [];
  for (let i = 0; i < base64.length; i += 68) {
    lines.push(spaces + base64.substr(i, 68));
  }
  
  return lines.join(newline) + newline;
}
