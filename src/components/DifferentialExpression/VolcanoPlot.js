import React, { useRef, useEffect, useState } from "react";

export default function VolcanoPlot({ results, filters, onGeneClick }) {
  const canvasRef = useRef(null);
  const [hoveredGene, setHoveredGene] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(canvas.parentElement);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!results || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { width, height } = dimensions;

    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Extract data
    const genes = results.ordering || [];
    const lfc = results.means?.lfc || [];
    const auc = results.means?.auc || [];
    const cohen = results.means?.cohen || [];

    if (genes.length === 0) return;

    // Calculate effect size (use Cohen's d or AUC deviation from 0.5)
    const effectSize = cohen.length > 0 ? cohen : auc.map(v => Math.abs(v - 0.5) * 2);

    // Margins
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // Scales
    const lfcExtent = [Math.min(...lfc), Math.max(...lfc)];
    const effectExtent = [0, Math.max(...effectSize)];

    const xScale = (val) => margin.left + ((val - lfcExtent[0]) / (lfcExtent[1] - lfcExtent[0])) * plotWidth;
    const yScale = (val) => margin.top + plotHeight - (val / effectExtent[1]) * plotHeight;

    // Draw axes
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.stroke();

    // Draw threshold lines
    ctx.strokeStyle = "#ccc";
    ctx.setLineDash([5, 5]);

    // LFC threshold lines
    const lfcThresholdX1 = xScale(filters.lfcThreshold);
    const lfcThresholdX2 = xScale(-filters.lfcThreshold);
    ctx.beginPath();
    ctx.moveTo(lfcThresholdX1, margin.top);
    ctx.lineTo(lfcThresholdX1, height - margin.bottom);
    ctx.moveTo(lfcThresholdX2, margin.top);
    ctx.lineTo(lfcThresholdX2, height - margin.bottom);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw points
    genes.forEach((gene, i) => {
      const x = xScale(lfc[i]);
      const y = yScale(effectSize[i]);
      const isSignificant = Math.abs(lfc[i]) > filters.lfcThreshold &&
                           (auc.length > 0 ? (auc[i] > filters.aucThreshold || auc[i] < (1 - filters.aucThreshold)) : true);

      let color = "#999";
      if (isSignificant) {
        color = lfc[i] > 0 ? "#e74c3c" : "#3498db";
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw axis labels
    ctx.fillStyle = "#333";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Log Fold Change", width / 2, height - 10);

    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Effect Size (Cohen's d)", 0, 0);
    ctx.restore();

    // Draw hovered gene label
    if (hoveredGene) {
      const idx = genes.indexOf(hoveredGene);
      if (idx !== -1) {
        const x = xScale(lfc[idx]);
        const y = yScale(effectSize[idx]);

        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(x + 5, y - 20, hoveredGene.length * 7 + 10, 20);
        ctx.fillStyle = "#fff";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.fillText(hoveredGene, x + 10, y - 5);
      }
    }

  }, [results, filters, dimensions, hoveredGene]);

  const handleMouseMove = (e) => {
    if (!results || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const genes = results.ordering || [];
    const lfc = results.means?.lfc || [];
    const cohen = results.means?.cohen || [];
    const auc = results.means?.auc || [];
    const effectSize = cohen.length > 0 ? cohen : auc.map(v => Math.abs(v - 0.5) * 2);

    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const plotWidth = canvas.width - margin.left - margin.right;
    const plotHeight = canvas.height - margin.top - margin.bottom;

    const lfcExtent = [Math.min(...lfc), Math.max(...lfc)];
    const effectExtent = [0, Math.max(...effectSize)];

    const xScale = (val) => margin.left + ((val - lfcExtent[0]) / (lfcExtent[1] - lfcExtent[0])) * plotWidth;
    const yScale = (val) => margin.top + plotHeight - (val / effectExtent[1]) * plotHeight;

    let closestGene = null;
    let minDist = Infinity;

    genes.forEach((gene, i) => {
      const gx = xScale(lfc[i]);
      const gy = yScale(effectSize[i]);
      const dist = Math.sqrt((x - gx) ** 2 + (y - gy) ** 2);
      if (dist < 10 && dist < minDist) {
        minDist = dist;
        closestGene = gene;
      }
    });

    setHoveredGene(closestGene);
  };

  const handleClick = () => {
    if (hoveredGene && onGeneClick) {
      onGeneClick(hoveredGene);
    }
  };

  return (
    <div className="volcano-plot-container">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        style={{ cursor: hoveredGene ? "pointer" : "default" }}
      />
    </div>
  );
}
