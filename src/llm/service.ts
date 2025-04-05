import * as vscode from 'vscode';
import { LLMProvider, LLMModel, LLMRequest, LLMResponse, OpenAIResponse } from '../types';

export class LLMService {
    private providers: Map<string, LLMProvider> = new Map();
    private models: Map<string, LLMModel> = new Map();
    private modelAliases: Map<string, string> = new Map();
    private currentModelId: string | undefined;
    private configurationChangeListener: vscode.Disposable;

    constructor(private context: vscode.ExtensionContext) {
        this.loadConfiguration().catch(err => {
            console.error('Failed to load configuration:', err);
        });
        // 监听配置变化
        this.configurationChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('vschat.llm')) {
                this.loadConfiguration().catch(err => {
                    console.error('Failed to load configuration:', err);
                });
            }
        });
        context.subscriptions.push(this.configurationChangeListener);
    }

    private async loadConfiguration() {
        const config = vscode.workspace.getConfiguration('vschat.llm');
        const providers = config.get<LLMProvider[]>('providers') || [];
        
        // 清空旧数据
        this.providers.clear();
        this.models.clear();
        this.modelAliases.clear();
        console.log("[LLMService] Cleared existing configuration. Loading new configuration.");

        for (const provider of providers) {
            // 从 Secret Storage 获取 API Key
            const apiKeyKey = `vschat.llm.provider.${provider.id}.apiKey`;
            const apiKey = await this.context.secrets.get(apiKeyKey);
            
            // 存储 Provider 信息
            const storedProvider: LLMProvider = {
                ...provider,
                apiKey: apiKey || provider.apiKey || '' // 仍然保留从配置读取 apiKey 作为后备
            };
            this.providers.set(provider.id, storedProvider);
            console.log(`[LLMService] Loaded provider: ${provider.id}`);
            
            // 迭代并存储模型信息，强制使用父级 providerId
            for (const modelConfig of provider.models) {
                const storedModel: LLMModel = {
                    ...modelConfig,
                    providerId: provider.id // 强制使用父级 Provider 的 ID
                };
                this.models.set(storedModel.id, storedModel);
                console.log(`[LLMService] Loaded model: ${storedModel.id} for provider: ${provider.id}`);
                if (storedModel.alias) {
                    this.modelAliases.set(storedModel.alias, storedModel.id);
                    console.log(`[LLMService] Mapped alias '${storedModel.alias}' to model: ${storedModel.id}`);
                }
            }
        }
        console.log("[LLMService] Configuration loading complete.");
        // 可选：在这里触发一个事件或更新状态，通知其他部分配置已更新
    }

    public async setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new Error(`Provider ${providerId} not found`);
        }

        // 保存到 Secret Storage
        const apiKeyKey = `vschat.llm.provider.${providerId}.apiKey`;
        await this.context.secrets.store(apiKeyKey, apiKey);
        
        // 更新内存中的值
        this.providers.set(providerId, {
            ...provider,
            apiKey
        });
    }

    public async getProviderApiKey(providerId: string): Promise<string | undefined> {
        const provider = this.providers.get(providerId);
        if (!provider) {
            return undefined;
        }
        const apiKeyKey = `vschat.llm.provider.${providerId}.apiKey`;
        // 优先从 Secret Storage 获取
        const secretKey = await this.context.secrets.get(apiKeyKey);
        if (secretKey) {
            return secretKey;
        }
        // 后备使用内存中的（可能来自配置文件，但不推荐）
        return provider.apiKey; 
    }

    public async deleteProviderApiKey(providerId: string): Promise<void> {
        const provider = this.providers.get(providerId);
        if (!provider) {
            // Provider 本身不存在，无需删除
            console.warn(`[LLMService] Attempted to delete API key for non-existent provider: ${providerId}`);
            return;
        }

        const apiKeyKey = `vschat.llm.provider.${providerId}.apiKey`;
        try {
            await this.context.secrets.delete(apiKeyKey);
            console.log(`[LLMService] Successfully deleted API key from Secret Storage for provider: ${providerId}`);
            // 更新内存中的状态，将 apiKey 置为空字符串，避免使用可能残留的后备值
            this.providers.set(providerId, {
                ...provider,
                apiKey: '' 
            });
        } catch (error) {
            console.error(`[LLMService] Failed to delete API key for provider ${providerId}:`, error);
            throw new Error(`Failed to delete API key for provider ${providerId}`);
        }
    }

    public async sendRequest(request: LLMRequest): Promise<LLMResponse> {
        const model = this.models.get(request.modelId);
        if (!model) {
            throw new Error(`Model ${request.modelId} not found`);
        }

        const provider = this.providers.get(model.providerId);
        if (!provider) {
            throw new Error(`Provider ${model.providerId} not found`);
        }

        // 获取 API Key
        const apiKey = await this.getProviderApiKey(model.providerId);
        if (!apiKey) {
            throw new Error(`API Key not found for provider ${model.providerId}`);
        }

        try {
            const response = await fetch(provider.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model.name,
                    messages: request.messages,
                    ...request.parameters
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}\n${errorText}`);
            }

            const data = await response.json() as OpenAIResponse;
            return {
                content: data.choices?.[0]?.message?.content || '',
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens
                } : undefined
            };
        } catch (error) {
            return {
                content: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    public getCurrentModel(): LLMModel | undefined {
        return this.currentModelId ? this.models.get(this.currentModelId) : undefined;
    }

    public setCurrentModel(modelId: string) {
        if (!this.models.has(modelId)) {
            throw new Error(`Model ${modelId} not found`);
        }
        this.currentModelId = modelId;
    }

    public getAvailableModels(): LLMModel[] {
        return Array.from(this.models.values());
    }

    public getProviders(): LLMProvider[] {
        return Array.from(this.providers.values());
    }

    public dispose() {
        this.configurationChangeListener.dispose();
    }
} 