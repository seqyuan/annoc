# Differential Expression Page Implementation Plan

## Overview
Implement a DE analysis page that allows users to compare a target cluster against all others, a specific cluster, or multiple selected clusters using bakana's effect-size-based marker detection.

## Implementation Tasks

### Phase 1: Worker Backend (scran.worker.js)

**Task 1.1: Add DE computation message handler**
- Add new message type `computeDE` to worker
- Extract parameters: annotation, target, compareMode, compareGroups, rankType
- Route to appropriate bakana API based on compareMode

**Task 1.2: Implement comparison mode logic**
- **vs All Others**: Use existing `fetchResults()` from MarkerDetectionState
- **vs One Group**: Use `computeVersus(left, right)` from MarkerDetectionState
- **vs Multiple Groups**: Create temporary merged group and use `scran.scoreMarkers()`

**Task 1.3: Format and return results**
- Use `bakana.formatMarkerResults()` to extract statistics
- Return arrays: genes, lfc, cohen, auc, detected_target, detected_ref, means_target, means_ref
- Send via `postSuccess()` with type `computeDE_DATA`

### Phase 2: Component Structure

**Task 2.1: Create component directory**
```
src/components/DifferentialExpression/
├── index.js          # Main component
├── VolcanoPlot.js    # Canvas-based volcano plot
├── DETable.js        # Virtualized table
└── de.css            # Styles
```

**Task 2.2: Main component (index.js)**
- Accept props: scranWorker, inputData, annotations
- State management: selectedAnnotation, targetGroup, compareMode, compareGroups, results, loading, filters
- Layout: left control panel + right results area (split top/bottom)

**Task 2.3: Control panel UI**
- Annotation selector (dropdown)
- Target group selector (dropdown)
- Compare mode radio buttons (vs All / vs Selected / vs One)
- Conditional UI: multi-select checkboxes or single dropdown based on mode
- Rank type selector (cohen-min, cohen-mean, lfc-mean, auc-mean)
- Run button with loading spinner

### Phase 3: Visualization Components

**Task 3.1: VolcanoPlot component**
- Canvas-based rendering (reference DotPlot implementation)
- X-axis: LFC, Y-axis: |AUC - 0.5| or Cohen's d
- Color coding: gray (non-significant), red (upregulated), blue (downregulated)
- Threshold lines: adjustable LFC and AUC cutoffs
- Interactions: hover tooltip, click to highlight in table
- Responsive sizing with useEffect + ResizeObserver

**Task 3.2: DETable component**
- Columns: Gene, LFC, Cohen's d, AUC, Detected(target)%, Detected(ref)%, Mean(target), Mean(ref)
- Virtual scrolling using react-virtuoso
- Sortable columns (click header to sort)
- Row highlighting when clicked from volcano plot
- Filter controls above table:
  - LFC threshold slider
  - AUC threshold slider
  - Detected% minimum input
  - Up/Down/All toggle buttons

### Phase 4: Download Functionality

**Task 4.1: CSV export buttons**
- "Download All" - all filtered genes with full statistics
- "Download Top N Up" - top N upregulated genes (input field for N)
- "Download Top N Down" - top N downregulated genes
- Use react-csv's CSVLink component (reference Markers implementation)

**Task 4.2: CSV formatting**
- Headers: Gene, LogFC, Cohen_d, AUC, Detected_Target_Pct, Detected_Ref_Pct, Mean_Target, Mean_Ref
- Apply current filters before export
- Sort by selected rank metric

### Phase 5: Integration

**Task 5.1: Add to ExploreMode**
- Add "DE Analysis" button to ExploreMode sidebar
- Pass scranWorker and inputData as props
- Handle navigation state

**Task 5.2: Add to AnalysisMode**
- Add "DE Analysis" button to AnalysisMode sidebar
- Pass scranWorker and inputData as props
- Ensure worker is ready before allowing access

**Task 5.3: Route configuration**
- Add route if using React Router
- Or use conditional rendering based on sidebar selection

### Phase 6: Testing & Polish

**Task 6.1: Manual testing**
- Test all three comparison modes with sample data
- Verify volcano plot interactions
- Test table sorting and filtering
- Verify CSV downloads contain correct data
- Test with different annotation columns

**Task 6.2: Error handling**
- Handle worker errors gracefully
- Show user-friendly messages for invalid selections
- Validate that target group exists in selected annotation
- Handle empty results

**Task 6.3: Performance optimization**
- Debounce filter changes
- Optimize canvas redraws
- Ensure virtual scrolling works smoothly with large gene lists

**Task 6.4: UI polish**
- Consistent styling with existing components
- Loading states and progress indicators
- Responsive layout for different screen sizes
- Tooltips for controls

## Dependencies
- Existing: react-virtuoso, react-csv, bakana, scran.js
- No new dependencies required

## Estimated Complexity
- Worker backend: Medium (reusing existing bakana APIs)
- UI components: Medium-High (volcano plot canvas rendering)
- Integration: Low (following existing patterns)

## Success Criteria
- Users can select any cluster and compare against others using all three modes
- Volcano plot accurately visualizes effect sizes
- Table filtering works correctly
- CSV downloads contain accurate statistics
- Component works in both ExploreMode and AnalysisMode
