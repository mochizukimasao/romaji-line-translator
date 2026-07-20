var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../src/lib/gemini.js
var GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
var PROTECTED_TOKEN = /https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[@#][\w-]+|\b(?:AI|OK|LINE|Zoom|Google|ChatGPT)\b|\b\d+(?:[/:.-]\d+)*\b/g;
var PRODUCT_ALIASES = /* @__PURE__ */ new Map([
  ["AI", ["AI", "\u30A8\u30FC\u30A2\u30A4"]],
  ["OK", ["OK", "\u30AA\u30FC\u30B1\u30FC", "\u30AA\u30FC\u30B1\u30A4"]],
  ["LINE", ["LINE", "\u30E9\u30A4\u30F3"]],
  ["Zoom", ["Zoom", "\u30BA\u30FC\u30E0"]],
  ["Google", ["Google", "\u30B0\u30FC\u30B0\u30EB"]],
  ["ChatGPT", ["ChatGPT", "\u30C1\u30E3\u30C3\u30C8\u30B8\u30FC\u30D4\u30FC\u30C6\u30A3\u30FC"]]
]);
var JAPANESE_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu;
function buildTranslatePrompt(mode, items) {
  const goal = mode === "japanese" ? "\u65E5\u672C\u8A9E\u306E\u610F\u5473\u3001\u767A\u8A00\u5185\u5BB9\u3001\u56FA\u6709\u540D\u8A5E\u3001\u6570\u5B57\u3001\u8A9E\u8ABF\u3092\u4FDD\u3063\u305F\u307E\u307E\u3001\u52A9\u8A5E\u30FB\u53E5\u8AAD\u70B9\u30FB\u660E\u767D\u306A\u8A9E\u9806\u306E\u5D29\u308C\u3060\u3051\u3092\u6700\u5C0F\u9650\u4FEE\u6B63\u3059\u308B\u3002" : "\u30ED\u30FC\u30DE\u5B57\u3092\u6587\u8108\u306B\u5FDC\u3058\u305F\u81EA\u7136\u306A\u6F22\u5B57\u304B\u306A\u4EA4\u3058\u308A\u6587\u3078\u5909\u63DB\u3057\u3001\u610F\u5473\u3001\u8A9E\u9806\u3001\u8A9E\u8ABF\u3001\u4E01\u5BE7\u3055\u3001\u65AD\u5B9A\u306E\u5F37\u3055\u3092\u5909\u3048\u306A\u3044\u3002";
  return [
    "\u3042\u306A\u305F\u306F\u6B63\u78BA\u306A\u65E5\u672C\u8A9E\u5909\u63DB\u30A8\u30C7\u30A3\u30BF\u3067\u3059\u3002",
    `\u76EE\u7684: ${goal}`,
    "\u8981\u7D04\u3001\u8AAC\u660E\u3001\u60C5\u5831\u8FFD\u52A0\u3001\u8A55\u4FA1\u3001\u88C5\u98FE\u7684\u306A\u8A00\u3044\u63DB\u3048\u3092\u3057\u306A\u3044\u3002\u5165\u529B\u306E\u9806\u5E8F\u3068\u9805\u76EE\u6570\u3092\u5FC5\u305A\u4FDD\u3064\u3002",
    "URL\u3001\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3001@mention\u3001#hashtag\u3001\u6570\u5B57\u3001\u65E5\u6642\u3001\u5143\u5165\u529B\u306E\u65E5\u672C\u8A9E\u3001LINE\u30FBZoom\u30FBGoogle\u30FBChatGPT\u306A\u3069\u306E\u88FD\u54C1\u540D\u30FB\u7565\u8A9E\u3001\u4EBA\u540D\u30FB\u5730\u540D\u30FB\u7D44\u7E54\u540D\u306F\u52DD\u624B\u306B\u5225\u8A9E\u3078\u7F6E\u63DB\u3057\u306A\u3044\u3002",
    "\u51FA\u529B\u306BLatin\u6587\u5B57\u3092\u6B8B\u3059\u5834\u5408\u306F\u3001\u5143\u5165\u529B\u306B\u3042\u308B\u4FDD\u8B77\u5BFE\u8C61\u30C8\u30FC\u30AF\u30F3\u3068\u5B8C\u5168\u4E00\u81F4\u3059\u308B\u3082\u306E\u3060\u3051\u8A31\u53EF\u3059\u308B\u3002",
    mode === "romaji" ? "\u5B89\u5168\u306B\u65AD\u5B9A\u3067\u304D\u306A\u3044\u56FA\u6709\u540D\u8A5E\u306F\u539F\u8868\u8A18\u307E\u305F\u306F\u30AB\u30BF\u30AB\u30CA\u3092\u512A\u5148\u3057\u3001ASCII\u53E5\u8AAD\u70B9\u306F\u5FC5\u8981\u306B\u5FDC\u3058\u3066\u65E5\u672C\u8A9E\u53E5\u8AAD\u70B9\u3078\u6B63\u898F\u5316\u3059\u308B\u3002" : "\u3060\u30FB\u3067\u3042\u308B\u8ABF\u3068\u3067\u3059\u30FB\u307E\u3059\u8ABF\u3092\u76F8\u4E92\u5909\u63DB\u3057\u306A\u3044\u3002\u5185\u5BB9\u3092\u524A\u9664\u30FB\u7D71\u5408\u3057\u306A\u3044\u3002",
    'JSON\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8 {"results":[{"id":"\u5165\u529Bid","output":"\u5909\u63DB\u7D50\u679C"}]} \u3060\u3051\u3092\u8FD4\u3059\u3002\u5168\u9805\u76EE\u3092\u540C\u3058\u9806\u5E8F\u3067\u8FD4\u3059\u3002',
    "",
    JSON.stringify({ mode, items: items.map(({ id, text }) => ({ id, text })) })
  ].join("\n");
}
__name(buildTranslatePrompt, "buildTranslatePrompt");
function safeString(value) {
  return String(value ?? "");
}
__name(safeString, "safeString");
function parseResponse(text) {
  const parsed = JSON.parse(text);
  const results = Array.isArray(parsed) ? parsed : parsed?.results;
  if (!Array.isArray(results)) throw new Error("invalid_json");
  return results.map((item) => typeof item === "string" ? { output: item } : item);
}
__name(parseResponse, "parseResponse");
function validateOutput(mode, source, output) {
  const value = safeString(output).trimEnd();
  if (!value.trim()) return false;
  if (mode === "japanese" && value.replace(/\s/g, "").length < source.replace(/\s/g, "").length * 0.35) return false;
  if (mode === "romaji") {
    let remainingJapanese = value;
    for (const run of source.match(JAPANESE_RUN) || []) {
      if (!remainingJapanese.includes(run)) return false;
      remainingJapanese = remainingJapanese.replace(run, "");
    }
  }
  const protectedTokens = source.match(PROTECTED_TOKEN) || [];
  let remaining = value;
  for (const token of protectedTokens) {
    const alternatives = PRODUCT_ALIASES.get(token) || [token];
    const matched = alternatives.find((candidate) => remaining.includes(candidate));
    if (!matched) return false;
    remaining = remaining.replace(matched, "");
  }
  if (mode === "romaji" && /[A-Za-z]/.test(value)) {
    if (/[A-Za-z]/.test(remaining)) return false;
  }
  return mode === "japanese" || /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value) || protectedTokens.length > 0;
}
__name(validateOutput, "validateOutput");
async function requestBatch(items, { apiKey, model, mode }) {
  if (!apiKey) throw new Error("configuration");
  const response = await fetch(`${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: buildTranslatePrompt(mode, items) }] }], generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json" } })
  });
  if (!response.ok) throw new Error("service");
  const data = await response.json().catch(() => {
    throw new Error("invalid_json");
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("invalid_json");
  const results = parseResponse(text);
  if (results.length !== items.length) throw new Error("count_mismatch");
  const byId = new Map(results.map((result) => [result.id, result]));
  return items.map((item) => {
    const result = byId.get(item.id);
    if (!result || !validateOutput(mode, item.text, result.output)) throw new Error("validation");
    return { id: item.id, status: "ok", output: safeString(result.output).trimEnd(), errorCode: null };
  });
}
__name(requestBatch, "requestBatch");
function errorCode(error) {
  return ["configuration", "service", "invalid_json", "count_mismatch", "validation"].includes(error?.message) ? error.message : "service";
}
__name(errorCode, "errorCode");
async function translateItems(items, { apiKey, model = "gemini-3.5-flash", mode = "romaji" } = {}) {
  const results = [];
  for (let index = 0; index < items.length; index += 12) {
    const chunk = items.slice(index, index + 12);
    try {
      results.push(...await requestBatch(chunk, { apiKey, model, mode }));
    } catch (batchError) {
      for (const item of chunk) {
        try {
          results.push(...await requestBatch([item], { apiKey, model, mode }));
        } catch (itemError) {
          results.push({ id: item.id, status: "error", output: "", errorCode: errorCode(itemError || batchError) });
        }
      }
    }
  }
  return results;
}
__name(translateItems, "translateItems");

// ../src/lib/api-request.js
var API_LIMITS = {
  maxItems: 1e3,
  maxIdLength: 200,
  maxItemLength: 4e3,
  maxTotalLength: 12e4
};
function invalid(error) {
  return { ok: false, status: 400, error };
}
__name(invalid, "invalid");
function validateTranslateRequest(body) {
  const mode = body?.mode === void 0 ? "romaji" : body.mode;
  if (mode !== "romaji" && mode !== "japanese") return invalid("\u5909\u63DB\u30E2\u30FC\u30C9\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  if (!Array.isArray(body?.items) || !body.items.length || body.items.length > API_LIMITS.maxItems) {
    return invalid(`1\u301C${API_LIMITS.maxItems}\u9805\u76EE\u306E\u5165\u529B\u3092\u9001\u3063\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  const ids = /* @__PURE__ */ new Set();
  let totalLength = 0;
  const items = [];
  for (const item of body.items) {
    if (!item || typeof item.id !== "string" || typeof item.text !== "string" || !item.id.trim() || !item.text.trim()) {
      return invalid("\u9805\u76EE\u306Eid\u3068text\u306B\u306F\u7A7A\u3067\u306A\u3044\u6587\u5B57\u5217\u304C\u5FC5\u8981\u3067\u3059\u3002");
    }
    if (item.id.length > API_LIMITS.maxIdLength) return invalid("\u9805\u76EE\u306Eid\u304C\u9577\u3059\u304E\u307E\u3059\u3002");
    if (item.text.length > API_LIMITS.maxItemLength) return invalid("1\u9805\u76EE\u306E\u5165\u529B\u304C\u9577\u3059\u304E\u307E\u3059\u3002");
    if (ids.has(item.id)) return invalid("\u9805\u76EE\u306Eid\u304C\u91CD\u8907\u3057\u3066\u3044\u307E\u3059\u3002");
    ids.add(item.id);
    totalLength += item.text.length;
    items.push({ id: item.id, text: item.text });
  }
  if (totalLength > API_LIMITS.maxTotalLength) return invalid("\u5165\u529B\u304C\u9577\u3059\u304E\u307E\u3059\u3002\u5C11\u3057\u5206\u3051\u3066\u5909\u63DB\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  return { ok: true, mode, items };
}
__name(validateTranslateRequest, "validateTranslateRequest");

// api/translate.js
async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const validation = validateTranslateRequest(body);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: validation.status });
  if (!env.GEMINI_API_KEY) return Response.json({ error: "\u5909\u63DB\u30B5\u30FC\u30D3\u30B9\u306E\u8A2D\u5B9A\u304C\u3042\u308A\u307E\u305B\u3093\u3002" }, { status: 500 });
  try {
    const results = await translateItems(validation.items, {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || "gemini-3.5-flash",
      mode: validation.mode
    });
    return Response.json({ results });
  } catch {
    return Response.json({ error: "\u5909\u63DB\u30B5\u30FC\u30D3\u30B9\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002" }, { status: 503 });
  }
}
__name(onRequestPost, "onRequestPost");

// ../.wrangler/tmp/pages-NB73sJ/functionsRoutes-0.6462422294011152.mjs
var routes = [
  {
    routePath: "/api/translate",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  }
];

// ../../../../.npm/_npx/095711ed2bffd7f3/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../.npm/_npx/095711ed2bffd7f3/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
