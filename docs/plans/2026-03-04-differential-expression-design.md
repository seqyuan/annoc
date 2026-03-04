# Differential Expression (DE) Page Design

## Overview

Add a DE analysis page to AnnoC that allows users to select a target cluster and compare it against all others, a specific cluster, or multiple selected clusters. Uses bakana's effect-size-based marker detection system (Cohen's d, AUC, LFC) instead of traditional Wilcoxon p-values. Provides an interactive volcano plot, filterable table, and CSV download functionality.

## Requirements

- **Comparison modes**: One vs Rest, One vs One, One vs Multiple
- **Results display**: Volcano plot (top) + filterable table (bottom), with click-to-highlight linkage
- **Filtering**: LFC threshold, AUC threshold, detected% minimum, up/down regulation toggle
- **Download**: All filtered genes, Top N up-regulated, Top N down-regulated (CSV)
- **Integration**: Available in both ExploreMode and AnalysisMode as an independent reusable component

## Component Structure

```
src/components/DifferentialExpression/
├── index.js          # Main component (control panel + results area)
├── VolcanoPlot.js    # Volcano plot (Canvas-based)
├── DETable.js        # Differential gene table (virtualized)
└── de.css            # Styles
```

## Control Panel (Left Side)

| Control | Type | Description |
|---------|------|-------------|
| Annotation | HTMLSelect | Choose annotation column (reuse `getSuppliedCols`/`getComputedCols`) |
| Target Group | HTMLSelect | Select the primary cluster to analyze |
| Compare Mode | RadioGroup | `vs All Others` (default), `vs Selected Groups`, `vs One Group` |
| Compare Groups | Multi-checkbox or HTMLSelect | Visible when mode is `vs Selected Groups` or `vs One Group` |
| Rank Effect | HTMLSelect | `cohen-min`, `cohen-mean`, `lfc-mean`, `auc-mean`, etc. |
| Run Button | Button | Triggers DE computation |

## Results Area (Right Side)

### Volcano Plot (Upper)

- **X-axis**: LFC (log-fold change)
- **Y-axis**: Cohen's d (effect size)
- **Point color**: Gray (not significant), Red (up-regulated), Blue (down-regulated)
- **Threshold lines**: Adjustable LFC and Cohen's d cutoffs
- **Interaction**: Hover shows gene name tooltip, click highlights row in table
- **Rendering**: Canvas-based, following DotPlot implementation pattern

### DE Table (Lower)

| Column | Description |
|--------|-------------|
| Gene | Gene name/symbol |
| LFC | Log-fold change (mean summary) |
| Cohen's d | Effect size |
| AUC | Area under curve (equivalent to Wilcoxon U statistic) |
| Detected (target) | % cells with expression in target group |
| Detected (ref) | % cells with expression in reference group |
| Mean (target) | Mean expression in target group |
| Mean (ref) | Mean expression in reference group |

- Virtual scrolling via `react-virtuoso` (already in project)
- Column header click to sort
- Filter controls: LFC slider, AUC slider, Detected% minimum, Up/Down/All toggle

### Download Options

- **Download All**: All filtered genes with full statistics (CSV via `react-csv`)
- **Download Top N Up**: Top N up-regulated genes
- **Download Top N Down**: Top N down-regulated genes

## Worker Communication

### Frontend to Worker

```js
{
  type: "computeDE",
  payload: {
    annotation,      // annotation column name
    target,          // target group label
    compareMode,     // "rest" | "one" | "multiple"
    compareGroups,   // array of group labels (for "one" or "multiple" mode)
    rankType,        // e.g. "cohen-min-rank"
    modality         // "RNA" | "ADT" | "CRISPR"
  }
}
```

### Worker to Frontend

```js
{
  type: "computeDE_DATA",
  resp: {
    success: true,
    data: {
      genes: string[],
      lfc: Float64Array,
      cohen: Float64Array,
      auc: Float64Array,
      detected_target: Float64Array,
      detected_ref: Float64Array,
      means_target: Float64Array,
      means_ref: Float64Array
    }
  }
}
```

### Worker Implementation Logic

| Mode | Strategy |
|------|----------|
| vs All Others | Call `fetchResults()` on existing marker detection, use `formatMarkerResults()` for target group |
| vs One Group | Call `computeVersus(targetIndex, otherIndex)` |
| vs Multiple | Merge selected groups into a virtual "right" group by modifying cluster array, create temporary `MarkerDetectionStandalone` instance |

For **vs Multiple** implementation detail:
1. Get annotation vector via `scran.factorize(getAnnotation(annotation))`
2. Create new cluster array: target cells = 0, selected comparison cells = 1, others excluded
3. Use `scran.scoreMarkers()` on the subsetted matrix with the binary grouping
4. Extract results for group 0 (target)

## Integration

### ExploreMode (src/components/ExploreMode/index.js)

- Add "DE Analysis" button to sidebar navigation
- Pass `scranWorker` (explorer.worker.js) as prop

### AnalysisMode (src/components/AnalysisMode/index.js)

- Add "DE Analysis" button to sidebar navigation
- Pass `scranWorker` (scran.worker.js) as prop

### Worker Handler

Add message handler in both `scran.worker.js` and `explorer.worker.js`:
- Handle `computeDE` message type
- Reuse existing `getAnnotation()`, `getMarkerStandAloneForAnnot()`, `scran.factorize()` utilities

## Dependencies (already in project)

- `react-virtuoso` - virtual scrolling for table
- `react-csv` (CSVLink) - CSV download
- `d3` - color scales and data utilities
- `@blueprintjs/core` - UI components
