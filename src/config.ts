import * as dotenv from "dotenv";
import { z } from "zod";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const ConfigSchema = z.object({
    embeddingProvider: z.enum(["ollama", "azure"]).optional().default("azure"),
    ollamaBaseUrl: z.string().optional().default("http://127.0.0.1:11434"),
    ollamaModel: z.string().optional().default("llama3.2"),
    ollamaEmbeddingModel: z.string().optional().default("nomic-embed-text"),
    azureOpenAiEndpoint: z.string().optional(),
    azureOpenAiDeployment: z.string().optional(),
    openAiApiVersion: z.string().optional(),
    azureOpenAiApiKey: z.string().optional(),
	azureOpenAIApiInstanceName: z.string().optional(),
    dhis2BaseUrl: z.string(),
    dhis2ApiToken: z.string(),
    faissIndexPath: z.string().optional().default(""),
	scoreThreshold: z.string(),
});

export const loadConfig=(importMetaUrl?: string) =>{
    // Compute default faissIndexPath if importMetaUrl is provided
    const defaultFaissIndexPath = importMetaUrl
        ? join(dirname(fileURLToPath(importMetaUrl)), "..", "data", "faiss_index")
        : "./data/faiss_index";

    const env = {
        embeddingProvider: process.env.EMBEDDING_PROVIDER,
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
        ollamaModel: process.env.OLLAMA_MODEL,
        ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL,
        azureOpenAiEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        azureOpenAiDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
        openAiApiVersion: process.env.OPENAI_API_VERSION,
        azureOpenAiApiKey: process.env.AZURE_OPENAI_API_KEY,
	    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
        dhis2BaseUrl: process.env.DHIS2_BASE_URL,
        dhis2ApiToken: process.env.DHIS_PAT,
        faissIndexPath: process.env.FAISS_INDEX_PATH || defaultFaissIndexPath,
	    scoreThreshold: process.env.EMBEDDING_SCORE_THRESHOLD || 0.3,
    };
    return ConfigSchema.parse(env);
}
