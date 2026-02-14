# DotPlot Hover Window - Annotation Only Mode

**Date:** 2026-02-15
**Status:** Approved
**Author:** Claude Code

## Overview

Simplify the DotPlot floating annotation panel to show only annotation functionality, removing the Stat tab. The ExploreMode will retain the full Tabs interface (Annotation + Stat + future tabs). Additionally, synchronize all annotation editing state between ExploreMode and DotPlot so users can seamlessly switch between pages without losing their work.

## Background

The ClusterAnnotation component currently displays two tabs:
1. **Annotation tab** - Core functionality for annotating clusters
2. **Stat tab** - Statistical visualization of cell proportions across groups

The DotPlot page uses this component in a floating panel, but only needs the core annotation functionality. The ExploreMode uses the same component in a right-side panel and will have additional tabs in the future.

## Requirements

- DotPlot floating panel should show **only** annotation functionality (no Tabs UI, no Stat content)
- ExploreMode should maintain current Tabs interface with both Annotation and Stat tabs
- Support future tab additions in ExploreMode without affecting DotPlot
- **Synchronize all annotation editing state** between ExploreMode and DotPlot, including:
  - Selected origin metadata column
  - New annotation column name
  - Cluster list with current edits
  - All unsaved annotation changes
- Switching between ExploreMode and DotPlot should preserve all editing state
- Maintain backward compatibility

## Design

### AppContext State Synchronization

To synchronize annotation editing state between ExploreMode and DotPlot, add a new global state object in AppContext:

**New State in AppContext:**
```javascript
const [annotationEditState, setAnnotationEditState] = useState({
  selectedMetadata: null,           // Currently selected origin annotation column
  annotationColumnName: "celltype1", // New annotation column name
  clusterList: [],                   // Array of {id, cluster, annotation} objects being edited
  currentAnnotations: {}             // Map of cluster -> annotation for quick lookup
});
```

This state is:
- Shared across both ExploreMode and DotPlot
- Persists when switching between pages
- Updated whenever user edits origin, column name, cluster annotations, or reorders clusters
- Independent of saved annotations (clusterAnnotations) which are only updated on "Anno" button click

### Component Modification: ClusterAnnotation

**New Prop:**
```javascript
onlyAnnotation: PropTypes.bool  // Default: false
```

**Rendering Logic:**

When `onlyAnnotation={true}`:
- Render annotation content directly without Tabs wrapper
- Skip Stat tab state initialization (statGroup, statCelltype, chartOrientation, barWidthRatio)
- Render: collapse button (if provided) + annotation fields + cluster list + action buttons

When `onlyAnnotation={false}` (default):
- Render full Tabs component with Annotation and Stat tabs
- Initialize all state (annotation + stat)
- Support future tab additions

**State Management:**
- Annotation state comes from AppContext: selectedMetadata, annotationColumnName, clusterList, currentAnnotations
- Stat state remains local (only when `!onlyAnnotation`): statGroup, statCelltype, chartOrientation, barWidthRatio, activeTab

### Component Usage

**DotPlot (new):**
```jsx
<ClusterAnnotation
  scranWorker={props.scranWorker}
  setReqAnnotation={setReqAnnotation}
  onlyAnnotation={true}
/>
```

**ExploreMode (unchanged):**
```jsx
<ClusterAnnotation
  scranWorker={scranWorker}
  setReqAnnotation={setReqAnnotation}
  onCollapse={() => setClusterAnnotationCollapsed(true)}
/>
```

### Implementation Structure

```jsx
const ClusterAnnotation = (props) => {
  const {
    annotationCols,
    setAnnotationCols,
    annotationObj,
    setAnnotationObj,
    clusterAnnotations,
    setClusterAnnotations,
    globalClusterOrder,
    setGlobalClusterOrder,
    annotationEditState,      // NEW: Get shared editing state
    setAnnotationEditState,   // NEW: Update shared editing state
  } = useContext(AppContext);

  const { onlyAnnotation = false, onCollapse } = props;

  // Destructure annotation state from AppContext
  const {
    selectedMetadata,
    annotationColumnName,
    clusterList,
    currentAnnotations
  } = annotationEditState;

  // Helper setters to update specific fields in annotationEditState
  const setSelectedMetadata = (value) => {
    setAnnotationEditState(prev => ({ ...prev, selectedMetadata: value }));
  };

  const setAnnotationColumnName = (value) => {
    setAnnotationEditState(prev => ({ ...prev, annotationColumnName: value }));
  };

  const setClusterList = (value) => {
    setAnnotationEditState(prev => ({ ...prev, clusterList: value }));
  };

  const setCurrentAnnotations = (value) => {
    setAnnotationEditState(prev => ({ ...prev, currentAnnotations: value }));
  };

  // Stat-related state remains local (only when not in annotation-only mode)
  const [activeTab, setActiveTab] = useState(onlyAnnotation ? null : "annotation");
  const [statGroup, setStatGroup] = useState(onlyAnnotation ? null : null);
  const [statCelltype, setStatCelltype] = useState(onlyAnnotation ? null : null);
  const [chartOrientation, setChartOrientation] = useState(onlyAnnotation ? null : "vertical");
  const [barWidthRatio, setBarWidthRatio] = useState(onlyAnnotation ? null : 0.27);

  // ... rest of the component logic remains the same
  // All references to selectedMetadata, annotationColumnName, clusterList, currentAnnotations
  // now read from/write to AppContext automatically
```

**Key Changes:**
- Remove local useState for annotation-related state
- Read annotation state from `annotationEditState` in AppContext
- Create helper setters that update the corresponding field in `annotationEditState`
- Stat-related state remains local to ClusterAnnotation component
- All existing logic (drag-and-drop, save, export) works unchanged

**Synchronization Behavior:**
- User edits in ExploreMode → updates AppContext → visible in DotPlot
- User edits in DotPlot → updates AppContext → visible in ExploreMode
- Switching pages preserves all unsaved edits
- Clicking "Anno" saves to clusterAnnotations but keeps annotationEditState for continued editing

## Impact Analysis

**Files Modified:**
1. `src/context/AppContext.js` - Add annotationEditState global state
2. `src/components/ClusterAnnotation/index.js` - Use AppContext state instead of local state, add onlyAnnotation prop and conditional rendering
3. `src/components/DotPlot/index.js` - Pass onlyAnnotation={true} prop

**Files Unchanged:**
- `src/components/ExploreMode/index.js` - Uses default behavior
- `src/components/ClusterAnnotation/annotation.css` - No CSS changes needed

**Backward Compatibility:**
- ✅ ExploreMode continues to work without changes
- ✅ Default behavior (onlyAnnotation=false) maintains current functionality
- ✅ Future tab additions in ExploreMode are unaffected

## Benefits

1. **Cleaner UX for DotPlot** - Only shows what users need (annotation), no navigation overhead
2. **Flexible for ExploreMode** - Retains full Tabs interface for current and future tabs
3. **Maintainable** - Clear separation between annotation-only and full-featured modes
4. **Minimal Changes** - Single prop addition, backward compatible

## Testing Considerations

1. **DotPlot** - Verify floating panel shows only annotation content (no tabs, no stat functionality)
2. **ExploreMode** - Verify both Annotation and Stat tabs work as before
3. **Annotation functionality** - Verify save, export, drag-reorder work in both modes
4. **State Synchronization** - Critical test scenarios:
   - Edit annotation in ExploreMode → switch to DotPlot → verify edits are preserved
   - Edit annotation in DotPlot → switch to ExploreMode → verify edits are preserved
   - Change origin column in ExploreMode → switch to DotPlot → verify same origin selected
   - Change new name in DotPlot → switch to ExploreMode → verify same new name shown
   - Drag-reorder clusters in ExploreMode → switch to DotPlot → verify same order
   - Edit annotations → click "Anno" to save → verify editing state persists for continued editing
5. **Edge cases** - No metadata columns, missing annotation data
