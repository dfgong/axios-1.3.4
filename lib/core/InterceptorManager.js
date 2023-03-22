'use strict';

import utils from './../utils.js';

/**
 * dfgong 发布订阅模式
 *  handlers - 存放依赖的容器
 *  use - 收集依赖
 *  eject - 删除依赖
 *  clear - 清空依赖
 *  forEach - 触发依赖
 */
class InterceptorManager {
  constructor() {
    this.handlers = [];
  }

  /**
   * Add a new interceptor to the stack
   *
   * @param {Function} fulfilled The function to handle `then` for a `Promise`
   * @param {Function} rejected The function to handle `reject` for a `Promise`
   *
   * @return {Number} An ID used to remove interceptor later
   */
  // dfgong 收集到 this.handlers 栈中
  use(fulfilled, rejected, options) {
    this.handlers.push({
      fulfilled,
      rejected,
      synchronous: options ? options.synchronous : false, // dfgong 默认是异步
      runWhen: options ? options.runWhen : null
    });
    return this.handlers.length - 1; // dfgong 返回该拦截器函数的下标，可以用于eject
  }

  /**
   * Remove an interceptor from the stack
   *
   * @param {Number} id The ID that was returned by `use`
   *
   * @returns {Boolean} `true` if the interceptor was removed, `false` otherwise
   */
  eject(id) {
    if (this.handlers[id]) {
      this.handlers[id] = null; // dfgong 没有用从数组中移除的方式 - 保证了id的不断递增、不重复
    }
  }

  /**
   * Clear all interceptors from the stack
   *
   * @returns {void}
   */
  clear() {
    if (this.handlers) {
      this.handlers = [];
    }
  }

  /**
   * Iterate over all the registered interceptors
   *
   * This method is particularly useful for skipping over any
   * interceptors that may have become `null` calling `eject`.
   *
   * @param {Function} fn The function to call for each interceptor
   *
   * @returns {void}
   */
  // dfgong 执行除eject外的所有handler - 并发的执行，如果有异步是不能保证函数里面的执行顺序的
  forEach(fn) {
    utils.forEach(this.handlers, function forEachHandler(h) {
      if (h !== null) {
        fn(h);
      }
    });
  }
}

export default InterceptorManager;
