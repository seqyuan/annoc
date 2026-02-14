# DotPlot Annotation-Only Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add annotation-only mode to ClusterAnnotation component, removing Stat tab from DotPlot while keeping full Tabs interface in ExploreMode.

**Architecture:** Add optional `onlyAnnotation` prop to ClusterAnnotation component. When true, render annotation content directly without Tabs wrapper. When false (default), maintain current Tabs structure. DotPlot opts-in to annotation-only mode.

**Tech Stack:** React, Blueprint.js, @dnd-kit/core

---

## Task 1: Extract Annotation Panel Content

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

## Task 2: Add Conditional Rendering Logic

**Goal:** Add `onlyAnnotation` prop and implement conditional rendering to show annotation content directly when true, or full Tabs interface when false.

**Files:**
- Modify: `src/components/ClusterAnnotation/index.js:330-770`

**Step 1: Add onlyAnnotation prop destructuring**

At line 330 (start of ClusterAnnotation component), add `onlyAnnotation` to destructured props:

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
  } = useContext(AppContext);

  const { onlyAnnotation = false, onCollapse } = props;
```

**Step 2: Conditionally initialize stat state**

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

**Step 3: Conditionally skip stat initialization effects**

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

**Step 4: Add conditional rendering before return statement**

Before the main return statement (around line 770, before `return (`), add annotation-only mode rendering:

```javascript
  const statData = calculateStatData();

  // Annotation panel content (extracted for reuse in both modes)
  const annotationPanel = (
    // ... extracted panel from Task 1
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

**Step 5: Verify app still runs**

Run: `npm start`
Expected: App starts successfully, no console errors

**Step 6: Test ExploreMode still works (default behavior)**

Manual test:
1. Navigate to ExploreMode
2. Open cluster annotation panel
3. Verify both "Annotation" and "Stat" tabs are visible
4. Switch between tabs
5. Verify all functionality works

Expected: No changes in behavior (onlyAnnotation defaults to false)

**Step 7: Commit the conditional rendering**

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

## Task 3: Update DotPlot to Use Annotation-Only Mode

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

## Task 4: Final Verification and Documentation

**Goal:** Verify all requirements are met and update relevant documentation.

**Files:**
- Read: `docs/plans/2026-02-15-dotplot-hover-design.md`
- Verify: All functionality works as expected

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
- [x] onlyAnnotation prop added with default false
- [x] Conditional rendering implemented
- [x] Stat state initialization skipped when onlyAnnotation=true
- [x] DotPlot passes onlyAnnotation={true}
- [x] ExploreMode unchanged
- [x] Backward compatibility maintained

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

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 7: Verify git log**

Run: `git log --oneline -4`
Expected: 4 commits showing the implementation progression:
1. refactor: extract annotation panel
2. feat: add annotation-only mode
3. feat: use annotation-only mode in DotPlot
4. docs: mark design as implemented

---

## Testing Notes

**No automated tests:** This codebase does not have a comprehensive test suite. All verification is manual testing in browser.

**Test coverage:**
1. DotPlot annotation-only mode (new behavior)
2. ExploreMode full tabs mode (existing behavior)
3. Annotation functionality in both modes
4. Drag-and-drop in both modes
5. Save and export in both modes

**Edge cases to verify:**
- No metadata columns available
- Empty cluster list
- Missing annotation data
- Switching between DotPlot and ExploreMode

---

## Rollback Plan

If issues are discovered:

```bash
# Revert all commits
git revert HEAD~3..HEAD

# Or reset to before changes (if not pushed)
git reset --hard HEAD~4
```

**Files affected:**
- `src/components/ClusterAnnotation/index.js`
- `src/components/DotPlot/index.js`
- `docs/plans/2026-02-15-dotplot-hover-design.md`
