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
import { LLMRequest, LLMProvider, LLMModel, LLMVerificationResponse, BlockState, ChatBlock, BlockType } from './types';
import { TextProcessor } from './parser/textProcessor';
import { TextProcessingConfig } from './config/textProcessingConfig';

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
				// **重要**: 重新解析文档获取最新的块状态
				const blocks = ChatParser.parseDocument(editor.document);
				const currentBlock = blocks.find(block => block.range.contains(position));

				if (currentBlock) {
					// **重要**: 使用从文档解析出的当前状态
					const currentState: BlockState = currentBlock.state;
					const newState: BlockState = currentState === 'A' ? 'I' : 'A';
					
					// 更新内存状态（虽然 updateDocument 会覆盖，但保持一致性）
					stateManager.setBlockState(currentBlock.id, newState);

					// 使用新状态直接构建编辑操作
					const newBlock: ChatBlock = { ...currentBlock, state: newState };
					const edit = new vscode.WorkspaceEdit();
					edit.replace(editor.document.uri, currentBlock.range, ChatParser.serializeBlock(newBlock));
					
					const success = await vscode.workspace.applyEdit(edit);
					if (success) {
						// 成功后，确保 StateManager 与文件同步
						stateManager.reloadStateFromDocument();
						// 更新装饰器
						if (editorEnhancement) {
							editorEnhancement.updateDecorations(editor);
						}
					} else {
						vscode.window.showErrorMessage('切换状态失败。');
					}
				} else {
					 vscode.window.showInformationMessage('光标不在任何聊天块内。');
				}
			} else {
				 vscode.window.showWarningMessage('请先打开一个 .chat 文件。');
			}
		})
	);

	// 监听文档保存事件
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(document => {
			if (isChatDocument(document) && stateManager && stateManager.getDocumentUri().toString() === document.uri.toString()) {
				console.log(`Document saved, reloading state for: ${document.uri.toString()}`);
				stateManager.reloadStateFromDocument();
				// 如果编辑器处于活动状态，更新装饰器
				const editor = vscode.window.activeTextEditor;
				if (editor && editor.document === document && editorEnhancement) {
					editorEnhancement.updateDecorations(editor);
				}
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
				const editor = vscode.window.activeTextEditor;
				if (stateManager.popState()) {
					console.log('State popped. Updating decorations.');
					// 只更新内存状态，并触发装饰器更新，不直接修改文件
					if (editor && editor.document.uri.toString() === stateManager.getDocumentUri().toString() && editorEnhancement) {
						editorEnhancement.updateDecorations(editor);
					}
					vscode.window.showInformationMessage('已撤销上一步状态更改。');
				} else {
					vscode.window.showWarningMessage('没有可撤销的状态。');
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.renameBlock', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !isChatDocument(editor.document)) {
				vscode.window.showWarningMessage('请先打开一个 .chat 文件。');
				return;
			}

			const blocks = ChatParser.parseDocument(editor.document);
			const block = blocks.find(b => b.range.contains(editor.selection.active));
			if (!block) {
				vscode.window.showWarningMessage('光标不在任何聊天块内。');
				return;
			}

			const name = await vscode.window.showInputBox({
				prompt: '输入块标题（用于在大纲视图中显示）',
				placeHolder: '标题',
				value: block.name
			});

			if (name === undefined) {
				return; // 用户取消了操作
			}

			const newBlock = { ...block, name: name || undefined };
			const workspaceEdit = new vscode.WorkspaceEdit();
			workspaceEdit.replace(editor.document.uri, block.range, ChatParser.serializeBlock(newBlock));
			await vscode.workspace.applyEdit(workspaceEdit);
			
			// 显示通知
			if (name) {
				vscode.window.showInformationMessage(`已设置块标题: "${name}"`);
			} else {
				vscode.window.showInformationMessage('已移除块标题');
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
				vscode.window.showWarningMessage('请至少激活一个聊天块。');
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
					cancellable: true
				}, async (progress, token) => {
					const response = await llmService.sendRequest(request);
					console.log('Received response from LLMService:', response);

					if (token.isCancellationRequested) {
						return;
					}

					if (response.error) {
						vscode.window.showErrorMessage(`请求失败: ${response.error}`);
					} else {
						// 4. 处理响应内容，提取思维链
						const { mainContent, thinkingContent } = ChatParser.extractThinkingContent(
							response.rawResponse,
							response.provider
						);
						console.log('Extracted content - Main:', mainContent, 'Thinking:', thinkingContent);
						
						let insertText = '';
						const lastLine = document.lineAt(document.lineCount - 1);
						const separator = (document.lineCount > 0 && lastLine.text.trim() !== '') ? '\n\n' : '';

						// 如果存在思维链内容，创建思维链块
						if (thinkingContent) {
							console.log('Creating thinking block with content:', thinkingContent);
							const thinkingBlockText = ContextBuilder.createThinkingBlock(thinkingContent);
							// 创建主要响应块
							const assistantBlockText = ContextBuilder.createNewBlock(
								'A', 
								mainContent,
								undefined,
								currentModel.alias || currentModel.name
							);
							// 创建新的用户块
							const newUserBlockText = ContextBuilder.createNewBlock('U', '');
							// 组合文本
							insertText = separator + thinkingBlockText + '\n\n' + assistantBlockText + '\n\n' + newUserBlockText;
						} else {
							console.log('No thinking content, skipping thinking block');
							// 创建主要响应块
							const assistantBlockText = ContextBuilder.createNewBlock(
								'A', 
								mainContent,
								undefined,
								currentModel.alias || currentModel.name
							);
							 // 创建新的用户块
							const newUserBlockText = ContextBuilder.createNewBlock('U', '');
							// 组合文本
							insertText = separator + assistantBlockText + '\n\n' + newUserBlockText;
						}

						// 应用编辑
						const edit = new vscode.WorkspaceEdit();
						const endPosition = new vscode.Position(document.lineCount, 0);
						edit.insert(document.uri, endPosition, insertText);
						const success = await vscode.workspace.applyEdit(edit);

						if (success) {
							// 强制 StateManager 从更新后的文档重新加载状态
							stateManager?.reloadStateFromDocument();
							// 触发装饰器更新
							if (editorEnhancement) {
								editorEnhancement.updateDecorations(editor);
							}
							// 移动光标到新的用户块
							const blocks = ChatParser.parseDocument(editor.document);
							const userBlocks = blocks.filter(b => b.type === 'U');
							const lastUserBlock = userBlocks[userBlocks.length - 1];
							
							if (lastUserBlock) {
								const position = editor.document.positionAt(
									editor.document.offsetAt(lastUserBlock.range.start) + 
									lastUserBlock.range.end.character - lastUserBlock.range.start.character - 5 // 调整位置到内容开始处
								);
								editor.selection = new vscode.Selection(position, position);
								editor.revealRange(lastUserBlock.range);
							}
						} else {
							vscode.window.showErrorMessage('应用编辑失败。');
						}
					}
				});
			} catch (error) {
				vscode.window.showErrorMessage(`发送请求失败: ${error instanceof Error ? error.message : String(error)}`);
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

	// 添加复制块内容的命令
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.copyBlockContent', async (content: string) => {
			if (!content) {
				const editor = vscode.window.activeTextEditor;
				if (!editor || !isChatDocument(editor.document)) {
					vscode.window.showWarningMessage('请先打开一个 .chat 文件。');
					return;
				}

				const blocks = ChatParser.parseDocument(editor.document);
				const position = editor.selection.active;
				const currentBlock = blocks.find(block => block.range.contains(position));

				if (!currentBlock) {
					vscode.window.showWarningMessage('光标不在任何聊天块内。');
					return;
				}
				
				content = currentBlock.content;
			}
			
			// 复制内容到剪贴板
			await vscode.env.clipboard.writeText(content);
			vscode.window.showInformationMessage('已复制块内容到剪贴板');
		})
	);

	// Helper function to calculate the cursor position
	function calculateCursorPosition(document: vscode.TextDocument, start: vscode.Position, blockType: string, blockName?: string): vscode.Position {
		const baseOffset = `<${blockType} A id="`.length + 36; // Base length including type and UUID
		const nameOffset = blockName ? ` name="${blockName}">`.length : `>`.length; // Additional length for name if present
		const totalOffset = baseOffset + nameOffset;
		return document.positionAt(document.offsetAt(start) + totalOffset);
	}
	
	// Register the new insertBlock command
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.insertBlock', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !isChatDocument(editor.document)) {
				vscode.window.showWarningMessage('请先打开一个 .chat 文件。');
				return;
			}

			// Define block types and descriptions
			const blockTypes: { label: string; description: string; type: BlockType }[] = [
				{ label: 'U', description: '用户块 (User)', type: 'U' },
				{ label: 'A', description: '助手块 (Assistant)', type: 'A' },
				{ label: 'S', description: '系统块 (System)', type: 'S' },
				{ label: 'N', description: '注释块 (Note)', type: 'N' },
			];

			const selectedType = await vscode.window.showQuickPick(blockTypes, {
				placeHolder: '选择要插入的块类型'
			});

			if (!selectedType) {
				return; // User cancelled
			}

			let blockName: string | undefined = undefined;
			if (selectedType.type === 'N') {
				blockName = await vscode.window.showInputBox({
					prompt: '输入注释块标题（可选，用于大纲视图）',
					placeHolder: '注释'
				});
				// If user cancels the input box, blockName will be undefined, which is fine
			}

			const newBlockContent = ContextBuilder.createNewBlock(selectedType.type, '', blockName || undefined);

			await editor.edit(editBuilder => {
				// Insert at the current cursor position or the end of the selection
				editBuilder.insert(editor.selection.end, newBlockContent);
			});
			
			// Optional: Move cursor inside the newly created block
			const newBlockRange = new vscode.Range(editor.selection.end, editor.selection.end.translate(0, newBlockContent.length));
			const position = calculateCursorPosition(editor.document, newBlockRange.start, selectedType.type, blockName);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(newBlockRange);

		})
	);

	// Command to insert default LLM provider template
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.insertDefaultProviderTemplate', async () => {
			// 提供用户选择模板类型
			const templateTypes = [
				{ label: 'AI供应商配置模板', description: '包含OpenAI和DeepSeek的默认配置' },
				{ label: '文本处理规则配置模板', description: '包含几个常用文本处理规则示例' }
			];
			
			const selectedType = await vscode.window.showQuickPick(templateTypes, {
				placeHolder: '选择要插入的模板类型'
			});
			
			if (!selectedType) {
				return; // 用户取消选择
			}
			
			let templateJson = '';
			
			if (selectedType.label === 'AI供应商配置模板') {
				const defaultProviders = ConfigManager.getDefaultProviders();
				templateJson = JSON.stringify(defaultProviders, null, 2); // 格式化JSON
			} else {
				// 文本处理规则模板
				const regexTemplates = TextProcessingConfig.getTemplateRules();
				templateJson = JSON.stringify(regexTemplates, null, 2);
			}

			const editor = vscode.window.activeTextEditor;
			if (editor) {
				// 在光标位置插入
				await editor.edit(editBuilder => {
					editBuilder.insert(editor.selection.active, templateJson);
				});
				vscode.window.showInformationMessage(`已在当前光标位置插入${selectedType.label}。`);
			} else {
				// 如果没有活动编辑器，显示在输出面板
				console.log(`${selectedType.label}:\n`, templateJson);
				vscode.window.showInformationMessage(`请打开配置文件并粘贴以下内容。已输出到控制台。`);
				// 可选，在输出通道显示JSON
				const outputChannel = vscode.window.createOutputChannel("VSChat 配置模板");
				outputChannel.appendLine(templateJson);
				outputChannel.show();
			}
		})
	);

	// 添加提取选中内容到新块的命令
	context.subscriptions.push(
		vscode.commands.registerCommand('vschat.extractSelectionToBlock', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !isChatDocument(editor.document)) {
				vscode.window.showWarningMessage('请先打开一个 .chat 文件。');
				return;
			}

			// 获取当前选择的文本
			const selection = editor.selection;
			if (selection.isEmpty) {
				vscode.window.showWarningMessage('请先选择要提取的文本。');
				return;
			}

			const selectedText = editor.document.getText(selection);
			if (!selectedText || selectedText.trim() === '') {
				vscode.window.showWarningMessage('选中的文本为空，无法提取。');
				return;
			}

			// 默认使用注释块，但允许用户选择块类型
			const blockTypes: { label: string; description: string; type: BlockType }[] = [
				{ label: 'N', description: '注释块 (Note)', type: 'N' },
				{ label: 'U', description: '用户块 (User)', type: 'U' },
				{ label: 'A', description: '助手块 (Assistant)', type: 'A' },
				{ label: 'S', description: '系统块 (System)', type: 'S' }
			];

			const selectedType = await vscode.window.showQuickPick(blockTypes, {
				placeHolder: '选择要创建的块类型',
				ignoreFocusOut: true
			});

			if (!selectedType) {
				return; // 用户取消了操作
			}

			// 如果是注释块，可以允许用户设置标题
			let blockName: string | undefined = undefined;
			if (selectedType.type === 'N') {
				// 获取默认注释块名称
				const config = vscode.workspace.getConfiguration('vschat');
				const defaultName = config.get<string>('textProcessing.defaultNoteBlockName', '注释');
				
				blockName = await vscode.window.showInputBox({
					prompt: '输入注释块标题（可选，用于大纲视图）',
					placeHolder: defaultName,
					value: defaultName,
					ignoreFocusOut: true
				});
				// 如果用户取消输入，使用默认值
				blockName = blockName || defaultName;
			}

			// 创建提取规则
			const extractRule = {
				id: 'extract-selection',
				name: '提取选中内容',
				description: '将选中内容提取到新块',
				pattern: {
					customMatcher: (text: string) => ({
						matched: true,
						content: text,
						start: 0,
						end: text.length
					})
				},
				processorType: 'extract' as const,
				processor: {
					extractToBlock: {
						blockType: selectedType.type as 'U' | 'A' | 'S' | 'N',
						blockName: blockName,
						removeFromSource: true
					}
				}
			};

			// 处理文本
			const result = TextProcessor.processText(selectedText, extractRule);
			
			if (!result.success || !result.extractedBlock) {
				vscode.window.showErrorMessage('提取内容失败。');
				return;
			}

			// 创建新块的内容
			const newBlockContent = ContextBuilder.createNewBlock(
				result.extractedBlock.type,
				result.extractedBlock.content,
				result.extractedBlock.name
			);

			// 执行编辑操作
			const edit = new vscode.WorkspaceEdit();
			
			// 替换选中文本（删除原内容）
			edit.delete(editor.document.uri, selection);
			
			// 在选择位置插入新块
			edit.insert(editor.document.uri, selection.start, newBlockContent);
			
			// 应用编辑
			const success = await vscode.workspace.applyEdit(edit);
			
			if (success) {
				// 移动光标到新块的末尾
				const newPosition = selection.start.translate(0, newBlockContent.length);
				editor.selection = new vscode.Selection(newPosition, newPosition);
				editor.revealRange(new vscode.Range(selection.start, newPosition));
				
				vscode.window.showInformationMessage(`已将选中内容提取到${selectedType.description}中。`);
			} else {
				vscode.window.showErrorMessage('提取内容到新块失败。');
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
