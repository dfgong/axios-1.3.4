### 整体思路
1. 处理配置 - 默认配置+用户传入的配置
2. 构建一条promise请求响应链 - 链接请求处理、请求、响应处理
3. 请求过程封装为xhr/http，注册到适配器adapter中，上层调用适配器，适配器动态选择对应的请求方式
4. 请求、响应数据通过transformData处理
5. 请求cancel由配置信息传入真实的请求方式中，各种分别处理

### 学习重点
1. promise请求响应链的设计
2. 适配器模式的应用
3. http相关的知识点查漏补缺
4. config的合并时，不同的属性采用不同的合并策略 - 代码实现时采用典型的策略模式