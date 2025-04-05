import * as vscode from 'vscode';
import { ExtensionConfig, APIConfig, EditorConfig } from '../types';

export class ConfigManager {
    private static readonly DEFAULT_CONFIG: ExtensionConfig = {
        api: {
            profiles: [],
            activeProfileName: ''
        },
        editor: {
            folding: {
                enabled: true,
                includeMarkdownHeadings: true
            },
            highlightActiveState: {
                enabled: true
            },
            hideTags: {
                enabled: false
            }
        }
    };

    public static getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration('aiChat');
        return {
            api: {
                profiles: config.get<APIConfig[]>('api.profiles', this.DEFAULT_CONFIG.api.profiles),
                activeProfileName: config.get<string>('api.activeProfileName', this.DEFAULT_CONFIG.api.activeProfileName)
            },
            editor: {
                folding: {
                    enabled: config.get<boolean>('editor.folding.enabled', this.DEFAULT_CONFIG.editor.folding.enabled),
                    includeMarkdownHeadings: config.get<boolean>('editor.folding.includeMarkdownHeadings', this.DEFAULT_CONFIG.editor.folding.includeMarkdownHeadings)
                },
                highlightActiveState: {
                    enabled: config.get<boolean>('editor.highlightActiveState.enabled', this.DEFAULT_CONFIG.editor.highlightActiveState.enabled)
                },
                hideTags: {
                    enabled: config.get<boolean>('editor.hideTags.enabled', this.DEFAULT_CONFIG.editor.hideTags.enabled)
                }
            }
        };
    }

    public static async setConfig(config: Partial<ExtensionConfig>): Promise<void> {
        const currentConfig = vscode.workspace.getConfiguration('aiChat');
        if (config.api) {
            if (config.api.profiles !== undefined) {
                 await currentConfig.update('api.profiles', config.api.profiles, vscode.ConfigurationTarget.Global);
            }
             if (config.api.activeProfileName !== undefined) {
                await currentConfig.update('api.activeProfileName', config.api.activeProfileName, vscode.ConfigurationTarget.Global);
            }
        }
        if (config.editor) {
            if (config.editor.folding) {
                if (config.editor.folding.enabled !== undefined) {
                    await currentConfig.update('editor.folding.enabled', config.editor.folding.enabled, vscode.ConfigurationTarget.Global);
                }
                if (config.editor.folding.includeMarkdownHeadings !== undefined) {
                     await currentConfig.update('editor.folding.includeMarkdownHeadings', config.editor.folding.includeMarkdownHeadings, vscode.ConfigurationTarget.Global);
                }
            }
             if (config.editor.highlightActiveState) {
                if (config.editor.highlightActiveState.enabled !== undefined) {
                    await currentConfig.update('editor.highlightActiveState.enabled', config.editor.highlightActiveState.enabled, vscode.ConfigurationTarget.Global);
                }
            }
            if (config.editor.hideTags) {
                if (config.editor.hideTags.enabled !== undefined) {
                    await currentConfig.update('editor.hideTags.enabled', config.editor.hideTags.enabled, vscode.ConfigurationTarget.Global);
                }
            }
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
        await vscode.workspace.getConfiguration('aiChat').update('api.activeProfileName', profileName, true);
    }

    public static async addAPIProfile(profile: APIConfig): Promise<void> {
        const config = this.getConfig();
        const profiles = [...config.api.profiles, profile];
        await vscode.workspace.getConfiguration('aiChat').update('api.profiles', profiles, true);
    }

    public static async removeAPIProfile(profileName: string): Promise<void> {
        const config = this.getConfig();
        const profiles = config.api.profiles.filter(profile => profile.profileName !== profileName);
        await vscode.workspace.getConfiguration('aiChat').update('api.profiles', profiles, true);
    }
} 