# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AnnoC** is a client-side single-cell RNA-seq analysis web application that runs entirely in the browser using WebAssembly. The application performs computationally intensive analysis locally without sending data to backend servers, ensuring privacy and eliminating server costs.

Key technologies:
- **scran.js**: WebAssembly-compiled C/C++ libraries for efficient client-side single-cell analysis
- **bakana**: Core analysis workflow library that works in both browser and Node.js environments
- **Web Workers**: All computations run in separate workers to avoid blocking the main thread
- **SharedArrayBuffer**: Enables PThreads support for parallelized WASM execution
- **Service Workers**: Required for cross-origin isolation headers (COOP/COEP) to enable SharedArrayBuffer

## Development Commands

### Installation
```sh
npm install --legacy-peer-deps
# or
yarn install

# You may need to dedupe after installation
npm dedupe
```

### Running the Application
```sh
yarn start
# or
npm run start
```
Runs on port 3000 by default (unless occupied).

### Building for Production
```sh
# Standard build
npm run build

# Build for GitHub Pages deployment
npm run build-ghpages

# Build for dev deployment
npm run build-dev
```

### Testing
```sh
npm run test
# or
react-scripts test
```

### Docker-based Build
```sh
# Build Docker image
docker build . -t annoc

# For macOS with M1/M2
docker build . -t annoc --platform linux/arm64

# Run container to generate production builds
docker run -v .:/annoc -t annoc
# or on Windows WSL
docker run -v $(pwd):/annoc -t annoc
```

### Serving Built Files Locally
```sh
# Using Python
python -m http.server 3000 -d builds

# Using npm serve
npm install -g serve
serve builds
```

## Architecture Overview

### Multi-Worker Architecture

Kana uses a sophisticated worker-based architecture to keep the UI responsive:

1. **Main Thread**: Handles UI rendering and user interactions
2. **scran.worker.js**: Primary analysis worker that executes the bakana workflow
3. **explorer.worker.js**: Secondary worker for exploring pre-computed results
4. **Separate t-SNE/UMAP workers**: Run dimensionality reductions concurrently

Data flow:
- Input files → Web Worker → WASM analysis → Results sent to main thread as needed
- Workers communicate via `postMessage`
- Large datasets stay in workers; only visualization data is transferred to main thread

### Key Components Structure

**src/workers/**
- `scran.worker.js`: Main analysis pipeline using bakana library
- `explorer.worker.js`: Loads and explores existing analysis results
- `KanaDBHandler.js`: IndexedDB operations for caching
- `DownloadsDBHandler.js`: Manages downloaded reference datasets
- `helpers.js`: Shared utility functions for workers
- `translate.js`: Data transformation utilities

**src/context/**
- `AppContext.js`: Global application state including:
  - Input files state
  - Analysis parameters (PCA, t-SNE, UMAP, clustering, etc.)
  - Gene/cell annotation state
  - WASM initialization status

**src/components/** (organized by functionality)
- `NewAnalysis/`: File input cards for different formats (H5AD, MatrixMarket, 10X HDF5, RDS, ExperimentHub, ZippedADB)
- `LoadAnalysis/`: Load saved .kana analysis files
- `LoadExplore/`: Explore pre-computed results without full analysis
- `AnalysisMode/`: Main analysis interface and workflow orchestration
- `ExploreMode/`: Interface for exploring loaded results
- `Plots/`: Visualization components (DimPlot, Histogram, ViolinPlot, etc.)
- `Markers/`: Marker gene detection and display
- `CellAnnotation/`: Cell type annotation interface
- `FeatureSets/`: Gene set enrichment analysis
- `ParamSelection/`: Analysis parameter configuration
- `Gallery/`: Save and manage visualization snapshots
- `Logs/`: Display analysis step timing and errors
- `Stats/`: QC statistics and metrics

### Supported Input Formats

The application supports multiple single-cell data formats:
- **Matrix Market** (.mtx with optional genes.tsv/features.tsv)
- **10X HDF5** (10X Genomics format)
- **H5AD** (AnnData format)
- **SummarizedExperiment/SingleCellExperiment** (RDS files from R/Bioconductor)
- **ExperimentHub** (Bioconductor ExperimentHub IDs)
- **ZippedADB** (Zipped ArtifactDB format)
- **.kana files** (Saved analysis state for import/export)

### Analysis Workflow

The standard analysis follows the OSCA (Orchestrating Single-Cell Analysis with Bioconductor) workflow:

1. Quality control and cell filtering
2. Normalization and log-transformation
3. Modeling mean-variance trend
4. Feature selection (highly variable genes)
5. PCA on variable features
6. Graph-based clustering
7. t-SNE and UMAP visualization
8. Marker gene detection per cluster
9. Gene set enrichment analysis
10. Cell type annotation using reference datasets
11. Batch correction/integration (MNN method)
12. Multi-modal support (CITE-seq ADT, CRISPR)

### State Management

- **AppContext** provides global state via React Context API
- Analysis state is managed in workers, not React state
- Parameters (tsne.perplexity, umap.num_neighbors, etc.) flow from AppContext → worker
- Results flow from worker → component state → UI
- Export functionality saves entire analysis state to .kana files
- Import restores saved state including parameters and results

### Service Worker Requirements

The app requires cross-origin isolation for SharedArrayBuffer support:
- `public/serviceworker.js` sets COOP and COEP headers
- Must be served over HTTPS (or localhost for development)
- Service worker caches resources and modifies headers on fetch

### Related Packages

The "Kanaverse" ecosystem:
- **bakana**: Core analysis workflow (this app is a wrapper around it)
- **kanapi**: Node.js WebSocket API for backend analysis
- **kana-formats**: Specification and readers for .kana file formats
- **kanaval**: Validation utilities for analysis results
- **scran.js**: WASM-compiled single-cell analysis libraries

## Code Style

- Uses **Prettier** as the default formatter
- Install Prettier extension if using VS Code
- No strict linting rules enforced beyond Create React App defaults

## Important Implementation Notes

### Working with Workers

When modifying worker code:
- Workers don't have access to DOM or React state
- Use `postMessage` for communication
- Extract transferable buffers when possible to avoid copying large arrays
- Check `helpers.js` for utilities like `postSuccess`, `postError`, `extractBuffers`

### WebAssembly Initialization

- WASM modules (scran.js, bakana) must be initialized before use
- Check `wasmInitialized` state before running analysis
- Initialization happens asynchronously on app load

### Animation Features

Both t-SNE and UMAP support animation mode:
- Set `animate: true` in parameters
- Workers send intermediate iteration results
- Creates smooth visualization of algorithm convergence

### Custom Selections

Users can create custom cell selections in visualizations:
- Stored with key pattern `${code}::SELECTION`
- Can perform marker detection on custom selections
- Separate from cluster-based annotations

### File Format Detection

The preflight system (`preflights` in workers) validates and summarizes input files before full analysis:
- Returns column summaries, cell/feature counts
- Helps users select appropriate columns for downstream analysis
- Critical for H5AD files which can have multiple assays

## Deployment

The application is a static site:
- Build generates static files in `/build` directory
- Can be deployed to GitHub Pages, S3, Netlify, or any static host
- No backend server required
- GitHub Actions workflow (`.github/workflows/node.js.yml`) auto-deploys to GitHub Pages on push to master
