import React, { useEffect, useContext, useState, useRef } from "react";
import {
  Button,
  HTMLSelect,
  Label,
  Callout,
  FileInput,
  NumericInput,
  Icon,
  RangeSlider,
} from "@blueprintjs/core";
import { Tooltip2 } from "@blueprintjs/popover2";
import * as XLSX from "xlsx";

import { AppContext } from "../../context/AppContext";
import { getSuppliedCols, getComputedCols } from "../../utils/utils";
import "./topmarker.css";

// Parse CSV/TSV
function parseCsvOrTxtFull(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  let headerCells = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

  // Detect row names column (data has one more column than header)
  if (lines.length > 1) {
    const sampleDataCells = lines[1].split(delimiter);
    if (sampleDataCells.length === headerCells.length + 1) {
      headerCells = ['rowname', ...headerCells];
    }
  }

  const headers = headerCells;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cells.length >= headers.length) {
      const row = {};
      headers.forEach((h, idx) => { row[h] = cells[idx]; });
      rows.push(row);
    }
  }
  return { headers, rows };
}

// Parse XLSX
function parseXlsxBufferFull(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return { headers: [], rows: [] };

  const sheet = wb.Sheets[firstSheet];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (jsonData.length === 0) return { headers: [], rows: [] };

  const headers = jsonData[0].map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < jsonData.length; i++) {
    const row = {};
    headers.forEach((h, idx) => { row[h] = String(jsonData[i][idx] || "").trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

const TopMarker = (props) => {
  const { annotationCols } = useContext(AppContext);

  // Upload state
  const [uploadedFileData, setUploadedFileData] = useState(null);
  const [fileColumns, setFileColumns] = useState([]);

  // Column selection
  const [clusterColumn, setClusterColumn] = useState("");
  const [geneColumn, setGeneColumn] = useState("");
  const [markerData, setMarkerData] = useState(null);

  // Group by
  const [groupByColumn, setGroupByColumn] = useState("");
  const [availableGroups, setAvailableGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);

  // Filters
  const [topN, setTopN] = useState(3);
  const [filterConditions, setFilterConditions] = useState([]);
  const [columnRanges, setColumnRanges] = useState({});
  const [filtersInitialized, setFiltersInitialized] = useState(false);

  // Results
  const [error, setError] = useState(null);
  const [filteredGenes, setFilteredGenes] = useState([]);

  // Table sorting
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState("asc");

  // Table filtering and display
  const [columnFilters, setColumnFilters] = useState({});
  const [visibleColumns, setVisibleColumns] = useState({});
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // ---- File upload ----
  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        let parsed;
        if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
          parsed = parseXlsxBufferFull(content);
        } else {
          const text = new TextDecoder().decode(content);
          parsed = parseCsvOrTxtFull(text);
        }

        if (parsed.rows.length === 0 || parsed.headers.length === 0) {
          setError("No valid data found in file");
          return;
        }

        setUploadedFileData(parsed);
        setFileColumns(parsed.headers);
        setFiltersInitialized(false);

        // Auto-detect columns
        const lowerHeaders = parsed.headers.map(h => h.toLowerCase());

        // Cluster column
        const clusterIdx = lowerHeaders.findIndex(h =>
          h.includes("cluster") || h.includes("group") || h === "celltype"
        );
        if (clusterIdx !== -1) setClusterColumn(parsed.headers[clusterIdx]);

        // Gene column: prioritize exact "gene" (Seurat) or "names" (Scanpy)
        let geneIdx = lowerHeaders.findIndex(h => h === "gene" || h === "names");
        if (geneIdx === -1) geneIdx = lowerHeaders.findIndex(h => h.includes("gene") || h.includes("name"));
        if (geneIdx !== -1) setGeneColumn(parsed.headers[geneIdx]);

        setError(null);
      } catch (err) {
        setError(`Failed to parse file: ${err.message}`);
      }
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsArrayBuffer(file);
  };

  // ---- Auto-process when columns selected ----
  useEffect(() => {
    if (!uploadedFileData || !clusterColumn || !geneColumn) return;

    const processedData = {
      headers: uploadedFileData.headers,
      rows: uploadedFileData.rows,
      clusterColumn,
      geneColumn
    };
    setMarkerData(processedData);

    // Calculate ranges for numeric columns
    const ranges = {};
    uploadedFileData.headers.forEach(header => {
      if (header === clusterColumn || header === geneColumn) return;
      const values = uploadedFileData.rows.map(row => parseFloat(row[header])).filter(v => !isNaN(v));
      if (values.length > 0) {
        ranges[header] = { min: Math.min(...values), max: Math.max(...values) };
      }
    });
    setColumnRanges(ranges);

    setGroupByColumn(clusterColumn);
    const groups = [...new Set(uploadedFileData.rows.map(row => row[clusterColumn]))].filter(Boolean);
    setAvailableGroups(groups);
    setSelectedGroups(groups);

    // Initialize visible columns (all visible by default)
    const initialVisibility = {};
    uploadedFileData.headers.forEach(h => { initialVisibility[h] = true; });
    setVisibleColumns(initialVisibility);
    setColumnFilters({});

    // Default filters (only once per file)
    if (!filtersInitialized) {
      const defaultFilters = [];
      const lowerHeaders = uploadedFileData.headers.map(h => h.toLowerCase());

      const log2fcIdx = lowerHeaders.findIndex(h =>
        h.includes("log2fc") || h.includes("avg_log2fc") || h.includes("logfc")
      );
      if (log2fcIdx !== -1 && ranges[uploadedFileData.headers[log2fcIdx]]) {
        const colName = uploadedFileData.headers[log2fcIdx];
        defaultFilters.push({ field: colName, min: 2, max: ranges[colName].max });
      }

      const pct1Idx = lowerHeaders.findIndex(h =>
        h === "pct.1" || h.includes("pct_1") || h.includes("pct1")
      );
      if (pct1Idx !== -1 && ranges[uploadedFileData.headers[pct1Idx]]) {
        const colName = uploadedFileData.headers[pct1Idx];
        defaultFilters.push({ field: colName, min: 0.25, max: ranges[colName].max });
      }

      setFilterConditions(defaultFilters);
      setFiltersInitialized(true);
    }
    setError(null);
  }, [uploadedFileData, clusterColumn, geneColumn]);

  // ---- Sorting ----
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleGroupByChange = (newGroupBy) => {
    setGroupByColumn(newGroupBy);
    if (markerData) {
      const groups = [...new Set(markerData.rows.map(row => row[newGroupBy]))].filter(Boolean);
      setAvailableGroups(groups);
      setSelectedGroups(groups);
    }
  };

  const handleUpdateFilter = (index, updates) => {
    const newConditions = [...filterConditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    setFilterConditions(newConditions);
  };

  const toggleGroup = (group) => {
    setSelectedGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  // ---- Table filtering ----
  const getFilteredAndSortedData = () => {
    if (!markerData) return [];
    let data = [...markerData.rows];

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, filterValue]) => {
      if (filterValue && filterValue.trim()) {
        const lowerFilter = filterValue.toLowerCase();
        data = data.filter(row =>
          String(row[column] || "").toLowerCase().includes(lowerFilter)
        );
      }
    });

    // Apply sorting
    if (sortColumn) {
      data.sort((a, b) => {
        const aNum = parseFloat(a[sortColumn]), bNum = parseFloat(b[sortColumn]);
        if (!isNaN(aNum) && !isNaN(bNum)) return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
        return sortDirection === "asc"
          ? String(a[sortColumn] || "").localeCompare(String(b[sortColumn] || ""))
          : String(b[sortColumn] || "").localeCompare(String(a[sortColumn] || ""));
      });
    }

    return data;
  };

  const handleColumnFilterChange = (column, value) => {
    setColumnFilters(prev => ({ ...prev, [column]: value }));
  };

  const toggleColumnVisibility = (column) => {
    setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }));
  };

  // ---- Export function ----
  const handleExportCSV = () => {
    if (!markerData) return;
    const data = getFilteredAndSortedData();
    const visibleHeaders = markerData.headers.filter(h => visibleColumns[h]);

    // Create CSV content
    const csvRows = [];
    csvRows.push(visibleHeaders.join(","));
    data.forEach(row => {
      const values = visibleHeaders.map(h => {
        const val = String(row[h] || "");
        return val.includes(",") ? `"${val}"` : val;
      });
      csvRows.push(values.join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "filtered_markers.csv";
    link.click();
  };

  // Check if a row is in filtered genes list
  const isRowInFilteredGenes = (row) => {
    if (!markerData || filteredGenes.length === 0) return false;
    const gene = row[markerData.geneColumn];
    const group = row[groupByColumn];
    return filteredGenes.some(item => item.gene === gene && item.group === group);
  };

  // ---- Generate filtered gene list ----
  const handleGenerateList = () => {
    if (!markerData) { setError("Please upload a marker file"); return; }
    if (!groupByColumn) { setError("Please select a group by column"); return; }
    if (selectedGroups.length === 0) { setError("Please select at least one group"); return; }
    if (!geneColumn) { setError("Please select a gene column"); return; }

    // Apply filters
    let filteredData = [...markerData.rows];
    filteredData = filteredData.filter(row => selectedGroups.includes(row[groupByColumn]));
    filterConditions.forEach(condition => {
      filteredData = filteredData.filter(row => {
        const value = parseFloat(row[condition.field]);
        if (isNaN(value)) return false;
        return value >= condition.min && value <= condition.max;
      });
    });

    // Group by cluster and get top N genes
    const genesByGroup = {};
    filteredData.forEach(row => {
      const group = row[groupByColumn];
      const gene = row[geneColumn];
      if (!genesByGroup[group]) genesByGroup[group] = [];
      genesByGroup[group].push(gene);
    });

    const genesWithGroups = [];
    Object.entries(genesByGroup).forEach(([group, genes]) => {
      const uniqueGenes = [...new Set(genes)].slice(0, topN);
      uniqueGenes.forEach(gene => { genesWithGroups.push({ group, gene }); });
    });

    setFilteredGenes(genesWithGroups);
    setError(null);
  };

  // ---- Render ----
  return (
    <div className="topmarker-container">
      <div className="topmarker-left-panel">
        {/* Upload */}
        <Label htmlFor="topmarker-file-input">
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Upload markers
            <Tooltip2 content="Upload Seurat/Scanpy marker output (CSV, TSV, XLSX).">
              <Icon icon="help" size={12} style={{ cursor: "help" }} />
            </Tooltip2>
          </div>
          <FileInput
            id="topmarker-file-input"
            inputProps={{ id: "topmarker-file-input", name: "topmarker-file" }}
            text={markerData ? "File uploaded" : "Choose file..."}
            onInputChange={handleFileUpload}
            fill
          />
        </Label>

        {/* Column selection */}
        {uploadedFileData && fileColumns.length > 0 && (
          <Label htmlFor="gene-column-select">
            Gene/Marker Column
            <HTMLSelect id="gene-column-select" name="gene-column" value={geneColumn}
              onChange={(e) => setGeneColumn(e.target.value)} fill>
              <option value="">Select...</option>
              {fileColumns.map(col => <option key={col} value={col}>{col}</option>)}
            </HTMLSelect>
          </Label>
        )}

        {/* Group by */}
        {markerData && (
          <>
            <Label htmlFor="group-by-select">
              Group by
              <HTMLSelect id="group-by-select" name="group-by" value={groupByColumn}
                onChange={(e) => handleGroupByChange(e.target.value)} fill>
                {fileColumns.map(col => <option key={col} value={col}>{col}</option>)}
              </HTMLSelect>
            </Label>

            {availableGroups.length > 0 && (
              <Label>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <span>Target Group(s)</span>
                  <div style={{ display: "flex", gap: 5 }}>
                    <Button
                      small
                      minimal
                      text="Select All"
                      onClick={() => setSelectedGroups([...availableGroups])}
                    />
                    <Button
                      small
                      minimal
                      text="Deselect All"
                      onClick={() => setSelectedGroups([])}
                    />
                  </div>
                </div>
                <div className="de-group-selector de-scrollable"
                  style={{ maxHeight: 90, overflowY: "auto", border: "1px solid #ddd", borderRadius: 4, padding: 10, backgroundColor: "white" }}>
                  {availableGroups.map(group => (
                    <label key={group} className="de-checkbox-label">
                      <input type="checkbox" checked={selectedGroups.includes(group)}
                        onChange={() => toggleGroup(group)} />
                      {group}
                    </label>
                  ))}
                </div>
              </Label>
            )}

            <Label htmlFor="top-n-input">
              Top N markers per cluster
              <NumericInput id="top-n-input" inputProps={{ id: "top-n-input", name: "top-n" }}
                value={topN} onValueChange={(v) => setTopN(typeof v === "number" ? v : 3)}
                min={1} max={50} stepSize={1} fill />
            </Label>

            {/* Filter column selector */}
            <Label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                Filter Columns
                <Tooltip2 content="Select which columns to use for filtering. Default: avg_logFC and pct.1">
                  <Icon icon="help" size={12} style={{ cursor: "help" }} />
                </Tooltip2>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 5 }}>
                {fileColumns.filter(col => {
                  const val = markerData.rows[0]?.[col];
                  return !isNaN(parseFloat(val));
                }).map(col => (
                  <label key={col} style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={filterConditions.some(f => f.field === col)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Add filter
                          const range = columnRanges[col];
                          if (range) {
                            setFilterConditions(prev => [...prev, { field: col, min: range.min, max: range.max }]);
                          }
                        } else {
                          // Remove filter
                          setFilterConditions(prev => prev.filter(f => f.field !== col));
                        }
                      }}
                      style={{ marginRight: 5 }}
                    />
                    {col}
                  </label>
                ))}
              </div>
            </Label>

            {/* Filter conditions - dynamic based on selection */}
            {filterConditions.map((condition, index) => (
              <div key={index} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ minWidth: 80, fontSize: 13, fontWeight: 500 }}>
                    {condition.field}
                  </span>
                  <div style={{ flex: 1 }}>
                    <RangeSlider
                      min={columnRanges[condition.field]?.min || 0}
                      max={columnRanges[condition.field]?.max || 1}
                      stepSize={(columnRanges[condition.field]?.max - columnRanges[condition.field]?.min) / 100 || 0.01}
                      labelStepSize={(columnRanges[condition.field]?.max - columnRanges[condition.field]?.min)}
                      labelRenderer={(value) => value.toFixed(2)}
                      value={[condition.min, condition.max]}
                      onChange={(range) => handleUpdateFilter(index, { min: range[0], max: range[1] })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Generate */}
        <Button intent="primary" text="Generate List" onClick={handleGenerateList}
          disabled={!markerData} fill large />

        {error && <Callout intent="danger" icon="error">{error}</Callout>}
      </div>

      <div className="topmarker-right-panel">
        {/* Top Genes + Full marker table */}
        {markerData && markerData.rows.length > 0 && (
          <div style={{ display: "flex", gap: 10, height: "100%" }}>
            <div className="topmarker-genes-list" style={{ position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h4 style={{ margin: 0 }}>Top Genes</h4>
                <Button
                  icon="duplicate"
                  text="Copy"
                  small
                  disabled={filteredGenes.length === 0}
                  onClick={() => {
                    const text = filteredGenes.map(item => `${item.group},${item.gene}`).join("\n");
                    navigator.clipboard.writeText(text).then(() => {
                      // Optional: show success feedback
                      const btn = document.activeElement;
                      if (btn) {
                        const originalText = btn.textContent;
                        btn.textContent = "Copied!";
                        setTimeout(() => { btn.textContent = originalText; }, 1500);
                      }
                    }).catch(err => {
                      console.error("Failed to copy:", err);
                    });
                  }}
                />
              </div>
              <div style={{ fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {filteredGenes.length > 0 ? (
                  filteredGenes.map((item, idx) => (
                    <div key={idx}>{item.group},{item.gene}</div>
                  ))
                ) : (
                  <div style={{ color: "#999", fontStyle: "italic" }}>
                    Click "Generate List" to display filtered genes
                  </div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, maxHeight: "100%", display: "flex", flexDirection: "column", border: "1px solid #ddd", borderRadius: 4, backgroundColor: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, borderBottom: "1px solid #ddd" }}>
                <h4 style={{ margin: 0 }}>All Markers ({getFilteredAndSortedData().length} / {markerData.rows.length} rows)</h4>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    icon="eye-open"
                    text="Columns"
                    small
                    onClick={() => setShowColumnSelector(!showColumnSelector)}
                  />
                  <Button
                    icon="download"
                    text="Export CSV"
                    small
                    onClick={handleExportCSV}
                  />
                  <Tooltip2 content="导出右侧表格中当前筛选和排序后的marker数据（基于表格列过滤器和排序，不是左侧参数）">
                    <Icon icon="help" size={14} style={{ cursor: "help", marginLeft: 4 }} />
                  </Tooltip2>
                </div>
              </div>

              {showColumnSelector && (
                <div style={{ padding: 10, borderBottom: "1px solid #ddd", backgroundColor: "#f9f9f9", maxHeight: 150, overflowY: "auto" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                    {markerData.headers.map(header => (
                      <label key={header} style={{ display: "flex", alignItems: "center", fontSize: 12, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={visibleColumns[header]}
                          onChange={() => toggleColumnVisibility(header)}
                          style={{ marginRight: 6 }}
                        />
                        {header}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f5f5f5", position: "sticky", top: 0, zIndex: 1 }}>
                      {markerData.headers.filter(h => visibleColumns[h]).map((header, idx) => (
                        <th key={idx}
                          style={{ padding: 6, borderBottom: "2px solid #ddd", textAlign: "left",
                            whiteSpace: "nowrap", backgroundColor: "#f5f5f5" }}>
                          <div onClick={() => handleSort(header)}
                            style={{ cursor: "pointer", userSelect: "none", marginBottom: 4 }}>
                            {header}
                            {sortColumn === header && <span style={{ marginLeft: 4 }}>{sortDirection === "asc" ? "▲" : "▼"}</span>}
                          </div>
                          <input
                            type="text"
                            placeholder="Filter..."
                            value={columnFilters[header] || ""}
                            onChange={(e) => handleColumnFilterChange(header, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: "100%",
                              padding: "2px 4px",
                              fontSize: 10,
                              border: "1px solid #ccc",
                              borderRadius: 2,
                              boxSizing: "border-box"
                            }}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAndSortedData().map((row, rowIdx) => {
                      const isHighlighted = isRowInFilteredGenes(row);
                      return (
                        <tr key={rowIdx}
                          style={{
                            borderBottom: "1px solid #eee",
                            backgroundColor: isHighlighted ? "#e8f5e9" : (rowIdx % 2 === 0 ? "white" : "#fafafa")
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isHighlighted ? "#c8e6c9" : "#f0f0f0"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isHighlighted ? "#e8f5e9" : (rowIdx % 2 === 0 ? "white" : "#fafafa")}
                        >
                          {markerData.headers.filter(h => visibleColumns[h]).map((header, colIdx) => (
                            <td key={colIdx} style={{ padding: 6, whiteSpace: "nowrap" }}>{row[header]}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopMarker;
