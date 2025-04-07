import * as vscode from 'vscode';
import { TextProcessingRule } from '../parser/textProcessor';

/**
 * 文本处理配置管理器
 */
export class TextProcessingConfig {
    /**
     * 获取思维链提取规则（默认）
     */
    public static getThinkingChainRules(): TextProcessingRule[] {
        return [
            {
                id: 'openai-thinking-tag',
                name: '提取思维链（OpenAI格式）',
                description: '从OpenAI回复中提取<think>标签中的思维链内容',
                pattern: {
                    regex: '<think>([\s\S]*?)<\\/think>',
                    captureGroup: 1
                },
                processorType: 'extract',
                processor: {
                    extractToBlock: {
                        blockType: 'N',
                        blockName: '思维链',
                        removeFromSource: true
                    }
                }
            }
        ];
    }

    /**
     * 获取预设规则集合
     */
    public static getPresetRules(): TextProcessingRule[] {
        return [
            ...this.getThinkingChainRules(),
            {
                id: 'extract-to-note',
                name: '提取到注释块',
                description: '将选中内容提取到一个注释块中',
                pattern: {
                    // 这个规则将在选择命令中使用，所以不需要实际匹配模式
                    customMatcher: (text: string) => {
                        return {
                            matched: true,
                            content: text,
                            start: 0,
                            end: text.length
                        };
                    }
                },
                processorType: 'extract',
                processor: {
                    extractToBlock: {
                        blockType: 'N',
                        removeFromSource: true
                    }
                }
            }
        ];
    }

    /**
     * 从用户配置中加载所有规则
     */
    public static loadAllRules(): TextProcessingRule[] {
        const rules: TextProcessingRule[] = [];

        // 获取预设规则
        const presetRules = this.getPresetRules();
        rules.push(...presetRules);

        // 从配置文件加载自定义规则
        const config = vscode.workspace.getConfiguration('vschat');
        const customRules = config.get<TextProcessingRule[]>('textProcessing.rules', []);
        
        // 确保不会加入重复ID的规则（自定义规则优先）
        const existingIds = new Set(rules.map(rule => rule.id));
        for (const rule of customRules) {
            if (!existingIds.has(rule.id)) {
                rules.push(rule);
                existingIds.add(rule.id);
            }
        }

        return rules;
    }

    /**
     * 获取特定ID的规则
     * @param ruleId 规则ID
     */
    public static getRuleById(ruleId: string): TextProcessingRule | undefined {
        const allRules = this.loadAllRules();
        return allRules.find(rule => rule.id === ruleId);
    }

    /**
     * 获取用于特定目的的规则（如思维链提取）
     * @param purpose 目的标识
     */
    public static getRulesByPurpose(purpose: string): TextProcessingRule[] {
        switch (purpose) {
            case 'thinking-chain':
                return this.getThinkingChainRules();
            default:
                return [];
        }
    }

    /**
     * 获取示例规则模板
     * 用于生成示例配置
     */
    public static getTemplateRules(): TextProcessingRule[] {
        return [
            {
                id: "extract-markdown-code-blocks",
                name: "提取Markdown代码块",
                description: "从文本中提取Markdown格式的代码块",
                pattern: {
                    regex: "```([a-zA-Z0-9]*)\\n([\\s\\S]*?)\\n```",
                    flags: "g",
                    captureGroup: 2
                },
                processorType: "extract",
                processor: {
                    extractToBlock: {
                        blockType: "N",
                        blockName: "代码块",
                        removeFromSource: true
                    }
                }
            },
            {
                id: "extract-json-data",
                name: "提取JSON数据",
                description: "从文本中提取JSON格式的数据",
                pattern: {
                    regex: "\\{[\\s\\S]*?\\}",
                    flags: "g"
                },
                processorType: "extract",
                processor: {
                    extractToBlock: {
                        blockType: "N",
                        blockName: "JSON数据",
                        removeFromSource: false
                    }
                }
            },
            {
                id: "extract-python-function",
                name: "提取Python函数",
                description: "从文本中提取Python函数定义",
                pattern: {
                    regex: "def\\s+[a-zA-Z_][a-zA-Z0-9_]*\\s*\\([^)]*\\)\\s*:[\\s\\S]*?(?=\\n\\S|$)",
                    flags: "g"
                },
                processorType: "extract",
                processor: {
                    extractToBlock: {
                        blockType: "N",
                        blockName: "Python函数",
                        removeFromSource: true
                    }
                }
            },
            {
                id: "extract-thinking-chain-xml",
                name: "提取XML格式思维链",
                description: "从回复中提取<thinking>标签中的思维链内容",
                pattern: {
                    regex: "<thinking>(\\s*.*?\\s*)</thinking>",
                    flags: "s",
                    captureGroup: 1
                },
                processorType: "extract",
                processor: {
                    extractToBlock: {
                        blockType: "N",
                        blockName: "思维链",
                        removeFromSource: true
                    }
                }
            }
        ];
    }
} 