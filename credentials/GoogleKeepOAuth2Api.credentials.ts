import type {
	ICredentialTestRequest,
	ICredentialType,
	IAuthenticateGeneric,
	INodeProperties,
} from 'n8n-workflow';

export class GoogleKeepOAuth2Api implements ICredentialType {
	name = 'googleKeepOAuth2Api';
	displayName = 'Google Keep OAuth2 API';
	documentationUrl = 'https://developers.google.com/workspace/keep/api';
	icon = 'file:googleKeep.svg';
	extends = []; // standalone

	properties: INodeProperties[] = [
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'OAuth Redirect URL',
			name: 'redirectUri',
			type: 'string',
			default: 'http://localhost:5678/rest/oauth2-credential/callback',
			description: 'Use your n8n OAuth redirect URL',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			default: 'https://www.googleapis.com/auth/keep',
			description: 'Full access. For read-only use https://www.googleapis.com/auth/keep.readonly',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'oAuth2',
		properties: {
			tokenType: 'Bearer',
			key: 'access_token',
			oauth2: {
				authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
				accessTokenUrl: 'https://oauth2.googleapis.com/token',
				authQueryParameters: {
					access_type: 'offline',
					prompt: 'consent',
				},
				scopes: ['={{$self.scope}}'],
			},
		},
	};

	// lightweight verification: list 1 note
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://keep.googleapis.com',
			url: '/v1/notes',
			method: 'GET',
			qs: { pageSize: 1 },
		},
	};
}
