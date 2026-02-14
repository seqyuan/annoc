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
  Icon,
} from "@blueprintjs/core";
import { Select2 } from "@blueprintjs/select";
import { MultiSelect } from "@blueprintjs/select";
import { Popover2, Tooltip2 } from "@blueprintjs/popover2";
import * as d3 from "d3";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

import { AppContext } from "../../context/AppContext";
import { getSuppliedCols, getComputedCols } from "../../utils/utils";
import ClusterAnnotation from "../ClusterAnnotation";
import "./dotplot.css";

// Expected upload format: col0 = category (e.g. "T cells"), col1 = gene. Supports CSV, TXT, XLSX.
function isHeaderRow(cells) {
  if (!cells || cells.length < 2) return false;
  const a = String(cells[0] ?? "").trim().toLowerCase();
  const b = String(cells[1] ?? "").trim().toLowerCase();
  return (
    (a === "category" || a === "gene" || a === "group" || a === "genes") ||
    (b === "category" || b === "gene" || b === "group" || b === "genes")
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
  if (!firstSheet) return [];
  const sheet = wb.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const out = [];
  for (const row of rows) {
    const a = String(row[0] ?? "").trim();
    const b = String(row[1] ?? "").trim();
    if (a && b) out.push([a, b]);
  }
  if (out.length > 0 && isHeaderRow(out[0])) out.shift();
  return out;
}

function rowsToGeneGroups(rows) {
  const groups = [];
  let lastCat = null;
  for (const [cat, gene] of rows) {
    if (lastCat !== cat) {
      groups.push({ category: cat, genes: [] });
      lastCat = cat;
    }
    groups[groups.length - 1].genes.push(gene);
  }
  return groups;
}

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

// Classic marker gene list organized by cell types
const CLASSIC_MARKERS = {
  "Epithelial Cells": {
    "Squamous Epithelium": ["KRT5", "KRT14", "KRT15", "TP63", "ITGA6", "COL17A1"],
    "Columnar Epithelium": ["KRT8", "KRT18", "KRT19", "EPCAM", "CDH1", "MUC1"],
    "Basal Cells": ["KRT5", "KRT14", "TP63", "ITGA6", "NGFR", "DLK2"],
    "Goblet Cells": ["MUC2", "MUC5AC", "TFF3", "SPDEF", "AGR2"],
    "Club Cells": ["SCGB1A1", "SCGB3A2", "CYP2F2", "LYPD2"],
  },
  "Immune Cells": {
    "T Cells": ["CD3D", "CD3E", "CD3G", "IL7R", "CD2", "CD28"],
    "CD4+ T Cells": ["CD4", "IL7R", "TCF7", "MAL", "LDHB"],
    "CD8+ T Cells": ["CD8A", "CD8B", "GZMK", "CCL5", "NKG7"],
    "Regulatory T Cells": ["FOXP3", "IL2RA", "CTLA4", "IKZF2", "TIGIT"],
    "B Cells": ["CD19", "MS4A1", "CD79A", "CD79B", "IGHM", "IGHD"],
    "Plasma Cells": ["JCHAIN", "MZB1", "IGHG1", "IGHG3", "SDC1"],
    "NK Cells": ["NKG7", "GNLY", "KLRD1", "KLRF1", "NCAM1", "GZMB"],
    "Monocytes": ["CD14", "FCGR3A", "LYZ", "S100A8", "S100A9", "VCAN"],
    "Macrophages": ["CD68", "CD163", "MSR1", "MRC1", "MARCO", "C1QA"],
    "Dendritic Cells": ["CD1C", "CLEC9A", "FCER1A", "CLEC10A", "IRF8"],
    "Mast Cells": ["TPSAB1", "CPA3", "KIT", "MS4A2", "HDC"],
  },
  "Stromal Cells": {
    "Fibroblasts": ["COL1A1", "COL1A2", "DCN", "LUM", "VIM", "PDGFRA"],
    "Myofibroblasts": ["ACTA2", "TAGLN", "MYH11", "MYLK", "TPM2"],
    "Endothelial Cells": ["PECAM1", "VWF", "CDH5", "PLVAP", "ENG", "CD34"],
    "Lymphatic Endothelial": ["PROX1", "LYVE1", "PDPN", "FLT4", "CCL21"],
    "Pericytes": ["RGS5", "PDGFRB", "NOTCH3", "ACTA2", "MCAM"],
    "Smooth Muscle Cells": ["ACTA2", "MYH11", "TAGLN", "CNN1", "MYLK"],
  },
  "Neural Cells": {
    "Neurons": ["RBFOX3", "MAP2", "SYP", "SNAP25", "TUBB3"],
    "Astrocytes": ["GFAP", "AQP4", "SLC1A3", "SLC1A2", "ALDH1L1"],
    "Oligodendrocytes": ["MOG", "MBP", "PLP1", "MOBP", "OLIG2"],
    "Schwann Cells": ["MPZ", "PMP22", "S100B", "SOX10", "NGFR"],
  },
  "Cell Cycle": {
    "Cycling Cells": ["MKI67", "TOP2A", "PCNA", "CDKN3", "UBE2C", "HMGB2"],
  },
};

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
  const [geneGroups, setGeneGroups] = useState([]);
  const [groupRanges, setGroupRanges] = useState([]);
  const [selectedClassicMarkers, setSelectedClassicMarkers] = useState([]);
  const [markerSpecies, setMarkerSpecies] = useState("human");

  // Floating annotation panel state
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [reqAnnotation, setReqAnnotation] = useState(null);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const floatingPanelRef = useRef(null);

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

  // When species changes or selections change, rebuild gene groups
  useEffect(() => {
    if (selectedClassicMarkers.length > 0) {
      const groups = buildGeneGroupsFromSelections(selectedClassicMarkers, markerSpecies);
      setGeneGroups(groups);

      // Update gene input to show selected genes with categories
      const inputLines = groups.flatMap((g) =>
        g.genes.map((gene) => `${g.category}\t${gene}`)
      );
      setGeneInput(inputLines.join("\n"));
    } else {
      // Clear gene groups and input when no classic markers selected
      setGeneGroups([]);
      setGeneInput("");
    }
  }, [markerSpecies, selectedClassicMarkers]);

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

  // Helper function to convert gene name based on species
  const convertGeneName = (gene, species) => {
    if (species === "mouse") {
      // Mouse: first letter uppercase, rest lowercase (e.g., CD3D -> Cd3d)
      return gene.charAt(0).toUpperCase() + gene.slice(1).toLowerCase();
    }
    // Human: keep original (all uppercase for most markers)
    return gene;
  };

  // Helper function to simplify cell type names for display
  const simplifyCellTypeName = (name) => {
    const simplifications = {
      "Squamous Epithelium": "Squamous Epi",
      "Columnar Epithelium": "Columnar Epi",
      "Basal Cells": "Basal",
      "Goblet Cells": "Goblet",
      "Club Cells": "Club",
      "T Cells": "T",
      "CD4+ T Cells": "CD4+ T",
      "CD8+ T Cells": "CD8+ T",
      "Regulatory T Cells": "Treg",
      "B Cells": "B",
      "Plasma Cells": "Plasma",
      "NK Cells": "NK",
      "Dendritic Cells": "DC",
      "Mast Cells": "Mast",
      "Lymphatic Endothelial": "Lymphatic Endo",
      "Endothelial Cells": "Endothelial",
      "Smooth Muscle Cells": "Smooth Muscle",
      "Cycling Cells": "Cycling",
    };
    return simplifications[name] || name;
  };

  // Helper function to build gene groups from selections
  const buildGeneGroupsFromSelections = (selections, species) => {
    const groups = [];
    selections.forEach((sel) => {
      const [majorCategory, subCategory] = sel.split(" > ");
      const genes = CLASSIC_MARKERS[majorCategory]?.[subCategory];
      if (genes && genes.length > 0) {
        const convertedGenes = genes.map((gene) => convertGeneName(gene, species));
        groups.push({
          category: simplifyCellTypeName(subCategory),
          genes: convertedGenes,
        });
      }
    });
    return groups;
  };

  const parseGeneInput = (input) => {
    if (!input.trim()) return { genes: [], groups: [] };

    const lines = input.split(/\r?\n/).filter((line) => line.trim());
    const genes = [];
    const detectedGroups = [];
    let hasTwoColumn = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try to detect two-column format: category + gene
      // Priority: Tab > Comma > Space (from right to support "T cell Cd3d")
      let category = null;
      let gene = null;

      if (trimmed.includes('\t')) {
        // Tab-separated (highest priority)
        const parts = trimmed.split('\t').map(p => p.trim()).filter(p => p);
        if (parts.length >= 2) {
          category = parts[0];
          gene = parts[1];
          hasTwoColumn = true;
        } else if (parts.length === 1) {
          gene = parts[0];
        }
      } else if (trimmed.includes(',')) {
        // Comma-separated (check if it's part of two-column format)
        const parts = trimmed.split(',').map(p => p.trim()).filter(p => p);
        if (parts.length >= 2) {
          category = parts[0];
          gene = parts[1];
          hasTwoColumn = true;
        } else if (parts.length === 1) {
          gene = parts[0];
        }
      } else if (trimmed.includes(' ')) {
        // Space-separated: find last space to support "T cell Cd3d"
        const lastSpaceIdx = trimmed.lastIndexOf(' ');
        const beforeSpace = trimmed.substring(0, lastSpaceIdx).trim();
        const afterSpace = trimmed.substring(lastSpaceIdx + 1).trim();

        if (beforeSpace && afterSpace) {
          category = beforeSpace;
          gene = afterSpace;
          hasTwoColumn = true;
        } else {
          gene = trimmed;
        }
      } else {
        // Single word, treat as gene only
        gene = trimmed;
      }

      if (gene) {
        genes.push(gene);

        if (category) {
          // Check if this category already exists
          let group = detectedGroups.find(g => g.category === category);
          if (!group) {
            group = { category, genes: [] };
            detectedGroups.push(group);
          }
          group.genes.push(gene);
        }
      }
    }

    // Only return groups if we detected at least one two-column line
    return {
      genes,
      groups: hasTwoColumn ? detectedGroups : []
    };
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

    const name = (file.name || "").toLowerCase();
    const isXlsx = name.endsWith(".xlsx");

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const rows = parseXlsxBuffer(e.target.result);
          const groups = rowsToGeneGroups(rows);
          setGeneGroups(groups);
          setGeneInput(groups.flatMap((g) => g.genes).join("\n"));
        } catch (err) {
          setError("Failed to parse XLSX: " + (err.message || String(err)));
          setGeneGroups([]);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const rows = parseCsvOrTxt(text);
        const groups = rowsToGeneGroups(rows);
        setGeneGroups(groups);
        setGeneInput(groups.flatMap((g) => g.genes).join("\n"));
      };
      reader.readAsText(file);
    }
    event.target.value = "";
  };

  const handleClassicMarkerSelection = (selections) => {
    setSelectedClassicMarkers(selections || []);
    // The useEffect will handle updating gene groups and input
  };

  const handleSavePDF = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error("Canvas not found");
      return;
    }

    // Convert canvas to image data
    const imgData = canvas.toDataURL("image/png");

    // Calculate PDF dimensions based on canvas size
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Create PDF in landscape or portrait based on aspect ratio
    const aspectRatio = canvasWidth / canvasHeight;
    let pdf;
    let pdfWidth, pdfHeight;

    if (aspectRatio > 1.4) {
      // Wide plot - use landscape
      pdf = new jsPDF('landscape', 'pt', 'a4');
      pdfWidth = pdf.internal.pageSize.getWidth();
      pdfHeight = pdf.internal.pageSize.getHeight();
    } else {
      // Tall or square plot - use portrait
      pdf = new jsPDF('portrait', 'pt', 'a4');
      pdfWidth = pdf.internal.pageSize.getWidth();
      pdfHeight = pdf.internal.pageSize.getHeight();
    }

    // Scale image to fit PDF page while maintaining aspect ratio
    const scale = Math.min(pdfWidth / canvasWidth, pdfHeight / canvasHeight);
    const scaledWidth = canvasWidth * scale;
    const scaledHeight = canvasHeight * scale;

    // Center the image on the page
    const x = (pdfWidth - scaledWidth) / 2;
    const y = (pdfHeight - scaledHeight) / 2;

    // Add image to PDF
    pdf.addImage(imgData, 'PNG', x, y, scaledWidth, scaledHeight);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `dotplot_${timestamp}.pdf`;

    // Save PDF
    pdf.save(filename);
  };

  const handleGeneratePlot = () => {
    let genes;
    let flatWithCategory = null;
    let detectedGroups = [];

    if (geneGroups.length > 0) {
      // From file upload
      genes = geneGroups.flatMap((g) => g.genes);
      flatWithCategory = geneGroups.flatMap((g) => g.genes.map((gene) => [gene, g.category]));
      detectedGroups = geneGroups;
    } else {
      // From text input - now supports both single-column and two-column format
      const parsed = parseGeneInput(geneInput);
      genes = parsed.genes;

      if (parsed.groups.length > 0) {
        // Two-column format detected in input
        flatWithCategory = parsed.groups.flatMap((g) => g.genes.map((gene) => [gene, g.category]));
        detectedGroups = parsed.groups;
      }
    }

    if (genes.length === 0) {
      setError("Please enter at least one gene name or upload a file (col1=category, col2=gene)");
      return;
    }

    const { valid, invalid, indices } = validateGenes(genes);

    setValidGenes(valid);
    setInvalidGenes(invalid);

    if (valid.length === 0) {
      setError("No valid genes found in the dataset");
      return;
    }

    if (flatWithCategory && indices.length > 0) {
      // Build a map from original gene name (lowercase) to category
      const geneToCategory = {};
      flatWithCategory.forEach(([gene, category]) => {
        geneToCategory[gene.toLowerCase()] = category;
      });

      // Map valid genes to their categories
      const validCategories = valid.map((gene) => geneToCategory[gene.toLowerCase()]);
      const ranges = [];
      let start = 0;
      for (let i = 1; i <= validCategories.length; i++) {
        if (i === validCategories.length || validCategories[i] !== validCategories[start]) {
          ranges.push({
            category: validCategories[start],
            startCol: start,
            endCol: i,
          });
          start = i;
        }
      }
      setGroupRanges(ranges);
    } else {
      setGroupRanges([]);
    }

    setError(null);
    setLoading(true);

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
  }, [dotplotData, globalClusterOrder, colormap, selectedAnnotation, groupRanges]);

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
    const margin = { top: 100, right: 200, bottom: 100, left: 150 };

    // Adaptive cellWidth based on container width
    const containerWidth = containerRef.current?.clientWidth || 1200;
    const maxWidth = containerWidth - margin.left - margin.right - 20; // 20px padding
    const idealCellWidth = Math.floor(maxWidth / geneNames.length);
    const cellWidth = Math.min(35, Math.max(20, idealCellWidth)); // Between 20-35px

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

    // Draw category lines and labels below the plot
    if (groupRanges && groupRanges.length > 0) {
      const plotBottom = margin.top + orderedClusters.length * cellHeight;
      const lineY = plotBottom + 20; // 20px below the plot
      const textY = lineY + 15; // 15px below the line
      const lineThickness = 2.5;

      ctx.strokeStyle = "black";
      ctx.lineWidth = lineThickness;
      ctx.fillStyle = "black";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      groupRanges.forEach(({ category, startCol, endCol }) => {
        // Calculate line start and end positions (center of first and last gene columns)
        const startX = margin.left + startCol * cellWidth + cellWidth / 2;
        const endX = margin.left + (endCol - 1) * cellWidth + cellWidth / 2;
        const centerX = (startX + endX) / 2;

        // Draw horizontal line
        ctx.beginPath();
        ctx.moveTo(startX, lineY);
        ctx.lineTo(endX, lineY);
        ctx.stroke();

        // Draw category text centered below the line
        ctx.fillText(String(category), centerX, textY);
      });
    }

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

  // Draggable panel handlers
  const handleMouseDown = (e) => {
    if (e.target.classList.contains('floating-panel-header') ||
        e.target.closest('.floating-panel-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - panelPosition.x,
        y: e.clientY - panelPosition.y,
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPanelPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

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
            <div style={{ display: "flex", alignItems: "center", marginBottom: "5px" }}>
              Gene input:
              <Popover2
                content={
                  <div style={{ padding: "15px", maxWidth: "400px" }}>
                    <h4 style={{ marginTop: 0 }}>Gene Input Format</h4>
                    <p><strong>Single column</strong> (one gene per line):</p>
                    <pre style={{
                      background: "#f5f5f5",
                      padding: "10px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      overflow: "auto"
                    }}>
{`CD3D
CD8A
CD4
CD19`}
                    </pre>
                    <p><strong>Two columns</strong> (celltype + gene):</p>
                    <ul style={{ marginLeft: "20px", marginBottom: "10px" }}>
                      <li><strong>Tab-separated</strong> (recommended):</li>
                    </ul>
                    <pre style={{
                      background: "#f5f5f5",
                      padding: "10px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      overflow: "auto"
                    }}>
{`T cell	CD3D
T cell	CD8A
B cell	CD19`}
                    </pre>
                    <ul style={{ marginLeft: "20px", marginBottom: "10px" }}>
                      <li><strong>Comma-separated:</strong></li>
                    </ul>
                    <pre style={{
                      background: "#f5f5f5",
                      padding: "10px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      overflow: "auto"
                    }}>
{`T cell,CD3D
T cell,CD8A
B cell,CD19`}
                    </pre>
                  </div>
                }
                placement="right"
              >
                <Tooltip2 content="Click for input format help" placement="top">
                  <Icon
                    icon="help"
                    style={{
                      marginLeft: "8px",
                      cursor: "pointer",
                      color: "#5C7080"
                    }}
                  />
                </Tooltip2>
              </Popover2>
            </div>
            <TextArea
              value={geneInput}
              onChange={(e) => {
                setGeneInput(e.target.value);
                setGeneGroups([]);
              }}
              placeholder="CD3D&#10;CD8A&#10;CD4&#10;..."
              fill
              rows={6}
              disabled={loading}
            />
          </Label>

          <div className="dotplot-file-upload">
            <FileInput
              text="Upload marker list"
              onInputChange={handleFileUpload}
              disabled={loading}
              inputProps={{ accept: ".csv,.txt,.xlsx" }}
            />
            <Popover2
              content={
                <div style={{ padding: "15px", maxWidth: "400px" }}>
                  <h4 style={{ marginTop: 0 }}>Upload File Format</h4>
                  <p><strong>Supported formats:</strong> CSV, TXT, XLSX</p>
                  <p><strong>Required columns:</strong></p>
                  <ul style={{ marginLeft: "20px", marginBottom: "10px" }}>
                    <li><strong>Column 1:</strong> Category/Group name (e.g., "T cells", "B cells")</li>
                    <li><strong>Column 2:</strong> Gene name (e.g., "CD3D", "CD8A")</li>
                  </ul>
                  <p><strong>Example CSV:</strong></p>
                  <pre style={{
                    background: "#f5f5f5",
                    padding: "10px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    overflow: "auto"
                  }}>
{`category,gene
T cells,CD3D
T cells,CD8A
T cells,CD4
B cells,CD19
B cells,MS4A1`}
                  </pre>
                  <p style={{ fontSize: "12px", color: "#666", marginBottom: 0 }}>
                    <strong>Note:</strong> Header row is optional. Files can be tab-delimited or comma-delimited.
                  </p>
                </div>
              }
              placement="right"
            >
              <Tooltip2 content="Click for file format help" placement="top">
                <Icon
                  icon="help"
                  style={{
                    marginLeft: "8px",
                    cursor: "pointer",
                    color: "#5C7080"
                  }}
                />
              </Tooltip2>
            </Popover2>
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
                setGeneGroups([]);
                setGroupRanges([]);
                setDotplotData(null);
                setError(null);
                setValidGenes([]);
                setInvalidGenes([]);
                setSelectedClassicMarkers([]);
                setMarkerSpecies("human");
              }}
              disabled={loading}
              style={{ marginLeft: "10px" }}
            />
            <Button
              text="SaveFig"
              onClick={handleSavePDF}
              disabled={!dotplotData}
              icon="download"
              style={{ marginLeft: "10px" }}
              title="Save plot as PDF"
            />
          </div>

          <Label style={{ marginTop: "15px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "5px", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                Classic marker:
                <Popover2
                  content={
                    <div style={{ padding: "15px", maxWidth: "350px" }}>
                      <h4 style={{ marginTop: 0 }}>Classic Marker Genes</h4>
                      <p>Select one or more cell types to automatically populate marker genes.</p>
                      <p><strong>Categories available:</strong></p>
                      <ul style={{ marginLeft: "20px", fontSize: "12px" }}>
                        <li>Epithelial Cells (squamous, columnar, basal, etc.)</li>
                        <li>Immune Cells (T, B, NK, myeloid, etc.)</li>
                        <li>Stromal Cells (fibroblasts, endothelial, etc.)</li>
                        <li>Neural Cells (neurons, astrocytes, etc.)</li>
                        <li>Cell Cycle (cycling cells)</li>
                      </ul>
                      <p style={{ fontSize: "12px", color: "#666", marginTop: "10px" }}>
                        <strong>Species:</strong> Select <em>Human</em> for uppercase gene names (e.g., CD3D) or <em>Mouse</em> for title case (e.g., Cd3d).
                      </p>
                    </div>
                  }
                  placement="right"
                >
                  <Tooltip2 content="Click for more info" placement="top">
                    <Icon
                      icon="help"
                      style={{
                        marginLeft: "8px",
                        cursor: "pointer",
                        color: "#5C7080"
                      }}
                    />
                  </Tooltip2>
                </Popover2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <HTMLSelect
                  value={markerSpecies}
                  onChange={(e) => setMarkerSpecies(e.target.value)}
                  disabled={loading}
                  style={{ minWidth: "90px" }}
                >
                  <option value="human">Human</option>
                  <option value="mouse">Mouse</option>
                </HTMLSelect>
              </div>
            </div>
            <MultiSelect
              items={(() => {
                const items = [];
                Object.entries(CLASSIC_MARKERS).forEach(([major, subs]) => {
                  Object.keys(subs).forEach((sub) => {
                    items.push(`${major} > ${sub}`);
                  });
                });
                return items;
              })()}
              selectedItems={selectedClassicMarkers}
              onItemSelect={(item) => {
                const newSelection = selectedClassicMarkers.includes(item)
                  ? selectedClassicMarkers.filter((s) => s !== item)
                  : [...selectedClassicMarkers, item];
                handleClassicMarkerSelection(newSelection);
              }}
              itemRenderer={(item, { handleClick, modifiers }) => {
                const [major, sub] = item.split(" > ");
                const genes = CLASSIC_MARKERS[major]?.[sub] || [];
                const isSelected = selectedClassicMarkers.includes(item);
                return (
                  <MenuItem
                    key={item}
                    active={modifiers.active}
                    selected={isSelected}
                    onClick={handleClick}
                    text={
                      <div>
                        <div style={{ fontWeight: "500" }}>{sub}</div>
                        <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                          {major} • {genes.length} genes
                        </div>
                      </div>
                    }
                    icon={isSelected ? "tick" : "blank"}
                  />
                );
              }}
              itemPredicate={(query, item) => {
                const lowerQuery = query.toLowerCase();
                return item.toLowerCase().includes(lowerQuery);
              }}
              tagRenderer={(item) => {
                const [, sub] = item.split(" > ");
                return simplifyCellTypeName(sub);
              }}
              onRemove={(item) => {
                const newSelection = selectedClassicMarkers.filter((s) => s !== item);
                handleClassicMarkerSelection(newSelection);
              }}
              fill
              disabled={loading}
              placeholder="Select cell types..."
              popoverProps={{
                minimal: true,
                matchTargetWidth: false,
                popoverClassName: "dotplot-classic-marker-popover"
              }}
            />
          </Label>
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

      {/* Floating Annotation Panel Toggle Button */}
      <Tooltip2 content="Cluster Annotation" placement="left">
        <Button
          className="dotplot-annotation-toggle-btn"
          icon="annotation"
          intent={showAnnotationPanel ? "primary" : "none"}
          onClick={() => setShowAnnotationPanel(!showAnnotationPanel)}
        />
      </Tooltip2>

      {/* Floating Annotation Panel */}
      {showAnnotationPanel && (
        <div
          ref={floatingPanelRef}
          className="dotplot-floating-panel"
          style={{
            position: 'fixed',
            left: `${panelPosition.x}px`,
            top: `${panelPosition.y}px`,
            width: '360px',
            maxHeight: '80vh',
            backgroundColor: 'white',
            borderRadius: '4px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onMouseDown={handleMouseDown}
        >
          <div
            className="floating-panel-header"
            style={{
              padding: '10px 15px',
              backgroundColor: '#f5f5f5',
              borderBottom: '1px solid #ddd',
              cursor: isDragging ? 'grabbing' : 'grab',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              userSelect: 'none',
            }}
          >
            <strong>Cluster Annotation</strong>
            <Button
              minimal
              small
              icon="cross"
              onClick={() => setShowAnnotationPanel(false)}
            />
          </div>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
            }}
          >
            <ClusterAnnotation
              scranWorker={props.scranWorker}
              setReqAnnotation={setReqAnnotation}
              onlyAnnotation={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(DotPlot);
