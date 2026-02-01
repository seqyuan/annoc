import React, { useEffect, useContext, useState } from "react";
import {
  Button,
  HTMLSelect,
  InputGroup,
  Label,
  Divider,
  Callout,
} from "@blueprintjs/core";
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

  const [selectedMetadata, setSelectedMetadata] = useState(null);
  const [annotationColumnName, setAnnotationColumnName] = useState("celltype1");
  const [clusterList, setClusterList] = useState([]);
  const [currentAnnotations, setCurrentAnnotations] = useState({});

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

  return (
    <div className="cluster-annotation-container">
      <div className="cluster-annotation-header">
        <h3>Cluster Annotation</h3>
      </div>
      <Divider />

      {nonNumericCols.length === 0 ? (
        <Callout intent="warning" icon="warning-sign">
          No non-numeric metadata columns available for annotation.
        </Callout>
      ) : (
        <>
          <Label>
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

          <Label style={{ marginTop: "10px" }}>
            new name:
            <InputGroup
              value={annotationColumnName}
              onChange={(e) => setAnnotationColumnName(e.target.value)}
              placeholder="e.g., celltype1"
            />
          </Label>

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
      )}
    </div>
  );
};

export default React.memo(ClusterAnnotation);
