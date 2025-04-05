import * as vscode from 'vscode';
import { ChatBlock } from '../types';
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
                const prefix = this.getBlockPrefix(block);
                return `${prefix}${block.content}`;
            })
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
            default:
                return '';
        }
    }

    public static createBlockId(type: 'S' | 'U' | 'A'): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${type.toLowerCase()}_${timestamp}_${random}`;
    }

    public static createNewBlock(type: 'S' | 'U' | 'A', content: string, name?: string): string {
        const id = this.createBlockId(type);
        return ChatParser.serializeBlock({
            type,
            state: 'A',
            id,
            name,
            content,
            range: new vscode.Range(0, 0, 0, 0) // 占位符，实际使用时会被忽略
        });
    }
} 