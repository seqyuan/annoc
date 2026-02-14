# DotPlot Annotation-Only Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add annotation-only mode to ClusterAnnotation component, removing Stat tab from DotPlot while keeping full Tabs interface in ExploreMode. Synchronize all annotation editing state between ExploreMode and DotPlot using AppContext.

**Architecture:** Add `annotationEditState` global state in AppContext to store all annotation editing state (origin, column name, cluster list, current annotations). Add optional `onlyAnnotation` prop to ClusterAnnotation component. When true, render annotation content directly without Tabs wrapper. When false (default), maintain current Tabs structure. Both ExploreMode and DotPlot share the same editing state.

**Tech Stack:** React, Blueprint.js, @dnd-kit/core, React Context API

---

## Task 1: Add Annotation Edit State to AppContext

**Goal:** Add `annotationEditState` global state to AppContext to enable synchronization between ExploreMode and DotPlot.

**Files:**
- Modify: `src/context/AppContext.js:73-74`
- Modify: `src/context/AppContext.js:241-243`

**Step 1: Read current AppContext**

Read: `src/context/AppContext.js`
Expected: Current clusterAnnotations and globalClusterOrder state around line 73

**Step 2: Add annotationEditState state**

Add new state after clusterAnnotations (around line 73):

```javascript
  // cluster annotations and ordering
  const [clusterAnnotations, setClusterAnnotations] = useState({});
  const [globalClusterOrder, setGlobalClusterOrder] = useState({});

  // annotation editing state (shared between ExploreMode and DotPlot)
  const [annotationEditState, setAnnotationEditState] = useState({
    selectedMetadata: null,
    annotationColumnName: "celltype1",
    clusterList: [],
    currentAnnotations: {}
  });
```

**Step 3: Add to Context Provider value**

Update the Context Provider value (around line 241) to include the new state:

```javascript
        annotationObj,
        setAnnotationObj,
        clusterAnnotations,
        setClusterAnnotations,
        globalClusterOrder,
        setGlobalClusterOrder,
        annotationEditState,
        setAnnotationEditState,
```

**Step 4: Verify app still runs**

Run: `npm start`
Expected: App starts successfully, no console errors

**Step 5: Commit AppContext changes**

```bash
git add src/context/AppContext.js
git commit -m "feat: add annotationEditState to AppContext

Add global state for annotation editing (origin, column name, cluster
list, current annotations) to enable synchronization between ExploreMode
and DotPlot.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Convert ClusterAnnotation to Use AppContext State

**Goal:** Replace ClusterAnnotation's local annotation state with shared AppContext state to enable synchronization.

**Files:**
- Modify: `src/components/ClusterAnnotation/index.js:330-345`

**Step 1: Add annotationEditState to Context destructuring**

At line 330 (start of ClusterAnnotation component), add annotationEditState to Context:

```javascript
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
    annotationEditState,       // NEW
    setAnnotationEditState,    // NEW
  } = useContext(AppContext);

  const { onlyAnnotation = false, onCollapse } = props;
```

**Step 2: Remove local annotation state and create setters**

Replace the local useState declarations (lines 342-345) with destructuring from AppContext and helper setters:

Remove:
```javascript
  const [selectedMetadata, setSelectedMetadata] = useState(null);
  const [annotationColumnName, setAnnotationColumnName] = useState("celltype1");
  const [clusterList, setClusterList] = useState([]);
  const [currentAnnotations, setCurrentAnnotations] = useState({});
```

Replace with:
```javascript
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
    setAnnotationEditState(prev => ({
      ...prev,
      clusterList: typeof value === 'function' ? value(prev.clusterList) : value
    }));
  };

  const setCurrentAnnotations = (value) => {
    setAnnotationEditState(prev => ({
      ...prev,
      currentAnnotations: typeof value === 'function' ? value(prev.currentAnnotations) : value
    }));
  };
```

Note: The setters support both direct values and updater functions (for compatibility with existing code that uses functional updates like `setClusterList(items => ...)`).

**Step 3: Verify app still runs**

Run: `npm start`
Expected: App starts successfully, no console errors

**Step 4: Test annotation state in ExploreMode**

Manual test:
1. Navigate to ExploreMode
2. Open cluster annotation panel
3. Select an origin column
4. Edit some cluster annotations
5. Verify annotations are editable

Expected: Annotation editing works (state now comes from AppContext)

**Step 5: Commit state conversion**

```bash
git add src/components/ClusterAnnotation/index.js
git commit -m "feat: use AppContext state for annotation editing

Replace local useState with AppContext annotationEditState to enable
synchronization. Create helper setters that support both direct values
and updater functions.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Extract Annotation Panel Content

**Goal:** Refactor ClusterAnnotation to separate annotation panel JSX into a reusable variable, preparing for conditional rendering.

**Files:**
- Modify: `src/components/ClusterAnnotation/index.js:797-874`

**Step 1: Read current ClusterAnnotation component**

Read: `src/components/ClusterAnnotation/index.js`
Expected: Current Tab structure at lines 797-874 (annotation tab panel)

**Step 2: Extract annotation panel JSX into a constant**

Locate the annotation tab panel (currently inline in Tab component around line 800-874) and extract it into a `const annotationPanel` variable before the return statement (around line 770).

Add after line 768 (after `const statData = calculateStatData();`):

```javascript
  const statData = calculateStatData();

  // Annotation panel content (extracted for reuse in both modes)
  const annotationPanel = (
    <>
      <div className="cluster-annotation-fields">
        <Label className="cluster-field-origin">
          origin:
          <HTMLSelect
            value={selectedMetadata || ""}
            onChange={(e) => setSelectedMetadata(e.target.value)}
            fill
          >
            {nonNumericCols.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </HTMLSelect>
        </Label>
        <Label className="cluster-field-newname">
          new name:
          <InputGroup
            value={annotationColumnName}
            onChange={(e) => setAnnotationColumnName(e.target.value)}
            placeholder="e.g., celltype1"
          />
        </Label>
      </div>

      <Divider />

      {clusterList.length > 0 ? (
        <>
          <div className="cluster-list">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={clusterList.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {clusterList.map((item) => (
                  <SortableClusterRow
                    key={item.id}
                    id={item.id}
                    cluster={item.cluster}
                    annotation={item.annotation}
                    onAnnotationChange={handleAnnotationChange}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <div className="cluster-annotation-actions">
            <Button
              intent="primary"
              text="Anno"
              onClick={handleSave}
            />
            <Button
              text="Export"
              onClick={handleExport}
              style={{ marginLeft: "10px" }}
            />
          </div>
        </>
      ) : (
        <Callout intent="primary" icon="info-sign">
          Select a metadata column to begin annotation.
        </Callout>
      )}
    </>
  );

  return (
```

**Step 3: Update annotation Tab to use extracted panel**

Change the annotation Tab's panel prop from inline JSX to the extracted variable (around line 798-874):

Replace:
```javascript
<Tab
  id="annotation"
  title="Annotation"
  panel={
    <>
      <div className="cluster-annotation-fields">
        ...entire panel content...
      </>
    }
  />
```

With:
```javascript
<Tab
  id="annotation"
  title="Annotation"
  panel={annotationPanel}
/>
```

**Step 4: Verify app still runs**

Run: `npm start`
Expected: App starts successfully, no console errors

**Step 5: Test ExploreMode annotation functionality**

Manual test:
1. Navigate to ExploreMode
2. Open cluster annotation panel (right side)
3. Verify both "Annotation" and "Stat" tabs are visible
4. Verify annotation tab works (can select origin, edit cluster names, save)

Expected: All functionality works as before

**Step 6: Commit the refactoring**

```bash
git add src/components/ClusterAnnotation/index.js
git commit -m "refactor: extract annotation panel into reusable constant

Extract annotation panel JSX into annotationPanel constant to prepare
for conditional rendering in annotation-only mode.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Conditional Rendering Logic

**Goal:** Add `onlyAnnotation` prop and implement conditional rendering to show annotation content directly when true, or full Tabs interface when false.

**Files:**
- Modify: `src/components/ClusterAnnotation/index.js:330-770`

**Step 1: Conditionally initialize stat state**

Modify stat-related state initialization (lines 347-354) to only initialize when NOT in annotation-only mode:

Replace:
```javascript
  // Tab state
  const [activeTab, setActiveTab] = useState("annotation");

  // Stat tab states
  const [statGroup, setStatGroup] = useState(null);
  const [statCelltype, setStatCelltype] = useState(null);
  const [chartOrientation, setChartOrientation] = useState("vertical");
  const [barWidthRatio, setBarWidthRatio] = useState(0.27);
```

With:
```javascript
  // Tab state (only needed when not in annotation-only mode)
  const [activeTab, setActiveTab] = useState(onlyAnnotation ? null : "annotation");

  // Stat tab states (only needed when not in annotation-only mode)
  const [statGroup, setStatGroup] = useState(onlyAnnotation ? null : null);
  const [statCelltype, setStatCelltype] = useState(onlyAnnotation ? null : null);
  const [chartOrientation, setChartOrientation] = useState(onlyAnnotation ? null : "vertical");
  const [barWidthRatio, setBarWidthRatio] = useState(onlyAnnotation ? null : 0.27);
```

**Step 2: Conditionally skip stat initialization effects**

Modify the stat initialization useEffects (lines 395-451 and 488-496) to only run when NOT in annotation-only mode:

Add early return at the start of both useEffects:

At line 395:
```javascript
  // Initialize stat tab selections
  useEffect(() => {
    if (onlyAnnotation) return; // Skip stat initialization in annotation-only mode

    const nonNumericCols = getNonNumericColumns();
    // ... rest of the effect
  }, [annotationCols, statGroup, statCelltype, onlyAnnotation]);
```

At line 488:
```javascript
  // Request stat data when group or celltype changes
  useEffect(() => {
    if (onlyAnnotation) return; // Skip stat data requests in annotation-only mode

    if (statGroup && !annotationObj[statGroup]) {
      props.setReqAnnotation?.(statGroup);
    }
    // ... rest of the effect
  }, [statGroup, statCelltype, annotationObj, onlyAnnotation]);
```

**Step 3: Add conditional rendering before return statement**

Before the main return statement (around line 770, before `return (`), add annotation-only mode rendering:

```javascript
  const statData = calculateStatData();

  // Annotation panel content (extracted for reuse in both modes)
  const annotationPanel = (
    // ... extracted panel from Task 3
  );

  // Annotation-only mode: render content directly without Tabs
  if (onlyAnnotation) {
    return (
      <div className="cluster-annotation-container">
        {onCollapse && (
          <div style={{ position: 'absolute', top: '5px', right: '5px', zIndex: 10 }}>
            <Tooltip2 content="收起（左侧铺满）" placement="left">
              <Button
                minimal
                small
                icon="chevron-left"
                onClick={onCollapse}
                className="cluster-annotation-toggle"
              />
            </Tooltip2>
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

  // Default mode: full Tabs interface
  return (
```

**Step 4: Verify app still runs**

Run: `npm start`
Expected: App starts successfully, no console errors

**Step 5: Test ExploreMode still works (default behavior)**

Manual test:
1. Navigate to ExploreMode
2. Open cluster annotation panel
3. Verify both "Annotation" and "Stat" tabs are visible
4. Switch between tabs
5. Verify all functionality works

Expected: No changes in behavior (onlyAnnotation defaults to false)

**Step 6: Commit the conditional rendering**

```bash
git add src/components/ClusterAnnotation/index.js
git commit -m "feat: add annotation-only mode to ClusterAnnotation

Add onlyAnnotation prop (default: false) to ClusterAnnotation component.
When true, renders annotation content directly without Tabs wrapper and
skips stat-related state initialization. When false, maintains current
Tabs interface with both Annotation and Stat tabs.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update DotPlot to Use Annotation-Only Mode

**Goal:** Pass `onlyAnnotation={true}` prop to ClusterAnnotation in DotPlot component.

**Files:**
- Modify: `src/components/DotPlot/index.js:1172-1176`

**Step 1: Locate ClusterAnnotation usage in DotPlot**

Read: `src/components/DotPlot/index.js:1172-1176`
Expected: ClusterAnnotation component without onlyAnnotation prop

**Step 2: Add onlyAnnotation prop**

At line 1172-1176, add `onlyAnnotation={true}` prop:

Replace:
```javascript
            <ClusterAnnotation
              scranWorker={props.scranWorker}
              setReqAnnotation={setReqAnnotation}
            />
```

With:
```javascript
            <ClusterAnnotation
              scranWorker={props.scranWorker}
              setReqAnnotation={setReqAnnotation}
              onlyAnnotation={true}
            />
```

**Step 3: Verify app still runs**

Run: `npm start`
Expected: App starts successfully, no console errors

**Step 4: Test DotPlot annotation panel**

Manual test:
1. Navigate to DotPlot page
2. Click the "Cluster Annotation" floating button (top right)
3. Verify floating panel shows ONLY annotation content (no tabs, no Stat functionality)
4. Verify annotation fields are visible (origin dropdown, new name input)
5. Verify cluster list and action buttons (Anno, Export) are visible
6. Test annotation functionality (select origin, edit annotations, save)

Expected: Panel shows annotation-only interface without tab navigation

**Step 5: Verify ExploreMode unchanged**

Manual test:
1. Navigate to ExploreMode
2. Open cluster annotation panel
3. Verify both "Annotation" and "Stat" tabs are still visible
4. Verify all functionality works

Expected: ExploreMode behavior unchanged

**Step 6: Commit DotPlot changes**

```bash
git add src/components/DotPlot/index.js
git commit -m "feat: use annotation-only mode in DotPlot

Pass onlyAnnotation={true} to ClusterAnnotation in DotPlot floating
panel to show only annotation functionality without Tabs interface.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Test Annotation State Synchronization

**Goal:** Verify that annotation editing state synchronizes correctly between ExploreMode and DotPlot.

**Files:**
- Verify: All functionality works as expected

**Step 1: Test ExploreMode → DotPlot synchronization**

Manual test:
1. Navigate to ExploreMode
2. Open cluster annotation panel
3. Select an origin column (e.g., "seurat_clusters")
4. Change new name to "my_celltype"
5. Edit some cluster annotations (e.g., "0" → "T cells", "1" → "B cells")
6. Navigate to DotPlot page
7. Open cluster annotation floating panel
8. Verify:
   - [ ] Same origin column selected ("seurat_clusters")
   - [ ] Same new name shown ("my_celltype")
   - [ ] Same cluster annotations visible ("T cells", "B cells")
   - [ ] Cluster order preserved

Expected: All editing state synchronized

**Step 2: Test DotPlot → ExploreMode synchronization**

Manual test:
1. Continue from Step 1 (in DotPlot)
2. Edit more annotations (e.g., "2" → "NK cells")
3. Change new name to "final_celltype"
4. Navigate to ExploreMode
5. Open cluster annotation panel
6. Verify:
   - [ ] Same new name shown ("final_celltype")
   - [ ] All cluster annotations visible including "NK cells"
   - [ ] No edits were lost

Expected: All editing state synchronized

**Step 3: Test drag-and-drop synchronization**

Manual test:
1. In ExploreMode, drag cluster "0" to position 2
2. Navigate to DotPlot
3. Verify cluster order matches ExploreMode
4. In DotPlot, drag cluster "1" to position 0
5. Navigate to ExploreMode
6. Verify cluster order matches DotPlot

Expected: Cluster order synchronized across pages

**Step 4: Test save and continue editing**

Manual test:
1. In ExploreMode, edit annotations
2. Click "Anno" button to save
3. Verify save success message
4. Verify annotations are still editable (state not cleared)
5. Navigate to DotPlot
6. Verify editing state still present
7. Make more edits
8. Click "Anno" again
9. Verify can continue editing

Expected: Saving doesn't clear editing state; can continue editing after save

**Step 5: Test edge case - switch origin column**

Manual test:
1. In ExploreMode, select origin "seurat_clusters", edit annotations
2. Navigate to DotPlot
3. Change origin to different column (e.g., "clusters")
4. Navigate back to ExploreMode
5. Verify origin changed to "clusters"
6. Verify cluster list updated accordingly

Expected: Origin change synchronized; cluster list updates correctly

**Step 6: Document test results**

Create a summary of test results:
- All synchronization tests passed
- Any issues discovered
- Any edge cases that need attention

No commit needed (manual testing only)

---

## Task 7: Final Verification and Documentation

**Goal:** Verify all requirements are met and update relevant documentation.

**Files:**
- Read: `docs/plans/2026-02-15-dotplot-hover-design.md`
- Modify: `docs/plans/2026-02-15-dotplot-hover-design.md:4`

**Step 1: Test all scenarios**

Manual test checklist:

**DotPlot:**
- [ ] Floating annotation panel shows no tabs
- [ ] Origin dropdown works
- [ ] New name input works
- [ ] Cluster list displays correctly
- [ ] Drag-and-drop reordering works
- [ ] Annotation editing works
- [ ] Anno button saves annotations
- [ ] Export button downloads CSV
- [ ] No Stat functionality visible

**ExploreMode:**
- [ ] Both "Annotation" and "Stat" tabs visible
- [ ] Can switch between tabs
- [ ] Annotation tab functionality works
- [ ] Stat tab functionality works
- [ ] All existing features work

**Synchronization:**
- [ ] ExploreMode edits → DotPlot synced
- [ ] DotPlot edits → ExploreMode synced
- [ ] Origin column synced
- [ ] New name synced
- [ ] Cluster list synced
- [ ] Cluster order synced
- [ ] Edits persist after save

**Step 2: Check for console errors**

Open browser DevTools console
Expected: No errors or warnings

**Step 3: Verify backward compatibility**

Check that:
- ExploreMode works without passing onlyAnnotation prop (uses default false)
- All existing ClusterAnnotation functionality preserved
- No breaking changes

**Step 4: Review implementation against design**

Read: `docs/plans/2026-02-15-dotplot-hover-design.md`

Verify:
- [x] annotationEditState added to AppContext
- [x] ClusterAnnotation uses AppContext state
- [x] onlyAnnotation prop added with default false
- [x] Conditional rendering implemented
- [x] Stat state initialization skipped when onlyAnnotation=true
- [x] DotPlot passes onlyAnnotation={true}
- [x] ExploreMode unchanged
- [x] Backward compatibility maintained
- [x] State synchronization works

**Step 5: Update design document status**

Edit: `docs/plans/2026-02-15-dotplot-hover-design.md:4`

Change:
```markdown
**Status:** Approved
```

To:
```markdown
**Status:** Implemented
```

**Step 6: Final commit**

```bash
git add docs/plans/2026-02-15-dotplot-hover-design.md
git commit -m "docs: mark dotplot annotation-only design as implemented

All requirements completed:
- Annotation-only mode in DotPlot
- Full Tabs interface in ExploreMode
- Annotation state synchronized between pages

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 7: Verify git log**

Run: `git log --oneline -8`
Expected: 8 commits showing the implementation progression:
1. feat: add annotationEditState to AppContext
2. feat: use AppContext state for annotation editing
3. refactor: extract annotation panel
4. feat: add annotation-only mode
5. feat: use annotation-only mode in DotPlot
6. (no commit for Task 6 - manual testing)
7. docs: mark design as implemented

---

## Testing Notes

**No automated tests:** This codebase does not have a comprehensive test suite. All verification is manual testing in browser.

**Test coverage:**
1. DotPlot annotation-only mode (new behavior)
2. ExploreMode full tabs mode (existing behavior)
3. Annotation functionality in both modes
4. State synchronization between modes (new behavior)
5. Drag-and-drop in both modes
6. Save and export in both modes

**Edge cases to verify:**
- No metadata columns available
- Empty cluster list
- Missing annotation data
- Switching between DotPlot and ExploreMode multiple times
- Editing after saving

**Critical synchronization tests:**
- Origin column selection syncs
- New annotation column name syncs
- Cluster list and annotations sync
- Cluster order (from drag-and-drop) syncs
- Edits persist when switching pages
- Saved annotations available in both pages

---

## Rollback Plan

If issues are discovered:

```bash
# Revert all commits
git revert HEAD~7..HEAD

# Or reset to before changes (if not pushed)
git reset --hard HEAD~8
```

**Files affected:**
- `src/context/AppContext.js`
- `src/components/ClusterAnnotation/index.js`
- `src/components/DotPlot/index.js`
- `docs/plans/2026-02-15-dotplot-hover-design.md`
