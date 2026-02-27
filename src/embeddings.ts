import { loadConfig } from './config.ts';
import { AzureOpenAIEmbeddings } from '@langchain/openai';

// @ts-ignore
const config = loadConfig(import.meta.url);
const {
    azureOpenAiInstanceName,
    azureOpenAiDeployment,
    openAiApiVersion,
    azureOpenAiApiKey} = config;

// Initialize embeddings
export const embeddings = new AzureOpenAIEmbeddings({
    azureOpenAIApiInstanceName: azureOpenAiInstanceName!,
    azureOpenAIApiDeploymentName: azureOpenAiDeployment!,
    azureOpenAIApiVersion: openAiApiVersion!,
    azureOpenAIApiKey: azureOpenAiApiKey!,
});