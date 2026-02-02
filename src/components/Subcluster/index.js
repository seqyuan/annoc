import React, { useEffect, useContext, useState, useRef } from "react";
import {
  Button,
  HTMLSelect,
  Label,
  InputGroup,
  Callout,
  Spinner,
  Checkbox,
  NumericInput,
} from "@blueprintjs/core";

import { AppContext } from "../../context/AppContext";
import { getSuppliedCols, getComputedCols } from "../../utils/utils";
import "./index.css";

const ALGORITHMS = ["multilevel", "leiden", "walktrap"];
const SCHEMES = ["rank", "number", "jaccard"];

const Subcluster = (props) => {
  const { annotationCols, annotationObj, setAnnotationCols, setAnnotationObj, setReqAnnotation } =
    useContext(AppContext);

  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [selectedClusters, setSelectedClusters] = useState(new Set());
  const [resolution, setResolution] = useState(1);
  const [algorithm, setAlgorithm] = useState("multilevel");
  const [k, setK] = useState(10);
  const [scheme, setScheme] = useState("rank");
  const [leidenResolution, setLeidenResolution] = useState(1);
  const [walktrapSteps, setWalktrapSteps] = useState(4);
  const [newColumnName, setNewColumnName] = useState("subcluster1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const listenerRef = useRef(null);

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

  const levels = (() => {
    if (!selectedAnnotation || !annotationObj[selectedAnnotation]) return [];
    const data = annotationObj[selectedAnnotation];
    if (data.type === "array") return [...new Set(data.values)];
    if (data.type === "factor") return data.levels || [];
    return [];
  })();

  const toggleCluster = (cluster) => {
    setSelectedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(cluster)) next.delete(cluster);
      else next.add(cluster);
      return next;
    });
  };

  const handleFindSubcluster = () => {
    if (!selectedAnnotation) {
      setError("Please choose an annotation.");
      return;
    }
    if (selectedClusters.size === 0) {
      setError("Please select at least one cluster to subcluster.");
      return;
    }
    if (!newColumnName.trim()) {
      setError("Please enter a name for the new column.");
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    if (props.scranWorker) {
      props.scranWorker.postMessage({
        type: "findSubcluster",
        payload: {
          annotation: selectedAnnotation,
          selectedClusters: Array.from(selectedClusters),
          newColumnName: newColumnName.trim(),
          parameters: {
            k,
            scheme,
            algorithm,
            multilevel_resolution: resolution,
            leiden_resolution: leidenResolution,
            walktrap_steps: walktrapSteps,
          },
        },
      });
    } else {
      setLoading(false);
      setError("Worker not available.");
    }
  };

  useEffect(() => {
    if (!props.scranWorker) return;

    const handleMessage = (event) => {
      const { type, resp } = event.data;
      if (type === "findSubcluster_DATA") {
        setLoading(false);
        if (resp?.success && resp?.newColumnName) {
          setSuccessMsg(`Subclusters saved as "${resp.newColumnName}".`);
          setError(null);
          const n = parseInt((resp.newColumnName.match(/\d+/) || [])[0], 10) || 0;
          setNewColumnName(`subcluster${n + 1}`);
        } else {
          setError(resp?.message || "Subclustering failed.");
        }
      }
    };

    props.scranWorker.addEventListener("message", handleMessage);
    listenerRef.current = handleMessage;
    return () => {
      props.scranWorker.removeEventListener("message", listenerRef.current);
    };
  }, [props.scranWorker]);

  return (
    <div className="subcluster-container">
      <div className="subcluster-controls">
        <Label>
          Choose annotation
          <HTMLSelect
            value={selectedAnnotation || ""}
            onChange={(e) => {
              setSelectedAnnotation(e.target.value);
              setSelectedClusters(new Set());
            }}
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

        {selectedAnnotation && (
          <Label>
            Clusters to subcluster (select one or more)
            <div className="subcluster-checkboxes">
              {levels.length === 0 && !annotationObj[selectedAnnotation] && (
                <Callout intent="primary" icon={<Spinner size={16} />}>
                  Loading annotation...
                </Callout>
              )}
              {levels.map((level) => (
                <Checkbox
                  key={String(level)}
                  checked={selectedClusters.has(String(level))}
                  onChange={() => toggleCluster(String(level))}
                  label={String(level)}
                  disabled={loading}
                />
              ))}
            </div>
          </Label>
        )}

        <Label>
          Resolution
          <NumericInput
            value={resolution}
            onValueChange={(v) => setResolution(typeof v === "number" ? v : 1)}
            min={0.1}
            max={5}
            stepSize={0.1}
            minorStepSize={0.01}
            disabled={loading}
            fill
          />
        </Label>

        <Label>
          Algorithm
          <HTMLSelect
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            fill
            disabled={loading}
          >
            {ALGORITHMS.map((alg) => (
              <option key={alg} value={alg}>
                {alg}
              </option>
            ))}
          </HTMLSelect>
        </Label>

        {algorithm === "leiden" && (
          <Label>
            Leiden resolution
            <NumericInput
              value={leidenResolution}
              onValueChange={(v) => setLeidenResolution(typeof v === "number" ? v : 1)}
              min={0.1}
              max={5}
              stepSize={0.1}
              disabled={loading}
              fill
            />
          </Label>
        )}

        {algorithm === "walktrap" && (
          <Label>
            Walktrap steps
            <NumericInput
              value={walktrapSteps}
              onValueChange={(v) => setWalktrapSteps(typeof v === "number" ? v : 4)}
              min={1}
              max={20}
              stepSize={1}
              disabled={loading}
              fill
            />
          </Label>
        )}

        <Label>
          k (neighbors)
          <NumericInput
            value={k}
            onValueChange={(v) => setK(typeof v === "number" ? v : 10)}
            min={2}
            max={50}
            stepSize={1}
            disabled={loading}
            fill
          />
        </Label>

        <Label>
          Scheme
          <HTMLSelect
            value={scheme}
            onChange={(e) => setScheme(e.target.value)}
            fill
            disabled={loading}
          >
            {SCHEMES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </HTMLSelect>
        </Label>

        <Label>
          New column name
          <InputGroup
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="subcluster1"
            disabled={loading}
            fill
          />
        </Label>

        <div className="subcluster-actions">
          <Button
            intent="primary"
            text="Find subcluster"
            onClick={handleFindSubcluster}
            disabled={loading || selectedClusters.size === 0 || !newColumnName.trim()}
            icon="git-branch"
          />
        </div>

        {loading && (
          <Callout intent="primary" icon={<Spinner size={16} />}>
            Finding subclusters...
          </Callout>
        )}

        {error && (
          <Callout intent="danger" icon="error">
            {error}
          </Callout>
        )}

        {successMsg && (
          <Callout intent="success" icon="tick">
            {successMsg}
          </Callout>
        )}
      </div>
    </div>
  );
};

export default React.memo(Subcluster);
