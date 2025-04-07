import * as vscode from 'vscode';

/**
 * 文本处理规则接口
 */
export interface TextProcessingRule {
    // 规则的唯一标识
    id: string;
    // 规则名称
    name: string;
    // 规则描述
    description: string;
    // 匹配模式
    pattern: {
        // 使用正则表达式进行匹配
        regex?: string;
        // 正则表达式标志
        flags?: string;
        // 匹配组索引，用于提取内容
        captureGroup?: number;
        // 自定义匹配函数
        customMatcher?: (text: string) => { matched: boolean; content?: string; start?: number; end?: number; };
    };
    // 处理类型
    processorType: 'extract' | 'replace' | 'transform';
    // 处理方式
    processor: {
        // 提取到新块
        extractToBlock?: {
            // 块类型
            blockType: 'U' | 'A' | 'S' | 'N';
            // 块名称
            blockName?: string;
            // 是否从原文中移除
            removeFromSource?: boolean;
        };
        // 替换内容
        replaceWith?: string | ((matched: string, ...groups: string[]) => string);
        // 转换函数
        transform?: (content: string) => string;
    };
}

/**
 * 文本处理结果接口
 */
export interface TextProcessingResult {
    // 处理后的原文本
    processedText: string;
    // 提取的内容
    extractedContent?: string;
    // 是否成功匹配并处理
    success: boolean;
    // 提取到的块内容
    extractedBlock?: {
        type: 'U' | 'A' | 'S' | 'N';
        content: string;
        name?: string;
    };
}

/**
 * 文本处理器类，提供通用文本处理功能
 */
export class TextProcessor {
    /**
     * 使用指定规则处理文本
     * @param text 要处理的文本
     * @param rule 处理规则
     * @returns 处理结果
     */
    public static processText(text: string, rule: TextProcessingRule): TextProcessingResult {
        // 默认结果
        const result: TextProcessingResult = {
            processedText: text,
            success: false
        };

        try {
            let matchResult: { matched: boolean; content?: string; start?: number; end?: number; } = { matched: false };
            
            // 使用自定义匹配函数或正则表达式
            if (rule.pattern.customMatcher) {
                matchResult = rule.pattern.customMatcher(text);
            } else if (rule.pattern.regex) {
                const regex = new RegExp(rule.pattern.regex, rule.pattern.flags || 'g');
                const match = regex.exec(text);
                
                if (match) {
                    const captureGroup = rule.pattern.captureGroup !== undefined ? rule.pattern.captureGroup : 0;
                    matchResult = {
                        matched: true,
                        content: match[captureGroup],
                        start: match.index,
                        end: match.index + match[0].length
                    };
                }
            }

            // 如果匹配成功
            if (matchResult.matched && matchResult.content !== undefined) {
                result.success = true;
                result.extractedContent = matchResult.content;

                // 根据处理类型执行相应操作
                switch (rule.processorType) {
                    case 'extract':
                        if (rule.processor.extractToBlock) {
                            const { blockType, blockName } = rule.processor.extractToBlock;
                            
                            // 创建提取的块
                            result.extractedBlock = {
                                type: blockType,
                                content: matchResult.content,
                                name: blockName
                            };

                            // 是否从原文中移除匹配内容
                            if (rule.processor.extractToBlock.removeFromSource && 
                                matchResult.start !== undefined && matchResult.end !== undefined) {
                                // 从原文中移除匹配内容
                                result.processedText = 
                                    text.substring(0, matchResult.start) + 
                                    text.substring(matchResult.end);
                            }
                        }
                        break;
                    
                    case 'replace':
                        if (matchResult.start !== undefined && matchResult.end !== undefined) {
                            let replacement = '';
                            
                            if (typeof rule.processor.replaceWith === 'function') {
                                // 使用函数生成替换内容
                                const regex = new RegExp(rule.pattern.regex!, rule.pattern.flags || 'g');
                                const match = regex.exec(text);
                                if (match) {
                                    replacement = rule.processor.replaceWith(match[0], ...match.slice(1));
                                }
                            } else if (typeof rule.processor.replaceWith === 'string') {
                                // 使用固定字符串替换
                                replacement = rule.processor.replaceWith;
                            }

                            // 执行替换
                            result.processedText = 
                                text.substring(0, matchResult.start) + 
                                replacement + 
                                text.substring(matchResult.end);
                        }
                        break;
                    
                    case 'transform':
                        if (rule.processor.transform && matchResult.start !== undefined && matchResult.end !== undefined) {
                            // 转换匹配的内容
                            const transformed = rule.processor.transform(matchResult.content);
                            
                            // 更新原文
                            result.processedText = 
                                text.substring(0, matchResult.start) + 
                                transformed + 
                                text.substring(matchResult.end);
                        }
                        break;
                }
            }
        } catch (error) {
            console.error('Error processing text:', error);
        }

        return result;
    }

    /**
     * 使用指定规则集处理文本，按顺序应用规则
     * @param text 要处理的文本
     * @param rules 处理规则集
     * @returns 处理结果数组
     */
    public static processTextWithRules(text: string, rules: TextProcessingRule[]): { 
        finalText: string; 
        results: TextProcessingResult[];
        extractedBlocks: Array<{
            type: 'U' | 'A' | 'S' | 'N';
            content: string;
            name?: string;
        }>;
    } {
        let currentText = text;
        const results: TextProcessingResult[] = [];
        const extractedBlocks: Array<{
            type: 'U' | 'A' | 'S' | 'N';
            content: string;
            name?: string;
        }> = [];

        // 按顺序应用每个规则
        for (const rule of rules) {
            const result = this.processText(currentText, rule);
            results.push(result);
            
            // 更新当前文本为处理后的文本
            currentText = result.processedText;
            
            // 收集提取的块
            if (result.extractedBlock) {
                extractedBlocks.push(result.extractedBlock);
            }
        }

        return {
            finalText: currentText,
            results,
            extractedBlocks
        };
    }
} 