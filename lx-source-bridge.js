const https = require('https');
const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { URL } = require('url');

const EVENT_NAMES = {
  request: 'request',
  inited: 'inited',
  updateAlert: 'updateAlert',
};

const loadedSources = {};
const requestHandlers = [];
let currentScriptInfo = null;
const KG_ONLY_MODE = process.env.MINERADIO_KG_ONLY !== '0';

process.on('unhandledRejection', (reason) => {
  const stack = reason && reason.stack || '';
  if (stack.includes('lx-source-bridge')) {
    console.warn('[LX Source] 未处理的 Promise 拒绝:', reason && reason.message || reason);
  }
});

function makeRequest(url, options, callback) {
  options = options || {};
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  const reqOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: String(options.method || 'GET').toUpperCase(),
    headers: Object.assign({}, options.headers || {}),
    timeout: typeof options.response_timeout === 'number' ? options.response_timeout : 60000,
    rejectUnauthorized: false,
  };

  let body = null;
  if (options.body) {
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
  } else if (options.form) {
    body = typeof options.form === 'string' ? options.form : new URLSearchParams(options.form).toString();
    reqOptions.headers['Content-Type'] = reqOptions.headers['Content-Type'] || 'application/x-www-form-urlencoded';
    reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
  } else if (options.formData) {
    body = typeof options.formData === 'string' ? options.formData : JSON.stringify(options.formData);
    reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
  }

  let aborted = false;
  const req = transport.request(reqOptions, (res) => {
    if (aborted) return;
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks);
      let parsedBody = raw.toString();
      try { parsedBody = JSON.parse(parsedBody); } catch (_) {}
      const resp = {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        headers: res.headers,
        bytes: raw.length,
        raw,
        body: parsedBody,
      };
      try { callback.call(null, null, resp, parsedBody); } catch (_) {}
    });
  });

  req.on('error', (err) => {
    if (!aborted) {
      try { callback.call(null, err, null, null); } catch (_) {}
    }
  });
  req.on('timeout', () => {
    aborted = true;
    req.destroy();
    try { callback.call(null, new Error('Request timeout'), null, null); } catch (_) {}
  });
  if (body) req.write(body);
  req.end();

  return () => {
    if (!aborted) {
      aborted = true;
      req.destroy();
    }
  };
}

function send(eventName, data) {
  if (eventName !== EVENT_NAMES.inited) return Promise.resolve();
  if (data && data.sources) {
    for (const [sourceKey, sourceInfo] of Object.entries(data.sources)) {
      if (KG_ONLY_MODE && sourceKey !== 'kg') continue;
      if (!sourceInfo || sourceInfo.type !== 'music') continue;
      loadedSources[sourceKey] = {
        name: sourceInfo.name || sourceKey,
        type: sourceInfo.type || 'music',
        actions: sourceInfo.actions || ['musicUrl'],
        qualitys: sourceInfo.qualitys || [],
        scriptName: currentScriptInfo ? currentScriptInfo.name : 'unknown',
      };
    }
    console.log(`[LX Source] 已注册音源: ${Object.keys(loadedSources).join(', ') || 'none'}`);
  }
  return Promise.resolve();
}

function on(eventName, handler) {
  if (eventName === EVENT_NAMES.request && typeof handler === 'function') {
    requestHandlers.push(handler);
    console.log(`[LX Source] Handler 已注册 #${requestHandlers.length}, 来自: ${currentScriptInfo ? currentScriptInfo.name : 'unknown'}`);
  }
  return Promise.resolve();
}

const utils = {
  crypto: {
    aesEncrypt(buffer, mode, key, iv) {
      const cipher = crypto.createCipheriv(mode, key, iv);
      return Buffer.concat([cipher.update(buffer), cipher.final()]);
    },
    rsaEncrypt(buffer, key) {
      buffer = Buffer.concat([Buffer.alloc(128 - buffer.length), buffer]);
      return crypto.publicEncrypt({ key, padding: crypto.constants.RSA_NO_PADDING }, buffer);
    },
    randomBytes(size) {
      return crypto.randomBytes(size);
    },
    md5(str) {
      return crypto.createHash('md5').update(str).digest('hex');
    },
  },
  buffer: {
    from(...args) {
      return Buffer.from(...args);
    },
    bufToString(buf, format) {
      return Buffer.from(buf, 'binary').toString(format);
    },
  },
  zlib: {
    inflate(buf) {
      return new Promise((resolve, reject) => {
        zlib.inflate(buf, (err, data) => err ? reject(new Error(err.message)) : resolve(data));
      });
    },
    deflate(data) {
      return new Promise((resolve, reject) => {
        zlib.deflate(data, (err, buf) => err ? reject(new Error(err.message)) : resolve(buf));
      });
    },
  },
};

async function loadSourceScript(scriptPath) {
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');
  const scriptName = path.basename(scriptPath, '.js');
  const fileInfo = {
    name: scriptName,
    description: scriptName,
    version: '1.0.0',
    author: 'lx-source',
    homepage: '',
    rawScript: scriptContent,
  };
  currentScriptInfo = Object.assign({}, fileInfo);

  const lxAPI = {
    EVENT_NAMES: Object.assign({}, EVENT_NAMES),
    request: makeRequest,
    send,
    on,
    utils,
    version: '2.0.0',
    env: 'desktop',
    currentScriptInfo: Object.assign({}, fileInfo),
  };

  const sandbox = {
    lx: lxAPI,
    console: {
      log() {},
      info() {},
      debug() {},
      group() {},
      groupEnd() {},
      groupCollapsed() {},
      warn: (...args) => console.warn('[LX Script:' + scriptName + ']', ...args),
      error: (...args) => console.error('[LX Script:' + scriptName + ']', ...args),
    },
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    Buffer,
    JSON,
    Math,
    Date,
    RegExp,
    Error,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    Function,
    globalThis: null,
    global: null,
  };

  const context = vm.createContext(sandbox);
  context.globalThis = context;
  context.global = context;
  try {
    new vm.Script(scriptContent, { filename: scriptPath }).runInContext(context, {
      timeout: 15000,
      breakOnSigint: true,
    });
  } catch (err) {
    console.warn(`[LX Source] ${scriptName} 执行警告:`, err.message);
  }
  currentScriptInfo = null;
  return { scriptName, sources: Object.assign({}, loadedSources) };
}

async function loadSourceDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.warn('[LX Source] 音源目录不存在:', dirPath);
    return {};
  }
  const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.js'));
  console.log(`[LX Source] 发现 ${files.length} 个音源脚本: ${dirPath}`);
  for (const file of files) {
    try {
      await loadSourceScript(path.join(dirPath, file));
    } catch (err) {
      console.error(`[LX Source] 跳过 ${file}:`, err.message);
    }
  }
  return Object.assign({}, loadedSources);
}

function checkDomainReachable(url) {
  return new Promise((resolve) => {
    try {
      const hostname = new URL(url).hostname;
      dns.lookup(hostname, { timeout: 3000 }, (err) => {
        if (err) { console.warn(`[LX Source] DNS 不可达: ${hostname} (${err.code})`); resolve(false); }
        else resolve(true);
      });
    } catch (e) { resolve(false); }
  });
}

function fixKgQualityLevel(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/level=undefined(&|$)/g, 'level=exhigh$1').replace(/level=null(&|$)/g, 'level=exhigh$1');
}

async function normalizeActionResult(action, value) {
  if (action === 'search') {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const data = value.data || value.body || value.result || value;
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.list)) return data.list;
      if (Array.isArray(data.songs)) return data.songs;
      if (data.data && Array.isArray(data.data.list)) return data.data.list;
    }
    return [];
  }
  if (action === 'musicUrl') {
    let url;
    if (typeof value === 'string' && /^https?:/.test(value)) url = value;
    else if (value && typeof value === 'object') {
      url = value.url || (value.data && value.data.url) || value.data;
    }
    if (typeof url !== 'string' || !/^https?:/.test(url)) throw new Error('获取到的播放地址无效');
    url = fixKgQualityLevel(url);
    const reachable = await checkDomainReachable(url);
    if (!reachable) throw new Error('播放地址域名不可达');
    return url;
  }
  if (action === 'lyric') {
    if (value && typeof value === 'object') {
      return {
        lyric: typeof value.lyric === 'string' ? value.lyric : '',
        tlyric: typeof value.tlyric === 'string' ? value.tlyric : '',
        rlyric: typeof value.rlyric === 'string' ? value.rlyric : '',
        lxlyric: typeof value.lxlyric === 'string' ? value.lxlyric : '',
      };
    }
    if (typeof value === 'string') return { lyric: value, tlyric: '', rlyric: '', lxlyric: '' };
    throw new Error('获取到的歌词无效');
  }
  if (action === 'pic') {
    if (typeof value === 'string' && /^https?:/.test(value)) return value;
    if (value && typeof value === 'object') {
      const url = value.url || value.data;
      if (typeof url === 'string' && /^https?:/.test(url)) return url;
    }
    throw new Error('获取到的封面无效');
  }
  return value;
}

async function callSourceAction(source, action, musicInfo, qualityType) {
  console.log(`[LX Source] ${action} 请求: source=${source}, handlers=${requestHandlers.length}`);
  if (!requestHandlers.length) throw new Error('没有可用的音源处理器');
  if (!loadedSources[source]) throw new Error(`音源 "${source}" 未注册`);

  const handlerPromises = requestHandlers.map((handler, index) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('音源处理超时(15s)')), 15000);
    });
    const handlerPromise = Promise.resolve(handler({
      source,
      action,
      info: {
        musicInfo,
        type: qualityType,
      },
    })).then(value => normalizeActionResult(action, value)).catch(err => {
      console.warn(`[LX Source] Handler #${index + 1} 失败:`, err.message);
      throw err;
    });
    return Promise.race([handlerPromise, timeoutPromise]);
  });

  try {
    return await Promise.any(handlerPromises);
  } catch (err) {
    const errors = err.errors || [];
    const errorMsg = errors.length ? errors.map(e => e.message).join('; ') : '所有音源处理器均失败';
    throw new Error(`所有音源处理器均失败(${source}/${action}): ${errorMsg}`);
  }
}

async function getMusicUrl(source, musicInfo, qualityType) {
  return callSourceAction(source, 'musicUrl', musicInfo, qualityType);
}

async function getMusicLyric(source, musicInfo) {
  return callSourceAction(source, 'lyric', musicInfo, '');
}

async function getMusicPic(source, musicInfo) {
  return callSourceAction(source, 'pic', musicInfo, '');
}

async function searchMusic(source, keywords, page, limit) {
  return callSourceAction(source, 'search', {
    keyword: keywords,
    keywords,
    searchText: keywords,
    page: page || 1,
    limit: limit || 20,
  }, '');
}

function getLoadedSources() {
  const result = {};
  for (const [key, info] of Object.entries(loadedSources)) {
    result[key] = {
      name: info.name,
      type: info.type,
      actions: info.actions,
      qualitys: info.qualitys,
      scriptName: info.scriptName,
    };
  }
  return result;
}

module.exports = {
  EVENT_NAMES,
  loadSourceScript,
  loadSourceDirectory,
  getMusicUrl,
  getMusicLyric,
  getMusicPic,
  searchMusic,
  getLoadedSources,
  loadedSources,
};
