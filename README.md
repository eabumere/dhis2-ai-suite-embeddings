# DHIS2 AI Embeddings API

A Node.js/TypeScript service that provides semantic search capabilities over DHIS2 metadata using AI embeddings. Built with Express, LangChain, and FAISS.

## Features

- 🔍 **Semantic Search** - Search DHIS2 metadata using natural language queries
- 📊 **Metadata Indexing** - Automatically fetch and index DHIS2 data elements, indicators, datasets, and more
- 🚀 **REST API** - HTTP endpoints for search and indexing operations
- ⚡ **Asynchronous Processing** - Long-running indexing jobs run in the background
- 🐳 **Docker Ready** - Containerized deployment support
- 📈 **Health Monitoring** - Built-in health checks and job status tracking

## Supported DHIS2 Metadata Types

- Data Elements
- Data Sets
- Indicators
- Program Indicators
- Organisation Units
- Category Options
- Category Option Combos

## Quick Start

### Prerequisites

- Node.js 18+ (for local development)
- Docker (for containerized deployment)
- Azure OpenAI API access (or Ollama for local embeddings)
- DHIS2 instance with API access

### Environment Variables

Create a `.env` file in the project root:

```env
# Azure OpenAI Configuration (Required for Azure embeddings)
AZURE_OPENAI_INSTANCE_NAME=your-instance-name
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=your-deployment-name
OPENAI_API_VERSION=2024-02-01
AZURE_OPENAI_API_KEY=your-api-key

# Ollama Configuration (Alternative for local embeddings)
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# DHIS2 Configuration
DHIS2_BASE_URL=https://your-dhis2-instance.org
DHIS_PAT=your-dhis2-personal-access-token

# Optional Configuration
PORT=3008
FAISS_INDEX_PATH=./data/faiss_index
```

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot-reload via ts-node)
npm run dev

# Or build and run production version
npm run build
node dist/server.js
```

### Docker Deployment

```bash
# Build production image
docker build --target production -t dhis2-embeddings-api .

# Run container
docker run -d \
  -p 3008:3008 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --name dhis2-embeddings \
  dhis2-embeddings-api

# Build and run development image
docker build --target development -t dhis2-embeddings-api:dev .
docker run -d -p 3008:3008 --env-file .env -v $(pwd):/app dhis2-embeddings-api:dev
```

### Docker Compose (Recommended)

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  dhis2-embeddings:
    build:
      context: .
      target: production
    ports:
      - "3008:3008"
    environment:
      - AZURE_OPENAI_INSTANCE_NAME=${AZURE_OPENAI_INSTANCE_NAME}
      - AZURE_OPENAI_EMBEDDING_DEPLOYMENT=${AZURE_OPENAI_EMBEDDING_DEPLOYMENT}
      - OPENAI_API_VERSION=${OPENAI_API_VERSION}
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - DHIS2_BASE_URL=${DHIS2_BASE_URL}
      - DHIS_PAT=${DHIS_PAT}
      - PORT=3008
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3008/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

Run with:
```bash
docker-compose up -d
```

## API Endpoints

### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "vectorStoreLoaded": true,
  "faissIndexPath": "./data/faiss_index",
  "currentIndexingJob": null
}
```

### Search Metadata
```http
POST /api/search
Content-Type: application/json

{
  "query": "malaria cases in children under 5",
  "limit": 5
}
```

Response:
```json
{
  "query": "malaria cases in children under 5",
  "results": [
    {
      "content": "Malaria cases confirmed - Number of confirmed malaria cases",
      "metadata": {
        "item_id": "xyz123",
        "name": "Malaria cases confirmed",
        "type": "dataElements"
      }
    }
  ],
  "totalResults": 5
}
```

### Start Indexing Job
```http
POST /api/index
```

Response:
```json
{
  "message": "Indexing started",
  "jobId": "job-1705315800000",
  "status": "pending",
  "startedAt": "2024-01-15T10:30:00.000Z",
  "checkStatusAt": "/api/index/status/job-1705315800000"
}
```

### Check Indexing Status
```http
GET /api/index/status/:jobId
```

Response:
```json
{
  "job": {
    "id": "job-1705315800000",
    "status": "completed",
    "startedAt": "2024-01-15T10:30:00.000Z",
    "completedAt": "2024-01-15T10:32:15.000Z"
  },
  "isCurrent": false
}
```

### Get All Indexing Status
```http
GET /api/index/status
```

Response:
```json
{
  "currentJob": null,
  "recentJobs": [
    {
      "id": "job-1705315800000",
      "status": "completed",
      "startedAt": "2024-01-15T10:30:00.000Z",
      "completedAt": "2024-01-15T10:32:15.000Z"
    }
  ]
}
```

### Get Indexing History
```http
GET /api/index/history
```

### Reload Vector Store
```http
POST /api/reload
```

Useful after external updates to the FAISS index.

## Usage Workflow

1. **Initial Setup**: Deploy the service with proper environment variables

2. **First Indexing**: Trigger the initial metadata indexing:
   ```bash
   curl -X POST http://localhost:3008/api/index
   ```

3. **Check Status**: Poll the status endpoint until complete:
   ```bash
   curl http://localhost:3008/api/index/status/job-xxx
   ```

4. **Search**: Once indexing is complete, perform searches:
   ```bash
   curl -X POST http://localhost:3008/api/search \
     -H "Content-Type: application/json" \
     -d '{"query": "child health indicators", "limit": 10}'
   ```

5. **Incremental Updates**: The indexing process supports incremental updates - subsequent runs only fetch metadata changed since the last successful index.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   DHIS2 API     │────▶│  Metadata Fetch  │────▶│  AI Embeddings  │
│                 │     │                  │     │  (Azure/Ollama) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Search Results │◄────│  FAISS Vector    │◄────│  Vector Store   │
│                 │     │  Store (Local)   │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         ▲
         │
┌────────┴────────┐
│   HTTP Client   │
│  /api/search    │
└─────────────────┘
```

## Production Considerations

### Security
- Use HTTPS in production (terminate at load balancer/reverse proxy)
- Restrict DHIS2 API token permissions
- Store sensitive credentials in secrets management (Kubernetes secrets, AWS Secrets Manager, etc.)
- Consider adding API authentication/authorization middleware

### Performance
- The initial indexing can take several minutes depending on DHIS2 instance size
- Incremental updates are much faster (only changed metadata)
- FAISS index is loaded into memory for fast search
- Consider scheduled indexing (cron job) for keeping data fresh

### Monitoring
- Health endpoint suitable for load balancer health checks
- Container includes Docker healthcheck
- Application logs to stdout/stderr (container-friendly)

### Storage
- FAISS index is stored in `data/faiss_index` directory
- Persist this directory across container restarts
- For Kubernetes: use PersistentVolumeClaim
- For Docker: use bind mount or named volume

## Troubleshooting

### FAISS index not found
```
⚠️ FAISS index not found at ./data/faiss_index. Run indexing to create it.
```
Run `POST /api/index` to create the initial index.

### Embedding API errors
Check Azure OpenAI credentials and ensure deployment name matches. For Ollama, verify the service is running and accessible.

### DHIS2 API errors
Verify `DHIS2_BASE_URL` and `DHIS_PAT` are correct. Ensure the PAT has sufficient permissions to read metadata.

## License

MIT