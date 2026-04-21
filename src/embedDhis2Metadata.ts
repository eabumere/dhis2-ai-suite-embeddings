import axios from 'axios';
import { Document } from '@langchain/core/documents';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { loadConfig } from './config.js';
import * as fs from 'node:fs';
import { embeddings } from './embeddings.js';

// Load configuration
const config = loadConfig();
const { dhis2BaseUrl, dhis2ApiToken, azureOpenAiEndpoint, azureOpenAiDeployment, azureOpenAIApiInstanceName, openAiApiVersion, azureOpenAiApiKey, faissIndexPath } = config;

// Initialize embeddings
const embeddings = new AzureOpenAIEmbeddings({
	azureOpenAIEndpoint: azureOpenAiEndpoint,
	azureOpenAIApiInstanceName: azureOpenAIApiInstanceName,
	openAIApiVersion: openAiApiVersion,
	azureOpenAIApiKey: azureOpenAiApiKey,
	azureOpenAIApiDeploymentName: azureOpenAiDeployment
});

// Fetch DHIS2 metadata
async function fetchMetadata(lastUpdatedAfter?: Date) {
    const endpoints = [
        { endpoint: "dataElements.json", key: "dataElements", fields: "id,displayName,description" },
        { endpoint: "indicators.json", key: "indicators", fields: "id,displayName,description,numeratorDescription,denominatorDescription" },
        { endpoint: "programIndicators.json", key: "programIndicators", fields: "id,displayName,description" },
        { endpoint: "organisationUnits.json", key: "organisationUnits", fields: "id,code,name,parent,children,level,ancestors" },
        { endpoint: "categoryOptions.json", key: "categoryOptions", fields: "id,code,name,description" },
        { endpoint: "categoryOptionCombos.json", key: "categoryOptionCombos", fields: "id,name"}
    ];

    const allItems: any[] = [];

    for (const {endpoint, key, fields} of endpoints) {
        let page = 1;
        const pageSize = 600;

        while (true) {
            // Build URL with optional lastUpdated filter
            let url = `${dhis2BaseUrl}/api/${endpoint}?page=${page}&pageSize=${pageSize}&fields=${fields}`;

            // Add lastUpdated filter if timestamp is provided
            if (lastUpdatedAfter) {
                const isoTimestamp = lastUpdatedAfter.toISOString();
                url += `&filter=lastUpdated:gt:${encodeURIComponent(isoTimestamp)}`;
            }

            const response = await axios.get(url, {
                headers: {
                    Authorization: `ApiToken ${dhis2ApiToken}`
                }
            });
            const items = response.data[key] || [];
            allItems.push(...items.map((item: any) => ({...item, type: key})));
            const pager = response.data.pager || {};
            if (pager.page >= pager.pageCount || !items.length) break;
            page++;
        }
    }

    return allItems;
}

// Helper function to get last embed timestamp from FAISS store
async function getLastEmbedTimestampFromStore(vectorStore: FaissStore): Promise<Date | null> {
    try {
        // Access the document store directly
        const docstore = vectorStore.docstore;
        // Convert the Map values to an array of documents
        const allDocs = Array.from(docstore._docs.values());

        const timestampDoc = allDocs.find((doc: Document) =>
            doc.metadata.type === 'last_embed_timestamp'
        );

        if (timestampDoc && timestampDoc.metadata.timestamp) {
            return new Date(timestampDoc.metadata.timestamp);
        }
        return null;
    } catch (error) {
        console.log('⚠️ Could not retrieve last embed timestamp:', error);
        return null;
    }
}

// Helper function to update last embed timestamp in FAISS store
async function updateLastEmbedTimestampInStore(vectorStore: FaissStore): Promise<void> {
    const timestampDoc = new Document({
        pageContent: 'System document: Last successful embed timestamp',
        metadata: {
            type: 'last_embed_timestamp',
            timestamp: new Date().toISOString()
        }
    });

    // Try to find and delete existing timestamp document first
    try {
        const docstore = vectorStore.docstore;
        // Convert the Map values to an array of documents
        const allDocs = Array.from(docstore._docs.values());
        const existingTimestampDoc = allDocs.find((doc: Document) =>
            doc.metadata.type === 'last_embed_timestamp'
        );

        if (existingTimestampDoc && existingTimestampDoc.metadata.item_id) {
            await vectorStore.delete({ids: [existingTimestampDoc.metadata.item_id]});
        }
    } catch (error) {
        // If we can't find or delete the existing one, that's okay
        console.log('ℹ️ No existing timestamp document found or could not delete');
    }

    // Add the new timestamp document
    await vectorStore.addDocuments([timestampDoc]);
}

// Build documents from metadata
function buildDocuments(items: any[]): Document[] {
    return items.map((item) => {
        const type = item.type;
        return new Document({
            pageContent: item,
            metadata: { item_id: item.id, name: item.displayName || item.name, type },
        });
    });
}

// Embed and store in FAISS
async function embedAndStoreMetadata() {
    console.log('📦 Fetching and embedding DHIS2 metadata...');

    // Get last embed timestamp if store exists
    let lastUpdatedAfter: Date | undefined;
    let vectorStore: FaissStore;

    if (fs.existsSync(faissIndexPath)) {
        console.log('🔄 Loading existing FAISS store for incremental update...');
        vectorStore = await FaissStore.load(faissIndexPath, embeddings);

        // Get the last embed timestamp from the store
        const lastTimestamp = await getLastEmbedTimestampFromStore(vectorStore);
        if (lastTimestamp) {
            lastUpdatedAfter = lastTimestamp;
            console.log(`🕒 Using last embed timestamp: ${lastUpdatedAfter.toISOString()}`);
        } else {
            console.log('ℹ️ No previous timestamp found, fetching all metadata');
        }
    } else {
        console.log('🆕 Creating new FAISS store...');
        vectorStore = new FaissStore(embeddings, {});
    }

    // Fetch metadata with optional timestamp filter
    const metadata = await fetchMetadata(lastUpdatedAfter);
    const documents = buildDocuments(metadata);

    // Extract the DHIS2 IDs to use as the Vector Store IDs
    const docIds = metadata.map(item => item.id);

    // If we have an existing store, delete existing versions of these IDs to prevent duplicates
    if (fs.existsSync(faissIndexPath)) {
        try {
            await vectorStore.delete({ids: docIds});
            console.log('🧹 Removed existing entries for update.');
        } catch (e) {
            // delete might throw if IDs don't exist; we can safely ignore in many versions
            console.log('ℹ️ No existing records found for these IDs, proceeding with insert.');
        }
    }

    // Add (or re-add) the documents with explicit IDs
    await vectorStore.addDocuments(documents, {ids: docIds});

    // Update the last embed timestamp
    await updateLastEmbedTimestampInStore(vectorStore);

    // Save the merged/updated state
    await vectorStore.save(faissIndexPath);

    if (lastUpdatedAfter) {
        console.log(`✅ Incrementally updated ${documents.length} documents in FAISS store at ${faissIndexPath}.`);
    } else {
        console.log(`✅ Embedded ${documents.length} documents in FAISS store at ${faissIndexPath}.`);
    }
}

// Main function
async function main() {
    await embedAndStoreMetadata();
}

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { main as embedDhis2Metadata };
