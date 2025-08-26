import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
	IHttpRequestOptions,
	JsonObject,
	IHttpRequestMethods,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionType } from 'n8n-workflow';

const BASE_URL = 'https://keep.googleapis.com/v1';

// helper for auth’d requests
async function keepRequest(
	this: ITriggerFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
) {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${endpoint}`,
		json: true,
		body: Object.keys(body).length ? body : undefined,
		qs: Object.keys(qs).length ? qs : undefined,
	};

	try {
                return await this.helpers.httpRequestWithAuthentication.call(
                        this,
                        'googleApi',
                        options,
                );
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export class GoogleKeepTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Google Keep Trigger',
		name: 'googleKeepTrigger',
		icon: 'file:googleKeep.svg',
		group: ['trigger'],
		version: 1,
		description: 'Triggers when a new Keep note is created (polling)',
		defaults: { name: 'Google Keep Trigger' },
                credentials: [{ name: 'googleApi', required: true }],
		inputs: [],
		outputs: [NodeConnectionType.Main],
		polling: true,
		properties: [
			{
				displayName: 'Poll Interval (seconds)',
				name: 'intervalSeconds',
				type: 'number',
				typeOptions: { minValue: 10, maxValue: 86400 },
				default: 60,
			},
			{
				displayName: 'Include Existing on First Run',
				name: 'includeExisting',
				type: 'boolean',
				default: false,
				description: 'If enabled, the first poll will emit all current notes (respecting filters)',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				default: {},
				options: [
					{ displayName: 'Only Untrashed', name: 'onlyUntrashed', type: 'boolean', default: true },
				],
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const intervalSeconds = this.getNodeParameter('intervalSeconds', 0) as number;
		const includeExisting = this.getNodeParameter('includeExisting', 0) as boolean;
		const { onlyUntrashed } = this.getNodeParameter('filters', 0, {}) as IDataObject;

		const staticData = this.getWorkflowStaticData('node') as { lastChecked?: string };

		const poll = async () => {
			// Build filter
			const filters: string[] = [];
			if (onlyUntrashed !== false) filters.push('trashed=false');

			// If we have a lastChecked, only fetch notes created after that
			if (staticData.lastChecked) {
				filters.push(`createTime > "${staticData.lastChecked}"`);
			}

			const qs: IDataObject = { pageSize: 200 };
			if (filters.length) qs.filter = filters.join(' AND ');

			let pageToken: string | undefined;
			let emitted = 0;

			do {
				const res = (await keepRequest.call(this, 'GET', '/notes', {}, {
					...qs,
					pageToken,
				})) as { notes?: IDataObject[]; nextPageToken?: string };

				const notes = res.notes ?? [];
				if (notes.length) {
					// Emit items
					this.emit([notes.map((n) => ({ json: n }))]);
					emitted += notes.length;
				}
				pageToken = res.nextPageToken;
			} while (pageToken);

			// advance cursor after polling to "now"
			staticData.lastChecked = new Date().toISOString();

			return emitted;
		};

		// On first activation:
		if (!staticData.lastChecked) {
			if (includeExisting) {
				await poll();
			}
			staticData.lastChecked = new Date().toISOString();
		}

		const interval = setInterval(async () => {
			try {
				await poll();
			} catch (error) {
				this.logger.error(`Google Keep Trigger poll error: ${(error as Error).message}`);
			}
		}, Math.max(10, intervalSeconds) * 1000);

		// Manual execution (“Execute Node”) runs one immediate poll
		const manualTriggerFunction = async () => {
			await poll();
		};

		return {
			closeFunction: async () => clearInterval(interval),
			manualTriggerFunction,
		};
	}
}
