import utils from '../utils.js';
import httpAdapter from './http.js';
import xhrAdapter from './xhr.js';
import AxiosError from "../core/AxiosError.js";

const knownAdapters = {
  http: httpAdapter,
  xhr: xhrAdapter
}

utils.forEach(knownAdapters, (fn, value) => {
  if(fn) {
    try {
      // dfgong 默认情况下，使用 Object.defineProperty() 添加的属性值是不可修改（immutable）的。
      // dfgong https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
      Object.defineProperty(fn, 'name', {value});
    } catch (e) {
      // eslint-disable-next-line no-empty
    }
    Object.defineProperty(fn, 'adapterName', {value});
  }
});

export default {
  getAdapter: (adapters) => {
    adapters = utils.isArray(adapters) ? adapters : [adapters];

    const {length} = adapters;
    let nameOrAdapter;
    let adapter;

    for (let i = 0; i < length; i++) {
      // dfgong 选择具体的请求方式 - 兼容浏览器和node环境 环境判断已经融合到了具体的adapter实现中
      // dfgong 如果环境判断不通过 adapters[i] 得到的是 undefined - 在 export default中做了判断
      nameOrAdapter = adapters[i];
      if((adapter = utils.isString(nameOrAdapter) ? knownAdapters[nameOrAdapter.toLowerCase()] : nameOrAdapter)) {
        break;
      }
    }

    if (!adapter) {
      if (adapter === false) {
        throw new AxiosError(
          `Adapter ${nameOrAdapter} is not supported by the environment`,
          'ERR_NOT_SUPPORT'
        );
      }

      // dfgong throw 当前函数的执行将被停止（throw 之后的语句将不会执行），并且控制将被传递到调用堆栈中的第一个 catch 块。如果调用者函数中没有 catch 块，程序将会终止
      throw new Error(
        utils.hasOwnProp(knownAdapters, nameOrAdapter) ?
          `Adapter '${nameOrAdapter}' is not available in the build` :
          `Unknown adapter '${nameOrAdapter}'`
      );
    }

    if (!utils.isFunction(adapter)) {
      throw new TypeError('adapter is not a function');
    }

    return adapter;
  },
  adapters: knownAdapters
}
