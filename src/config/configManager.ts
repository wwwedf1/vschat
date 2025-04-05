import * as vscode from 'vscode';
import { ExtensionConfig, APIConfig, EditorConfig } from '../types';

export class ConfigManager {
    private static readonly DEFAULT_CONFIG: ExtensionConfig = {
        api: {
            profiles: [],
            activeProfileName: ''
        },
        editor: {}
    };

    public static getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration('vschat');
        return {
            api: {
                profiles: config.get<APIConfig[]>('api.profiles', this.DEFAULT_CONFIG.api.profiles),
                activeProfileName: config.get<string>('api.activeProfileName', this.DEFAULT_CONFIG.api.activeProfileName)
            },
            editor: {}
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
} 