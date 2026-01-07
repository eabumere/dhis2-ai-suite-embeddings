import express from 'express';
import cors from 'cors';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { AzureOpenAIEmbeddings } from '@langchain/openai';
// @ts-ignore
import { loadConfig } from './config.ts';

const app = express();
const port = Number(process.env.PORT) || 3008;


// Enable CORS for Angular frontend
app.use(cors({ origin: '*' }));
app.use(express.json());

// Load configuration with import.meta.url
// @ts-ignore
const config = loadConfig(import.meta.url);
const { azureOpenAiEndpoint, azureOpenAiDeployment, openAiApiVersion, azureOpenAiApiKey, faissIndexPath } = config;

// Initialize embeddings
const embeddings = new AzureOpenAIEmbeddings({
    azureOpenAIEndpoint: azureOpenAiEndpoint,
    azureOpenAIDeployment: azureOpenAiDeployment,
    openAIApiVersion: openAiApiVersion,
    openAIApiKey: azureOpenAiApiKey,
});

// Initialize FAISS vector store
let vectorStore: FaissStore | null = null;
async function initializeVectorStore() {
    try {
        vectorStore = await FaissStore.load(faissIndexPath, embeddings);
        console.log(`✅ Loaded FAISS vector store from ${faissIndexPath}`);
    } catch (e) {
        console.error(`Error: FAISS index not found at ${faissIndexPath}. Run 'npm run embed' to create it.`);
        vectorStore = null;
    }
}
initializeVectorStore();

// Search endpoint
app.post('/api/search', async (req, res) => {
    const { query, limit = 5 } = req.body;
    console.log('Query', query, req.body)
    if (!vectorStore) {
        return res.status(500).json({ error: `FAISS vector store not initialized. Run 'npm run embed' to create the index at ${faissIndexPath}.` });
    }
    try {
        const results = await vectorStore.similaritySearch(query, limit);
        const formattedResults = results.map((doc) => ({
            content: doc.pageContent,
            metadata: doc.metadata,
        }));
        console.log('Result', results)
        res.json(formattedResults);
    } catch (e) {
        res.status(500).json({ error: `Semantic search failed: ${String(e)}` });
    }
});

app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});
