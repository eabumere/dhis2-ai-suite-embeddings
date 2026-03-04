import express from 'express';
import cors from 'cors';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
// @ts-ignore
import { loadConfig } from './config.js';
import { embeddings } from './embeddings.js';
import { embedDhis2Metadata } from './embedDhis2Metadata.js';

const app = express();
const port = Number(process.env.PORT) || 3008;

// Enable CORS for Angular frontend
app.use(cors({ origin: '*' }));
app.use(express.json());

// Load configuration with import.meta.url
// @ts-ignore
const config = loadConfig(import.meta.url);
const { faissIndexPath } = config;

// Indexing job status tracking
interface IndexingJob {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startedAt: Date;
    completedAt?: Date;
    error?: string;
    documentsProcessed?: number;
}

let currentJob: IndexingJob | null = null;
let jobHistory: IndexingJob[] = [];

// Initialize FAISS vector store
let vectorStore: FaissStore | null = null;

async function loadVectorStore(): Promise<FaissStore | null> {
    try {
        const store = await FaissStore.load(faissIndexPath, embeddings);
        console.log(`✅ Loaded FAISS vector store from ${faissIndexPath}`);
        return store;
    } catch (e) {
        console.error(`⚠️ FAISS index not found at ${faissIndexPath}. Run indexing to create it.`);
        return null;
    }
}

async function initializeVectorStore() {
    vectorStore = await loadVectorStore();
}

// Initial load on startup
initializeVectorStore();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        vectorStoreLoaded: vectorStore !== null,
        faissIndexPath,
        currentIndexingJob: currentJob ? {
            id: currentJob.id,
            status: currentJob.status,
            startedAt: currentJob.startedAt
        } : null
    });
});

// Search endpoint
app.post('/api/search', async (req, res) => {
    const { query, limit = 5 } = req.body;

    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query parameter is required and must be a string' });
    }

    if (!vectorStore) {
        return res.status(503).json({
            error: 'FAISS vector store not initialized. Run indexing to create the index.',
            faissIndexPath
        });
    }

    try {
        const results = await vectorStore.similaritySearch(query, Number(limit));
        const formattedResults = results.map((doc) => ({
            content: doc.pageContent,
            metadata: doc.metadata,
        }));
        res.json({
            query,
            results: formattedResults,
            totalResults: formattedResults.length
        });
    } catch (e) {
        console.error('Search error:', e);
        res.status(500).json({ error: `Semantic search failed: ${String(e)}` });
    }
});

// Index endpoint - Trigger metadata embedding (asynchronous)
app.post('/api/index', async (req, res) => {
    // Check if a job is already running
    if (currentJob && currentJob.status === 'running') {
        return res.status(409).json({
            error: 'Indexing already in progress',
            jobId: currentJob.id,
            startedAt: currentJob.startedAt
        });
    }

    // Create new job
    const jobId = `job-${Date.now()}`;
    currentJob = {
        id: jobId,
        status: 'pending',
        startedAt: new Date()
    };

    // Start indexing asynchronously
    (async () => {
        try {
            currentJob!.status = 'running';
            console.log(`🚀 Starting indexing job ${jobId}...`);

            await embedDhis2Metadata();

            // Reload vector store after indexing
            await initializeVectorStore();

            currentJob!.status = 'completed';
            currentJob!.completedAt = new Date();
            console.log(`✅ Indexing job ${jobId} completed successfully`);

            // Add to history
            jobHistory.push({ ...currentJob });
            if (jobHistory.length > 10) {
                jobHistory = jobHistory.slice(-10); // Keep last 10 jobs
            }
        } catch (error) {
            console.error(`❌ Indexing job ${jobId} failed:`, error);
            currentJob!.status = 'failed';
            currentJob!.error = String(error);
            currentJob!.completedAt = new Date();

            // Add to history
            jobHistory.push({ ...currentJob });
            if (jobHistory.length > 10) {
                jobHistory = jobHistory.slice(-10);
            }
        }
    })();

    // Return immediately with job ID
    res.status(202).json({
        message: 'Indexing started',
        jobId,
        status: 'pending',
        startedAt: currentJob.startedAt,
        checkStatusAt: `/api/index/status/${jobId}`
    });
});

// Get indexing job status
app.get('/api/index/status/:jobId?', (req, res) => {
    const { jobId } = req.params;

    if (jobId) {
        // Check current job first
        if (currentJob && currentJob.id === jobId) {
            return res.json({
                job: currentJob,
                isCurrent: true
            });
        }

        // Check history
        const historicalJob = jobHistory.find(j => j.id === jobId);
        if (historicalJob) {
            return res.json({
                job: historicalJob,
                isCurrent: false
            });
        }

        return res.status(404).json({ error: 'Job not found' });
    }

    // Return all jobs if no jobId specified
    res.json({
        currentJob,
        recentJobs: jobHistory
    });
});

// Get indexing history
app.get('/api/index/history', (req, res) => {
    res.json({
        currentJob,
        history: jobHistory
    });
});

// Reload vector store endpoint (useful after external index updates)
app.post('/api/reload', async (req, res) => {
    try {
        await initializeVectorStore();
        res.json({
            message: 'Vector store reloaded successfully',
            vectorStoreLoaded: vectorStore !== null,
            faissIndexPath
        });
    } catch (error) {
        res.status(500).json({
            error: `Failed to reload vector store: ${String(error)}`
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        availableEndpoints: [
            'GET /health',
            'POST /api/search',
            'POST /api/index',
            'GET /api/index/status',
            'GET /api/index/history',
            'POST /api/reload'
        ]
    });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
    console.log(`🚀 DHIS2 AI Embeddings API server running at http://localhost:${port}`);
    console.log(`📖 Available endpoints:`);
    console.log(`   GET  /health              - Health check`);
    console.log(`   POST /api/search          - Semantic search`);
    console.log(`   POST /api/index           - Start metadata indexing`);
    console.log(`   GET  /api/index/status    - Check indexing status`);
    console.log(`   GET  /api/index/history   - View indexing history`);
    console.log(`   POST /api/reload          - Reload vector store`);
});
