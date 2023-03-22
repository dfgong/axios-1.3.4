'use strict';

/**
 * Creates a new URL by combining the specified URLs
 *
 * @param {string} baseURL The base URL
 * @param {string} relativeURL The relative URL
 *
 * @returns {string} The combined URL
 */
export default function combineURLs(baseURL, relativeURL) {
  return relativeURL
    // dfgong baseURL: (xx/a/ === xx/a) - 处理开始位置的/
    // dfgong relativeURL: (xx/a === /xx/a) - 处理结束位置的/
    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
    : baseURL;
}
