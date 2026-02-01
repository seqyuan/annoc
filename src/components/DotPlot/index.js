import React, { useEffect, useContext, useState, useRef } from "react";
import {
  Button,
  HTMLSelect,
  TextArea,
  Label,
  Callout,
  Spinner,
  FileInput,
  MenuItem,
} from "@blueprintjs/core";
import { Select2 } from "@blueprintjs/select";
import * as d3 from "d3";

import { AppContext } from "../../context/AppContext";
import { getSuppliedCols, getComputedCols } from "../../utils/utils";
import "./dotplot.css";

const COLORMAP_INTERPOLATORS = {
  Blues: d3.interpolateBlues,
  Reds: d3.interpolateReds,
  Greens: d3.interpolateGreens,
  Oranges: d3.interpolateOranges,
  Purples: d3.interpolatePurples,
  Greys: d3.interpolateGreys,
  Viridis: d3.interpolateViridis,
  Plasma: d3.interpolatePlasma,
  Inferno: d3.interpolateInferno,
  Magma: d3.interpolateMagma,
  Warm: d3.interpolateWarm,
  Cool: d3.interpolateCool,
  RdYlBu: d3.interpolateRdYlBu,
  Spectral: d3.interpolateSpectral,
};

const COLORMAP_NAMES = Object.keys(COLORMAP_INTERPOLATORS);

function colormapBarStyle(name) {
  const interp = COLORMAP_INTERPOLATORS[name] || d3.interpolateBlues;
  return {
    background: `linear-gradient(to right, ${Array.from(
      { length: 21 },
      (_, i) => interp(i / 20)
    ).join(", ")})`,
  };
}

const DotPlot = (props) => {
  const { annotationCols, genesInfo, globalClusterOrder } = useContext(AppContext);

  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [geneInput, setGeneInput] = useState("");
  const [dotplotData, setDotplotData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validGenes, setValidGenes] = useState([]);
  const [invalidGenes, setInvalidGenes] = useState([]);
  const [colormap, setColormap] = useState("Blues");

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Initialize selected annotation
  useEffect(() => {
    if (annotationCols && selectedAnnotation === null) {
      const allCols = [...getSuppliedCols(annotationCols), ...getComputedCols(annotationCols)];
      if (allCols.length > 0) {
        // Try to find a default cluster column
        let defaultCol = allCols[0];
        if (allCols.includes("seurat_clusters")) {
          defaultCol = "seurat_clusters";
        } else if (allCols.includes("clusters")) {
          defaultCol = "clusters";
        }
        setSelectedAnnotation(defaultCol);
      }
    }
  }, [annotationCols, selectedAnnotation]);

  // Gene names: prefer rowNames (like DimPlot), else first array column
  const getGeneNames = () => {
    if (!genesInfo || typeof genesInfo !== "object") return null;
    if (Array.isArray(genesInfo.rowNames)) return genesInfo.rowNames;
    const keys = Object.keys(genesInfo);
    for (const k of keys) {
      const v = genesInfo[k];
      if (Array.isArray(v) || (v && typeof v.length === "number" && v.length > 0)) return Array.isArray(v) ? v : Array.from(v);
    }
    return null;
  };

  const parseGeneInput = (input) => {
    if (!input.trim()) return [];

    // Split by newlines or commas
    const genes = input
      .split(/[\n,]+/)
      .map((g) => g.trim())
      .filter((g) => g.length > 0);

    return genes;
  };

  const validateGenes = (genes) => {
    const geneNames = getGeneNames();
    if (!geneNames || geneNames.length === 0) {
      return { valid: [], invalid: genes, indices: [] };
    }

    const valid = [];
    const invalid = [];
    const indices = [];

    // Create a case-insensitive lookup map (convert to string for Symbol etc.)
    const geneNameMap = {};
    geneNames.forEach((name, idx) => {
      const key = String(name).toLowerCase();
      geneNameMap[key] = { name: String(name), index: idx };
    });

    genes.forEach((gene) => {
      const geneLower = gene.toLowerCase();
      if (geneNameMap[geneLower]) {
        valid.push(geneNameMap[geneLower].name);
        indices.push(geneNameMap[geneLower].index);
      } else {
        invalid.push(gene);
      }
    });

    return { valid, invalid, indices };
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setGeneInput(text);
    };
    reader.readAsText(file);
  };

  const handleGeneratePlot = () => {
    const genes = parseGeneInput(geneInput);
    if (genes.length === 0) {
      setError("Please enter at least one gene name");
      return;
    }

    const { valid, invalid, indices } = validateGenes(genes);

    setValidGenes(valid);
    setInvalidGenes(invalid);

    if (valid.length === 0) {
      setError("No valid genes found in the dataset");
      return;
    }

    setError(null);
    setLoading(true);

    // Request data from worker
    if (props.scranWorker) {
      props.scranWorker.postMessage({
        type: "getBatchGeneExpression",
        payload: {
          genes: indices,
          annotation: selectedAnnotation,
          modality: props.selectedModality,
        },
      });
    }
  };

  // Listen for worker response
  useEffect(() => {
    if (!props.scranWorker) return;

    const handleMessage = (event) => {
      const { type, resp } = event.data;
      if (type === "setBatchGeneExpression") {
        setDotplotData(resp);
        setLoading(false);
      }
    };

    props.scranWorker.addEventListener("message", handleMessage);
    return () => {
      props.scranWorker.removeEventListener("message", handleMessage);
    };
  }, [props.scranWorker]);

  // Render dotplot when data is available
  useEffect(() => {
    if (dotplotData && canvasRef.current && containerRef.current) {
      renderDotplot();
    }
  }, [dotplotData, globalClusterOrder, colormap, selectedAnnotation]);

  const renderDotplot = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const { genes, clusters, data } = dotplotData;

    const nameList = getGeneNames();
    if (!nameList) return;
    const geneNames = genes.map((idx) => nameList[idx] ?? String(idx));

    // Apply global cluster order if available; keep only clusters present in response, append any missing
    let orderedClusters = clusters;
    if (selectedAnnotation && globalClusterOrder[selectedAnnotation]) {
      const savedOrder = globalClusterOrder[selectedAnnotation];
      const clusterSet = new Set(clusters);
      const fromOrder = savedOrder.filter((c) => clusterSet.has(c));
      const missing = clusters.filter((c) => !savedOrder.includes(c));
      orderedClusters = fromOrder.length > 0 ? [...fromOrder, ...missing] : clusters;
    }

    // Canvas dimensions
    const margin = { top: 100, right: 200, bottom: 50, left: 150 };
    const cellWidth = 35;
    const cellHeight = 25;
    const width = geneNames.length * cellWidth + margin.left + margin.right;
    const height = orderedClusters.length * cellHeight + margin.top + margin.bottom;

    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    // Find max values for scaling
    let maxAvg = 0;
    let maxPct = 0;
    genes.forEach((geneIdx) => {
      orderedClusters.forEach((cluster) => {
        const cellData = data[geneIdx]?.[cluster];
        if (cellData) {
          maxAvg = Math.max(maxAvg, cellData.avg);
          maxPct = Math.max(maxPct, cellData.pct);
        }
      });
    });

    // Color scale for average expression
    const colorScale = d3.scaleSequential(COLORMAP_INTERPOLATORS[colormap] || d3.interpolateBlues).domain([0, maxAvg]);

    // Size scale for percentage expressed (pct is 0-1, convert to radius)
    // Limit max radius to prevent oversized dots
    const maxRadius = Math.min(cellWidth / 2 - 2, cellHeight / 2 - 2, 14);
    const sizeScale = d3.scaleSqrt().domain([0, 1]).range([0, maxRadius]);

    // Draw gene labels (top): after -45° rotation, left end of text aligns with column center
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "black";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    geneNames.forEach((gene, i) => {
      const colCenterX = margin.left + i * cellWidth + cellWidth / 2;
      const labelY = margin.top - 10;
      ctx.save();
      ctx.translate(colCenterX, labelY);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(gene, 0, 0);
      ctx.restore();
    });

    // Draw cluster labels (left)
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "black";
    orderedClusters.forEach((cluster, i) => {
      ctx.fillText(
        String(cluster),
        margin.left - 10,
        margin.top + i * cellHeight + cellHeight / 2
      );
    });

    // Draw dots
    genes.forEach((geneIdx, geneI) => {
      orderedClusters.forEach((cluster, clusterI) => {
        const cellData = data[geneIdx]?.[cluster];
        if (cellData && cellData.pct > 0) {
          const x = margin.left + geneI * cellWidth + cellWidth / 2;
          const y = margin.top + clusterI * cellHeight + cellHeight / 2;
          const radius = sizeScale(cellData.pct);
          const color = colorScale(cellData.avg);

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    });

    // Draw legend (top aligned with plot top edge)
    const legendX = width - margin.right + 20;
    const legendY = margin.top;

    // Size legend (Pct. Expressed)
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = "black";
    ctx.textAlign = "left";
    ctx.fillText("Pct. Exp (%)", legendX, legendY);

    [0.25, 0.5, 0.75, 1.0].forEach((pct, i) => {
      const radius = sizeScale(pct);
      const y = legendY + 20 + i * (maxRadius * 2 + 8);
      ctx.beginPath();
      ctx.arc(legendX + maxRadius, y, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "black";
      ctx.fillText(`${(pct * 100).toFixed(0)}%`, legendX + maxRadius * 2 + 8, y + 4);
    });

    // Color legend (Avg. Expression) — extra gap below size legend
    const colorLegendY = legendY + 200;
    ctx.font = "bold 11px sans-serif";
    ctx.fillStyle = "black";
    ctx.fillText("Avg. Exp", legendX, colorLegendY - 10);
    const gradientHeight = 80;
    const gradientWidth = 14;

    // Draw gradient bar
    const gradient = ctx.createLinearGradient(0, colorLegendY + gradientHeight, 0, colorLegendY);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      gradient.addColorStop(t, colorScale(t * maxAvg));
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, colorLegendY, gradientWidth, gradientHeight);
    ctx.strokeStyle = "#ccc";
    ctx.strokeRect(legendX, colorLegendY, gradientWidth, gradientHeight);

    // Color scale labels
    ctx.fillStyle = "black";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(maxAvg.toFixed(2), legendX + gradientWidth + 5, colorLegendY + 4);
    ctx.fillText((maxAvg / 2).toFixed(2), legendX + gradientWidth + 5, colorLegendY + gradientHeight / 2 + 4);
    ctx.fillText("0", legendX + gradientWidth + 5, colorLegendY + gradientHeight + 4);
  };

  return (
    <div className="dotplot-container">
      {/* Left Panel - Controls */}
      <div className="dotplot-left-panel">
        <div className="dotplot-controls">
          <Label>
            Group by:
            <HTMLSelect
              value={selectedAnnotation || ""}
              onChange={(e) => setSelectedAnnotation(e.target.value)}
              fill
              disabled={loading}
            >
              {annotationCols && (
                <>
                  {getSuppliedCols(annotationCols).length > 0 && (
                    <optgroup label="Supplied">
                      {getSuppliedCols(annotationCols).map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {getComputedCols(annotationCols).length > 0 && (
                    <optgroup label="Computed">
                      {getComputedCols(annotationCols).map((col) => (
                        <option key={col} value={col}>
                          {col.replace("KANA_CODE::", "")}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </HTMLSelect>
          </Label>

          <Label style={{ marginTop: "15px" }}>
            Gene input (one per line or comma-separated):
            <TextArea
              value={geneInput}
              onChange={(e) => setGeneInput(e.target.value)}
              placeholder="CD3D&#10;CD8A&#10;CD4&#10;..."
              fill
              rows={6}
              disabled={loading}
            />
          </Label>

          <div className="dotplot-file-upload">
            <FileInput
              text="Upload gene list file..."
              onInputChange={handleFileUpload}
              disabled={loading}
            />
          </div>

          <div className="dotplot-actions">
            <Button
              intent="primary"
              text="Generate Plot"
              onClick={handleGeneratePlot}
              disabled={loading || !selectedAnnotation}
              icon="chart"
            />
            <Button
              text="Clear"
              onClick={() => {
                setGeneInput("");
                setDotplotData(null);
                setError(null);
                setValidGenes([]);
                setInvalidGenes([]);
              }}
              disabled={loading}
              style={{ marginLeft: "10px" }}
            />
          </div>
        </div>
      </div>

      {/* Right Panel - Canvas and Messages */}
      <div className="dotplot-right-panel">
        <div className="dotplot-status-messages">
          {loading && (
            <Callout intent="primary" icon={<Spinner size={16} />} style={{ marginBottom: "10px" }}>
              Generating dotplot...
            </Callout>
          )}

          {error && (
            <Callout intent="danger" icon="error" style={{ marginBottom: "10px" }}>
              {error}
            </Callout>
          )}

          {invalidGenes.length > 0 && (
            <Callout intent="warning" icon="warning-sign" style={{ marginBottom: "10px" }}>
              <strong>Genes not found:</strong> {invalidGenes.join(", ")}
            </Callout>
          )}
        </div>

        {/* Plot panel: same box as Explore's plot + Choose annotation */}
        <div className="dotplot-plot-panel">
          <div className="dotplot-canvas-container" ref={containerRef}>
            {dotplotData ? (
              <canvas ref={canvasRef} className="dotplot-canvas" />
            ) : (
              <Callout intent="primary" icon="info-sign">
                Enter gene names and click "Generate Plot" to create a dotplot visualization.
              </Callout>
            )}
          </div>
          <div className="dotplot-colormap-corner">
            <span className="dotplot-colormap-label">Colormap:</span>
            <div className="dotplot-colormap-row">
              <div
                className="dotplot-colormap-bar"
                style={colormapBarStyle(colormap)}
                title={colormap}
              />
              <Select2
                items={COLORMAP_NAMES}
                filterable={false}
                onItemSelect={(name) => setColormap(name)}
                itemRenderer={(name, { handleClick, modifiers, ref }) => (
                  <MenuItem
                    key={name}
                    elementRef={ref}
                    active={modifiers.active}
                    onClick={handleClick}
                    text={<div className="dotplot-colormap-option-bar" style={colormapBarStyle(name)} />}
                    style={{ padding: "4px 8px" }}
                  />
                )}
                disabled={loading}
              >
                <Button
                  icon="caret-down"
                  disabled={loading}
                  minimal
                  title="Choose colormap"
                />
              </Select2>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(DotPlot);
