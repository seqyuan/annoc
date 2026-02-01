# DotPlot and Cluster Annotation Features Design

**Date:** 2026-01-31
**Status:** Approved
**Author:** Claude Code

## Overview

This document describes the design for two new features in the Kana single-cell analysis application:

1. **DotPlot Tab**: A new page for visualizing gene expression across clusters using dotplot visualization
2. **Annotation Panel**: A panel in EXPLORE mode for manually annotating clusters with cell types

## Architecture Overview

### DotPlot Feature
- **New sidebar tab**: Add "DOTPLOT" button between EXPLORE and PARAMS in the left sidebar
- **New component**: Create `src/components/DotPlot/index.js` as the main dotplot interface
- **Worker integration**: Extend `explorer.worker.js` to handle batch gene expression requests for dotplot visualization
- **Data flow**: User pastes gene list → Worker fetches expression data for all genes → Component renders dotplot using D3.js or Canvas

### Annotation Panel Feature
- **Layout modification**: Add right panel to ExploreMode using nested SplitPane (similar to AnalysisMode's structure)
- **New component**: Create `src/components/ClusterAnnotation/index.js` for the annotation interface
- **Drag-and-drop**: Use `@dnd-kit/core` library for reorderable cluster list
- **State management**: Store cluster order and annotations in AppContext, persist to worker session
- **Worker integration**: Add `saveCustomAnnotation` and `getCustomAnnotation` message handlers to store/retrieve custom annotations

### Key Architectural Decisions
1. **Reusable patterns**: Follow existing component patterns (MarkerPlot, CellAnnotation) for consistency
2. **Worker communication**: Use the established `postMessage` pattern for all data requests
3. **Global ordering**: Store cluster display order in AppContext so all components can access it
4. **Session persistence**: Annotations saved to worker state, exportable as CSV, but lost on page reload unless re-imported

## DotPlot Component Details

### Component Structure (`src/components/DotPlot/index.js`)

**UI Layout:**
```
┌─────────────────────────────────────────┐
│ DotPlot                                 │
├─────────────────────────────────────────┤
│ [Annotation Dropdown ▼]                │
│                                         │
│ Gene Input:                             │
│ ┌─────────────────────────────────────┐ │
│ │ Paste gene names here...            │ │
│ │ (one per line or comma-separated)   │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ [Upload File] [Clear] [Generate Plot]  │
├─────────────────────────────────────────┤
│                                         │
│        Dotplot Visualization            │
│   (Canvas/SVG with D3.js rendering)     │
│                                         │
│   Genes →                               │
│ C ○ ● ○ ●                              │
│ l ● ○ ● ○                              │
│ u ○ ● ● ●                              │
│ s ● ● ○ ○                              │
│ t                                       │
│ e                                       │
│ r                                       │
│ s                                       │
│ ↓                                       │
│                                         │
│ Legend: Size = % expressed              │
│         Color = Avg expression          │
└─────────────────────────────────────────┘
```

**Key Features:**
- **Annotation selector**: Independent dropdown to choose which annotation column (clusters) to display on Y-axis
- **Gene input**: TextArea for pasting gene lists, supports newline or comma separation
- **File upload**: Button to upload .txt file with gene names
- **Validation**: Check genes exist in dataset, show warnings for missing genes
- **Visualization**: Canvas-based dotplot with:
  - Dot size = percentage of cells expressing gene in cluster
  - Dot color = average expression level (gradient scale)
  - Hover tooltips showing exact values
  - Export button to save as PNG/SVG

**State Management:**
```javascript
const [selectedAnnotation, setSelectedAnnotation] = useState(null);
const [geneInput, setGeneInput] = useState("");
const [geneList, setGeneList] = useState([]);
const [dotplotData, setDotplotData] = useState(null);
const [loading, setLoading] = useState(false);
```

### Left Sidebar Integration

Add new button in `src/components/ExploreMode/index.js` between EXPLORE and PARAMS:

```javascript
<div className={showPanel === "dotplot" ? "item-sidebar-intent" : "item-sidebar"}>
  <Tooltip2
    content="Generate dotplot visualizations"
    placement={"right"}
    intent={showPanel === "dotplot" ? "primary" : ""}
  >
    <div className="item-button-group">
      <Button
        icon={"dot"}
        onClick={() => setShowPanel("dotplot")}
        intent={showPanel === "dotplot" ? "primary" : "none"}
        disabled={selectedRedDim === null}
      />
      <span>DOTPLOT</span>
    </div>
  </Tooltip2>
</div>
```

## Annotation Panel Component Details

### Component Structure (`src/components/ClusterAnnotation/index.js`)

**UI Layout:**
```
┌─────────────────────────────────────────┐
│ Annotation                              │
├─────────────────────────────────────────┤
│ Select metadata column:                 │
│ [seurat_clusters ▼]                     │
│                                         │
│ Annotation column name:                 │
│ [celltype_____________]                 │
├─────────────────────────────────────────┤
│ Cluster List (draggable):               │
│ ┌─────────────────────────────────────┐ │
│ │ ≡ Cluster 0  [T cell________]       │ │
│ │ ≡ Cluster 1  [B cell________]       │ │
│ │ ≡ Cluster 2  [Monocyte______]       │ │
│ │ ≡ Cluster 3  [NK cell_______]       │ │
│ │ ≡ Cluster 4  [________________]     │ │
│ │ ...                                 │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Anno] [Export]                         │
└─────────────────────────────────────────┘
```

**Key Features:**
- **Metadata selector**: Dropdown showing only non-numeric columns from obs/metadata
- **Column name input**: Text input at top for naming the annotation column
- **Draggable rows**: Each cluster row has:
  - Drag handle (≡ icon)
  - Cluster label (read-only)
  - Annotation input field (editable)
- **Drag behavior**: Uses `@dnd-kit/core` for smooth drag-and-drop
- **Global ordering**: When reordered, updates AppContext state that affects all visualizations
- **Save button**: "Anno" button saves annotations to worker session and AppContext
- **Export button**: Downloads CSV with current order: `cluster,celltype`

**State Management:**
```javascript
const [selectedMetadata, setSelectedMetadata] = useState(null);
const [annotationColumnName, setAnnotationColumnName] = useState("celltype");
const [clusterList, setClusterList] = useState([]); // [{id, label, annotation}]
const [clusterOrder, setClusterOrder] = useState([]); // Global order array
```

**Integration with AppContext:**
```javascript
// Add to AppContext.js
const [clusterAnnotations, setClusterAnnotations] = useState({});
const [globalClusterOrder, setGlobalClusterOrder] = useState({});
```

### ExploreMode Layout Modification

Modify the EXPLORE panel layout in `src/components/ExploreMode/index.js`:

```javascript
{showPanel === "explore" && (
  <ResizeSensor onResize={handleResize}>
    <SplitPane
      defaultSize={windowWidth >= 1200 ? 300 : 275}
      split={windowWidth >= 1200 ? "vertical" : "horizontal"}
      primary="second"
      allowResize={false}
    >
      <SplitPane
        defaultSize={360}
        split="vertical"
        primary="first"
        allowResize={false}
      >
        <ClusterAnnotation {...annotationProps} />
        <div className={showDimPlotLoader ? "results-dims effect-opacitygrayscale" : "results-dims"}>
          <DimPlot {...dimPlotProps} />
        </div>
      </SplitPane>
      <div className="results-gallery" style={getGalleryStyles()}>
        <Gallery {...galleryProps} />
      </div>
    </SplitPane>
  </ResizeSensor>
)}
```

## Worker Integration Details

### New Worker Message Types for `explorer.worker.js`

**1. Batch Gene Expression for DotPlot:**
```javascript
// Request from UI
{
  type: "getBatchGeneExpression",
  payload: {
    genes: [0, 5, 10, 23], // gene indices
    annotation: "seurat_clusters",
    modality: "RNA"
  }
}

// Response to UI
{
  type: "setBatchGeneExpression",
  resp: {
    genes: [0, 5, 10, 23],
    clusters: ["0", "1", "2", "3"],
    data: {
      // For each gene, for each cluster:
      // avgExpression and percentExpressed
      0: { "0": {avg: 2.5, pct: 0.8}, "1": {avg: 1.2, pct: 0.4}, ... },
      5: { "0": {avg: 3.1, pct: 0.9}, "1": {avg: 0.5, pct: 0.2}, ... },
      ...
    }
  }
}
```

**2. Save Custom Annotations:**
```javascript
// Request from UI
{
  type: "saveCustomAnnotation",
  payload: {
    columnName: "celltype",
    annotations: {
      "0": "T cell",
      "1": "B cell",
      "2": "Monocyte"
    },
    sourceAnnotation: "seurat_clusters",
    clusterOrder: ["0", "1", "2", "3", "4"]
  }
}

// Response to UI
{
  type: "saveCustomAnnotation_DATA",
  resp: {
    success: true,
    columnName: "celltype"
  }
}
```

**3. Get Custom Annotations:**
```javascript
// Request from UI
{
  type: "getCustomAnnotation",
  payload: {
    columnName: "celltype"
  }
}

// Response to UI
{
  type: "getCustomAnnotation_DATA",
  resp: {
    annotations: {...},
    clusterOrder: [...]
  }
}
```

### Worker Implementation Strategy

**In `explorer.worker.js`:**
- Add `custom_annotations_state = {}` to store user annotations
- Implement `getBatchGeneExpression` handler that loops through genes and clusters, computing average expression and percentage expressed
- Implement `saveCustomAnnotation` handler that stores annotations in memory
- Implement `getCustomAnnotation` handler that retrieves stored annotations

**Algorithm for Batch Gene Expression:**
```javascript
// For each gene index:
//   Get expression vector from dataset.matrix.get(modality).row(geneIdx)
//   For each cluster in annotation:
//     Filter cells belonging to cluster
//     Compute average expression (mean of non-zero values)
//     Compute percentage expressed (count non-zero / total cells in cluster)
```

## Data Flow and State Management

### DotPlot Data Flow

```
User Action → Component → Worker → Component → Render
─────────────────────────────────────────────────────
1. User pastes genes
   → Parse gene names
   → Validate against genesInfo
   → Convert to gene indices

2. User selects annotation
   → setSelectedAnnotation("seurat_clusters")

3. User clicks "Generate Plot"
   → postMessage({type: "getBatchGeneExpression", ...})
   → Worker computes avg/pct for each gene×cluster
   → Worker sends back dotplot data
   → Component receives data
   → Render dotplot with D3.js/Canvas

4. User hovers over dot
   → Show tooltip: "Gene: CD3D, Cluster: 0, Avg: 2.5, Pct: 80%"

5. User exports
   → Generate PNG/SVG from canvas
```

### Annotation Panel Data Flow

```
User Action → Component → AppContext → Worker → Global Update
──────────────────────────────────────────────────────────────
1. User selects metadata column
   → Request annotation data if not cached
   → Display unique cluster values

2. User types annotations
   → Update local state (clusterList)

3. User drags to reorder
   → Update clusterOrder in local state
   → Update globalClusterOrder in AppContext
   → All components using this annotation re-render with new order

4. User clicks "Anno"
   → postMessage({type: "saveCustomAnnotation", ...})
   → Worker stores in custom_annotations_state
   → Update AppContext.clusterAnnotations
   → Update annotationCols to include new column
   → New column appears in all annotation dropdowns

5. User clicks "Export"
   → Generate CSV from clusterList
   → Download as "annotations.csv"
```

### AppContext State Additions

Add to `src/context/AppContext.js`:

```javascript
const [clusterAnnotations, setClusterAnnotations] = useState({});
// Structure: { "celltype": { "0": "T cell", "1": "B cell", ... } }

const [globalClusterOrder, setGlobalClusterOrder] = useState({});
// Structure: { "seurat_clusters": ["0", "1", "2", ...] }
```

## Implementation Steps

### Phase 1: DotPlot Feature
1. Create `src/components/DotPlot/index.js` component
2. Create `src/components/DotPlot/dotplot.css` styles
3. Add DOTPLOT button to left sidebar in ExploreMode
4. Implement gene input parsing and validation
5. Add `getBatchGeneExpression` handler to `explorer.worker.js`
6. Implement dotplot rendering with D3.js/Canvas
7. Add export functionality (PNG/SVG)

### Phase 2: Annotation Panel Feature
1. Install `@dnd-kit/core` and `@dnd-kit/sortable` packages
2. Create `src/components/ClusterAnnotation/index.js` component
3. Create `src/components/ClusterAnnotation/annotation.css` styles
4. Add state to AppContext for annotations and cluster order
5. Modify ExploreMode layout to include ClusterAnnotation panel
6. Implement drag-and-drop reordering
7. Add `saveCustomAnnotation` and `getCustomAnnotation` handlers to worker
8. Implement CSV export functionality
9. Update all components to respect globalClusterOrder

### Phase 3: Integration and Testing
1. Test DotPlot with various gene lists and annotations
2. Test Annotation panel drag-and-drop behavior
3. Verify global cluster ordering affects all visualizations
4. Test annotation save/export functionality
5. Test edge cases (missing genes, empty annotations, etc.)

## Dependencies

### New NPM Packages Required
- `@dnd-kit/core`: ^6.0.0 - Core drag-and-drop functionality
- `@dnd-kit/sortable`: ^7.0.0 - Sortable list utilities
- `@dnd-kit/utilities`: ^3.2.0 - Helper utilities

### Existing Dependencies Used
- `d3`: For dotplot visualization
- `react-split-pane`: For layout management
- `@blueprintjs/core`: For UI components
- `react-csv`: For CSV export (or implement custom)

## Technical Considerations

### Performance
- **DotPlot**: For large gene lists (>100 genes), consider pagination or virtualization
- **Worker computation**: Batch gene expression computation may take time for large datasets; show loading indicator
- **Canvas rendering**: Use Canvas instead of SVG for better performance with many dots

### Error Handling
- **Missing genes**: Show warning list of genes not found in dataset
- **Invalid input**: Validate gene input format before sending to worker
- **Worker errors**: Handle computation errors gracefully with user-friendly messages

### User Experience
- **Loading states**: Show spinners during worker computation
- **Validation feedback**: Real-time feedback on gene input validity
- **Drag preview**: Show visual feedback during cluster reordering
- **Tooltips**: Informative tooltips on all interactive elements

### Future Enhancements
- **DotPlot customization**: Allow users to adjust dot size scale, color scheme
- **Annotation import**: Allow importing annotations from CSV file
- **Annotation history**: Undo/redo functionality for annotations
- **Multiple annotation columns**: Support creating multiple annotation columns
- **Cluster merging**: Allow merging clusters in annotation panel

## Files to Create

1. `src/components/DotPlot/index.js`
2. `src/components/DotPlot/dotplot.css`
3. `src/components/ClusterAnnotation/index.js`
4. `src/components/ClusterAnnotation/annotation.css`

## Files to Modify

1. `src/components/ExploreMode/index.js` - Add DOTPLOT button and ClusterAnnotation panel
2. `src/context/AppContext.js` - Add annotation and cluster order state
3. `src/workers/explorer.worker.js` - Add new message handlers
4. `package.json` - Add @dnd-kit dependencies

## Success Criteria

- Users can create dotplot visualizations by pasting gene lists
- Users can select any annotation column for dotplot Y-axis
- Users can manually annotate clusters with cell type labels
- Users can drag to reorder clusters, affecting all visualizations globally
- Users can save annotations to session and export as CSV
- All features work smoothly without blocking the UI
- Code follows existing patterns and conventions in the codebase
