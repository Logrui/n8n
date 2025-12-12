import { ReadableStream } from 'node:stream/web';
import type {
	AiApplySuggestionRequestDto,
	AiAskRequestDto,
	AiChatRequestDto,
} from '@n8n/api-types';
import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import { AiAssistantClient } from '@n8n_io/ai-assistant-sdk';
import { Logger } from '@n8n/backend-common';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { assert, type IUser } from 'n8n-workflow';

import { N8N_VERSION } from '../constants';
import { License } from '../license';

@Service()
export class AiService {
	private client: AiAssistantClient | undefined;

	// WHITELABEL: In-memory session store for local development
	private sessions = new Map<string, BaseMessage[]>();

	constructor(
		private readonly licenseService: License,
		private readonly globalConfig: GlobalConfig,
		private readonly logger: Logger,
	) {}

	async init() {
		const aiAssistantEnabled = this.licenseService.isAiAssistantEnabled();

		if (!aiAssistantEnabled) {
			return;
		}

		const licenseCert = await this.licenseService.loadCertStr();
		const consumerId = this.licenseService.getConsumerId();
		const baseUrl = this.globalConfig.aiAssistant.baseUrl;
		const logLevel = this.globalConfig.logging.level;

		if (!baseUrl) {
			this.logger.warn('[AiService] Skipping AI Assistant Client init: No base URL configured');
			return;
		}

		this.client = new AiAssistantClient({
			licenseCert,
			consumerId,
			n8nVersion: N8N_VERSION,
			baseUrl,
			logLevel,
		});

		this.licenseService.onCertRefresh((cert) => {
			this.client?.updateLicenseCert(cert);
		});
	}

	async chat(payload: AiChatRequestDto, user: IUser) {
		const apiKey = this.globalConfig.aiBuilder.apiKey;
		const baseUrl = this.globalConfig.aiAssistant.baseUrl;

		// WHITELABEL: Local Anthropic fallback for Chat (Sidebar)
		if (apiKey && !baseUrl) {
			this.logger.debug('[AiService] Using local Anthropic API for Chat');
			return await this.chatLocal(payload);
		}

		if (!baseUrl) {
			throw new Error('AI Assistant is not configured (N8N_AI_ASSISTANT_BASE_URL is missing)');
		}

		if (!this.client) {
			await this.init();
		}
		assert(this.client, 'Assistant client not setup');

		return await this.client.chat(payload, { id: user.id });
	}

	private async chatLocal(payload: AiChatRequestDto): Promise<{ body: ReadableStream }> {
		const apiKey = this.globalConfig.aiBuilder.apiKey;
		if (!apiKey) throw new Error('N8N_AI_ANTHROPIC_KEY not set');

		const reqData = payload.payload as any;
		const sessionId = payload.sessionId || 'default-session';

		this.logger.debug('[AiService] chatLocal', {
			sessionId,
			type: reqData.type,
		});

		// Initialize session if needed or requested
		if (!this.sessions.has(sessionId) || reqData.type.startsWith('init-')) {
			this.sessions.set(sessionId, [
				new SystemMessage(`You are the n8n AI Assistant.
You help users create and troubleshoot workflows.
Be concise and helpful.
Answer directly about n8n concepts.`),
			]);
		}

		const history = this.sessions.get(sessionId)!;

		// Extract user input based on message type
		let userContent = '';
		if (reqData.type === 'message') {
			userContent = reqData.text;
		} else if (reqData.type === 'init-support-chat' || reqData.type === 'init-cred-help') {
			userContent = reqData.question;
			// Add context to history if available (simplified)
			if (reqData.context) {
				history.push(new SystemMessage(`Context: ${JSON.stringify(reqData.context)}`));
			}
		} else if (reqData.type === 'init-error-helper') {
			userContent = `I have an error in node "${reqData.node?.name}". Error: ${JSON.stringify(reqData.error)}`;
		}

		if (userContent) {
			history.push(new HumanMessage(userContent));
		} else {
			// If no content (e.g. just an event), returning empty stream might be safer?
			// But usually there is content.
			this.logger.warn('[AiService] No user content found in payload', { reqData });
		}

		const model = new ChatAnthropic({
			anthropicApiKey: apiKey,
			modelName: 'claude-sonnet-4-20250514',
			streaming: true,
		});

		// Stream response
		const stream = await model.stream(history);

		let fullResponse = '';

		const readable = new ReadableStream({
			async start(controller) {
				try {
					for await (const chunk of stream) {
						if (chunk.content) {
							const text = chunk.content.toString();
							fullResponse += text;

							const chunkData = {
								token: text,
							};
							controller.enqueue(JSON.stringify(chunkData) + '\n');
						}
					}

					// Append full AI response to history
					if (fullResponse) {
						history.push(new AIMessage(fullResponse));
					}

					controller.close();
				} catch (e) {
					controller.error(e);
				}
			},
		});

		return { body: readable };
	}

	async applySuggestion(payload: AiApplySuggestionRequestDto, user: IUser) {
		if (!this.client) {
			await this.init();
		}
		assert(this.client, 'Assistant client not setup');

		return await this.client.applySuggestion(payload, { id: user.id });
	}

	async askAi(payload: AiAskRequestDto, user: IUser) {
		const apiKey = this.globalConfig.aiBuilder.apiKey;
		const baseUrl = this.globalConfig.aiAssistant.baseUrl;

		if (apiKey && !baseUrl) {
			this.logger.debug('[AiService] Using local Anthropic API for Ask AI');
			return await this.askAiLocal(payload);
		}

		if (!this.client) {
			await this.init();
		}
		assert(this.client, 'Assistant client not setup');

		return await this.client.askAi(payload, { id: user.id });
	}

	private async askAiLocal(payload: AiAskRequestDto): Promise<{ code: string }> {
		const apiKey = this.globalConfig.aiBuilder.apiKey;
		if (!apiKey) throw new Error('N8N_AI_ANTHROPIC_KEY is not configured');

		const model = new ChatAnthropic({
			anthropicApiKey: apiKey,
			modelName: 'claude-sonnet-4-20250514',
			maxTokens: 2048,
		});

		const systemPrompt = `You are a helpful coding assistant that generates JavaScript/TypeScript code for n8n nodes.
Rules: Only respond with the code, no explanations. Use modern JS/TS. Access data via $input.`;

		const userMessage = this.buildAskAiPrompt(payload);

		try {
			const response = await model.invoke([
				new SystemMessage(systemPrompt),
				new HumanMessage(userMessage),
			]);

			const text = typeof response.content === 'string' ? response.content : '';
			return { code: this.extractCode(text) };
		} catch (error) {
			this.logger.error('[AiService] Local Anthropic request failed', { error });
			throw error;
		}
	}

	private buildAskAiPrompt(payload: AiAskRequestDto): string {
		const { question, context, forNode } = payload;
		let prompt = `Question: ${question}\n\nTarget Node: ${forNode}\n\n`;

		if (context.inputSchema) {
			prompt += `Input Data Schema: ${JSON.stringify(context.inputSchema.schema, null, 2)}\n\n`;
		}

		prompt += `Generate the code to accomplish the question. Return only the code.`;
		return prompt;
	}

	private extractCode(text: string): string {
		const codeBlockMatch = text.match(/```(?:javascript|typescript|js|ts)?\n?([\s\S]*?)```/);
		return codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();
	}

	async createFreeAiCredits(user: IUser) {
		if (!this.client) {
			await this.init();
		}
		assert(this.client, 'Assistant client not setup');
		return await this.client.generateAiCreditsCredentials(user);
	}
}
