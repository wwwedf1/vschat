import * as vscode from 'vscode';
import { ExtensionConfig, APIConfig, EditorConfig, LLMProvider } from '../types';

export class ConfigManager {
    private static readonly DEFAULT_CONFIG: ExtensionConfig = {
        api: {
            profiles: [],
            activeProfileName: ''
        },
        editor: {},
        llm: {
            providers: [
                {
                  id: "openai",
                  name: "OpenAI",
                  url: "https://api.openai.com/v1/chat/completions",
                  models: [
                    { id: "gpt-3.5-turbo", name: "gpt-3.5-turbo", providerId: "openai", alias: "GPT-3.5" },
                    { id: "gpt-4", name: "gpt-4", providerId: "openai", alias: "GPT-4" }
                  ]
                },
                {
                  id: "deepseek",
                  name: "DeepSeek",
                  url: "https://api.deepseek.com/v1/chat/completions",
                  models: [
                    { id: "deepseek-chat", name: "deepseek-chat", providerId: "deepseek", alias: "DeepSeek Chat" }
                  ]
                }
              ]
        }
    };

    public static getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration('vschat');
        return {
            api: {
                profiles: config.get<APIConfig[]>('api.profiles', this.DEFAULT_CONFIG.api.profiles),
                activeProfileName: config.get<string>('api.activeProfileName', this.DEFAULT_CONFIG.api.activeProfileName)
            },
            editor: {},
            llm: {
                 providers: config.get<LLMProvider[]>('llm.providers', this.DEFAULT_CONFIG.llm.providers)
            }
        };
    }

    public static async setConfig(config: Partial<ExtensionConfig>): Promise<void> {
        const currentConfig = vscode.workspace.getConfiguration('vschat');
        if (config.api) {
            if (config.api.profiles !== undefined) {
                 await currentConfig.update('api.profiles', config.api.profiles, vscode.ConfigurationTarget.Global);
            }
             if (config.api.activeProfileName !== undefined) {
                await currentConfig.update('api.activeProfileName', config.api.activeProfileName, vscode.ConfigurationTarget.Global);
            }
        }
        if (config.llm && config.llm.providers !== undefined) {
            await currentConfig.update('llm.providers', config.llm.providers, vscode.ConfigurationTarget.Global);
        }
    }

    public static getActiveAPIConfig(): APIConfig | undefined {
        const config = this.getConfig();
        return config.api.profiles.find(profile => profile.profileName === config.api.activeProfileName);
    }

    public static async setActiveAPIProfile(profileName: string): Promise<void> {
        const config = this.getConfig();
        if (!config.api.profiles.some(profile => profile.profileName === profileName)) {
            throw new Error(`API profile "${profileName}" not found`);
        }
        await vscode.workspace.getConfiguration('vschat').update('api.activeProfileName', profileName, true);
    }

    public static async addAPIProfile(profile: APIConfig): Promise<void> {
        const config = this.getConfig();
        const profiles = [...config.api.profiles, profile];
        await vscode.workspace.getConfiguration('vschat').update('api.profiles', profiles, true);
    }

    public static async removeAPIProfile(profileName: string): Promise<void> {
        const config = this.getConfig();
        const profiles = config.api.profiles.filter(profile => profile.profileName !== profileName);
        await vscode.workspace.getConfiguration('vschat').update('api.profiles', profiles, true);
    }

    public static getDefaultProviders(): LLMProvider[] {
        return this.DEFAULT_CONFIG.llm.providers;
    }
}