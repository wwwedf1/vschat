import * as vscode from 'vscode';

export type BlockType = 'S' | 'U' | 'A' | 'N' | 'Tool';
export type BlockState = 'A' | 'I';

export interface ChatBlock {
    type: BlockType;
    state: BlockState;
    id: string;
    name?: string;
    content: string;
    range: vscode.Range;
    toolCallId?: string;
    toolName?: string;
    modelAlias?: string;
}

export interface APIConfig {
    profileName: string;
    endpoint: string;
    model: string;
    apiKeySecret: string;
}

export interface EditorConfig {
    // Remove hideTags configuration
    /*
    hideTags: {
        enabled: boolean;
    };
    */
}

export interface ExtensionConfig {
    api: {
        profiles: APIConfig[];
        activeProfileName: string;
    };
    editor: EditorConfig;
}

export interface LLMProvider {
    id: string;
    name: string;
    url: string;
    apiKey: string;
    models: LLMModel[];
}

export interface LLMModel {
    id: string;
    name: string;
    providerId: string;
    alias?: string;
    parameters?: Record<string, any>;
}

export interface LLMResponse {
    content: string;
    error?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface LLMRequest {
    modelId: string;
    messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }>;
    parameters?: Record<string, any>;
}

export interface OpenAIResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface LLMVerificationResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    choices: Array<{
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
        index: number;
    }>;
} 