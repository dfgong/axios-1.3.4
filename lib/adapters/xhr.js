'use strict';

import utils from './../utils.js';
import settle from './../core/settle.js';
import cookies from './../helpers/cookies.js';
import buildURL from './../helpers/buildURL.js';
import buildFullPath from '../core/buildFullPath.js';
import isURLSameOrigin from './../helpers/isURLSameOrigin.js';
import transitionalDefaults from '../defaults/transitional.js';
import AxiosError from '../core/AxiosError.js';
import CanceledError from '../cancel/CanceledError.js';
import parseProtocol from '../helpers/parseProtocol.js';
import platform from '../platform/index.js';
import AxiosHeaders from '../core/AxiosHeaders.js';
import speedometer from '../helpers/speedometer.js';

function progressEventReducer(listener, isDownloadStream) {
  let bytesNotified = 0;
  const _speedometer = speedometer(50, 250);

  return e => {
    const loaded = e.loaded;
    const total = e.lengthComputable ? e.total : undefined;
    const progressBytes = loaded - bytesNotified;
    const rate = _speedometer(progressBytes);
    const inRange = loaded <= total;

    bytesNotified = loaded;

    const data = {
      loaded,
      total,
      progress: total ? (loaded / total) : undefined,
      bytes: progressBytes,
      rate: rate ? rate : undefined,
      estimated: rate && total && inRange ? (total - loaded) / rate : undefined,
      event: e
    };

    data[isDownloadStream ? 'download' : 'upload'] = true;

    listener(data);
  };
}

const isXHRAdapterSupported = typeof XMLHttpRequest !== 'undefined';

// dfgong 环境判断也融合进来了
export default isXHRAdapterSupported && function (config) {
  // dfgong return 一个 promise
  return new Promise(function dispatchXhrRequest(resolve, reject) { // dfgong 必要时用具名函数，表达清晰的语义（虽然这里可以用匿名函数）
    let requestData = config.data;
    const requestHeaders = AxiosHeaders.from(config.headers).normalize();
    const responseType = config.responseType;
    let onCanceled;
    function done() {
      if (config.cancelToken) {
        config.cancelToken.unsubscribe(onCanceled);
      }

      if (config.signal) {
        config.signal.removeEventListener('abort', onCanceled);
      }
    }

    if (utils.isFormData(requestData) && (platform.isStandardBrowserEnv || platform.isStandardBrowserWebWorkerEnv)) {
      requestHeaders.setContentType(false); // Let the browser set it
    }

    let request = new XMLHttpRequest();

    // HTTP basic authentication
    if (config.auth) {
      const username = config.auth.username || '';
      const password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
      // dfgong btoa => 转为Base64
      requestHeaders.set('Authorization', 'Basic ' + btoa(username + ':' + password));
    }

    const fullPath = buildFullPath(config.baseURL, config.url);

    // dfgong config.paramsSerializer 是对 config.params 进行序列化 - 主要用于nobody类请求，比如get
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
    request.timeout = config.timeout;

    function onloadend() {
      if (!request) {
        return;
      }
      // Prepare the response
      const responseHeaders = AxiosHeaders.from(
        'getAllResponseHeaders' in request && request.getAllResponseHeaders()
      );
      // dfgong responseText 与 response 的不同 - https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/response
      const responseData = !responseType || responseType === 'text' || responseType === 'json' ?
        request.responseText : request.response;
      const response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config,
        request
      };

      settle(function _resolve(value) {
        resolve(value);
        done();
      }, function _reject(err) {
        reject(err);
        done();
      }, response);

      // Clean up request
      request = null;
    }

    if ('onloadend' in request) {
      // Use onloadend if available
      request.onloadend = onloadend;
    } else {
      // Listen for ready state to emulate onloadend
      request.onreadystatechange = function handleLoad() {
        /**
         * dfgong readyState 返回的是一个整数，表示当前请求的状态
         * 0: 请求未初始化，尚未调用 open() 方法。
         * 1: 请求已经建立，但是尚未发送，尚未调用 send() 方法。
         * 2: 请求已经发送，但是尚未接收到响应，尚未接收到响应头部。
         * 3: 请求已经接收到部分响应数据。
         * 4: 请求已经完成，且响应数据已经完全接收到
         * status 表示服务器响应的状态码 - 就是http状态码
         * 1xx: 信息性状态码，表示请求已经被接收，继续处理。
         * 2xx: 成功状态码，表示请求已经成功被接收、理解、接受。
         * 3xx: 重定向状态码，表示需要进一步的操作以完成请求。
         * 4xx: 客户端错误状态码，表示请求包含语法错误或无法完成请求。
         * 5xx: 服务器错误状态码，表示服务器在处理请求时发生了错误。
         *
         * 当 readyState 的值为 4 时，status 的值才有意义，表示服务器响应的状态码。在其他状态下，status 的值可能是 0 或 undefined，表示当前请求尚未完成或尚未接收到响应。
         */
        if (!request || request.readyState !== 4) {
          return;
        }

        // The request errored out and we didn't get a response, this will be
        // handled by onerror instead
        // With one exception: request that using file: protocol, most browsers
        // will return status as 0 even though it's a successful request
        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
          return;
        }
        // readystate handler is calling before onerror or ontimeout handlers,
        // so we should call onloadend on the next 'tick'
        setTimeout(onloadend);
      };
    }

    // Handle browser request cancellation (as opposed to a manual cancellation)
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }

      reject(new AxiosError('Request aborted', AxiosError.ECONNABORTED, config, request));

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    request.ontimeout = function handleTimeout() {
      let timeoutErrorMessage = config.timeout ? 'timeout of ' + config.timeout + 'ms exceeded' : 'timeout exceeded';
      const transitional = config.transitional || transitionalDefaults;
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      reject(new AxiosError(
        timeoutErrorMessage,
        transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED,
        config,
        request));

      // Clean up request
      request = null;
    };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (platform.isStandardBrowserEnv) {
      // Add xsrf header
      /**
       * dfgong
       *  xsrf 的攻击方式
       *    打开并登录A网站，保持登录A下又打开B网站(发起攻击的站点)，B中发起对A服务的请求(会带上保持登录A下的cookie)
       *    xsrf 的防御就是保障请求的确是来自于用户打开的本服务的页面
       *  默认值
       *    config.xsrfCookieName: 'XSRF-TOKEN',
       *    config.xsrfHeaderName: 'X-XSRF-TOKEN',
       *  大部分后端框架的xsrf处理：
       *    往cookies的 XSRF-TOKEN 中写入一个值 xxx
       *    前端把值 xxx 通过请求头 X-XSRF-TOKEN 传给后端(用于验证是否是之前它设置cookie的值)
       *
       *  xsrfCookieName 与 xsrfHeaderName 这样可以根据团队的需要设置为其他的值
       */
      const xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath))
        && config.xsrfCookieName && cookies.read(config.xsrfCookieName);

      if (xsrfValue) {
        requestHeaders.set(config.xsrfHeaderName, xsrfValue);
      }
    }

    // Remove Content-Type if data is undefined
    requestData === undefined && requestHeaders.setContentType(null);

    // Add headers to the request
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
        request.setRequestHeader(key, val);
      });
    }

    // Add withCredentials to request if needed
    if (!utils.isUndefined(config.withCredentials)) {
      request.withCredentials = !!config.withCredentials;
    }

    // Add responseType to request if needed
    if (responseType && responseType !== 'json') {
      request.responseType = config.responseType;
    }

    // Handle progress if needed
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', progressEventReducer(config.onDownloadProgress, true));
    }

    // Not all browsers support upload events
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', progressEventReducer(config.onUploadProgress));
    }

    if (config.cancelToken || config.signal) {
      // Handle cancellation
      // eslint-disable-next-line func-names
      onCanceled = cancel => {
        if (!request) {
          return;
        }
        // dfgong 请求终止就是在promise链上将它reject掉，同时将请求abort，并request = null
        reject(!cancel || cancel.type ? new CanceledError(null, config, request) : cancel);
        request.abort(); // dfgong 手动终止
        request = null;
      };

      config.cancelToken && config.cancelToken.subscribe(onCanceled);
      if (config.signal) {
        // dfgong https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
        // dfgong signal为AbortSignal
        config.signal.aborted ? onCanceled() : config.signal.addEventListener('abort', onCanceled);
      }
    }

    const protocol = parseProtocol(fullPath);

    if (protocol && platform.protocols.indexOf(protocol) === -1) {
      reject(new AxiosError('Unsupported protocol ' + protocol + ':', AxiosError.ERR_BAD_REQUEST, config));
      return;
    }


    // Send the request
    request.send(requestData || null);
  });
}
