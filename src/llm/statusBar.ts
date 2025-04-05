import * as vscode from 'vscode';
import { LLMService } from './service';

export class LLMStatusBar {
    private statusBarItem: vscode.StatusBarItem;

    constructor(private llmService: LLMService) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'vschat.selectModel';
        this.updateStatusBar();
        this.statusBarItem.show();
    }

    private updateStatusBar() {
        const currentModel = this.llmService.getCurrentModel();
        this.statusBarItem.text = currentModel 
            ? `$(symbol-misc) ${currentModel.alias || currentModel.name}`
            : '$(symbol-misc) 选择AI模型';
        this.statusBarItem.tooltip = currentModel
            ? `当前AI模型: ${currentModel.name}\n点击切换模型`
            : '点击选择AI模型';
    }

    public async showModelPicker() {
        const models = this.llmService.getAvailableModels();
        const items = models.map(model => ({
            label: model.alias || model.name,
            description: `(${this.llmService.getProviders().find(p => p.id === model.providerId)?.name})`,
            model: model
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择AI模型'
        });

        if (selected) {
            this.llmService.setCurrentModel(selected.model.id);
            this.updateStatusBar();
        }
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
} 