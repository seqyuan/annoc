import { useState, useEffect } from "react";
import { Card, HTMLSelect, Label, Text, Divider, H4, Callout } from "@blueprintjs/core";
import "./index.css";

export default function CellProportions({ annotationCols, annotationObj }) {
  const [groupBy, setGroupBy] = useState(null);
  const [splitBy, setSplitBy] = useState(null);

  // Debug: log props
  useEffect(() => {
    console.log("CellProportions - annotationCols:", annotationCols);
    console.log("CellProportions - annotationObj:", annotationObj);
  }, [annotationCols, annotationObj]);

  if (!annotationCols || Object.keys(annotationCols).length === 0) {
    return (
      <div style={{ padding: "20px" }}>
        <Callout intent="primary">
          <p>No annotations available. Load data to see cell proportions.</p>
        </Callout>
      </div>
    );
  }

  // Filter annotations to only show categorical/discrete columns
  const filterCategoricalAnnotations = () => {
    const filtered = [];

    for (const [name, info] of Object.entries(annotationCols)) {
      // Skip if no values in annotationObj
      if (!annotationObj[name]) continue;

      const values = annotationObj[name];
      if (!values || values.length === 0) continue;

      // Check if it's categorical/discrete
      // 1. If type is explicitly "categorical", include it
      if (info.type === "categorical") {
        filtered.push(name);
        continue;
      }

      // 2. Check the actual values
      const uniqueValues = new Set();
      let hasNonInteger = false;
      let sampleSize = Math.min(values.length, 1000); // Sample first 1000 values

      for (let i = 0; i < sampleSize; i++) {
        const val = values[i];
        uniqueValues.add(val);

        // Check if it's a non-integer number (float/decimal)
        if (typeof val === 'number' && !Number.isInteger(val)) {
          hasNonInteger = true;
          break;
        }
      }

      // Include if:
      // - Not a decimal number (integers are OK, like seurat_clusters: 0, 1, 2)
      // - Has reasonable number of unique values (< 50% of total or < 100 unique)
      const uniqueRatio = uniqueValues.size / sampleSize;
      if (!hasNonInteger && (uniqueValues.size < 100 || uniqueRatio < 0.5)) {
        filtered.push(name);
      }
    }

    return filtered;
  };

  const categoricalAnnotations = filterCategoricalAnnotations();

  if (categoricalAnnotations.length === 0) {
    return (
      <div style={{ padding: "20px" }}>
        <Callout intent="warning">
          <p>No categorical annotations found. Cell proportions require discrete/categorical data.</p>
        </Callout>
      </div>
    );
  }

  // Calculate proportions
  const calculateProportions = () => {
    if (!groupBy || !annotationObj[groupBy]) return null;

    const groupValues = annotationObj[groupBy];
    const counts = {};

    // Count occurrences
    for (let i = 0; i < groupValues.length; i++) {
      const val = groupValues[i];
      counts[val] = (counts[val] || 0) + 1;
    }

    const total = groupValues.length;
    const proportions = Object.entries(counts).map(([key, count]) => ({
      label: key,
      count: count,
      percentage: ((count / total) * 100).toFixed(2)
    }));

    // Sort by count descending
    proportions.sort((a, b) => b.count - a.count);

    return { proportions, total };
  };

  // Calculate split proportions
  const calculateSplitProportions = () => {
    if (!groupBy || !splitBy || !annotationObj[groupBy] || !annotationObj[splitBy]) {
      return null;
    }

    const groupValues = annotationObj[groupBy];
    const splitValues = annotationObj[splitBy];
    const matrix = {};

    // Build count matrix
    for (let i = 0; i < groupValues.length; i++) {
      const group = groupValues[i];
      const split = splitValues[i];

      if (!matrix[group]) matrix[group] = {};
      matrix[group][split] = (matrix[group][split] || 0) + 1;
    }

    // Calculate proportions
    const result = [];
    for (const [group, splits] of Object.entries(matrix)) {
      const groupTotal = Object.values(splits).reduce((a, b) => a + b, 0);
      const splitData = Object.entries(splits).map(([split, count]) => ({
        split,
        count,
        percentage: ((count / groupTotal) * 100).toFixed(2)
      }));
      splitData.sort((a, b) => b.count - a.count);
      result.push({ group, total: groupTotal, splits: splitData });
    }

    result.sort((a, b) => b.total - a.total);
    return result;
  };

  const data = calculateProportions();
  const splitData = splitBy ? calculateSplitProportions() : null;

  return (
    <div className="cell-proportions-container">
      <Card style={{ margin: "10px", padding: "15px" }}>
        <H4>Cell Proportions</H4>
        <Divider />

        <Label style={{ marginTop: "10px" }}>
          <Text>Group by:</Text>
          <HTMLSelect
            value={groupBy || ""}
            onChange={(e) => {
              const val = e.target.value;
              setGroupBy(val === "" ? null : val);
            }}
            fill={true}
          >
            <option value="">-- Select annotation --</option>
            {categoricalAnnotations.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </HTMLSelect>
        </Label>

        <Label style={{ marginTop: "10px" }}>
          <Text>Split by (optional):</Text>
          <HTMLSelect
            value={splitBy || ""}
            onChange={(e) => {
              const val = e.target.value;
              setSplitBy(val === "" ? null : val);
            }}
            fill={true}
            disabled={!groupBy}
          >
            <option value="">-- None --</option>
            {categoricalAnnotations.filter(n => n !== groupBy).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </HTMLSelect>
        </Label>

        <Divider style={{ marginTop: "15px" }} />

        {data && !splitBy && (
          <div style={{ marginTop: "15px" }}>
            <Text><strong>Total cells: {data.total}</strong></Text>
            <div style={{ marginTop: "10px", maxHeight: "500px", overflowY: "auto" }}>
              {data.proportions.map((item, idx) => (
                <div key={idx} style={{
                  padding: "8px",
                  marginBottom: "5px",
                  backgroundColor: idx % 2 === 0 ? "#f5f5f5" : "white",
                  borderRadius: "3px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Text><strong>{item.label}</strong></Text>
                    <Text>{item.percentage}%</Text>
                  </div>
                  <Text style={{ fontSize: "12px", color: "#666" }}>
                    {item.count} cells
                  </Text>
                </div>
              ))}
            </div>
          </div>
        )}

        {splitData && (
          <div style={{ marginTop: "15px", maxHeight: "500px", overflowY: "auto" }}>
            {splitData.map((group, idx) => (
              <Card key={idx} style={{ marginBottom: "10px", padding: "10px" }}>
                <Text><strong>{group.group}</strong> ({group.total} cells)</Text>
                <Divider style={{ margin: "5px 0" }} />
                {group.splits.map((split, sidx) => (
                  <div key={sidx} style={{
                    padding: "5px",
                    marginBottom: "3px",
                    fontSize: "12px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <Text>{split.split}</Text>
                      <Text>{split.percentage}%</Text>
                    </div>
                    <Text style={{ fontSize: "11px", color: "#666" }}>
                      {split.count} cells
                    </Text>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )}

        {!data && groupBy && (
          <Callout intent="warning" style={{ marginTop: "15px" }}>
            <p>No data available for selected annotation.</p>
          </Callout>
        )}
      </Card>
    </div>
  );
}
