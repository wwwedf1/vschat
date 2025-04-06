import * as vscode from 'vscode';
import { ChatBlock, BlockType } from '../types';
import { ChatParser } from '../parser/chatParser';
import { StateManager } from '../state/stateManager';

export class ContextBuilder {
    constructor(
        private document: vscode.TextDocument,
        private stateManager: StateManager
    ) {}

    public buildContext(): string {
        const blocks = ChatParser.parseDocument(this.document);
        const activeBlockIds = this.stateManager.getActiveBlocks();
        const activeBlocks = blocks.filter(block => activeBlockIds.includes(block.id));

        return activeBlocks
            .map(block => {
                // 不包含注释块（N类型）在上下文中
                if (block.type === 'N') {
                    return '';
                }
                const prefix = this.getBlockPrefix(block);
                return `${prefix}${block.content}`;
            })
            .filter(text => text !== '') // 过滤掉空字符串
            .join('\n\n');
    }

    private getBlockPrefix(block: ChatBlock): string {
        switch (block.type) {
            case 'S':
                return '[系统] ';
            case 'U':
                return '[用户] ';
            case 'A':
                return block.name ? `[${block.name}] ` : '[助手] ';
            case 'N':
                return '[注释] ';
            default:
                return '';
        }
    }

    public static createNewBlock(type: BlockType, content: string, name?: string, modelAlias?: string): string {
        const id = this.createBlockId(type);
        // 默认状态为 Active ('A')，除非是 Note ('N') 块
        const defaultState = type === 'N' ? 'I' : 'A'; 
        return ChatParser.serializeBlock({
            type,
            state: defaultState,
            id,
            name,
            modelAlias,
            content,
            range: new vscode.Range(0, 0, 0, 0) // 占位符，实际使用时会被忽略
        });
    }

    public static createThinkingBlock(content: string): string {
        return this.createNewBlock('N', content);
    }

    private static createBlockId(type: BlockType): string {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        return `${type}-${timestamp}-${random}`;
    }
} 