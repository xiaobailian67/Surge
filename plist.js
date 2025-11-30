// ===== plist.js =====

function escape(str) {
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
}

// --------------------
// XML → JS
// --------------------

function parse(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const plist = doc.getElementsByTagName("plist")[0];
  return parseNode(plist.firstElementChild);
}

function parseNode(node) {
  switch (node.tagName) {
    case "dict": return parseDict(node);
    case "array": return parseArray(node);
    case "string": return node.textContent || "";
    case "integer": return Number(node.textContent);
    case "real": return Number(node.textContent);
    case "true": return true;
    case "false": return false;
    case "date": return new Date(node.textContent);
    case "data": return atob(node.textContent);
    default: return null;
  }
}

function parseDict(node) {
  const obj = {};
  const children = Array.from(node.children);

  for (let i = 0; i < children.length; i += 2) {
    const key = children[i].textContent;
    const value = parseNode(children[i + 1]);
    obj[key] = value;
  }
  return obj;
}

function parseArray(node) {
  return Array.from(node.children).map(parseNode);
}

// --------------------
// JS → XML
// --------------------

function build(obj) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${buildNode(obj)}
</plist>`;
  return xml;
}

function buildNode(obj) {
  if (obj === null || obj === undefined) {
    return "<string></string>";
  }

  switch (typeof obj) {
    case "string":
      return `<string>${escape(obj)}</string>`;

    case "number":
      if (Number.isInteger(obj)) return `<integer>${obj}</integer>`;
      return `<real>${obj}</real>`;

    case "boolean":
      return obj ? "<true/>" : "<false/>";

    case "object":
      if (Array.isArray(obj)) return buildArray(obj);
      if (obj instanceof Date) return `<date>${obj.toISOString()}</date>`;
      return buildDict(obj);

    default:
      return "<string></string>";
  }
}

function buildDict(obj) {
  const entries = Object.entries(obj)
    .map(([key, value]) => `<key>${escape(key)}</key>${buildNode(value)}`)
    .join("");

  return `<dict>${entries}</dict>`;
}

function buildArray(arr) {
  const items = arr.map((v) => buildNode(v)).join("");
  return `<array>${items}</array>`;
}

// --------------------
// 导出小写对象 plist
// --------------------

const plist = { parse, build };

export default plist;
export { parse, build };
