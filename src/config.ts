import * as dotenv from "dotenv";
import { z } from "zod";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const ConfigSchema = z.object({
    ollamaBaseUrl: z.string().optional().default("http://127.0.0.1:11434"),
    ollamaModel: z.string().optional().default("llama3.2"),
    ollamaEmbeddingModel: z.string().optional().default("nomic-embed-text"),
    dhis2BaseUrl: z.string(),
    dhis2Username: z.string(),
    dhis2Password: z.string(),
    faissIndexPath: z.string().optional().default(""),
    enableDeleteTool: z.boolean().optional().default(false),
});

export const loadConfig=(importMetaUrl?: string) =>{
    // Compute default faissIndexPath if importMetaUrl is provided
    const defaultFaissIndexPath = importMetaUrl
        ? join(dirname(fileURLToPath(importMetaUrl)), "..", "data", "faiss_index")
        : "./data/faiss_index";

    const env = {
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
        ollamaModel: process.env.OLLAMA_MODEL,
        ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL,
        dhis2BaseUrl: process.env.DHIS2_BASE_URL,
        dhis2Username: process.env.DHIS2_USERNAME,
        dhis2Password: process.env.DHIS2_PASSWORD,
        faissIndexPath: process.env.FAISS_INDEX_PATH || defaultFaissIndexPath,
        enableDeleteTool: process.env.ENABLE_DELETE_TOOL === "true",
    };
    return ConfigSchema.parse(env);
}
