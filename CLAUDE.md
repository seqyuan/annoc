# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AnnoCluster** is a client-side single-cell RNA-seq cluster annotation assistant that runs entirely in the browser using WebAssembly. This application bridges the gap between computational analysis and biological interpretation by helping non-programming users annotate and name cell clusters from unsupervised clustering results.

### Core Purpose and User Workflow

AnnoCluster abstracts away the programming complexity of single-cell analysis, enabling biologists to:

1. **Load Data**: Import pre-computed clustering results from various formats (H5AD, RDS, 10X, etc.)
2. **Explore Clusters**: Visualize clusters in reduced dimensions (UMAP/t-SNE)
3. **Identify Cell Types**: Use multiple evidence sources to determine cluster identity:
   - Search and visualize canonical marker gene expression across clusters
   - Upload and filter top marker lists to assess specificity
   - View marker expression patterns in DotPlot for specificity assessment
   - Check QC metrics via VlnPlot to identify low-quality clusters
   - Detect proliferating clusters (high TOP2A/MKI67 expression)
4. **AI-Assisted Annotation**: Export cluster-specific markers to AI models (e.g., DeepSeek, ChatGPT) for cell type suggestions
5. **Manual Annotation**: Assign biologically meaningful names to clusters based on evidence

### Key User Scenarios

**Scenario 1: High-Specificity Markers**
- Cluster shows specific expression of known markers (e.g., CD3D/CD3E for T cells)
- User searches these genes → sees clear cluster-specific expression
- Confidently names cluster as "T cells"

**Scenario 2: Non-Specific Top Markers**
- Cluster's top markers are expressed across multiple clusters
- Suggests potential low-quality cluster or doublets
- User checks VlnPlot for QC metrics (nCount_RNA, nFeature_RNA, percent.mt)
- If QC metrics are poor → label as "Low Quality" or exclude from analysis

**Scenario 3: Proliferating Cells**
- Cluster highly expresses cell cycle markers (TOP2A, MKI67, PCNA)
- Lacks other specific cell type markers
- User names cluster as "Proliferating cells" or "Cycling [cell type]"

**Scenario 4: AI-Assisted Identification**
- Cluster has specific markers but user unsure of cell type
- User uploads top markers → filters in DotPlot for specificity
- Exports specific markers → asks AI: "What cell type expresses these markers: [gene list]?"
- AI suggests cell type → user validates and annotates

### Design Philosophy

- **No Programming Required**: All analysis accessible through GUI
- **Evidence-Based Annotation**: Multiple visualization tools to build confidence
- **Privacy-First**: All computation runs locally in browser (no data upload to servers)
- **Reproducible**: Save and reload analysis states (.kana files)
- **Flexible**: Works with various input formats and analysis pipelines

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
- `ExploreMode/`: Interface for exploring loaded results - **PRIMARY USER INTERFACE**
- `Plots/`: Visualization components
  - `DimPlot`: UMAP/t-SNE visualization with gene expression overlay
  - `DotPlot`: Marker gene expression specificity across clusters (key for annotation)
  - `VlnPlot`: QC metrics distribution by cluster (identify low-quality clusters)
  - `Histogram`: Distribution plots
- `Markers/`: Marker gene detection and display
- `TopMarker/`: Top marker gene heatmap and filtering (identify cluster-specific markers)
- `CellAnnotation/`: Cell type annotation interface
- `FeatureSets/`: Gene set enrichment analysis
- `ParamSelection/`: Analysis parameter configuration
- `Gallery/`: Save and manage visualization snapshots
- `Logs/`: Display analysis step timing and errors
- `Stats/`: QC statistics and metrics
- `Help/`: User guide for cluster annotation workflow (NEW)

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

### Cluster Annotation Workflow

The application is designed around a systematic cluster annotation workflow:

1. **Initial Exploration** (DimPlot)
   - Visualize all clusters in UMAP/t-SNE space
   - Assess cluster separation and quality
   - Identify potential doublets or low-quality clusters

2. **Marker Gene Search** (DimPlot + Gene Expression)
   - Search canonical markers for expected cell types
   - Overlay expression on dimension plot
   - Identify clusters with specific marker expression

3. **Top Marker Analysis** (TopMarker)
   - View heatmap of top differentially expressed genes per cluster
   - Upload external marker lists for comparison
   - Filter markers by expression specificity

4. **Specificity Assessment** (DotPlot)
   - Visualize marker expression across all clusters
   - Assess specificity: is marker unique to one cluster?
   - Non-specific markers suggest:
     - Low-quality cells (ribosomal/mitochondrial genes)
     - Doublets (markers from multiple cell types)
     - Proliferating cells (cell cycle genes across types)

5. **Quality Control Check** (VlnPlot)
   - When top markers are non-specific, check QC metrics:
     - `nCount_RNA`: Total UMI counts per cell
     - `nFeature_RNA`: Number of detected genes
     - `percent.mt`: Mitochondrial gene percentage
   - Low nCount/nFeature + high percent.mt → Low-quality cluster
   - Decision: exclude or label as "Low Quality"

6. **Proliferation Detection**
   - High expression of: TOP2A, MKI67, PCNA, CDK1, CCNB1
   - Lack of other specific markers
   - Label as "Proliferating cells" or "Cycling [cell type]"

7. **AI-Assisted Annotation**
   - Export cluster-specific markers
   - Query AI models: "What cell type specifically expresses: [gene list]?"
   - Validate AI suggestions with literature/databases
   - Apply annotation with confidence

8. **Manual Annotation**
   - Assign biologically meaningful names
   - Document evidence for each annotation
   - Save annotated results for downstream analysis

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
