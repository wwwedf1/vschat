# VSChat 正则提取功能使用指南

## 概述

VSChat 提供了强大的文本处理功能，可以通过正则表达式匹配和提取文本内容，并将其转换为聊天块。本指南将帮助你了解如何配置和使用这些功能。

## 配置正则提取规则

VSChat 支持通过 VS Code 的设置文件配置自定义正则提取规则。你可以在 `settings.json` 文件中添加以下配置：

```json
"vschat.textProcessing.rules": [
  {
    "id": "extract-markdown-code-blocks",
    "name": "提取Markdown代码块",
    "description": "从文本中提取Markdown格式的代码块",
    "pattern": {
      "regex": "```([a-zA-Z0-9]*)\\n([\\s\\S]*?)\\n```",
      "flags": "g",
      "captureGroup": 2
    },
    "processorType": "extract",
    "processor": {
      "extractToBlock": {
        "blockType": "N",
        "blockName": "代码块",
        "removeFromSource": true
      }
    }
  }
]
```

## 规则配置字段说明

每个规则包含以下主要字段：

1. **id**: 规则的唯一标识符
2. **name**: 规则的名称
3. **description**: 规则的描述
4. **pattern**: 匹配模式
   - **regex**: 正则表达式字符串
   - **flags**: 正则表达式标志（如 'g', 'i', 'm', 's' 等）
   - **captureGroup**: 提取的捕获组索引（如果需要特定组）
5. **processorType**: 处理类型（'extract', 'replace', 'transform'）
6. **processor**: 处理配置
   - **extractToBlock**: 提取到块的配置
     - **blockType**: 块类型（'U' 用户, 'A' 助手, 'S' 系统, 'N' 注释）
     - **blockName**: 块的名称
     - **removeFromSource**: 是否从源文本中移除匹配内容

## 使用场景示例

### 示例 1: 提取思维链

如果 AI 返回的内容中包含思维链（使用特定标签包裹），你可以自动将其提取为单独的注释块：

```json
{
  "id": "extract-thinking-chain",
  "name": "提取思维链",
  "description": "从AI回复中提取思维链内容",
  "pattern": {
    "regex": "<think>([\s\S]*?)</think>",
    "flags": "g",
    "captureGroup": 1
  },
  "processorType": "extract",
  "processor": {
    "extractToBlock": {
      "blockType": "N",
      "blockName": "思维链",
      "removeFromSource": true
    }
  }
}
```

当 AI 返回如下内容时：

```
<think>
首先我需要理解用户的问题，他们想要一个求和函数。
1. 函数应该接受任意数量的参数
2. 需要计算所有参数的总和
3. 返回结果
</think>

这是一个计算任意数量参数总和的函数：

```python
def sum_all(*args):
    total = 0
    for num in args:
        total += num
    return total
```

你可以这样使用: `sum_all(1, 2, 3, 4)` 将返回 10。
```

规则将自动提取 `<think>...</think>` 标签内的内容到一个单独的注释块中，并从原文中移除这部分内容。

### 示例 2: 提取 JSON 数据

如果你收到的回复中包含 JSON 数据，你可以将其提取到单独的块中以便查看和使用：

```json
{
  "id": "extract-json-data",
  "name": "提取JSON数据",
  "description": "从文本中提取JSON格式的数据",
  "pattern": {
    "regex": "\\{[\\s\\S]*?\\}",
    "flags": "g"
  },
  "processorType": "extract",
  "processor": {
    "extractToBlock": {
      "blockType": "N",
      "blockName": "JSON数据",
      "removeFromSource": false
    }
  }
}
```

### 示例 3: 提取代码块

你可以设置规则自动从回复中提取代码块：

```json
{
  "id": "extract-code-blocks",
  "name": "提取代码块",
  "description": "从文本中提取代码块",
  "pattern": {
    "regex": "```(?:[a-zA-Z0-9]*\\n)?([\\s\\S]*?)```",
    "flags": "g",
    "captureGroup": 1
  },
  "processorType": "extract",
  "processor": {
    "extractToBlock": {
      "blockType": "N",
      "blockName": "代码",
      "removeFromSource": true
    }
  }
}
```

## 手动提取选定内容

除了自动处理之外，你还可以手动选择文本，然后右键单击使用"提取选中内容到新块"功能，或使用快捷键 `Ctrl+Alt+E`（Mac: `Cmd+Alt+E`）。

## 高级用法：使用自定义匹配函数

对于更复杂的匹配需求，你可以编程方式定义自定义匹配函数：

```typescript
const complexRule = {
  id: "complex-extraction",
  name: "复杂提取规则",
  description: "使用自定义函数匹配特定内容",
  pattern: {
    customMatcher: (text) => {
      // 实现复杂的匹配逻辑
      const matched = /* 自定义匹配逻辑 */;
      return {
        matched: Boolean(matched),
        content: matched ? extractedContent : undefined,
        start: startIndex,
        end: endIndex
      };
    }
  },
  processorType: "extract",
  processor: {
    extractToBlock: {
      blockType: "N",
      blockName: "自定义提取",
      removeFromSource: true
    }
  }
};
```

## 注意事项

1. 正则表达式在 JSON 中需要转义反斜杠，因此使用 `\\` 来表示正则表达式中的 `\`。
2. 确保正则表达式不会匹配到不需要的内容。
3. 如果设置 `removeFromSource: true`，请确保你的规则不会影响文档的语义完整性。
4. 多个规则会按照它们在配置中的顺序依次应用。 