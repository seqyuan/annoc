import React, { useEffect, useContext, useState } from "react";
import {
  Button,
  HTMLSelect,
  InputGroup,
  Label,
  Divider,
  Callout,
  Tab,
  Tabs,
  Switch,
  NumericInput,
} from "@blueprintjs/core";
import { Tooltip2 } from "@blueprintjs/popover2";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { AppContext } from "../../context/AppContext";
import { getSuppliedCols } from "../../utils/utils";
import { generateColors } from "../Plots/colors";
import "./annotation.css";

// Sortable row component
function SortableClusterRow({ id, cluster, annotation, onAnnotationChange }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="cluster-row">
      <div className="drag-handle" {...attributes} {...listeners}>
        ≡
      </div>
      <div className="cluster-label">{cluster}</div>
      <InputGroup
        className="annotation-input"
        value={annotation}
        onChange={(e) => onAnnotationChange(id, e.target.value)}
        placeholder="Enter cell type..."
      />
    </div>
  );
}

// Stacked bar chart component with orientation option
function StackedBarChart({ data, celltypes, colors, orientation = "horizontal", barWidthRatio = 0.27 }) {
  if (!data || data.length === 0) {
    return null;
  }

  // Horizontal orientation (X-axis: proportion, Y-axis: groups)
  if (orientation === "horizontal") {
    const width = 700;
    const height = Math.max(300, data.length * 50);
    const margin = { top: 20, right: 100, bottom: 40, left: 120 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const barHeight = chartHeight / data.length * 0.7;
    const gap = chartHeight / data.length * 0.3;

    return (
      <div style={{ padding: '20px', overflowY: 'auto' }}>
        <svg width={width} height={height}>
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            {/* X-axis */}
            <line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="black" />
            {/* Y-axis */}
            <line x1={0} y1={0} x2={0} y2={chartHeight} stroke="black" />

            {/* X-axis labels (proportions) */}
            {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => (
              <g key={i}>
                <line
                  x1={tick * chartWidth}
                  y1={chartHeight}
                  x2={tick * chartWidth}
                  y2={chartHeight + 5}
                  stroke="black"
                />
                <text
                  x={tick * chartWidth}
                  y={chartHeight + 20}
                  textAnchor="middle"
                  fontSize="12"
                >
                  {(tick * 100).toFixed(0)}%
                </text>
              </g>
            ))}

            {/* Stacked bars (horizontal) */}
            {data.map((item, groupIndex) => {
              const y = groupIndex * (barHeight + gap) + gap / 2;
              let cumulativeWidth = 0;

              return (
                <g key={groupIndex}>
                  {/* Bars */}
                  {celltypes.map((celltype, celltypeIndex) => {
                    const proportion = item.proportions[celltype] || 0;
                    const barWidth = proportion * chartWidth;
                    const x = cumulativeWidth;
                    cumulativeWidth += barWidth;

                    return barWidth > 0 ? (
                      <rect
                        key={celltype}
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill={colors[celltypeIndex % colors.length]}
                        stroke="white"
                        strokeWidth={1}
                      >
                        <title>{`${celltype}: ${(proportion * 100).toFixed(1)}%`}</title>
                      </rect>
                    ) : null;
                  })}

                  {/* Y-axis labels (group names) */}
                  <text
                    x={-10}
                    y={y + barHeight / 2}
                    textAnchor="end"
                    alignmentBaseline="middle"
                    fontSize="12"
                    fontWeight="500"
                  >
                    {item.group}
                  </text>
                  <text
                    x={-10}
                    y={y + barHeight / 2 + 12}
                    textAnchor="end"
                    alignmentBaseline="middle"
                    fontSize="10"
                    fill="#666"
                  >
                    {item.total}
                  </text>
                </g>
              );
            })}

            {/* Legend */}
            {celltypes.map((celltype, index) => (
              <g key={celltype} transform={`translate(${chartWidth + 10}, ${index * 20})`}>
                <rect width={15} height={15} fill={colors[index % colors.length]} />
                <text x={20} y={12} fontSize="12">{celltype}</text>
              </g>
            ))}

            {/* X-axis label */}
            <text
              x={chartWidth / 2}
              y={chartHeight + 35}
              textAnchor="middle"
              fontSize="14"
            >
              Cell Proportion
            </text>
          </g>
        </svg>
      </div>
    );
  }

  // Vertical orientation (X-axis: groups, Y-axis: proportion)
  const width = 600;
  const height = 400;
  const margin = { top: 20, right: 100, bottom: 60, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Calculate bar width to minimize left/right padding
  // Total space needed: n bars + n gaps (including left/right gap/2 each)
  // n * barWidth + n * (barWidth/3) = chartWidth
  // barWidth * n * (1 + 1/3) = chartWidth
  // barWidth = chartWidth * 3 / (4 * n)
  const barWidth = (chartWidth * 3 / (4 * data.length)) * barWidthRatio;
  const gap = barWidth / 3;
  const startPadding = gap / 2;

  return (
    <div style={{ padding: '20px', overflowX: 'auto' }}>
      <svg width={width} height={height}>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Y-axis */}
          <line x1={0} y1={0} x2={0} y2={chartHeight} stroke="black" />

          {/* Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => (
            <g key={i}>
              <line
                x1={-5}
                y1={chartHeight - tick * chartHeight}
                x2={0}
                y2={chartHeight - tick * chartHeight}
                stroke="black"
              />
              <text
                x={-10}
                y={chartHeight - tick * chartHeight}
                textAnchor="end"
                alignmentBaseline="middle"
                fontSize="12"
              >
                {(tick * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {/* Stacked bars (vertical) */}
          {data.map((item, groupIndex) => {
            const x = startPadding + groupIndex * (barWidth + gap);
            let cumulativeHeight = 0;

            // Track the top of the stacked bar for placing cell count label
            let stackTop = chartHeight;

            return (
              <g key={groupIndex}>
                {/* Bars */}
                {celltypes.map((celltype, celltypeIndex) => {
                  const proportion = item.proportions[celltype] || 0;
                  const barHeight = proportion * chartHeight;
                  const y = chartHeight - cumulativeHeight - barHeight;
                  cumulativeHeight += barHeight;

                  // Update stack top to the highest point
                  if (barHeight > 0 && y < stackTop) {
                    stackTop = y;
                  }

                  return barHeight > 0 ? (
                    <rect
                      key={celltype}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      fill={colors[celltypeIndex % colors.length]}
                      stroke="white"
                      strokeWidth={1}
                    >
                      <title>{`${celltype}: ${(proportion * 100).toFixed(1)}%`}</title>
                    </rect>
                  ) : null;
                })}

                {/* Cell count label - above the bar */}
                <text
                  x={x + barWidth / 2}
                  y={stackTop - 5}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#666"
                  fontWeight="500"
                >
                  {item.total}
                </text>

                {/* X-axis label - rotated -45 degrees, right edge aligned to bar center */}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 15}
                  textAnchor="end"
                  fontSize="12"
                  transform={`rotate(-45, ${x + barWidth / 2}, ${chartHeight + 15})`}
                >
                  {item.group}
                </text>
              </g>
            );
          })}

          {/* Legend */}
          {celltypes.map((celltype, index) => {
            const lastBarX = startPadding + (data.length - 1) * (barWidth + gap);
            const legendX = lastBarX + barWidth + barWidth / 3;
            return (
              <g key={celltype} transform={`translate(${legendX}, ${index * 20})`}>
                <rect width={15} height={15} fill={colors[index % colors.length]} />
                <text x={20} y={12} fontSize="12">{celltype}</text>
              </g>
            );
          })}

          {/* Y-axis label */}
          <text
            x={-chartHeight / 2}
            y={-40}
            textAnchor="middle"
            fontSize="14"
            transform={`rotate(-90, ${-chartHeight / 2}, -40)`}
          >
            Cell Proportion
          </text>
        </g>
      </svg>
    </div>
  );
}

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
    annotationEditState,
    setAnnotationEditState,
  } = useContext(AppContext);

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

  // Destructure props
  const { onCollapse, onlyAnnotation = false } = props;

  // Tab state (only needed when not in annotation-only mode)
  const [activeTab, setActiveTab] = useState(onlyAnnotation ? null : "annotation");

  // Stat tab states (only needed when not in annotation-only mode)
  const [statGroup, setStatGroup] = useState(null);
  const [statCelltype, setStatCelltype] = useState(null);
  const [chartOrientation, setChartOrientation] = useState("vertical"); // "horizontal" or "vertical"
  const [barWidthRatio, setBarWidthRatio] = useState(0.27); // Bar width ratio (0-1)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get non-numeric metadata columns
  const getNonNumericColumns = () => {
    if (!annotationCols) return [];
    return getSuppliedCols(annotationCols).filter(
      (col) => annotationCols[col]?.type !== "continuous"
    );
  };

  // Initialize selected metadata
  useEffect(() => {
    const nonNumericCols = getNonNumericColumns();
    if (nonNumericCols.length > 0 && selectedMetadata === null) {
      // Try to find seurat_clusters or clusters
      let defaultCol = nonNumericCols[0];
      if (nonNumericCols.includes("seurat_clusters")) {
        defaultCol = "seurat_clusters";
      } else if (nonNumericCols.includes("clusters")) {
        defaultCol = "clusters";
      } else if (nonNumericCols.includes("cluster")) {
        defaultCol = "cluster";
      }
      setSelectedMetadata(defaultCol);

      // Generate celltypeX name based on existing annotations
      let counter = 1;
      while (annotationCols[`celltype${counter}`] || clusterAnnotations[`celltype${counter}`]) {
        counter++;
      }
      setAnnotationColumnName(`celltype${counter}`);
    }
  }, [annotationCols, clusterAnnotations]);

  // Initialize stat tab selections
  useEffect(() => {
    if (onlyAnnotation) return; // Skip stat initialization in annotation-only mode

    const nonNumericCols = getNonNumericColumns();
    if (nonNumericCols.length > 0) {
      // Initialize statGroup if not set
      if (statGroup === null) {
        let groupCol = nonNumericCols[0];
        // Priority: sample > orig.ident > stim > group
        if (nonNumericCols.includes("sample")) {
          groupCol = "sample";
        } else if (nonNumericCols.includes("orig.ident")) {
          groupCol = "orig.ident";
        } else if (nonNumericCols.includes("stim")) {
          groupCol = "stim";
        } else if (nonNumericCols.includes("group")) {
          groupCol = "group";
        }
        setStatGroup(groupCol);
      }

      // Initialize statCelltype if not set
      // Use same priority as Choose annotation in explore page
      if (statCelltype === null) {
        let celltypeCol = nonNumericCols[0];
        // Priority 1: celltype or contains celltype
        const celltypeAnno = nonNumericCols.find(x => x.toLowerCase().includes('celltype'));
        if (celltypeAnno) {
          celltypeCol = celltypeAnno;
        } else {
          // Priority 2: subtype
          const subtypeAnno = nonNumericCols.find(x => x.toLowerCase().includes('subtype'));
          if (subtypeAnno) {
            celltypeCol = subtypeAnno;
          } else {
            // Priority 3: seurat_clusters
            if (nonNumericCols.includes("seurat_clusters")) {
              celltypeCol = "seurat_clusters";
            } else {
              // Priority 4: leiden related
              const leidenAnno = nonNumericCols.find(x => x.toLowerCase().includes('leiden'));
              if (leidenAnno) {
                celltypeCol = leidenAnno;
              } else {
                // Priority 5: clusters or cluster
                if (nonNumericCols.includes("clusters")) {
                  celltypeCol = "clusters";
                } else if (nonNumericCols.includes("cluster")) {
                  celltypeCol = "cluster";
                }
              }
            }
          }
        }
        setStatCelltype(celltypeCol);
      }
    }
  }, [annotationCols, statGroup, statCelltype, onlyAnnotation]);

  // Load cluster list when metadata changes
  useEffect(() => {
    if (selectedMetadata && annotationObj[selectedMetadata]) {
      const data = annotationObj[selectedMetadata];
      let uniqueClusters = [];

      if (data.type === "array") {
        uniqueClusters = [...new Set(data.values)];
      } else if (data.type === "factor") {
        uniqueClusters = data.levels;
      }

      // Check if we have a saved order for this annotation
      const savedOrder = globalClusterOrder[selectedMetadata];
      if (savedOrder) {
        uniqueClusters = savedOrder;
      }

      // Check if we have saved annotations
      const savedAnnotations = clusterAnnotations[annotationColumnName];

      const clusters = uniqueClusters.map((cluster, index) => ({
        id: `cluster-${index}`,
        cluster: String(cluster),
        // Use currentAnnotations first, then savedAnnotations, then cluster name as default
        annotation: currentAnnotations[String(cluster)] || savedAnnotations?.[String(cluster)] || String(cluster),
      }));

      setClusterList(clusters);
    } else if (selectedMetadata && !annotationObj[selectedMetadata]) {
      // Request annotation data from worker
      props.setReqAnnotation?.(selectedMetadata);
    }
  }, [selectedMetadata, annotationObj, globalClusterOrder]);

  // Request stat data when group or celltype changes
  useEffect(() => {
    if (onlyAnnotation) return; // Skip stat data requests in annotation-only mode

    if (statGroup && !annotationObj[statGroup]) {
      props.setReqAnnotation?.(statGroup);
    }
    if (statCelltype && !annotationObj[statCelltype]) {
      props.setReqAnnotation?.(statCelltype);
    }
  }, [statGroup, statCelltype, annotationObj, onlyAnnotation]);

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setClusterList((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      const newOrder = arrayMove(items, oldIndex, newIndex);

      // Update global cluster order so Choose annotation (same column) reflects drag order immediately
      const clusterOrder = newOrder.map((item) => item.cluster);
      setGlobalClusterOrder((prev) => ({
        ...prev,
        [selectedMetadata]: clusterOrder,
      }));

      return newOrder;
    });
  };

  const handleAnnotationChange = (id, value) => {
    setClusterList((items) =>
      items.map((item) => {
        if (item.id === id) {
          // Save to temporary state
          setCurrentAnnotations((prev) => ({
            ...prev,
            [item.cluster]: value,
          }));
          return { ...item, annotation: value };
        }
        return item;
      })
    );
  };

  const handleSave = () => {
    if (!annotationColumnName.trim()) {
      alert("Please enter an annotation column name");
      return;
    }

    // Create annotations object from current cluster list
    const annotations = {};
    clusterList.forEach((item) => {
      annotations[item.cluster] = item.annotation;
    });

    // Save to context
    setClusterAnnotations({
      ...clusterAnnotations,
      [annotationColumnName]: annotations,
    });

    // Update currentAnnotations to match
    setCurrentAnnotations(annotations);

    // Add to annotationCols so it appears in dropdown (incl. DotPlot Group by)
    setAnnotationCols({
      ...annotationCols,
      [annotationColumnName]: {
        name: annotationColumnName,
        type: "categorical",
        truncated: false,
      },
    });

    // Remove from annotationObj if it exists, to force DimPlot to request fresh data
    if (annotationObj[annotationColumnName]) {
      const newAnnotationObj = { ...annotationObj };
      delete newAnnotationObj[annotationColumnName];
      setAnnotationObj(newAnnotationObj);
    }

    // Don't add to annotationObj here - let DimPlot request it from worker
    // This ensures the correct order from worker is used

    // Save to worker
    if (props.scranWorker) {
      props.scranWorker.postMessage({
        type: "saveCustomAnnotation",
        payload: {
          columnName: annotationColumnName,
          annotations: annotations,
          sourceAnnotation: selectedMetadata,
          clusterOrder: clusterList.map((item) => item.cluster),
        },
      });
    }

    alert(`Annotations saved as "${annotationColumnName}"`);
  };

  const handleExport = () => {
    if (clusterList.length === 0) {
      alert("No annotations to export");
      return;
    }

    const columnName = annotationColumnName || "celltype";
    const csvContent = [
      `cluster,${columnName}`,
      ...clusterList.map((item) => `${item.cluster},${item.annotation || ""}`),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${columnName}_annotations.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const nonNumericCols = getNonNumericColumns();

  // Calculate stacked bar chart data
  const calculateStatData = () => {
    if (!statGroup || !statCelltype || !annotationObj[statGroup] || !annotationObj[statCelltype]) {
      return null;
    }

    const groupData = annotationObj[statGroup];
    const celltypeData = annotationObj[statCelltype];

    // Validate data structure
    if (!groupData || !celltypeData) {
      return null;
    }

    // Extract values from array or factor type
    let groupValues = [];
    let celltypeValues = [];

    try {
      if (groupData.type === "array") {
        groupValues = groupData.values || [];
      } else if (groupData.type === "factor") {
        // For factor type, index contains indices, levels are the actual values
        if (!groupData.index || !groupData.levels) {
          return null;
        }
        // Convert index object to array if needed
        const indexArray = Array.isArray(groupData.index) ? groupData.index : Object.values(groupData.index);
        groupValues = Array.from({ length: indexArray.length }, (_, i) =>
          groupData.levels[indexArray[i]]
        );
      }

      if (celltypeData.type === "array") {
        celltypeValues = celltypeData.values || [];
      } else if (celltypeData.type === "factor") {
        // For factor type, index contains indices, levels are the actual values
        if (!celltypeData.index || !celltypeData.levels) {
          return null;
        }
        // Convert index object to array if needed
        const indexArray = Array.isArray(celltypeData.index) ? celltypeData.index : Object.values(celltypeData.index);
        celltypeValues = Array.from({ length: indexArray.length }, (_, i) =>
          celltypeData.levels[indexArray[i]]
        );
      }
    } catch (error) {
      console.error("Error extracting annotation data:", error);
      return null;
    }

    // Check if we have valid data
    if (!groupValues || !celltypeValues || groupValues.length === 0 || celltypeValues.length === 0) {
      return null;
    }

    // Ensure both arrays have the same length
    if (groupValues.length !== celltypeValues.length) {
      console.error("Group and celltype data have different lengths");
      return null;
    }

    // Count cells for each group-celltype combination
    const counts = {};
    const groups = new Set();
    const celltypes = new Set();

    for (let i = 0; i < groupValues.length; i++) {
      const group = String(groupValues[i]);
      const celltype = String(celltypeValues[i]);

      groups.add(group);
      celltypes.add(celltype);

      if (!counts[group]) {
        counts[group] = {};
      }
      if (!counts[group][celltype]) {
        counts[group][celltype] = 0;
      }
      counts[group][celltype]++;
    }

    // Get celltype levels from annotationObj to match DimPlot exactly
    let celltypeArray;
    if (celltypeData.type === "array") {
      // For array type, extract unique values in order
      const uniqueValues = [];
      const seen = new Set();
      celltypeValues.forEach(val => {
        const strVal = String(val);
        if (!seen.has(strVal)) {
          seen.add(strVal);
          uniqueValues.push(strVal);
        }
      });
      celltypeArray = uniqueValues;
    } else {
      // For factor type, use levels directly from annotationObj
      celltypeArray = celltypeData.levels.slice();
    }

    // Apply globalClusterOrder if available for statCelltype annotation (same logic as DimPlot)
    if (globalClusterOrder && globalClusterOrder[statCelltype]) {
      const desiredOrder = globalClusterOrder[statCelltype];
      const oldToNew = {};
      const newLevels = [];

      // Build new levels array in desired order
      desiredOrder.forEach((cluster, newIdx) => {
        const oldIdx = celltypeArray.indexOf(String(cluster));
        if (oldIdx !== -1) {
          oldToNew[oldIdx] = newIdx;
          newLevels.push(celltypeArray[oldIdx]);
        }
      });

      celltypeArray = newLevels;
    }

    // Calculate proportions
    const chartData = [];
    const groupArray = Array.from(groups);

    groupArray.forEach(group => {
      const total = Object.values(counts[group] || {}).reduce((sum, count) => sum + count, 0);
      const proportions = {};
      celltypeArray.forEach(celltype => {
        proportions[celltype] = total > 0 ? (counts[group]?.[celltype] || 0) / total : 0;
      });
      chartData.push({
        group,
        total,
        proportions,
      });
    });

    // Generate colors using the same logic as DimPlot: levels.length + 1
    const colors = generateColors(celltypeArray.length + 1);

    return {
      chartData,
      celltypes: celltypeArray,
      colors,
    };
  };

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
        <Tabs
          id="cluster-annotation-tabs"
          selectedTabId={activeTab}
          onChange={(newTabId) => setActiveTab(newTabId)}
          className="cluster-annotation-tabs"
        >
          <Tab
            id="annotation"
            title="Annotation"
            panel={annotationPanel}
          />
          <Tab
            id="stat"
            title="Stat"
            panel={
              <>
                <div className="cluster-annotation-fields">
                  <Label className="cluster-field-origin">
                    group:
                    <HTMLSelect
                      value={statGroup || ""}
                      onChange={(e) => setStatGroup(e.target.value)}
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
                    celltype:
                    <HTMLSelect
                      value={statCelltype || ""}
                      onChange={(e) => setStatCelltype(e.target.value)}
                      fill
                    >
                      {nonNumericCols.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </HTMLSelect>
                  </Label>
                </div>

                <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Switch
                    checked={chartOrientation === "horizontal"}
                    label="横向显示"
                    onChange={(e) => setChartOrientation(e.target.checked ? "horizontal" : "vertical")}
                  />
                  {chartOrientation === "vertical" && (
                    <>
                      <Label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        柱宽比例:
                        <NumericInput
                          value={barWidthRatio}
                          onValueChange={(valueAsNumber) => {
                            if (!isNaN(valueAsNumber) && valueAsNumber >= 0.1 && valueAsNumber <= 1) {
                              setBarWidthRatio(valueAsNumber);
                            }
                          }}
                          min={0.1}
                          max={1}
                          stepSize={0.05}
                          minorStepSize={0.01}
                          style={{ width: '80px' }}
                          fill={false}
                        />
                      </Label>
                    </>
                  )}
                </div>

                <Divider />

                {statData ? (
                  <div className="stat-chart-container">
                    <StackedBarChart
                      data={statData.chartData}
                      celltypes={statData.celltypes}
                      colors={statData.colors}
                      orientation={chartOrientation}
                      barWidthRatio={barWidthRatio}
                    />
                  </div>
                ) : (
                  <Callout intent="primary" icon="info-sign">
                    Loading data...
                  </Callout>
                )}
              </>
            }
          />
        </Tabs>
      )}
    </div>
  );
};

export default React.memo(ClusterAnnotation);
