import axios from "axios";
import { Document } from "@langchain/core/documents";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Embeddings } from "@langchain/core/embeddings";
import { loadConfig } from "./config.ts";

// Load configuration
const config = loadConfig();
const { dhis2BaseUrl, dhis2ApiToken, ollamaBaseUrl, ollamaEmbeddingModel, faissIndexPath } = config;

// Initialize embeddings
const embeddings = new (class extends Embeddings {
    constructor() {
        super({});
    }

    async embedDocuments(texts: string[]): Promise<number[][]> {
        try {
            const embeddings: number[][] = [];
            for (const text of texts) {
                const response = await axios.post(`${ollamaBaseUrl}/api/embeddings`, {
                    model: ollamaEmbeddingModel,
                    prompt: text,
                }, {
                    timeout: 30000, // 30-second timeout
                });
                embeddings.push(response.data.embedding);
            }
            return embeddings;
        } catch (e) {
            throw new Error(`Failed to embed documents: ${String(e)}`);
        }
    }

    async embedQuery(text: string): Promise<number[]> {
        try {
            const response = await axios.post(`${ollamaBaseUrl}/api/embeddings`, {
                model: ollamaEmbeddingModel,
                prompt: text,
            }, {
                timeout: 30000, // 30-second timeout
            });
            return response.data.embedding;
        } catch (e) {
            throw new Error(`Failed to embed query: ${String(e)}`);
        }
    }
})();

// Fetch DHIS2 metadata
async function fetchMetadata() {
    const endpoints = [
        { endpoint: "dataElements.json", key: "dataElements", fields: "id,displayName,description" },
        { endpoint: "indicators.json", key: "indicators", fields: "id,displayName,description" },
        { endpoint: "programIndicators.json", key: "programIndicators", fields: "id,displayName,description" },
        { endpoint: "organisationUnits.json", key: "organisationUnits", fields: "id,code,name,parent,children,level,ancestors" },
        { endpoint: "categoryOptions.json", key: "categoryOptions", fields: "id,code,name,description" },
        { endpoint: "categoryOptionCombos.json", key: "categoryOptionCombos", fields: "id,name"}
    ];

    const allItems: any[] = [];

    for (const { endpoint, key, fields } of endpoints) {
        let page = 1;
        const pageSize = 600;

        while (true) {
            const url = `${dhis2BaseUrl}/api/${endpoint}?page=${page}&pageSize=${pageSize}&fields=${fields}`;
            const response = await axios.get(url, {
                headers: {
                    Authorization: `ApiToken ${dhis2ApiToken}`
                }
            });
            const items = response.data[key] || [];
            allItems.push(...items.map((item: any) => ({ ...item, type: key })));
            const pager = response.data.pager || {};
            if (pager.page >= pager.pageCount || !items.length) break;
            page++;
        }
    }

    return allItems;
}

// Build documents from metadata
function buildDocuments(items: any[]): Document[] {
    return items.map((item) => {
        const type = item.type;
        let content = "";
        if (type === "organisationUnits") {
            content = `Name: ${item.name} | Code: ${item.code || ""} | ID: ${item.id} || ""}`;
        } else {
            content = `${item.displayName} - ${item.description || ""}`;
        }
        return new Document({
            pageContent: content,
            metadata: { item_id: item.id, name: item.displayName || item.name, type },
        });
    });
}

// Embed and store in FAISS
async function embedAndStoreMetadata() {
    console.log("📦 Fetching and embedding DHIS2 metadata...");
    const metadata = await fetchMetadata();
    const documents = buildDocuments(metadata);

    // Create new FAISS store
    const vectorStore = new FaissStore(embeddings, {});
    await vectorStore.addDocuments(documents);
    await vectorStore.save(faissIndexPath);
    console.log(`✅ Embedded ${documents.length} documents in FAISS store at ${faissIndexPath}.`);
}

// Main function
async function main() {
    await embedAndStoreMetadata();
}

if (import.meta.url === new URL(import.meta.url).href) {
    main().catch(console.error);
}

export { main as embedDhis2Metadata };