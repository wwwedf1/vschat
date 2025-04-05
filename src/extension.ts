// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ChatParser } from './parser/chatParser';
import { StateManager } from './state/stateManager';
import { ContextBuilder } from './context/contextBuilder';
import { EditorEnhancement } from './editor/editorEnhancement';
import { ConfigManager } from './config/configManager';
import { LLMService } from './llm/service';
import { LLMStatusBar } from './llm/statusBar';
import { LLMRequest, LLMProvider, LLMModel, LLMVerificationResponse } from './types';

let editorEnhancement: EditorEnhancement | undefined;
let stateManager: StateManager | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	extensionContext = context;
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vschat" is now active!');

	// 注册 .chat 文件关联
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(document => {
			if (isChatDocument(document)) {
				// 只进行最基本的 setup
				minimalSetupDocument(document);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument(document => {
			if (isChatDocument(document)) {
				cleanupDocument(document);
			}
		})
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && isChatDocument(editor.document)) {
				 // 只进行最基本的 setup
				minimalSetupDocument(editor.document);
			} else if (!editor) {
				 cleanupDocument();
			} else {
				 const lastChatDocUri = stateManager?.getDocumentUri();
				 if(lastChatDocUri && lastChatDocUri.toString() !== editor.document.uri.toString()) {
					cleanupDocument();
				 }
			}
		})
	);

	// 注册命令 (toggle 命令现在会报错，因为 editorEnhancement 不会被创建)
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.toggleCurrentBlockState', async () => {
			const editor = vscode.window.activeTextEditor;
			if (editor && isChatDocument(editor.document) && stateManager) {
				const position = editor.selection.active;
				const blocks = ChatParser.parseDocument(editor.document);
				const currentBlock = blocks.find(block => block.range.contains(position));

				if (currentBlock) {
					const currentState = stateManager.getBlockState(currentBlock.id) ?? 'I';
					const newState = currentState === 'A' ? 'I' : 'A';
					stateManager.setBlockState(currentBlock.id, newState);
					await stateManager.updateDocument();
					if (editorEnhancement) {
						editorEnhancement.updateDecorations(editor);
					}
				} else {
					 vscode.window.showInformationMessage('光标不在任何聊天块内。');
				}
			} else {
				 vscode.window.showWarningMessage('请先打开一个 .chat 文件。');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.pushState', () => {
			if (stateManager) {
				stateManager.pushState();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.popState', async () => {
			if (stateManager) {
				if (stateManager.popState()) {
					await stateManager.updateDocument();
					// updateDecorations();
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.insertUserBlock', async () => {
			const editor = vscode.window.activeTextEditor;
			if (editor && isChatDocument(editor.document)) {
				const newBlock = ContextBuilder.createNewBlock('U', '');
				await editor.edit(editBuilder => {
					editBuilder.insert(editor.selection.active, newBlock);
				});
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.renameBlock', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !isChatDocument(editor.document)) {
				return;
			}

			const blocks = ChatParser.parseDocument(editor.document);
			const block = blocks.find(b => b.range.contains(editor.selection.active));
			if (!block) {
				return;
			}

			const name = await vscode.window.showInputBox({
				prompt: '输入新的块名称',
				value: block.name
			});

			if (name !== undefined) {
				const newBlock = { ...block, name };
				const workspaceEdit = new vscode.WorkspaceEdit();
				workspaceEdit.replace(editor.document.uri, block.range, ChatParser.serializeBlock(newBlock));
				await vscode.workspace.applyEdit(workspaceEdit);
			}
		})
	);

	// 设置当前打开的 .chat 文件
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor && isChatDocument(activeEditor.document)) {
		minimalSetupDocument(activeEditor.document);
	}

	// 初始化LLM服务
	const llmService = new LLMService(context);
	const llmStatusBar = new LLMStatusBar(llmService);

	// 注册模型选择命令
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.selectModel', () => {
			llmStatusBar.showModelPicker();
		})
	);

	// 注册发送请求命令
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.sendCurrentContextRequest', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !isChatDocument(editor.document) || !stateManager) {
				vscode.window.showWarningMessage('请确保您正在编辑一个 .chat 文件。');
				return;
			}

			const currentModel = llmService.getCurrentModel();
			if (!currentModel) {
				vscode.window.showErrorMessage('请先通过状态栏选择一个AI模型');
				return;
			}

			// 1. 解析文档并构建上下文
			const document = editor.document;
			const allBlocks = ChatParser.parseDocument(document);
			const activeBlocks = allBlocks.filter(block => stateManager?.getBlockState(block.id) === 'A');

			if (activeBlocks.length === 0) {
				vscode.window.showInformationMessage('没有激活的聊天块用于发送请求。');
				return;
			}

			const messages = activeBlocks.map(block => {
				let role: 'user' | 'assistant' | 'system' | 'tool';
				switch (block.type) {
					case 'U':
						role = 'user';
						break;
					case 'A':
						role = 'assistant';
						break;
					case 'S':
						role = 'system';
						break;
					case 'Tool': // Handle the new Tool block type
						role = 'tool';
						break;
					default:
						// Should not happen with updated BlockType, but good practice
						console.error(`Unsupported block type encountered: ${block.type}`);
						return null; // Skip this block if type is unexpected
				}
				
				const message: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; tool_call_id?: string; name?: string } = {
					role: role,
					content: block.content
				};

				// Add tool_call_id and name if the role is 'tool' and data exists in the block
				if (role === 'tool') {
					if (block.toolCallId) {
						message.tool_call_id = block.toolCallId;
					}
					if (block.toolName) { // Add name if it exists
						message.name = block.toolName;
					}
					// Crucial: OpenAI requires tool_call_id for tool role messages.
					// If toolCallId is missing for a Tool block, we should probably skip it or error.
					if (!message.tool_call_id) {
						console.error(`Tool block (ID: ${block.id}) is missing required toolCallId.`);
						return null; // Skip invalid Tool block
					}
				}
				return message;
			}).filter(msg => msg !== null) as LLMRequest['messages']; // More specific type assertion

			// 2. 构建请求
			const request: LLMRequest = {
				modelId: currentModel.id,
				messages: messages,
				// parameters: { stream: true } // 如果API支持流式，可以考虑添加
			};

			// 3. 发送请求并处理响应
			try {
				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: `正在向 ${currentModel.alias || currentModel.name} 发送请求...`,
					cancellable: true // 允许取消
				}, async (progress, token) => {

					// 监听取消事件 (如果需要)
					// token.onCancellationRequested(() => {
					//     console.log("User cancelled the long running operation");
					//     // 需要一种方式来取消 fetch 请求，例如使用 AbortController
					// });

					const response = await llmService.sendRequest(request);

					if (token.isCancellationRequested) {
						return;
					}

					if (response.error) {
						vscode.window.showErrorMessage(`请求失败: ${response.error}`);
					} else {
						// 4. 将响应追加到文档末尾
						const assistantBlockText = ContextBuilder.createNewBlock('A', response.content);
						const newUserBlockText = ContextBuilder.createNewBlock('U', '');

						const edit = new vscode.WorkspaceEdit();
						const lastLine = document.lineAt(document.lineCount - 1);
						const endPosition = new vscode.Position(document.lineCount, 0);
						
						const separator = (document.lineCount > 0 && lastLine.text.trim() !== '') ? '\n\n' : '';
						const insertText = separator + assistantBlockText + '\n\n' + newUserBlockText;

						edit.insert(document.uri, endPosition, insertText);
						await vscode.workspace.applyEdit(edit);

						const assistantLines = assistantBlockText.split('\n').length;
						const separatorLines1 = separator.length > 0 ? 2 : 0;
						const separatorLines2 = 2;
						const newUserBlockStartLine = document.lineCount - newUserBlockText.split('\n').length; 

						const newPosition = new vscode.Position(newUserBlockStartLine, 4);
						editor.selection = new vscode.Selection(newPosition, newPosition);
						editor.revealRange(new vscode.Range(newPosition, newPosition), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
					}
				});

			} catch (error) {
				vscode.window.showErrorMessage(`发送请求时出错: ${error}`);
			}
		})
	);

	// 注册验证 LLM Provider 命令
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.verifyLLMProvider', async () => {
			// 获取所有配置的提供商
			const config = vscode.workspace.getConfiguration('vschat.llm');
			const providers = config.get<LLMProvider[]>('providers') || [];

			if (providers.length === 0) {
				vscode.window.showErrorMessage('没有配置任何 LLM Provider');
				return;
			}

			// 让用户选择提供商
			const providerItems = providers.map(p => ({
				label: p.name,
				description: p.url,
				provider: p
			}));

			const selectedProvider = await vscode.window.showQuickPick(providerItems, {
				placeHolder: '选择要验证的 Provider'
			});

			if (!selectedProvider) {
				return;
			}

			// 让用户选择模型
			const modelItems = selectedProvider.provider.models.map((m: LLMModel) => ({
				label: m.alias || m.name,
				description: m.id,
				model: m
			}));

			const selectedModel = await vscode.window.showQuickPick(modelItems, {
				placeHolder: '选择要验证的模型'
			});

			if (!selectedModel) {
				return;
			}

			// 获取 API Key
			const apiKey = await vscode.window.showInputBox({
				prompt: '请输入 API Key',
				password: true
			});

			if (!apiKey) {
				return;
			}

			// 显示进度
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: '正在验证 LLM Provider...',
				cancellable: false
			}, async (progress) => {
				try {
					const response = await fetch(selectedProvider.provider.url, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${apiKey}`
						},
						body: JSON.stringify({
							model: selectedModel.model.name,
							messages: [{ role: 'user', content: 'Say this is a test!' }],
							temperature: 0.7
						})
					});

					if (!response.ok) {
						const errorText = await response.text();
						throw new Error(`HTTP error! status: ${response.status}\n${errorText}`);
					}

					const data = await response.json() as LLMVerificationResponse;
					
					// 创建详细的验证报告
					const report = new vscode.MarkdownString();
					report.appendMarkdown('# LLM Provider 验证报告\n\n');
					report.appendMarkdown(`## 基本信息\n`);
					report.appendMarkdown(`- **Provider**: ${selectedProvider.provider.name}\n`);
					report.appendMarkdown(`- **Model**: ${selectedModel.model.name}\n`);
					report.appendMarkdown(`- **URL**: ${selectedProvider.provider.url}\n\n`);
					
					report.appendMarkdown(`## 响应信息\n`);
					report.appendMarkdown(`- **ID**: ${data.id}\n`);
					report.appendMarkdown(`- **Model**: ${data.model}\n`);
					report.appendMarkdown(`- **Created**: ${new Date(data.created * 1000).toLocaleString()}\n\n`);
					
					report.appendMarkdown(`## 使用统计\n`);
					report.appendMarkdown(`- **Prompt Tokens**: ${data.usage.prompt_tokens}\n`);
					report.appendMarkdown(`- **Completion Tokens**: ${data.usage.completion_tokens}\n`);
					report.appendMarkdown(`- **Total Tokens**: ${data.usage.total_tokens}\n\n`);
					
					report.appendMarkdown(`## 响应内容\n`);
					report.appendMarkdown(`\`\`\`\n${data.choices[0].message.content}\n\`\`\`\n`);

					// 创建并显示输出面板
					const outputChannel = vscode.window.createOutputChannel('VSChat Provider 验证');
					outputChannel.clear();
					outputChannel.appendLine(report.value);
					outputChannel.show();

					vscode.window.showInformationMessage('LLM Provider 验证成功！详细报告已在输出面板显示。');
				} catch (error) {
					vscode.window.showErrorMessage(`验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
				}
			});
		})
	);

	// 添加设置 API Key 的命令
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.setProviderApiKey', async () => {
			const providers = llmService.getProviders();
			if (providers.length === 0) {
				vscode.window.showErrorMessage('没有找到配置的 LLM Provider');
				return;
			}

			const selectedProvider = await vscode.window.showQuickPick(
				providers.map(p => ({
					label: p.id,
					description: p.url
				})),
				{
					placeHolder: '选择要设置 API Key 的 Provider'
				}
			);

			if (!selectedProvider) {
				return;
			}

			const apiKey = await vscode.window.showInputBox({
				prompt: `请输入 ${selectedProvider.label} 的 API Key`,
				password: true
			});

			if (!apiKey) {
				return;
			}

			try {
				await llmService.setProviderApiKey(selectedProvider.label, apiKey);
				vscode.window.showInformationMessage(`成功设置 ${selectedProvider.label} 的 API Key`);
			} catch (error) {
				vscode.window.showErrorMessage(`设置 API Key 失败: ${error instanceof Error ? error.message : '未知错误'}`);
			}
		})
	);

	// 添加删除 API Key 的命令
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.deleteProviderApiKey', async () => {
			const providers = llmService.getProviders();
			if (providers.length === 0) {
				vscode.window.showWarningMessage('没有找到配置的 LLM Provider');
				return;
			}

			const providerItems = await Promise.all(providers.map(async p => {
				const keyExists = !!(await llmService.getProviderApiKey(p.id)); // 检查密钥是否存在
				return {
					label: p.id,
					description: `${p.url}${keyExists ? ' (密钥已设置)' : ' (密钥未设置)'}`, // 显示密钥状态
					detail: keyExists ? '选择以删除此 Provider 的 API Key' : '此 Provider 没有设置 API Key'
				};
			}));

			const selectedProvider = await vscode.window.showQuickPick(
				providerItems,
				{
					placeHolder: '选择要删除 API Key 的 Provider'
				}
			);

			if (!selectedProvider) {
				return;
			}

			// 从 label 获取 providerId
			const providerIdToDelete = selectedProvider.label;
			
			// 确认操作
			const confirmation = await vscode.window.showWarningMessage(
				`确定要删除 Provider '${providerIdToDelete}' 的 API Key 吗？此操作不可撤销。`,
				{ modal: true }, // 模态对话框，强制用户交互
				'确认删除'
			);

			if (confirmation !== '确认删除') {
				vscode.window.showInformationMessage('删除操作已取消。');
				return;
			}

			try {
				await llmService.deleteProviderApiKey(providerIdToDelete);
				vscode.window.showInformationMessage(`成功删除 Provider '${providerIdToDelete}' 的 API Key`);
			} catch (error) {
				vscode.window.showErrorMessage(`删除 API Key 失败: ${error instanceof Error ? error.message : '未知错误'}`);
			}
		})
	);

	// 添加到disposables
	context.subscriptions.push(llmStatusBar);
}

function isChatDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'chat' && document.uri.scheme === 'file';
}

// 创建一个最小化的 setup 函数
function minimalSetupDocument(document: vscode.TextDocument) {
	if (stateManager && stateManager.getDocumentUri().toString() === document.uri.toString()) {
		return;
	}
	console.log(`Minimal setup for document: ${document.uri.toString()}`);
	// 清理旧的设置
	cleanupDocument();
	// 初始化 StateManager
	stateManager = new StateManager(document);
	
	// 初始化 EditorEnhancement
	editorEnhancement = new EditorEnhancement(document, stateManager);
	
	// 注册 providers
	if (extensionContext) {
		extensionContext.subscriptions.push(
			vscode.languages.registerFoldingRangeProvider({ language: 'chat' }, editorEnhancement),
			vscode.languages.registerDocumentSymbolProvider({ language: 'chat' }, editorEnhancement),
			vscode.languages.registerCodeActionsProvider({ language: 'chat' }, editorEnhancement)
		);
	}

	// 监听文档变化以更新装饰器
	const changeListener = vscode.workspace.onDidChangeTextDocument(e => {
		if (e.document === document) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document === document && editorEnhancement) {
				editorEnhancement.updateDecorations(editor);
			}
		}
	});

	if (editorEnhancement) {
		editorEnhancement.setChangeListener(changeListener);
	}

	// 立即更新当前编辑器的装饰器
	const editor = vscode.window.activeTextEditor;
	if (editor && editor.document === document && editorEnhancement) {
		editorEnhancement.updateDecorations(editor);
	}
}

function cleanupDocument(document?: vscode.TextDocument) {
	console.log(`Attempting cleanup for: ${document ? document.uri.toString() : 'all'}`);
	// 清理时也可能需要检查 editorEnhancement 是否存在
	if (editorEnhancement) {
		const currentDocUri = editorEnhancement.getDocumentUri();
		if (!document || currentDocUri.toString() === document.uri.toString()) {
			console.log(`Cleaning up editor enhancement for: ${currentDocUri.toString()}`);
			editorEnhancement.dispose();
			editorEnhancement = undefined;
		}
	}
	// 总是尝试清理 stateManager，如果它匹配或没有指定文档
	if (stateManager) {
		 const currentDocUri = stateManager.getDocumentUri();
		 if (!document || currentDocUri.toString() === document.uri.toString()) {
			console.log(`Cleaning up state manager for: ${currentDocUri.toString()}`);
			stateManager = undefined;
		 }
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('Deactivating extension');
	cleanupDocument();
	extensionContext = undefined;
}
