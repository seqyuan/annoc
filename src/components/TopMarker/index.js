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

  const getSortedData = () => {
    if (!markerData || !sortColumn) return markerData?.rows || [];
    return [...markerData.rows].sort((a, b) => {
      const aNum = parseFloat(a[sortColumn]), bNum = parseFloat(b[sortColumn]);
      if (!isNaN(aNum) && !isNaN(bNum)) return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      return sortDirection === "asc"
        ? String(a[sortColumn] || "").localeCompare(String(b[sortColumn] || ""))
        : String(b[sortColumn] || "").localeCompare(String(a[sortColumn] || ""));
    });
  };

  const handleGroupByChange = (newGroupBy) => {
    setGroupByColumn(newGroupBy);
    if (markerData) {
      const groups = [...new Set(markerData.rows.map(row => row[newGroupBy]))].filter(Boolean);
      setAvailableGroups(groups);
      setSelectedGroups(groups);
    }
  };

  const handleAddFilter = () => {
    const numericColumns = Object.keys(columnRanges);
    if (numericColumns.length > 0) {
      const firstCol = numericColumns[0];
      const range = columnRanges[firstCol];
      setFilterConditions([...filterConditions, { field: firstCol, min: range.min, max: range.max }]);
    }
  };

  const handleRemoveFilter = (index) => {
    setFilterConditions(filterConditions.filter((_, i) => i !== index));
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

  // ---- Generate filtered gene list ----
  const handleGenerateList = () => {
    if (!markerData) { setError("Please upload a marker file"); return; }
    if (!groupByColumn) { setError("Please select a group by column"); return; }
    if (selectedGroups.length === 0) { setError("Please select at least one group"); return; }

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
      const gene = row[markerData.geneColumn];
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
          <>
            <Label htmlFor="cluster-column-select">
              Cluster/Group Column
              <HTMLSelect id="cluster-column-select" name="cluster-column" value={clusterColumn}
                onChange={(e) => setClusterColumn(e.target.value)} fill>
                <option value="">Select...</option>
                {fileColumns.map(col => <option key={col} value={col}>{col}</option>)}
              </HTMLSelect>
            </Label>

            <Label htmlFor="gene-column-select">
              Gene/Marker Column
              <HTMLSelect id="gene-column-select" name="gene-column" value={geneColumn}
                onChange={(e) => setGeneColumn(e.target.value)} fill>
                <option value="">Select...</option>
                {fileColumns.map(col => <option key={col} value={col}>{col}</option>)}
              </HTMLSelect>
            </Label>
          </>
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
                Target Group(s)
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

            {/* Filter conditions */}
            <Label>
              Filter Conditions
              <Button icon="add" text="Add Filter" onClick={handleAddFilter}
                disabled={Object.keys(columnRanges).length === 0} small style={{ marginLeft: 10 }} />
            </Label>

            {filterConditions.map((condition, index) => (
              <div key={index} style={{ marginBottom: 10, padding: 10, border: "1px solid #ddd", borderRadius: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <HTMLSelect value={condition.field}
                    onChange={(e) => {
                      const newField = e.target.value;
                      const range = columnRanges[newField];
                      handleUpdateFilter(index, { field: newField, min: range.min, max: range.max });
                    }}>
                    {Object.keys(columnRanges).map(col => <option key={col} value={col}>{col}</option>)}
                  </HTMLSelect>
                  <Button icon="cross" minimal small onClick={() => handleRemoveFilter(index)} />
                </div>
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
            {filteredGenes.length > 0 && (
              <div className="topmarker-genes-list">
                <h4 style={{ marginTop: 0 }}>Top Genes</h4>
                <table style={{ width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 5 }}>Group</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 5 }}>Gene</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGenes.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: 5 }}>{item.group}</td>
                        <td style={{ padding: 5 }}>{item.gene}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ flex: 1, maxHeight: "100%", overflowY: "auto", border: "1px solid #ddd", borderRadius: 4, padding: 10, backgroundColor: "white" }}>
              <h4 style={{ marginTop: 0 }}>All Markers ({markerData.rows.length} rows)</h4>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f5f5f5", position: "sticky", top: 0 }}>
                      {markerData.headers.map((header, idx) => (
                        <th key={idx} onClick={() => handleSort(header)}
                          style={{ padding: 6, borderBottom: "2px solid #ddd", textAlign: "left",
                            whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", backgroundColor: "#f5f5f5" }}>
                          {header}
                          {sortColumn === header && <span style={{ marginLeft: 4 }}>{sortDirection === "asc" ? "▲" : "▼"}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedData().map((row, rowIdx) => (
                      <tr key={rowIdx} style={{ borderBottom: "1px solid #eee" }}>
                        {markerData.headers.map((header, colIdx) => (
                          <td key={colIdx} style={{ padding: 6, whiteSpace: "nowrap" }}>{row[header]}</td>
                        ))}
                      </tr>
                    ))}
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
