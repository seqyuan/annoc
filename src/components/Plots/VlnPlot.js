import React, { useState, useEffect, useContext, useRef } from "react";
import {
  HTMLSelect,
  Label,
  Callout,
  Button,
} from "@blueprintjs/core";
import { MultiSelect } from "@blueprintjs/select";
import * as d3 from "d3";

import { AppContext } from "../../context/AppContext";
import { getSuppliedCols, getComputedCols } from "../../utils/utils";
import { generateColors } from "./colors";
import "./VlnPlot.css";

const VlnPlot = (props) => {
  const { annotationCols, globalClusterOrder } = useContext(AppContext);

  // Group by selection
  const [groupByColumn, setGroupByColumn] = useState("");
  const [availableGroupCols, setAvailableGroupCols] = useState([]);

  // QC metrics selection
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [availableMetrics, setAvailableMetrics] = useState([]);

  // Display options
  const [stackPlots] = useState(true);

  // Data
  const [plotData, setPlotData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const svgRef = useRef();

  // Request annotation data if not loaded (similar to DimPlot logic)
  useEffect(() => {
    if (!props.setReqAnnotation) return;

    // Request groupByColumn annotation if not loaded
    if (groupByColumn && !(groupByColumn in props.annotationObj)) {
      console.log('Requesting groupByColumn annotation:', groupByColumn);
      props.setReqAnnotation(groupByColumn);
    }

    // Request metric annotations if not loaded
    selectedMetrics.forEach(metric => {
      if (!(metric in props.annotationObj)) {
        console.log('Requesting metric annotation:', metric);
        props.setReqAnnotation(metric);
      }
    });
  }, [groupByColumn, selectedMetrics, props.annotationObj, props.setReqAnnotation]);

  // Initialize available columns
  useEffect(() => {
    if (!annotationCols) return;

    // Get categorical columns for grouping
    const suppliedCols = getSuppliedCols(annotationCols);
    const computedCols = getComputedCols(annotationCols);
    const allGroupCols = [...suppliedCols, ...computedCols];
    setAvailableGroupCols(allGroupCols);

    // Get continuous columns for metrics
    const continuousCols = Object.keys(annotationCols).filter(
      col => annotationCols[col].type === "continuous"
    );
    setAvailableMetrics(continuousCols);

    // Set defaults
    if (allGroupCols.length > 0 && !groupByColumn) {
      setGroupByColumn(allGroupCols[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationCols]);

  const fetchViolinData = () => {
    try {
      setError(null);
      setLoading(true);

      console.log('fetchViolinData called:', { groupByColumn, selectedMetrics, annotationObj: props.annotationObj });

      // Check if all required annotations are loaded (similar to DimPlot)
      if (!(groupByColumn in props.annotationObj)) {
        setError(`Waiting for ${groupByColumn} annotation to load...`);
        setLoading(false);
        return;
      }

      for (const metric of selectedMetrics) {
        if (!(metric in props.annotationObj)) {
          setError(`Waiting for ${metric} annotation to load...`);
          setLoading(false);
          return;
        }
      }

      // Get group annotation (now we know it exists)
      const groupAnnotation = props.annotationObj[groupByColumn];

      console.log('groupAnnotation:', groupAnnotation);

      // Extract group values and levels (similar to DimPlot)
      let groupValues, uniqueGroups;

      if (groupAnnotation.type === "array") {
        // For array type, convert to regular array
        groupValues = Array.from(groupAnnotation.values);
        uniqueGroups = [...new Set(groupValues)];
      } else if (groupAnnotation.type === "factor") {
        // For factor type, use index to map to levels
        groupValues = Array.from(groupAnnotation.index);
        uniqueGroups = groupAnnotation.levels;
      } else {
        setError("Unsupported annotation type");
        setLoading(false);
        return;
      }

      // Apply globalClusterOrder if available (sync with annotation tab order)
      if (globalClusterOrder && globalClusterOrder[groupByColumn]) {
        const savedOrder = globalClusterOrder[groupByColumn];
        uniqueGroups = savedOrder.filter(cluster => uniqueGroups.includes(cluster));
      }

      console.log('groupValues length:', groupValues.length);
      console.log('uniqueGroups:', uniqueGroups);

      // Fetch metric data
      const metricsData = {};
      for (const metric of selectedMetrics) {
        const metricAnnotation = props.annotationObj[metric];
        console.log(`Metric ${metric}:`, metricAnnotation);
        if (metricAnnotation && metricAnnotation.values) {
          // Convert TypedArray to regular array
          metricsData[metric] = Array.from(metricAnnotation.values);
        }
      }

      console.log('metricsData keys:', Object.keys(metricsData));

      // Organize data by group
      const organizedData = {};
      selectedMetrics.forEach(metric => {
        organizedData[metric] = {};
        uniqueGroups.forEach(group => {
          organizedData[metric][group] = [];
        });
      });

      console.log('organizedData initialized for groups:', uniqueGroups);

      // Fill organized data
      groupValues.forEach((groupIdx, cellIdx) => {
        const group = groupAnnotation.type === "factor" ? uniqueGroups[groupIdx] : groupIdx;
        selectedMetrics.forEach(metric => {
          if (metricsData[metric] && metricsData[metric][cellIdx] != null) {
            if (organizedData[metric][group]) {
              organizedData[metric][group].push(metricsData[metric][cellIdx]);
            }
          }
        });
      });

      console.log('organizedData:', organizedData);

      setPlotData({ data: organizedData, groups: uniqueGroups });
      setLoading(false);
    } catch (err) {
      console.error('fetchViolinData error:', err);
      setError(`Failed to fetch data: ${err.message}`);
      setLoading(false);
    }
  };

  // Fetch data when parameters change - REMOVED AUTO FETCH
  // useEffect(() => {
  //   if (!groupByColumn || selectedMetrics.length === 0) {
  //     setPlotData(null);
  //     return;
  //   }
  //   fetchViolinData();
  // }, [groupByColumn, selectedMetrics, props.annotationObj]);

  // Render violin plots
  useEffect(() => {
    if (!plotData || !svgRef.current) return;

    // Set explicit SVG dimensions
    const container = svgRef.current.parentElement;
    if (container) {
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;
      svgRef.current.setAttribute('width', width);
      svgRef.current.setAttribute('height', height);
    }

    renderViolinPlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotData, stackPlots]);

  const renderViolinPlots = () => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 40, right: 40, bottom: 60, left: 80 };
    const containerWidth = svgRef.current.clientWidth || 800;
    const containerHeight = svgRef.current.clientHeight || 600;

    console.log('VlnPlot render:', { containerWidth, containerHeight, plotData });

    const numMetrics = selectedMetrics.length;

    if (stackPlots) {
      // Stacked layout: one plot per metric
      const plotHeight = (containerHeight - margin.top - margin.bottom) / numMetrics - 20;
      const width = containerWidth - margin.left - margin.right;

      selectedMetrics.forEach((metric, metricIdx) => {
        const yOffset = margin.top + metricIdx * (plotHeight + 20);
        const g = svg.append("g")
          .attr("transform", `translate(${margin.left}, ${yOffset})`);

        renderSingleViolin(g, metric, plotData.data[metric], plotData.groups, width, plotHeight);
      });
    } else {
      // Side-by-side layout: all metrics in one plot
      const width = containerWidth - margin.left - margin.right;
      const height = containerHeight - margin.top - margin.bottom;
      const g = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

      renderCombinedViolin(g, plotData.data, plotData.groups, width, height);
    }
  };

  const renderSingleViolin = (g, metric, data, groups, width, height) => {
    console.log('renderSingleViolin:', { metric, data, groups, width, height });

    // Generate colors matching DimPlot
    const colors = generateColors(groups.length + 1);

    // X scale
    const x = d3.scaleBand()
      .domain(groups)
      .range([0, width])
      .padding(0.1);

    // Y scale
    const allValues = Object.values(data).flat();
    console.log('allValues:', allValues.length, 'min:', Math.min(...allValues), 'max:', Math.max(...allValues));

    if (allValues.length === 0) {
      console.warn('No values to plot for metric:', metric);
      return;
    }

    const y = d3.scaleLinear()
      .domain([Math.min(...allValues), Math.max(...allValues)])
      .nice()
      .range([height, 0]);

    // X axis
    g.append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(45)")
      .style("text-anchor", "start");

    // Y axis with automatic tick density adjustment
    const tickCount = Math.max(3, Math.floor(height / 40)); // At least 3 ticks, ~40px spacing
    g.append("g")
      .call(d3.axisLeft(y).ticks(tickCount));

    // Y axis label
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -60)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .text(metric);

    // Draw violins
    groups.forEach((group, groupIdx) => {
      const values = data[group];
      if (values.length === 0) return;

      const violinWidth = x.bandwidth();
      const xPos = x(group);

      // Calculate density using d3.bin
      const bins = d3.bin()
        .domain(y.domain())
        .thresholds(20)(values);

      const maxDensity = d3.max(bins, d => d.length);
      const xScale = d3.scaleLinear()
        .domain([0, maxDensity])
        .range([0, violinWidth / 2]);

      // Create violin path
      const area = d3.area()
        .x0(d => xPos + violinWidth / 2 - xScale(d.length))
        .x1(d => xPos + violinWidth / 2 + xScale(d.length))
        .y(d => y((d.x0 + d.x1) / 2))
        .curve(d3.curveCatmullRom);

      g.append("path")
        .datum(bins)
        .attr("d", area)
        .attr("fill", colors[groupIdx])
        .attr("opacity", 0.7)
        .attr("stroke", "#333")
        .attr("stroke-width", 1);

      // Add median line
      const median = d3.median(values);
      g.append("line")
        .attr("x1", xPos)
        .attr("x2", xPos + violinWidth)
        .attr("y1", y(median))
        .attr("y2", y(median))
        .attr("stroke", "white")
        .attr("stroke-width", 2);
    });
  };

  const renderCombinedViolin = (g, data, groups, width, height) => {
    // Combined view: show all metrics side by side for each group
    const numMetrics = selectedMetrics.length;
    const groupWidth = width / groups.length;
    const metricWidth = groupWidth / numMetrics;

    // Generate colors matching DimPlot
    const colors = generateColors(groups.length + 1);

    // Calculate global Y scale across all metrics
    const allValues = [];
    selectedMetrics.forEach(metric => {
      Object.values(data[metric]).forEach(vals => allValues.push(...vals));
    });

    const y = d3.scaleLinear()
      .domain([Math.min(...allValues), Math.max(...allValues)])
      .nice()
      .range([height, 0]);

    // Draw violins for each group and metric
    groups.forEach((group, groupIdx) => {
      const groupX = groupIdx * groupWidth;

      selectedMetrics.forEach((metric, metricIdx) => {
        const values = data[metric][group];
        if (!values || values.length === 0) return;

        const metricX = groupX + metricIdx * metricWidth;
        const violinWidth = metricWidth * 0.8;

        // Calculate density
        const bins = d3.bin()
          .domain(y.domain())
          .thresholds(20)(values);

        const maxDensity = d3.max(bins, d => d.length);
        const xScale = d3.scaleLinear()
          .domain([0, maxDensity])
          .range([0, violinWidth / 2]);

        // Create violin path
        const area = d3.area()
          .x0(d => metricX + violinWidth / 2 - xScale(d.length))
          .x1(d => metricX + violinWidth / 2 + xScale(d.length))
          .y(d => y((d.x0 + d.x1) / 2))
          .curve(d3.curveCatmullRom);

        g.append("path")
          .datum(bins)
          .attr("d", area)
          .attr("fill", colors[groupIdx])
          .attr("opacity", 0.7)
          .attr("stroke", "#333")
          .attr("stroke-width", 1);

        // Add median line
        const median = d3.median(values);
        g.append("line")
          .attr("x1", metricX)
          .attr("x2", metricX + violinWidth)
          .attr("y1", y(median))
          .attr("y2", y(median))
          .attr("stroke", "white")
          .attr("stroke-width", 2);
      });

      // Add group label
      g.append("text")
        .attr("x", groupX + groupWidth / 2)
        .attr("y", height + 30)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text(group);
    });

    // Y axis with automatic tick density adjustment
    const tickCount = Math.max(3, Math.floor(height / 40)); // At least 3 ticks, ~40px spacing
    g.append("g")
      .call(d3.axisLeft(y).ticks(tickCount));

    // Legend - show groups with their colors
    const legend = g.append("g")
      .attr("transform", `translate(${width - 100}, 0)`);

    groups.forEach((group, idx) => {
      const legendItem = legend.append("g")
        .attr("transform", `translate(0, ${idx * 20})`);

      legendItem.append("rect")
        .attr("width", 15)
        .attr("height", 15)
        .attr("fill", colors[idx])
        .attr("opacity", 0.7);

      legendItem.append("text")
        .attr("x", 20)
        .attr("y", 12)
        .style("font-size", "11px")
        .text(group);
    });
  };

  return (
    <div className="vlnplot-container">
      <div className="vlnplot-controls">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <Label style={{ flex: 1, marginBottom: 0 }}>
            Group by
            <HTMLSelect
              value={groupByColumn}
              onChange={(e) => setGroupByColumn(e.target.value)}
              fill
            >
              {availableGroupCols.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </HTMLSelect>
          </Label>

          <Label style={{ flex: 1, marginBottom: 0 }}>
            QC Metrics
            <MultiSelect
              items={availableMetrics}
              selectedItems={selectedMetrics}
              onItemSelect={(item) => {
                if (!selectedMetrics.includes(item)) {
                  setSelectedMetrics([...selectedMetrics, item]);
                }
              }}
              onRemove={(item) => {
                setSelectedMetrics(selectedMetrics.filter(m => m !== item));
              }}
              itemRenderer={(item, { handleClick, modifiers }) => (
                <div
                  key={item}
                  onClick={handleClick}
                  style={{
                    padding: "5px 10px",
                    cursor: "pointer",
                    backgroundColor: modifiers.active ? "#eee" : "white"
                  }}
                >
                  {item}
                </div>
              )}
              tagRenderer={(item) => item}
              placeholder="Select metrics..."
              fill
            />
          </Label>
        </div>

        <Button
          intent="primary"
          text="Generate Plot"
          onClick={fetchViolinData}
          disabled={loading || !groupByColumn || selectedMetrics.length === 0}
          icon="chart"
          fill
          large
        />

        {error && <Callout intent="danger" icon="error">{error}</Callout>}
      </div>

      <div className="vlnplot-canvas">
        <svg ref={svgRef} width="100%" height="100%"></svg>
      </div>
    </div>
  );
};

export default VlnPlot;
