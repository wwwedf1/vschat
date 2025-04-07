import * as vscode from 'vscode';
import { ChatBlock, BlockType, BlockState } from '../types';
import { TextProcessor } from './textProcessor';
import { TextProcessingConfig } from '../config/textProcessingConfig';

export class ChatParser {
    private static readonly BLOCK_REGEX = /<([SUAN])\s+([AI])\s+id="([^"]+)"(?:\s+name="([^"]+)")?(?:\s+model="([^"]+)")?\s*>(.*?)<\/\1>/gs;
    private static readonly MARKDOWN_HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;
    private static readonly THINK_TAG_REGEX = /<think>([\s\S]*?)<\/think>/g;

    public static parseDocument(document: vscode.TextDocument): ChatBlock[] {
        const text = document.getText();
        const blocks: ChatBlock[] = [];
        let match;

        while ((match = this.BLOCK_REGEX.exec(text)) !== null) {
            const [fullMatch, type, state, id, name, modelAlias, content] = match;
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + fullMatch.length);

            blocks.push({
                type: type as BlockType,
                state: state as BlockState,
                id,
                name: name || undefined,
                modelAlias: modelAlias || undefined,
                content: content.trim(),
                range: new vscode.Range(startPos, endPos)
            });
        }

        return blocks;
    }

    public static findMarkdownHeadings(text: string): { level: number; text: string; range: vscode.Range }[] {
        const headings: { level: number; text: string; range: vscode.Range }[] = [];
        let match;

        while ((match = this.MARKDOWN_HEADING_REGEX.exec(text)) !== null) {
            const [fullMatch, hashes, headingText] = match;
            const lineNumber = text.substring(0, match.index).split('\n').length - 1;
            headings.push({
                level: hashes.length,
                text: headingText,
                range: new vscode.Range(
                    new vscode.Position(lineNumber, 0),
                    new vscode.Position(lineNumber, fullMatch.length)
                )
            });
        }

        return headings;
    }

    public static serializeBlock(block: ChatBlock): string {
        const nameAttr = block.name ? ` name="${block.name}"` : '';
        const modelAttr = block.modelAlias ? ` model="${block.modelAlias}"` : '';
        return `<${block.type} ${block.state} id="${block.id}"${nameAttr}${modelAttr}>${block.content}</${block.type}>`;
    }

    /**
     * 从响应内容中提取思维链
     * 优先检查独立字段 message.reasoning_content，其次检查 content 内的 <think> 标签。
     * @param response LLM响应内容或响应对象
     * @param provider 可选的provider配置 (目前主要用于日志记录)
     */
    static extractThinkingContent(response: string | any, provider?: any): { mainContent: string; thinkingContent: string | undefined } {
        console.log('Extracting thinking content from response:', response);
        console.log('Provider config:', provider);

        if (typeof response !== 'object' || !response.choices || response.choices.length === 0 || !response.choices[0].message) {
            console.warn('Invalid response format for thinking content extraction.');
            const content = typeof response === 'string' ? response : (response?.content || '');
            return {
                mainContent: content,
                thinkingContent: undefined
            };
        }

        const message = response.choices[0].message;
        let mainContent = message.content || ''; // 初始主内容
        let thinkingContent: string | undefined = undefined;

        // 优先检查独立字段 (如 DeepSeek 的 reasoning_content)
        if (message.reasoning_content) {
            thinkingContent = message.reasoning_content;
            console.log('Found thinking content in field `reasoning_content`:', thinkingContent);
            // 注意：此时 mainContent 仍然是原始的 message.content
        } else {
            // 如果没有独立字段，再使用文本处理器提取思维链
            const thinkingRules = TextProcessingConfig.getRulesByPurpose('thinking-chain');
            
            if (thinkingRules.length > 0) {
                // 应用规则处理文本
                const processResult = TextProcessor.processTextWithRules(mainContent, thinkingRules);
                
                // 如果成功提取了内容
                if (processResult.extractedBlocks.length > 0) {
                    // 更新主内容和思维链内容
                    mainContent = processResult.finalText.trim();
                    thinkingContent = processResult.extractedBlocks[0].content;
                    console.log('Extracted thinking content using text processor:', thinkingContent);
                } else {
                    // 如果没有匹配到思维链模式，则保持原样
                    console.log('No thinking content pattern matched using text processor.');
                }
            } else {
                // 如果没有配置思维链提取规则，回退到原始实现（向后兼容）
                const thinkRegex = /<think>([\s\S]*?)<\/think>/;
                const match = mainContent.match(thinkRegex);
                if (match) {
                    thinkingContent = match[1].trim();
                    // 如果找到标签，需要从 mainContent 中移除标签
                    mainContent = mainContent.replace(thinkRegex, '').trim();
                    console.log('Found thinking content in <think> tags (legacy method):', thinkingContent);
                }
            }
        }

        console.log('Final extracted content - Main:', mainContent, 'Thinking:', thinkingContent);
        return {
            mainContent,
            thinkingContent
        };
    }
} 