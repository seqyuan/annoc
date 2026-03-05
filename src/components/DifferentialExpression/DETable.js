import React, { useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { CSVLink } from "react-csv";

export default function DETable({
  results,
  filters,
  setFilters,
  highlightedGene,
  targetGroup,
  compareMode,
  compareGroups
}) {
  const [sortColumn, setSortColumn] = useState("lfc");
  const [sortDirection, setSortDirection] = useState("desc");
  const [topN, setTopN] = useState(50);

  const processedData = useMemo(() => {
    if (!results) return [];

    const genes = results.ordering || [];
    const lfc = results.means?.lfc || [];
    const cohen = results.means?.cohen || [];
    const auc = results.means?.auc || [];
    const detected = results.means?.detected || [];
    const means = results.mean || [];

    return genes.map((gene, i) => ({
      gene,
      lfc: lfc[i] || 0,
      cohen: cohen[i] || 0,
      auc: auc[i] || 0.5,
      detected_target: detected[i] || 0,
      detected_ref: 0, // Will be calculated if available
      mean_target: means[i] || 0,
      mean_ref: 0
    }));
  }, [results]);

  const filteredData = useMemo(() => {
    let data = [...processedData];

    // Apply filters
    data = data.filter(row => {
      const lfcPass = Math.abs(row.lfc) >= filters.lfcThreshold;
      const aucPass = row.auc >= filters.aucThreshold || row.auc <= (1 - filters.aucThreshold);
      const detectedPass = row.detected_target >= filters.detectedMin;

      let directionPass = true;
      if (filters.direction === "up") {
        directionPass = row.lfc > 0;
      } else if (filters.direction === "down") {
        directionPass = row.lfc < 0;
      }

      return lfcPass && aucPass && detectedPass && directionPass;
    });

    // Sort
    data.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      const multiplier = sortDirection === "asc" ? 1 : -1;
      return (aVal - bVal) * multiplier;
    });

    return data;
  }, [processedData, filters, sortColumn, sortDirection]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const getTopGenes = (direction, n) => {
    let data = [...processedData];
    data = data.filter(row => direction === "up" ? row.lfc > 0 : row.lfc < 0);
    data.sort((a, b) => Math.abs(b.lfc) - Math.abs(a.lfc));
    return data.slice(0, n);
  };

  const csvHeaders = [
    { label: "Gene", key: "gene" },
    { label: "LogFC", key: "lfc" },
    { label: "Cohen_d", key: "cohen" },
    { label: "AUC", key: "auc" },
    { label: "Detected_Target_Pct", key: "detected_target" },
    { label: "Mean_Target", key: "mean_target" }
  ];

  const Row = ({ index, style }) => {
    const row = filteredData[index];
    const isHighlighted = row.gene === highlightedGene;

    return (
      <div
        style={{
          ...style,
          display: "flex",
          borderBottom: "1px solid #eee",
          backgroundColor: isHighlighted ? "#fff3cd" : index % 2 === 0 ? "#f9f9f9" : "#fff"
        }}
      >
        <div style={{ flex: "0 0 120px", padding: "8px" }}>{row.gene}</div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right" }}>
          {row.lfc.toFixed(3)}
        </div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right" }}>
          {row.cohen.toFixed(3)}
        </div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right" }}>
          {row.auc.toFixed(3)}
        </div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right" }}>
          {(row.detected_target * 100).toFixed(1)}%
        </div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right" }}>
          {row.mean_target.toFixed(2)}
        </div>
      </div>
    );
  };

  return (
    <div className="de-table-container">
      <div className="de-table-controls">
        <div className="de-filter-group">
          <label>
            LFC Threshold:
            <input
              type="number"
              step="0.1"
              value={filters.lfcThreshold}
              onChange={(e) => setFilters({ ...filters, lfcThreshold: parseFloat(e.target.value) })}
            />
          </label>
          <label>
            AUC Threshold:
            <input
              type="number"
              step="0.05"
              min="0.5"
              max="1"
              value={filters.aucThreshold}
              onChange={(e) => setFilters({ ...filters, aucThreshold: parseFloat(e.target.value) })}
            />
          </label>
          <label>
            Min Detected %:
            <input
              type="number"
              step="5"
              min="0"
              max="100"
              value={filters.detectedMin * 100}
              onChange={(e) => setFilters({ ...filters, detectedMin: parseFloat(e.target.value) / 100 })}
            />
          </label>
        </div>

        <div className="de-direction-group">
          <button
            className={filters.direction === "all" ? "active" : ""}
            onClick={() => setFilters({ ...filters, direction: "all" })}
          >
            All
          </button>
          <button
            className={filters.direction === "up" ? "active" : ""}
            onClick={() => setFilters({ ...filters, direction: "up" })}
          >
            Upregulated
          </button>
          <button
            className={filters.direction === "down" ? "active" : ""}
            onClick={() => setFilters({ ...filters, direction: "down" })}
          >
            Downregulated
          </button>
        </div>

        <div className="de-download-group">
          <CSVLink
            data={filteredData}
            headers={csvHeaders}
            filename={`DE_${targetGroup}_${compareMode}.csv`}
            className="de-download-btn"
          >
            Download All ({filteredData.length})
          </CSVLink>

          <label>
            Top N:
            <input
              type="number"
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value))}
              style={{ width: "60px" }}
            />
          </label>

          <CSVLink
            data={getTopGenes("up", topN)}
            headers={csvHeaders}
            filename={`DE_${targetGroup}_top${topN}_up.csv`}
            className="de-download-btn"
          >
            Top {topN} Up
          </CSVLink>

          <CSVLink
            data={getTopGenes("down", topN)}
            headers={csvHeaders}
            filename={`DE_${targetGroup}_top${topN}_down.csv`}
            className="de-download-btn"
          >
            Top {topN} Down
          </CSVLink>
        </div>
      </div>

      <div className="de-table-header" style={{ display: "flex", fontWeight: "bold", borderBottom: "2px solid #333" }}>
        <div style={{ flex: "0 0 120px", padding: "8px", cursor: "pointer" }} onClick={() => handleSort("gene")}>
          Gene {sortColumn === "gene" && (sortDirection === "asc" ? "↑" : "↓")}
        </div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right", cursor: "pointer" }} onClick={() => handleSort("lfc")}>
          LogFC {sortColumn === "lfc" && (sortDirection === "asc" ? "↑" : "↓")}
        </div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right", cursor: "pointer" }} onClick={() => handleSort("cohen")}>
          Cohen's d {sortColumn === "cohen" && (sortDirection === "asc" ? "↑" : "↓")}
        </div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right", cursor: "pointer" }} onClick={() => handleSort("auc")}>
          AUC {sortColumn === "auc" && (sortDirection === "asc" ? "↑" : "↓")}
        </div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right", cursor: "pointer" }} onClick={() => handleSort("detected_target")}>
          Detected % {sortColumn === "detected_target" && (sortDirection === "asc" ? "↑" : "↓")}
        </div>
        <div style={{ flex: "0 0 100px", padding: "8px", textAlign: "right", cursor: "pointer" }} onClick={() => handleSort("mean_target")}>
          Mean Expr {sortColumn === "mean_target" && (sortDirection === "asc" ? "↑" : "↓")}
        </div>
      </div>

      <Virtuoso
        style={{ height: "400px" }}
        totalCount={filteredData.length}
        itemContent={(index) => <Row index={index} />}
      />

      <div className="de-table-footer">
        Showing {filteredData.length} of {processedData.length} genes
      </div>
    </div>
  );
}
