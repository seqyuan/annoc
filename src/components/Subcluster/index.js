import React, { useEffect, useContext, useState, useRef } from "react";
import {
  Button,
  HTMLSelect,
  Label,
  InputGroup,
  Callout,
  Spinner,
  NumericInput,
  Icon,
} from "@blueprintjs/core";
import { Tooltip2 } from "@blueprintjs/popover2";

import { AppContext } from "../../context/AppContext";
import { getSuppliedCols, getComputedCols } from "../../utils/utils";
import "./index.css";

const ALGORITHMS = ["multilevel", "leiden", "walktrap"];
const SCHEMES = ["rank", "number", "jaccard"];

const ParamHelp = ({ content }) => (
  <Tooltip2 content={content} placement="top">
    <Icon icon="help" size={12} style={{ cursor: "help", marginLeft: 4, opacity: 0.7, verticalAlign: "middle" }} />
  </Tooltip2>
);

const HELP = {
  resolution: "控制聚类粒度，数值越大子群越多。multilevel 和 leiden 共用此参数。",
  algorithm: "multilevel: 多层社区发现，速度快；leiden: 改进版，社区连通性更好；walktrap: 基于短随机游走识别紧密子群。",
  walktrapSteps: "随机游走步数，步数越多考虑更远邻接关系。",
  k: "构建 SNN 图时每个细胞考虑的最近邻数量。",
  scheme: "rank: 按邻居排名加权，对高维数据稳定；number: 按共同邻居数加权；jaccard: 用 Jaccard 相似度加权。",
};

const Subcluster = (props) => {
  const { annotationCols, annotationObj, setAnnotationCols, setAnnotationObj, setReqAnnotation } =
    useContext(AppContext);

  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [resolution, setResolution] = useState(0.1);
  const [algorithm, setAlgorithm] = useState("multilevel");
  const [k, setK] = useState(20);
  const [scheme, setScheme] = useState("rank");
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
    setSelectedCluster(cluster);
  };

  const handleFindSubcluster = () => {
    if (!selectedAnnotation) {
      setError("Please choose an annotation.");
      return;
    }
    if (!selectedCluster) {
      setError("Please select a cluster to subcluster.");
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
          selectedClusters: [selectedCluster],
          newColumnName: newColumnName.trim(),
          parameters: {
            k,
            scheme,
            algorithm,
            multilevel_resolution: resolution,
            leiden_resolution: resolution,
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
              setSelectedCluster(null);
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
            Clusters to subcluster (select one)
            <div style={{
              maxHeight: "200px",
              overflowY: "auto",
              border: "1px solid #ddd",
              borderRadius: "4px",
              padding: "10px",
              backgroundColor: "white"
            }}>
              {levels.length === 0 && !annotationObj[selectedAnnotation] && (
                <Callout intent="primary" icon={<Spinner size={16} />}>
                  Loading annotation...
                </Callout>
              )}
              {levels.map((level) => (
                <label
                  key={String(level)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "5px 0",
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="radio"
                    name="subcluster-selection"
                    value={String(level)}
                    checked={selectedCluster === String(level)}
                    onChange={(e) => setSelectedCluster(e.target.value)}
                    disabled={loading}
                    style={{ marginRight: "8px" }}
                  />
                  {String(level)}
                </label>
              ))}
            </div>
          </Label>
        )}

        {(algorithm === "multilevel" || algorithm === "leiden") && (
          <Label>
            Resolution <ParamHelp content={HELP.resolution} />
            <NumericInput
              value={resolution}
              onValueChange={(v) => setResolution(typeof v === "number" ? v : 0.25)}
              min={0.1}
              max={5}
              stepSize={0.1}
              minorStepSize={0.01}
              disabled={loading}
              fill
            />
          </Label>
        )}

        <Label>
          Algorithm <ParamHelp content={HELP.algorithm} />
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

        {algorithm === "walktrap" && (
          <Label>
            Walktrap steps <ParamHelp content={HELP.walktrapSteps} />
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
          k (neighbors) <ParamHelp content={HELP.k} />
          <NumericInput
            value={k}
            onValueChange={(v) => setK(typeof v === "number" ? v : 20)}
            min={2}
            max={50}
            stepSize={1}
            disabled={loading}
            fill
          />
        </Label>

        <Label>
          Scheme <ParamHelp content={HELP.scheme} />
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
            disabled={loading || !selectedCluster || !newColumnName.trim()}
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
