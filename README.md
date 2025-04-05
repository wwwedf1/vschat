# VS Chat

一个轻量级的 VS Code AI 聊天扩展，支持多种 LLM Provider，提供了简单易用的聊天界面和强大的上下文管理功能。

## 功能特点

- 支持多种 LLM Provider（OpenAI、DeepSeek 等）
- 安全的 API Key 管理
- 聊天上下文管理
- 代码块折叠
- Markdown 支持
- 自定义配置选项

## 安装要求

- VS Code 版本 1.99.0 或更高
- Node.js 14.0 或更高

## 扩展设置

此扩展提供以下设置：

* `vschat.llm.providers`: LLM providers 配置
* `vschat.files.exclude`: 文件排除配置
* `vschat.search.exclude`: 搜索排除配置
* `aiChat.editor.folding.enabled`: 启用/禁用代码折叠
* `aiChat.editor.highlightActiveState.enabled`: 启用/禁用活动状态高亮

## 使用指南

1. **配置 LLM Provider**
   - 打开命令面板 (Ctrl+Shift+P)
   - 输入 "VSChat: 设置 LLM Provider API Key"
   - 选择提供商并输入 API Key

2. **开始聊天**
   - 创建新的 .chat 文件
   - 使用命令面板或快捷键发送消息
   - 使用 Ctrl+Alt+T 切换聊天块状态

3. **验证 Provider**
   - 使用 "VSChat: 验证 LLM Provider" 命令
   - 选择要验证的提供商
   - 查看验证结果

## 快捷键

- `Ctrl+Alt+T` (Mac: `Cmd+Alt+T`): 切换当前聊天块状态
- 更多快捷键可在 VS Code 键盘快捷方式设置中自定义

## 已知问题

- 暂无已知问题

## 更新日志

### 0.0.1

- 初始版本发布
- 支持基本的聊天功能
- 支持多个 LLM Provider
- 实现 API Key 安全管理

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

[MIT](LICENSE)
