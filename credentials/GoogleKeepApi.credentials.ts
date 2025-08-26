import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GoogleKeepApi implements ICredentialType {
	name = 'googleKeepApi';
	displayName = 'Google Keep API';
	documentationUrl = 'https://developers.google.com/keep/api';
	icon = 'file:googleKeep.svg';
	httpRequestNode = {
		name: 'Google Keep',
		docsUrl: 'https://developers.google.com/keep/api',
		apiBaseUrl: 'https://keep.googleapis.com/v1',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Service Account Email',
			name: 'email',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			typeOptions: {
				password: true,
				multiline: true,
			},
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.email}}',
				password: '={{$credentials.privateKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://keep.googleapis.com/v1',
			url: '/notes',
			method: 'GET',
		},
	};
}