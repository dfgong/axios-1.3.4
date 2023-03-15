'use strict';

import utils from './../utils.js';
import buildURL from '../helpers/buildURL.js';
import InterceptorManager from './InterceptorManager.js';
import dispatchRequest from './dispatchRequest.js';
import mergeConfig from './mergeConfig.js';
import buildFullPath from './buildFullPath.js';
import validator from '../helpers/validator.js';
import AxiosHeaders from './AxiosHeaders.js';

const validators = validator.validators;

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 *
 * @return {Axios} A new instance of Axios
 */
class Axios {
  constructor(instanceConfig) {
    // dfgong axios.defaults.baseURL = 'https://api.example.com'; 的实现原理
    this.defaults = instanceConfig;
    this.interceptors = {
      request: new InterceptorManager(),
      response: new InterceptorManager()
    };
  }

  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  // dfgong 所有请求最终调用的都是这个方法
  request(configOrUrl, config) {
    /*eslint no-param-reassign:0*/
    // Allow for axios('example/url'[, config]) a la fetch API
    // dfgong 兼容用法axios('example/url'[, config])
    if (typeof configOrUrl === 'string') {
      config = config || {};
      config.url = configOrUrl;
    } else {
      config = configOrUrl || {};
    }

    // dfgong 修改了 defaults 后，在后面的使用中每次都会通过合并应用上，而不是存储在某个地方 - 对象的同一引用进行修改
    config = mergeConfig(this.defaults, config);

    const {transitional, paramsSerializer, headers} = config;

    if (transitional !== undefined) {
      validator.assertOptions(transitional, {
        silentJSONParsing: validators.transitional(validators.boolean),
        forcedJSONParsing: validators.transitional(validators.boolean),
        clarifyTimeoutError: validators.transitional(validators.boolean)
      }, false);
    }

    if (paramsSerializer !== undefined) {
      validator.assertOptions(paramsSerializer, {
        encode: validators.function,
        serialize: validators.function
      }, true);
    }

    // Set config.method
    // dfgong 默认get
    config.method = (config.method || this.defaults.method || 'get').toLowerCase();

    let contextHeaders;

    // Flatten headers
    contextHeaders = headers && utils.merge(
      headers.common,
      headers[config.method]
    );

    contextHeaders && utils.forEach(
      ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
      (method) => {
        delete headers[method];
      }
    );

    config.headers = AxiosHeaders.concat(contextHeaders, headers);

    // filter out skipped interceptors
    // dfgong 请求执行链的处理（包括异步操作）
    const requestInterceptorChain = [];
    let synchronousRequestInterceptors = true;
    this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
      // dfgong 通过runWhen返回值确认是否执行 - true才放入requestInterceptorChain - 该函数需要是同步的
      if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
        return;
      }

      // dfgong 只要有一个不是同步则判定为异步
      synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;

      // dfgong unshift - 最后use进去的放在最前面
      // dfgong interceptor.fulfilled, interceptor.rejected 不用打包成一个整理，后面执行时比unshift(interceptor)的方式更方便
      requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
    });

    const responseInterceptorChain = [];
    this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
      // dfgong push - 最后use进去的放在最后面
      responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
    });

    // dfgong 异步执行
    let promise;
    let i = 0;
    let len;

    if (!synchronousRequestInterceptors) {
      // dfgong 有异步时，request拦截器、dispatchRequest、response拦截器全部用promise来连接
      const chain = [dispatchRequest.bind(this), undefined];
      // dfgong unshift,push apply 后就不用解构了 - 参数的转换
      chain.unshift.apply(chain, requestInterceptorChain); // dfgong requestInterceptorChain 放前面
      chain.push.apply(chain, responseInterceptorChain); // dfgong responseInterceptorChain 放后面
      len = chain.length;

      promise = Promise.resolve(config); // dfgong while 中第一次调用 then 时，promise链开始执行

      while (i < len) {
        // dfgong 递归的用 promise.then 连接起来 - promise链的组装在then参数函数运行之前 - 同步任务在微任务之前
        // dfgong 链上某处出现错误跑到reject执行也不会停止,除非throw - then返回的总是一个promise
        // 顺序是 request拦截器(后use的先执行) -> dispatchRequest -> response拦截器(先use的先执行)
        promise = promise.then(chain[i++], chain[i++]);
      }

      return promise;
    }

    // dfgong 同步执行
    // dfgong requestInterceptorChain 的同步执行
    len = requestInterceptorChain.length;

    let newConfig = config;

    i = 0; // dfgong 最先执行的是最后一个use的handler - 为什么要这样设计？

    while (i < len) {
      const onFulfilled = requestInterceptorChain[i++];
      const onRejected = requestInterceptorChain[i++];
      try {
        // dfgong 配置onFulfilled函数时，要return 最新的配置 - 用于后面的 dispatchRequest
        newConfig = onFulfilled(newConfig);
      } catch (error) {
        onRejected.call(this, error);
        // dfgong 有失败直接break
        break;
      }
    }

    // dfgong 真实请求派发
    try {
      promise = dispatchRequest.call(this, newConfig);
    } catch (error) {
      return Promise.reject(error);
    }

    // dfgong 响应执行链
    i = 0;
    len = responseInterceptorChain.length;

    while (i < len) {
      promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
    }

    // dfgong 返回promise
    return promise;
  }

  getUri(config) {
    config = mergeConfig(this.defaults, config);
    const fullPath = buildFullPath(config.baseURL, config.url);
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
}

/**
 * dfgong
 * http的请求方式分两类
 *  数据通过body携带：'delete', 'get', 'head', 'options'
 *  数据通过url携带：'post', 'put', 'patch'
 *  所有请求最终都调用request实现
 */

// Provide aliases for supported request methods
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, config) {
    return this.request(mergeConfig(config || {}, {
      method,
      url,
      data: (config || {}).data
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/

  function generateHTTPMethod(isForm) {
    return function httpMethod(url, data, config) {
      return this.request(mergeConfig(config || {}, {
        method,
        headers: isForm ? {
          'Content-Type': 'multipart/form-data'
        } : {},
        url,
        data
      }));
    };
  }

  Axios.prototype[method] = generateHTTPMethod();

  Axios.prototype[method + 'Form'] = generateHTTPMethod(true);
});

export default Axios;
