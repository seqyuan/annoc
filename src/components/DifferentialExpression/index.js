import React, { useState, useEffect, useContext } from "react";
import { AppContext } from "../../context/AppContext";
import VolcanoPlot from "./VolcanoPlot";
import DETable from "./DETable";
import "./de.css";

export default function DifferentialExpression({ scranWorker, inputData }) {
  const { annotationCols } = useContext(AppContext);

  const [selectedAnnotation, setSelectedAnnotation] = useState("");
  const [availableGroups, setAvailableGroups] = useState([]);
  const [targetGroup, setTargetGroup] = useState("");
  const [compareMode, setCompareMode] = useState("vsAll");
  const [compareGroups, setCompareGroups] = useState([]);
  const [rankType, setRankType] = useState("cohen-min");
  const [modality, setModality] = useState("RNA");

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [highlightedGene, setHighlightedGene] = useState(null);

  const [filters, setFilters] = useState({
    lfcThreshold: 0.5,
    aucThreshold: 0.6,
    detectedMin: 0,
    direction: "all" // "all", "up", "down"
  });

  // Get available annotations
  const annotations = annotationCols ? Object.keys(annotationCols).filter(
    key => annotationCols[key].type !== "continuous"
  ) : [];

  useEffect(() => {
    if (annotations && annotations.length > 0) {
      setSelectedAnnotation(annotations[0]);
    }
  }, [annotationCols]);

  // Get available groups for selected annotation
  useEffect(() => {
    if (!selectedAnnotation || !scranWorker) return;

    scranWorker.postMessage({
      type: "getAnnotation",
      payload: { annotation: selectedAnnotation }
    });

    const handler = (e) => {
      if (e.data.type === "getAnnotation_DATA") {
        const uniqueGroups = [...new Set(e.data.resp)].sort();
        setAvailableGroups(uniqueGroups);
        if (uniqueGroups.length > 0) {
          setTargetGroup(uniqueGroups[0]);
        }
      }
    };

    scranWorker.addEventListener("message", handler);
    return () => scranWorker.removeEventListener("message", handler);
  }, [selectedAnnotation, scranWorker]);

  const handleRunDE = () => {
    if (!targetGroup) return;

    setLoading(true);
    setResults(null);

    scranWorker.postMessage({
      type: "computeDE",
      payload: {
        annotation: selectedAnnotation,
        target: targetGroup,
        compareMode,
        compareGroups: compareMode === "vsAll" ? [] : compareGroups,
        rank_type: rankType,
        modality
      }
    });
  };

  useEffect(() => {
    if (!scranWorker) return;

    const handler = (e) => {
      if (e.data.type === "computeDE_DATA") {
        setResults(e.data.resp);
        setLoading(false);
      }
    };

    scranWorker.addEventListener("message", handler);
    return () => scranWorker.removeEventListener("message", handler);
  }, [scranWorker]);

  const handleCompareGroupToggle = (group) => {
    if (compareMode === "vsOne") {
      setCompareGroups([group]);
    } else if (compareMode === "vsMultiple") {
      setCompareGroups(prev =>
        prev.includes(group)
          ? prev.filter(g => g !== group)
          : [...prev, group]
      );
    }
  };

  return (
    <div className="de-container">
      <div className="de-control-panel">
        <h3>Differential Expression</h3>

        <div className="de-control-group">
          <label>Annotation:</label>
          <select
            value={selectedAnnotation}
            onChange={(e) => setSelectedAnnotation(e.target.value)}
          >
            {annotations.map(anno => (
              <option key={anno} value={anno}>{anno}</option>
            ))}
          </select>
        </div>

        <div className="de-control-group">
          <label>Target Group:</label>
          <select
            value={targetGroup}
            onChange={(e) => setTargetGroup(e.target.value)}
          >
            {availableGroups.map(group => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </div>

        <div className="de-control-group">
          <label>Compare Mode:</label>
          <div className="de-radio-group">
            <label>
              <input
                type="radio"
                value="vsAll"
                checked={compareMode === "vsAll"}
                onChange={(e) => setCompareMode(e.target.value)}
              />
              vs All Others
            </label>
            <label>
              <input
                type="radio"
                value="vsOne"
                checked={compareMode === "vsOne"}
                onChange={(e) => setCompareMode(e.target.value)}
              />
              vs One Group
            </label>
            <label>
              <input
                type="radio"
                value="vsMultiple"
                checked={compareMode === "vsMultiple"}
                onChange={(e) => setCompareMode(e.target.value)}
              />
              vs Selected Groups
            </label>
          </div>
        </div>

        {compareMode !== "vsAll" && (
          <div className="de-control-group">
            <label>Reference Group(s):</label>
            <div className="de-group-selector">
              {availableGroups
                .filter(g => g !== targetGroup)
                .map(group => (
                  <label key={group} className="de-checkbox-label">
                    <input
                      type={compareMode === "vsOne" ? "radio" : "checkbox"}
                      checked={compareGroups.includes(group)}
                      onChange={() => handleCompareGroupToggle(group)}
                    />
                    {group}
                  </label>
                ))}
            </div>
          </div>
        )}

        <div className="de-control-group">
          <label>Rank Type:</label>
          <select value={rankType} onChange={(e) => setRankType(e.target.value)}>
            <option value="cohen-min">Cohen's d (min)</option>
            <option value="cohen-mean">Cohen's d (mean)</option>
            <option value="lfc-mean">LFC (mean)</option>
            <option value="auc-mean">AUC (mean)</option>
          </select>
        </div>

        <button
          className="de-run-button"
          onClick={handleRunDE}
          disabled={loading || !targetGroup || (compareMode !== "vsAll" && compareGroups.length === 0)}
        >
          {loading ? "Computing..." : "Run DE Analysis"}
        </button>
      </div>

      <div className="de-results-panel">
        {loading && <div className="de-loading">Computing differential expression...</div>}

        {results && (
          <>
            <VolcanoPlot
              results={results}
              filters={filters}
              onGeneClick={setHighlightedGene}
            />
            <DETable
              results={results}
              filters={filters}
              setFilters={setFilters}
              highlightedGene={highlightedGene}
              targetGroup={targetGroup}
              compareMode={compareMode}
              compareGroups={compareGroups}
            />
          </>
        )}
      </div>
    </div>
  );
}
