'use strict';

import utils from './../utils.js';
import defaults from '../defaults/index.js';
import AxiosHeaders from '../core/AxiosHeaders.js';

/**
 * Transform the data for a request or a response
 *
 * @param {Array|Function} fns A single function or Array of functions
 * @param {?Object} response The response object
 *
 * @returns {*} The resulting transformed data
 */
// dfgong 为什么要抽象出这一层来，分开写两个函数（request response 分别一个）不是更清晰吗
// dfgong 不断的去抽象
export default function transformData(fns, response) {
  const config = this || defaults;
  const context = response || config;
  const headers = AxiosHeaders.from(context.headers);
  let data = context.data;

  utils.forEach(fns, function transform(fn) {
    data = fn.call(config, data, headers.normalize(), response ? response.status : undefined);
  });

  headers.normalize();

  return data;
}
