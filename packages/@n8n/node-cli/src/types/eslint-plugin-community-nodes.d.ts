// Type declaration stub for @n8n/eslint-plugin-community-nodes
// This file resolves TS7016 errors when the package types aren't found during Docker builds
declare module '@n8n/eslint-plugin-community-nodes' {
	import type { TSESLint } from '@typescript-eslint/utils';

	export const n8nCommunityNodesPlugin: {
		configs: {
			recommended: TSESLint.FlatConfig.Config;
			recommendedWithoutN8nCloudSupport: TSESLint.FlatConfig.Config;
		};
	};
}
