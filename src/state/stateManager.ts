import * as vscode from 'vscode';
import { ChatBlock, BlockState } from '../types';
import { ChatParser } from '../parser/chatParser';

export class StateManager {
    private stateStack: Map<string, BlockState>[] = [];
    private currentState: Map<string, BlockState> = new Map();

    constructor(private document: vscode.TextDocument) {
        this.loadState();
    }

    public getDocumentUri(): vscode.Uri {
        return this.document.uri;
    }

    private loadState(): void {
        console.log(`Loading state for ${this.document.uri.toString()}`);
        const blocks = ChatParser.parseDocument(this.document);
        this.currentState.clear();
        blocks.forEach(block => {
            this.currentState.set(block.id, block.state);
        });
    }

    public reloadStateFromDocument(): void {
        console.log(`Reloading state for ${this.document.uri.toString()}`);
        // 重新加载状态，与 loadState 逻辑相同
        this.loadState();
    }

    public getBlockState(blockId: string): BlockState | undefined {
        return this.currentState.get(blockId);
    }

    public setBlockState(blockId: string, state: BlockState): void {
        this.currentState.set(blockId, state);
    }

    public pushState(): void {
        this.stateStack.push(new Map(this.currentState));
    }

    public popState(): boolean {
        const previousState = this.stateStack.pop();
        if (previousState) {
            this.currentState = previousState;
            return true;
        }
        return false;
    }

    public getActiveBlocks(): string[] {
        return Array.from(this.currentState.entries())
            .filter(([_, state]) => state === 'A')
            .map(([id]) => id);
    }

    public updateDocument(): Thenable<boolean> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== this.document) {
            return Promise.resolve(false);
        }

        const blocks = ChatParser.parseDocument(this.document);
        const edits: vscode.TextEdit[] = [];

        blocks.forEach(block => {
            const newState = this.currentState.get(block.id);
            if (newState && newState !== block.state) {
                const newBlock = { ...block, state: newState };
                edits.push(vscode.TextEdit.replace(block.range, ChatParser.serializeBlock(newBlock)));
            }
        });

        if (edits.length === 0) {
            return Promise.resolve(false);
        }

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(this.document.uri, edits);
        return vscode.workspace.applyEdit(workspaceEdit).then(success => {
            if (success) {
                // 成功应用编辑后，确保状态与文件一致
                // this.reloadStateFromDocument(); // 在这里reload可能导致与updateDecorations竞争
            }
            return success;
        });
    }
} 