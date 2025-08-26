import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestOptions,
	JsonObject,
	IHttpRequestMethods,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionType } from 'n8n-workflow';

const BASE_URL = 'https://keep.googleapis.com/v1';

async function keepRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
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
                // use n8n's generic Google OAuth2 credential
                return await this.helpers.httpRequestWithAuthentication.call(
                        this,
                        'googleApi',
                        options,
                );
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export class GoogleKeep implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Google Keep',
		name: 'googleKeep',
		icon: 'file:googleKeep.svg',
		group: ['transform'],
		version: 1,
		description: 'Create, get, list and delete Google Keep notes',
		defaults: { name: 'Google Keep' },
                credentials: [{ name: 'googleApi', required: true }],
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Note', value: 'note' }],
				default: 'note',
			},

			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Create', value: 'create' },
					{ name: 'Get', value: 'get' },
					{ name: 'Get Many', value: 'getAll' },
					{ name: 'Delete', value: 'delete' },
					// Update not supported by API – see trigger + workaround in README
				],
				default: 'create',
			},

			// --- create ---
			{
				displayName: 'Note Type',
				name: 'noteType',
				type: 'options',
				displayOptions: { show: { operation: ['create'] } },
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'List', value: 'list' },
				],
				default: 'text',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				required: true,
				displayOptions: { show: { operation: ['create'] } },
				default: '',
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				displayOptions: { show: { operation: ['create'], noteType: ['text'] } },
				default: '',
			},
			{
				displayName: 'List Items',
				name: 'listItems',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				displayOptions: { show: { operation: ['create'], noteType: ['list'] } },
				default: {},
				options: [
					{
						displayName: 'Item',
						name: 'items',
						values: [
							{ displayName: 'Text', name: 'text', type: 'string', default: '' },
							{ displayName: 'Checked', name: 'checked', type: 'boolean', default: false },
						],
					},
				],
			},

			// --- get/getAll/delete ---
			{
				displayName: 'Note ID',
				name: 'noteId',
				type: 'string',
				required: true,
				displayOptions: { show: { operation: ['get', 'delete'] } },
				description: 'Either the raw ID or the full resource name "notes/ID"',
				default: '',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: { show: { operation: ['getAll'] } },
				default: false,
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 1000 },
				displayOptions: { show: { operation: ['getAll'], returnAll: [false] } },
				default: 100,
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				displayOptions: { show: { operation: ['getAll'] } },
				default: {},
				options: [
					{
						displayName: 'Only Untrashed',
						name: 'onlyUntrashed',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Created After',
						name: 'createdAfter',
						type: 'dateTime',
						default: '',
						description: 'Filter by createTime (RFC3339)',
					},
					{
						displayName: 'Updated After',
						name: 'updatedAfter',
						type: 'dateTime',
						default: '',
						description: 'Filter by updateTime (RFC3339)',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			if (resource !== 'note') throw new Error('Unsupported resource');

			if (operation === 'create') {
				const noteType = this.getNodeParameter('noteType', i) as 'text' | 'list';
				const title = this.getNodeParameter('title', i) as string;

				let body: IDataObject = {};
				if (noteType === 'text') {
					const text = this.getNodeParameter('text', i) as string;
					body = { title, body: { text: { text } } };
				} else {
					const listItems = (this.getNodeParameter('listItems', i, {}) as IDataObject).items as
						| IDataObject[]
						| undefined;
					const list = (listItems || []).map((li) => ({
						text: { text: (li.text as string) || '' },
						checked: Boolean(li.checked),
					}));
					body = { title, body: { list: { listItems: list } } };
				}

				const res = await keepRequest.call(this, 'POST', '/notes', body);
				returnData.push({ json: res as IDataObject });
			}

			if (operation === 'get') {
				const raw = this.getNodeParameter('noteId', i) as string;
				const name = raw.startsWith('notes/') ? raw : `notes/${raw}`;
				const res = await keepRequest.call(this, 'GET', `/${name}`);
				returnData.push({ json: res as IDataObject });
			}

			if (operation === 'getAll') {
				const returnAll = this.getNodeParameter('returnAll', i) as boolean;
				const { onlyUntrashed, createdAfter, updatedAfter } = this.getNodeParameter(
					'filters',
					i,
					{},
				) as IDataObject;

				const filters: string[] = [];
				if (onlyUntrashed !== false) filters.push('trashed=false');
				if (createdAfter) filters.push(`createTime > "${new Date(createdAfter as string).toISOString()}"`);
				if (updatedAfter) filters.push(`updateTime > "${new Date(updatedAfter as string).toISOString()}"`);
				const filterStr = filters.join(' AND ');

				let pageToken: string | undefined;
				let collected: IDataObject[] = [];
				const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);

				do {
					const res = (await keepRequest.call(this, 'GET', '/notes', {}, {
						pageSize: Math.min(200, Math.max(1, limit - collected.length)),
						pageToken,
						filter: filterStr || undefined,
					})) as { notes?: IDataObject[]; nextPageToken?: string };

					if (res.notes?.length) collected = collected.concat(res.notes);
					pageToken = res.nextPageToken && collected.length < limit ? res.nextPageToken : undefined;
				} while (pageToken && collected.length < limit);

				returnData.push(...collected.slice(0, limit).map((n) => ({ json: n })));
			}

			if (operation === 'delete') {
				const raw = this.getNodeParameter('noteId', i) as string;
				const name = raw.startsWith('notes/') ? raw : `notes/${raw}`;
				await keepRequest.call(this, 'DELETE', `/${name}`);
				returnData.push({ json: { success: true, name } });
			}
		}

		return [returnData];
	}
}
