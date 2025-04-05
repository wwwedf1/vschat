import * as vscode from 'vscode';
import { ChatBlock, BlockType, BlockState } from '../types';

export class ChatParser {
    private static readonly BLOCK_REGEX = /<([SUA])\s+([AI])\s+id="([^"]+)"(?:\s+name="([^"]+)")?\s*>(.*?)<\/\1>/gs;
    private static readonly MARKDOWN_HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;

    public static parseDocument(document: vscode.TextDocument): ChatBlock[] {
        const text = document.getText();
        const blocks: ChatBlock[] = [];
        let match;

        while ((match = this.BLOCK_REGEX.exec(text)) !== null) {
            const [fullMatch, type, state, id, name, content] = match;
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + fullMatch.length);

            blocks.push({
                type: type as BlockType,
                state: state as BlockState,
                id,
                name: name || undefined,
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
        return `<${block.type} ${block.state} id="${block.id}"${nameAttr}>${block.content}</${block.type}>`;
    }
} 