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

    private activeStateDecoration: vscode.TextEditorDecorationType;
    private inactiveStateDecoration: vscode.TextEditorDecorationType;
    private changeListenerDisposable: vscode.Disposable | undefined;

    constructor(
        private document: vscode.TextDocument,
        private stateManager: StateManager
    ) {
        this.activeStateDecoration = vscode.window.createTextEditorDecorationType({
            borderWidth: '0 0 0 2px',
            borderStyle: 'solid',
            borderColor: new vscode.ThemeColor('editor.selectionBackground'),
            isWholeLine: true
        });

        this.inactiveStateDecoration = vscode.window.createTextEditorDecorationType({
            opacity: '0.6',
            isWholeLine: true
        });
    }

    public setChangeListener(disposable: vscode.Disposable) {
        this.changeListenerDisposable = disposable;
    }

    public getDocumentUri(): vscode.Uri {
        return this.document.uri;
    }

    public dispose(): void {
        this.activeStateDecoration.dispose();
        this.inactiveStateDecoration.dispose();
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

        const foldingRanges: vscode.FoldingRange[] = [];
        const blocks = ChatParser.parseDocument(document);

        blocks.forEach(block => {
            if (block.range.end.line > block.range.start.line) {
                 foldingRanges.push(new vscode.FoldingRange(
                    block.range.start.line,
                    block.range.end.line,
                    vscode.FoldingRangeKind.Region
                ));
            }

            const blockContent = document.getText(block.range);
            const codeBlockRegex = /^```(?:\w*\n)?([\s\S]*?)\n```$/gm;
            let match;
            while ((match = codeBlockRegex.exec(blockContent)) !== null) {
                const startIndex = match.index;
                const endIndex = startIndex + match[0].length;
                const startPos = document.positionAt(document.offsetAt(block.range.start) + startIndex);
                const endPos = document.positionAt(document.offsetAt(block.range.start) + endIndex);

                if (endPos.line > startPos.line) {
                    foldingRanges.push(new vscode.FoldingRange(
                        startPos.line,
                        endPos.line -1,
                        vscode.FoldingRangeKind.Region
                    ));
                }
            }
        });

        return foldingRanges;
    }

    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.DocumentSymbol[] {
        if (document.languageId !== 'chat') return [];
        const blocks = ChatParser.parseDocument(document);
        return blocks.map(block => {
            const symbol = new vscode.DocumentSymbol(
                block.name || `[${block.type}] ${block.content.substring(0, 30)}...`,
                '',
                vscode.SymbolKind.Field,
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
        const activeRanges: vscode.Range[] = [];
        const inactiveRanges: vscode.Range[] = [];

        blocks.forEach(block => {
            const state = this.stateManager.getBlockState(block.id) ?? 'I';
            if (state === 'A') {
                activeRanges.push(block.range);
            } else {
                inactiveRanges.push(block.range);
            }
        });

        editor.setDecorations(this.activeStateDecoration, activeRanges);
        editor.setDecorations(this.inactiveStateDecoration, inactiveRanges);
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
            const currentState = this.stateManager.getBlockState(currentBlock.id) ?? 'I';
            const actionTitle = `切换激活状态 (当前: ${currentState === 'A' ? '活动' : '非活动'})`;

            const action = new vscode.CodeAction(actionTitle, vscode.CodeActionKind.QuickFix);
            action.command = {
                command: 'vschat.toggleCurrentBlockState',
                title: actionTitle
            };
            action.isPreferred = true;

            return [action];
        }

        return undefined;
    }
} 