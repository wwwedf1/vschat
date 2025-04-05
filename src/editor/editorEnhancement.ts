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
        const currentBlock = blocks.find(block => block.range.contains(position));

        if (currentBlock && position.line === currentBlock.range.start.line) {
            const actions: vscode.CodeAction[] = [];
            
            // 检查是否已经存在相同的 action
            const addUniqueAction = (action: vscode.CodeAction) => {
                if (!actions.some(a => a.title === action.title)) {
                    actions.push(action);
                }
            };
            
            // 切换激活状态
            const currentState = this.stateManager.getBlockState(currentBlock.id) ?? 'I';
            const actionTitle = `切换激活状态 (当前: ${currentState === 'A' ? '活动' : '非活动'})`;

            const toggleAction = new vscode.CodeAction(actionTitle, vscode.CodeActionKind.QuickFix);
            toggleAction.command = {
                command: 'vschat.toggleCurrentBlockState',
                title: actionTitle
            };
            toggleAction.isPreferred = true;
            addUniqueAction(toggleAction);
            
            // 设置块名字
            const renameAction = new vscode.CodeAction('设置块标题', vscode.CodeActionKind.QuickFix);
            renameAction.command = {
                command: 'vschat.renameBlock',
                title: '设置块标题'
            };
            addUniqueAction(renameAction);
            
            // 复制块内容
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