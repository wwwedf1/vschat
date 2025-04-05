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
            console.warn('updateDocument called but editor/document mismatch.');
            return Promise.resolve(false);
        }

        // **重要**: 总是从当前文档内容解析最新的块信息
        const currentBlocks = ChatParser.parseDocument(this.document);
        const edits: vscode.TextEdit[] = [];

        currentBlocks.forEach(block => {
            // 获取 StateManager 中期望的状态
            const desiredState = this.currentState.get(block.id);
            
            // 如果 StateManager 中有这个块的状态，并且与文档中的当前状态不同
            if (desiredState && desiredState !== block.state) {
                console.log(`Updating block ${block.id} state from ${block.state} to ${desiredState}`);
                // 创建一个新的块对象，只更新状态
                const newBlock = { ...block, state: desiredState };
                // 生成替换编辑操作
                edits.push(vscode.TextEdit.replace(block.range, ChatParser.serializeBlock(newBlock)));
            } else if (!desiredState && this.currentState.has(block.id)){
                 // StateManager中有记录，但状态与文档一致，或者StateManager中没有记录（理论上不应发生，除非块被外部删除）
                 // 不需要生成编辑
                 // console.log(`Block ${block.id} state (${block.state}) is consistent or not managed, skipping edit.`);
            }
        });

        if (edits.length === 0) {
            console.log('updateDocument: No state changes detected requiring edits.');
            return Promise.resolve(false);
        }

        console.log(`updateDocument: Applying ${edits.length} edits.`);
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(this.document.uri, edits);
        return vscode.workspace.applyEdit(workspaceEdit);
        // 不再需要 then 中的 reloadStateFromDocument，因为我们总是基于文档生成编辑
        // 并且 reloadStateFromDocument 会在 applyEdit 成功后的主流程（如 toggle 命令或 sendRequest）中调用
    }
} 