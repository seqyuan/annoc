import React, { useEffect, useContext, useState, useRef } from "react";
import {
  Button,
  HTMLSelect,
  Label,
  Callout,
  Spinner,
  FileInput,
  NumericInput,
  Icon,
} from "@blueprintjs/core";
import { Popover2, Tooltip2 } from "@blueprintjs/popover2";
import * as d3 from "d3";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

import { AppContext } from "../../context/AppContext";
import { getSuppliedCols, getComputedCols } from "../../utils/utils";
import "./topmarker.css";

// Parse uploaded marker file
function isHeaderRow(cells) {
  if (!cells || cells.length < 2) return false;
  const headers = cells.map((c) => String(c ?? "").trim().toLowerCase());
  return (
    headers.includes("cluster") ||
    headers.includes("gene") ||
    headers.includes("group") ||
    headers.includes("names")
  );
}

function parseCsvOrTxt(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  for (const line of lines) {
    const cells = line.split(/[\t,]/).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    if (cells.length >= 2 && cells[0] && cells[1]) rows.push([cells[0], cells[1]]);
  }
  if (rows.length > 0 && isHeaderRow(rows[0])) rows.shift();
  return rows;
}

function parseXlsxBuffer(ab) {
  const wb = XLSX.read(ab, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheet];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const rows = [];
  for (const row of data) {
    if (row.length >= 2 && row[0] && row[1]) {
      rows.push([String(row[0]).trim(), String(row[1]).trim()]);
    }
  }
  if (rows.length > 0 && isHeaderRow(rows[0])) rows.shift();
  return rows;
}

const TopMarker = (props) => {
  const { annotationCols, annotationObj, setReqAnnotation } = useContext(AppContext);

  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [topN, setTopN] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dotplotData, setDotplotData] = useState(null);
  const [uploadedMarkers, setUploadedMarkers] = useState(null);
  const [hasH5adMarkers, setHasH5adMarkers] = useState(false);
  const canvasRef = useRef(null);
  const listenerRef = useRef(null);

  // Gene filter states
  const [filterCluster, setFilterCluster] = useState(null);
  const [filterTopN, setFilterTopN] = useState(10);
  const [filterConditions, setFilterConditions] = useState([
    { field: "means.lfc", operator: ">", value: 0.5 }
  ]);
  const [filteredGenes, setFilteredGenes] = useState([]);
  const [filterLoading, setFilterLoading] = useState(false);

  const allCols = annotationCols
    ? [...getSuppliedCols(annotationCols), ...getComputedCols(annotationCols)]
    : [];

  useEffect(() => {
    if (!annotationCols || allCols.length === 0) return;
    if (selectedAnnotation === null) {
      let defaultCol = allCols[0];
      if (allCols.includes("seurat_clusters")) defaultCol = "seurat_clusters";
      else if (allCols.includes("clusters")) defaultCol = "clusters";
      else if (allCols.includes("cluster")) defaultCol = "cluster";
      setSelectedAnnotation(defaultCol);
    }
  }, [annotationCols, allCols, selectedAnnotation]);

  useEffect(() => {
    if (selectedAnnotation && !annotationObj[selectedAnnotation] && setReqAnnotation) {
      setReqAnnotation(selectedAnnotation);
    }
  }, [selectedAnnotation, annotationObj, setReqAnnotation]);

  // Check if H5AD has markers in uns
  useEffect(() => {
    if (!props.scranWorker) return;

    props.scranWorker.postMessage({
      type: "checkH5adMarkers",
    });
  }, [props.scranWorker]);

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        let rows = [];

        if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
          rows = parseXlsxBuffer(content);
        } else {
          const text = new TextDecoder().decode(content);
          rows = parseCsvOrTxt(text);
        }

        if (rows.length === 0) {
          setError("No valid data found in file");
          return;
        }

        // Group by cluster
        const markersByCluster = {};
        for (const [cluster, gene] of rows) {
          if (!markersByCluster[cluster]) markersByCluster[cluster] = [];
          markersByCluster[cluster].push(gene);
        }

        setUploadedMarkers(markersByCluster);
        setError(null);
      } catch (err) {
        setError(`Failed to parse file: ${err.message}`);
      }
    };

    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleGeneratePlot = () => {
    if (!selectedAnnotation) {
      setError("Please select an annotation");
      return;
    }

    setError(null);
    setLoading(true);

    if (props.scranWorker) {
      props.scranWorker.postMessage({
        type: "generateTopMarkerDotplot",
        payload: {
          annotation: selectedAnnotation,
          topN,
          uploadedMarkers,
          useH5adMarkers: hasH5adMarkers && !uploadedMarkers,
        },
      });
    } else {
      setLoading(false);
      setError("Worker not available");
    }
  };

  const handleFilterGenes = () => {
    if (!filterCluster || !selectedAnnotation) {
      setError("Please select annotation and cluster");
      return;
    }

    setFilterLoading(true);
    setError(null);

    if (props.scranWorker) {
      props.scranWorker.postMessage({
        type: "getMarkersForCluster",
        payload: {
          annotation: selectedAnnotation,
          cluster: filterCluster,
          rank_type: "cohen-min",
          modality: props.selectedModality || "RNA",
        },
      });
    }
  };

  const addFilterCondition = () => {
    setFilterConditions([
      ...filterConditions,
      { field: "means.lfc", operator: ">", value: 0 }
    ]);
  };

  const removeFilterCondition = (index) => {
    setFilterConditions(filterConditions.filter((_, i) => i !== index));
  };

  const updateFilterCondition = (index, key, value) => {
    const newConditions = [...filterConditions];
    newConditions[index][key] = value;
    setFilterConditions(newConditions);
  };

  const drawDotplot = (data) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const { clusters, genes, matrix, pctMatrix } = data;
    const ctx = canvas.getContext("2d");

    const margin = { top: 100, right: 50, bottom: 50, left: 150 };
    const cellWidth = 40;
    const cellHeight = 25;
    const width = margin.left + clusters.length * cellWidth + margin.right;
    const height = margin.top + genes.length * cellHeight + margin.bottom;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Color scale
    const colorScale = d3.scaleSequential(d3.interpolateReds).domain([0, 1]);

    // Draw cells
    for (let i = 0; i < genes.length; i++) {
      for (let j = 0; j < clusters.length; j++) {
        const x = margin.left + j * cellWidth;
        const y = margin.top + i * cellHeight;
        const expr = matrix[i][j];
        const pct = pctMatrix[i][j];

        ctx.fillStyle = colorScale(expr);
        ctx.fillRect(x, y, cellWidth, cellHeight);

        // Draw dot
        const radius = Math.sqrt(pct) * 8;
        ctx.fillStyle = "#333";
        ctx.beginPath();
        ctx.arc(x + cellWidth / 2, y + cellHeight / 2, radius, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Draw gene labels
    ctx.fillStyle = "#000";
    ctx.font = "12px Arial";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < genes.length; i++) {
      const y = margin.top + i * cellHeight + cellHeight / 2;
      ctx.fillText(genes[i], margin.left - 10, y);
    }

    // Draw cluster labels
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let j = 0; j < clusters.length; j++) {
      const x = margin.left + j * cellWidth + cellWidth / 2;
      ctx.translate(x, margin.top - 10);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(clusters[j], 0, 0);
      ctx.rotate(Math.PI / 4);
      ctx.translate(-x, -(margin.top - 10));
    }
    ctx.restore();

    // Draw legend
    const legendX = width - margin.right + 10;
    const legendY = margin.top;
    const legendHeight = 100;
    const legendWidth = 20;

    for (let i = 0; i <= legendHeight; i++) {
      const val = 1 - i / legendHeight;
      ctx.fillStyle = colorScale(val);
      ctx.fillRect(legendX, legendY + i, legendWidth, 1);
    }

    ctx.strokeStyle = "#000";
    ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

    ctx.fillStyle = "#000";
    ctx.font = "10px Arial";
    ctx.textAlign = "left";
    ctx.fillText("High", legendX + legendWidth + 5, legendY);
    ctx.fillText("Low", legendX + legendWidth + 5, legendY + legendHeight);
  };

  useEffect(() => {
    if (dotplotData) {
      drawDotplot(dotplotData);
    }
  }, [dotplotData]);

  useEffect(() => {
    if (!props.scranWorker) return;

    const handleMessage = (event) => {
      const { type, resp } = event.data;

      if (type === "checkH5adMarkers_DATA") {
        setHasH5adMarkers(resp?.hasMarkers || false);
      }

      if (type === "generateTopMarkerDotplot_DATA") {
        setLoading(false);
        if (resp?.success && resp?.data) {
          setDotplotData(resp.data);
          setError(null);
        } else {
          setError(resp?.message || "Failed to generate plot");
        }
      }

      if (type === "setMarkersForCluster") {
        setFilterLoading(false);
        if (resp && resp.ordering) {
          // Apply filter conditions
          const genes = resp.ordering;
          const lfc = resp.means?.lfc || [];
          const cohen = resp.means?.cohen || [];
          const auc = resp.means?.auc || [];
          const detected = resp.means?.detected || [];
          const mean = resp.mean || [];

          let filtered = genes.map((gene, i) => ({
            gene,
            lfc: lfc[i] || 0,
            cohen: cohen[i] || 0,
            auc: auc[i] || 0.5,
            detected: detected[i] || 0,
            mean: mean[i] || 0,
          }));

          // Apply each filter condition
          filterConditions.forEach(condition => {
            filtered = filtered.filter(item => {
              let value;
              if (condition.field === "means.lfc") value = item.lfc;
              else if (condition.field === "means.cohen") value = item.cohen;
              else if (condition.field === "means.auc") value = item.auc;
              else if (condition.field === "means.detected") value = item.detected;
              else if (condition.field === "mean") value = item.mean;
              else return true;

              const threshold = parseFloat(condition.value);
              if (condition.operator === ">") return value > threshold;
              if (condition.operator === ">=") return value >= threshold;
              if (condition.operator === "<") return value < threshold;
              if (condition.operator === "<=") return value <= threshold;
              if (condition.operator === "==") return Math.abs(value - threshold) < 0.0001;
              return true;
            });
          });

          // Take top N
          filtered = filtered.slice(0, filterTopN);
          setFilteredGenes(filtered.map(item => item.gene));
        }
      }
    };

    props.scranWorker.addEventListener("message", handleMessage);
    listenerRef.current = handleMessage;
    return () => {
      props.scranWorker.removeEventListener("message", listenerRef.current);
    };
  }, [props.scranWorker, filterConditions, filterTopN]);

  return (
    <div className="topmarker-container">
      <div className="topmarker-controls">
        <Label>
          Choose annotation
          <HTMLSelect
            value={selectedAnnotation || ""}
            onChange={(e) => setSelectedAnnotation(e.target.value)}
            fill
            disabled={loading}
          >
            {allCols.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </HTMLSelect>
        </Label>

        <Label>
          Top N markers per cluster
          <NumericInput
            value={topN}
            onValueChange={(v) => setTopN(typeof v === "number" ? v : 7)}
            min={1}
            max={50}
            stepSize={1}
            disabled={loading}
            fill
          />
        </Label>

        {!hasH5adMarkers && (
          <Label>
            Upload marker genes (optional)
            <Popover2
              content={
                <div style={{ padding: "10px", maxWidth: "300px" }}>
                  Upload a CSV/TSV/XLSX file with two columns: cluster and gene.
                  Format: cluster, gene (e.g., "0, CD3D")
                </div>
              }
              placement="right"
            >
              <Icon
                icon="info-sign"
                size={14}
                style={{ marginLeft: "5px", cursor: "help" }}
              />
            </Popover2>
            <FileInput
              text={uploadedMarkers ? "File uploaded" : "Choose file..."}
              onInputChange={handleFileUpload}
              disabled={loading}
              fill
            />
          </Label>
        )}

        {hasH5adMarkers && !uploadedMarkers && (
          <Callout intent="success" icon="tick">
            H5AD file contains marker genes in uns structure
          </Callout>
        )}

        <div className="topmarker-actions">
          <Button
            intent="primary"
            text="Generate Plot"
            onClick={handleGeneratePlot}
            disabled={loading || !selectedAnnotation}
            icon="chart"
          />
        </div>

        {loading && (
          <Callout intent="primary" icon={<Spinner size={16} />}>
            Generating plot...
          </Callout>
        )}

        {error && (
          <Callout intent="danger" icon="error">
            {error}
          </Callout>
        )}

        {/* Gene Filter Section */}
        <div className="topmarker-filter-section" style={{ marginTop: "30px", borderTop: "2px solid #ddd", paddingTop: "20px" }}>
          <h4>Gene Filter</h4>

          <Label>
            Select Cluster
            <HTMLSelect
              value={filterCluster || ""}
              onChange={(e) => setFilterCluster(e.target.value)}
              fill
              disabled={filterLoading || !selectedAnnotation}
            >
              <option value="">Choose cluster...</option>
              {selectedAnnotation && annotationObj[selectedAnnotation] && (() => {
                const data = annotationObj[selectedAnnotation];
                const levels = data.type === "factor" ? data.levels : [...new Set(data.values)];
                return levels.map(level => (
                  <option key={level} value={level}>{level}</option>
                ));
              })()}
            </HTMLSelect>
          </Label>

          <Label>
            Top N markers
            <NumericInput
              value={filterTopN}
              onValueChange={(v) => setFilterTopN(typeof v === "number" ? v : 10)}
              min={1}
              max={100}
              stepSize={1}
              disabled={filterLoading}
              fill
            />
          </Label>

          <Label>
            Filter Conditions
            <div className="filter-conditions">
              {filterConditions.map((condition, index) => (
                <div key={index} className="filter-condition-row" style={{ display: "flex", gap: "5px", marginBottom: "5px" }}>
                  <HTMLSelect
                    value={condition.field}
                    onChange={(e) => updateFilterCondition(index, "field", e.target.value)}
                    disabled={filterLoading}
                  >
                    <option value="means.lfc">avg_log2FC</option>
                    <option value="means.cohen">Cohen's d</option>
                    <option value="means.auc">AUC</option>
                    <option value="means.detected">pct.1</option>
                    <option value="mean">Mean Expression</option>
                  </HTMLSelect>

                  <HTMLSelect
                    value={condition.operator}
                    onChange={(e) => updateFilterCondition(index, "operator", e.target.value)}
                    disabled={filterLoading}
                  >
                    <option value=">">{">"}</option>
                    <option value=">=">{">="}</option>
                    <option value="<">{"<"}</option>
                    <option value="<=">{"<="}</option>
                    <option value="==">{"=="}</option>
                  </HTMLSelect>

                  <NumericInput
                    value={condition.value}
                    onValueChange={(v) => updateFilterCondition(index, "value", typeof v === "number" ? v : 0)}
                    stepSize={0.1}
                    minorStepSize={0.01}
                    disabled={filterLoading}
                    style={{ width: "100px" }}
                  />

                  <Button
                    icon="cross"
                    minimal
                    onClick={() => removeFilterCondition(index)}
                    disabled={filterLoading || filterConditions.length === 1}
                  />
                </div>
              ))}

              <Button
                icon="plus"
                text="Add Condition"
                minimal
                onClick={addFilterCondition}
                disabled={filterLoading}
                style={{ marginTop: "5px" }}
              />
            </div>
          </Label>

          <Button
            intent="primary"
            text="Filter Genes"
            onClick={handleFilterGenes}
            disabled={filterLoading || !filterCluster || !selectedAnnotation}
            icon="filter"
          />

          {filterLoading && (
            <Callout intent="primary" icon={<Spinner size={16} />} style={{ marginTop: "10px" }}>
              Filtering genes...
            </Callout>
          )}
        </div>
      </div>

      <div className="topmarker-plot">
        <canvas ref={canvasRef} />

        {/* Filtered Genes Panel */}
        {filteredGenes.length > 0 && (
          <div className="filtered-genes-panel" style={{
            marginTop: "20px",
            padding: "15px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            backgroundColor: "#f9f9f9"
          }}>
            <h4>Filtered Genes ({filteredGenes.length})</h4>
            <div style={{
              maxHeight: "400px",
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: "14px",
              lineHeight: "1.8"
            }}>
              {filteredGenes.map((gene, index) => (
                <div key={index} style={{ padding: "2px 0" }}>
                  {index + 1}. {gene}
                </div>
              ))}
            </div>
            <Button
              text="Copy All"
              icon="clipboard"
              small
              style={{ marginTop: "10px" }}
              onClick={() => {
                navigator.clipboard.writeText(filteredGenes.join("\n"));
              }}
            />
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default React.memo(TopMarker);
