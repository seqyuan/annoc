# DotPlot Hover Window - Annotation Only Mode

**Date:** 2026-02-15
**Status:** Approved
**Author:** Claude Code

## Overview

Simplify the DotPlot floating annotation panel to show only annotation functionality, removing the Stat tab. The ExploreMode will retain the full Tabs interface (Annotation + Stat + future tabs).

## Background

The ClusterAnnotation component currently displays two tabs:
1. **Annotation tab** - Core functionality for annotating clusters
2. **Stat tab** - Statistical visualization of cell proportions across groups

The DotPlot page uses this component in a floating panel, but only needs the core annotation functionality. The ExploreMode uses the same component in a right-side panel and will have additional tabs in the future.

## Requirements

- DotPlot floating panel should show **only** annotation functionality (no Tabs UI, no Stat content)
- ExploreMode should maintain current Tabs interface with both Annotation and Stat tabs
- Support future tab additions in ExploreMode without affecting DotPlot
- Maintain backward compatibility

## Design

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
- Always initialize: selectedMetadata, annotationColumnName, clusterList, currentAnnotations
- Only when `!onlyAnnotation`: initialize statGroup, statCelltype, chartOrientation, barWidthRatio, activeTab

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
  const { onlyAnnotation = false } = props;

  // Always initialize annotation state
  const [selectedMetadata, setSelectedMetadata] = useState(null);
  const [annotationColumnName, setAnnotationColumnName] = useState("celltype1");
  const [clusterList, setClusterList] = useState([]);
  const [currentAnnotations, setCurrentAnnotations] = useState({});

  // Only initialize stat state when not in annotation-only mode
  const [activeTab, setActiveTab] = useState(onlyAnnotation ? null : "annotation");
  const [statGroup, setStatGroup] = useState(onlyAnnotation ? null : null);
  const [statCelltype, setStatCelltype] = useState(onlyAnnotation ? null : null);
  const [chartOrientation, setChartOrientation] = useState(onlyAnnotation ? null : "vertical");
  const [barWidthRatio, setBarWidthRatio] = useState(onlyAnnotation ? null : 0.27);

  // Annotation panel content
  const annotationPanel = (
    <>
      <div className="cluster-annotation-fields">
        {/* Origin and new name fields */}
      </div>
      <Divider />
      {clusterList.length > 0 ? (
        <>
          <div className="cluster-list">
            {/* Sortable cluster rows */}
          </div>
          <div className="cluster-annotation-actions">
            {/* Save and Export buttons */}
          </div>
        </>
      ) : (
        <Callout intent="primary" icon="info-sign">
          Select a metadata column to begin annotation.
        </Callout>
      )}
    </>
  );

  // Conditional rendering based on mode
  if (onlyAnnotation) {
    return (
      <div className="cluster-annotation-container">
        {onCollapse && (
          <div style={{ position: 'absolute', top: '5px', right: '5px', zIndex: 10 }}>
            <Button minimal small icon="chevron-left" onClick={onCollapse} />
          </div>
        )}
        {nonNumericCols.length === 0 ? (
          <Callout intent="warning" icon="warning-sign">
            No non-numeric metadata columns available for annotation.
          </Callout>
        ) : (
          annotationPanel
        )}
      </div>
    );
  }

  // Default mode with Tabs
  return (
    <div className="cluster-annotation-container">
      {onCollapse && (
        <div style={{ position: 'absolute', top: '5px', right: '5px', zIndex: 10 }}>
          <Button minimal small icon="chevron-left" onClick={onCollapse} />
        </div>
      )}
      {nonNumericCols.length === 0 ? (
        <Callout intent="warning" icon="warning-sign">
          No non-numeric metadata columns available for annotation.
        </Callout>
      ) : (
        <Tabs
          id="cluster-annotation-tabs"
          selectedTabId={activeTab}
          onChange={(newTabId) => setActiveTab(newTabId)}
          className="cluster-annotation-tabs"
        >
          <Tab id="annotation" title="Annotation" panel={annotationPanel} />
          <Tab id="stat" title="Stat" panel={/* stat panel content */} />
        </Tabs>
      )}
    </div>
  );
};
```

## Impact Analysis

**Files Modified:**
1. `src/components/ClusterAnnotation/index.js` - Add onlyAnnotation prop and conditional rendering
2. `src/components/DotPlot/index.js` - Pass onlyAnnotation={true} prop

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
4. **Edge cases** - No metadata columns, missing annotation data
