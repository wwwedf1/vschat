import * as vscode from 'vscode';
import { ChatBlock, BlockState } from '../types';
import { ChatParser } from '../parser/chatParser';
import { StateManager } from '../state/stateManager';
import { ConfigManager } from '../config/configManager';

export class EditorEnhancement implements
    vscode.FoldingRangeProvider,
    vscode.DocumentSymbolProvider,
    vscode.CodeActionProvider
{

    private inactiveStateDecoration: vscode.TextEditorDecorationType;
    private userActiveTagDecoration: vscode.TextEditorDecorationType;
    private assistantActiveTagDecoration: vscode.TextEditorDecorationType;
    private noteActiveTagDecoration: vscode.TextEditorDecorationType;
    private changeListenerDisposable: vscode.Disposable | undefined;

    constructor(
        private document: vscode.TextDocument,
        private stateManager: StateManager | undefined
    ) {
        this.inactiveStateDecoration = vscode.window.createTextEditorDecorationType({
            opacity: '0.6',
            isWholeLine: true
        });

        const commonTagDecorationOptions: vscode.DecorationRenderOptions = {
            borderRadius: '3px',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
        };

        this.userActiveTagDecoration = vscode.window.createTextEditorDecorationType({
            ...commonTagDecorationOptions,
            backgroundColor: 'rgba(0, 129, 9, 0.2)',
            overviewRulerColor: 'rgba(59, 246, 227, 0.5)',
        });

        this.assistantActiveTagDecoration = vscode.window.createTextEditorDecorationType({
            ...commonTagDecorationOptions,
            backgroundColor: 'rgba(197, 34, 132, 0.2)',
            overviewRulerColor: 'rgba(197, 34, 34, 0.5)',
        });

        this.noteActiveTagDecoration = vscode.window.createTextEditorDecorationType({
            ...commonTagDecorationOptions,
            backgroundColor: 'rgba(234, 179, 8, 0.2)',
            overviewRulerColor: 'rgba(234, 179, 8, 0.5)',
        });
    }

    public setChangeListener(disposable: vscode.Disposable) {
        this.changeListenerDisposable = disposable;
    }

    public getDocumentUri(): vscode.Uri {
        return this.document.uri;
    }

    public dispose(): void {
        this.inactiveStateDecoration.dispose();
        this.userActiveTagDecoration.dispose();
        this.assistantActiveTagDecoration.dispose();
        this.noteActiveTagDecoration.dispose();
        if (this.changeListenerDisposable) {
            this.changeListenerDisposable.dispose();
            this.changeListenerDisposable = undefined;
        }
    }

    public provideFoldingRanges(
        document: vscode.TextDocument,
        context: vscode.FoldingContext,
        token: vscode.CancellationToken
    ): vscode.FoldingRange[] {
        if (document.languageId !== 'chat') return [];

        const blocks = ChatParser.parseDocument(document);
        const ranges: vscode.FoldingRange[] = [];

        blocks.forEach(block => {
            const startLine = block.range.start.line;
            const endLine = block.range.end.line;
            
            if (endLine > startLine) {
                ranges.push(new vscode.FoldingRange(startLine, endLine));
            }

            if (block.type === 'N' && block.name === '思维链' && endLine > startLine) {
                ranges.push(new vscode.FoldingRange(startLine, endLine, vscode.FoldingRangeKind.Comment));
            }
        });

        return ranges;
    }

    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.DocumentSymbol[] {
        if (document.languageId !== 'chat') return [];
        const blocks = ChatParser.parseDocument(document);
        
        // 只显示具有 'name' 属性的块
        return blocks
            .filter(block => block.name)
            .map(block => {
                const symbolName = `[${block.type}] ${block.name}`; // 使用明确的name属性

                const symbol = new vscode.DocumentSymbol(
                    symbolName,
                    '',
                    block.type === 'N' ? vscode.SymbolKind.File : vscode.SymbolKind.Field,
                    block.range,
                    block.range
                );
                symbol.detail = block.state === 'A' ? '活动' : '非活动';
                return symbol;
            });
    }

    public updateDecorations(editor: vscode.TextEditor): void {
        if (editor.document.languageId !== 'chat' || !this.stateManager) return;

        const blocks = ChatParser.parseDocument(this.document);
        const inactiveRanges: vscode.Range[] = [];
        const userActiveTagRanges: vscode.Range[] = [];
        const assistantActiveTagRanges: vscode.Range[] = [];
        const noteActiveTagRanges: vscode.Range[] = [];

        blocks.forEach(block => {
            const tagRange = new vscode.Range(
                block.range.start.translate(0, 1),
                block.range.start.translate(0, 2)
            );

            const state = this.stateManager?.getBlockState(block.id) ?? 'I';

            if (state === 'A') {
                switch (block.type) {
                    case 'U':
                        userActiveTagRanges.push(tagRange);
                        break;
                    case 'A':
                        assistantActiveTagRanges.push(tagRange);
                        break;
                    case 'N':
                        noteActiveTagRanges.push(tagRange);
                        break;
                }
            } else {
                inactiveRanges.push(block.range);
            }
        });

        editor.setDecorations(this.inactiveStateDecoration, inactiveRanges);
        editor.setDecorations(this.userActiveTagDecoration, userActiveTagRanges);
        editor.setDecorations(this.assistantActiveTagDecoration, assistantActiveTagRanges);
        editor.setDecorations(this.noteActiveTagDecoration, noteActiveTagRanges);
    }

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        if (!this.stateManager) return undefined;

        const blocks = ChatParser.parseDocument(document);
        const position = range.start;
        // Only show actions if the cursor is on the first line of a block
        const currentBlock = blocks.find(block => block.range.start.line === position.line && block.range.contains(position));

        if (currentBlock) {
            const actions: vscode.CodeAction[] = [];
            
            // Helper to prevent duplicates based on COMMAND, not title
            const addUniqueAction = (action: vscode.CodeAction) => {
                if (action.command && !actions.some(a => a.command?.command === action.command?.command)) {
                    actions.push(action);
                } else if (!action.command && !actions.some(a => a.title === action.title)) { // Fallback for actions without command
                     actions.push(action);
                }
            };
            
            // 1. Toggle Activation State Action
            const currentState = this.stateManager.getBlockState(currentBlock.id) ?? 'I';
            // Use a fixed title for toggle action to ensure uniqueness check works
            const toggleActionTitle = '切换块激活状态'; 
            const toggleAction = new vscode.CodeAction(toggleActionTitle, vscode.CodeActionKind.QuickFix);
            toggleAction.command = {
                command: 'vschat.toggleCurrentBlockState',
                title: toggleActionTitle, // Title for the command execution itself
                // Optionally add tooltip or detail to show current state if needed
                // tooltip: `当前状态: ${currentState === 'A' ? '活动' : '非活动'}`
            };
            // toggleAction.isPreferred = true; // Preference might change based on context
            addUniqueAction(toggleAction);
            
            // 2. Rename Block Action (Common for all types)
            const renameAction = new vscode.CodeAction('设置块标题', vscode.CodeActionKind.QuickFix);
            renameAction.command = {
                command: 'vschat.renameBlock',
                title: '设置块标题'
            };
            addUniqueAction(renameAction);
            
            // 3. Copy Block Content Action (Common for all types)
            const copyAction = new vscode.CodeAction('复制块内容', vscode.CodeActionKind.QuickFix);
            copyAction.command = {
                command: 'vschat.copyBlockContent',
                title: '复制块内容',
                arguments: [currentBlock.content]
            };
            addUniqueAction(copyAction);

            return actions;
        }

        return undefined;
    }
}