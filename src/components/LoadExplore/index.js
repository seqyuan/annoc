import { useState, useContext, useEffect } from "react";
import {
  Tabs, Tab, Label, Text, HTMLSelect, FileInput, Card, Elevation,
  Button, Divider, Callout, H2,
} from "@blueprintjs/core";
import "./index.css";
import { AppContext } from "../../context/AppContext";
import { generateUID } from "../../utils/utils";
import { Tooltip2 } from "@blueprintjs/popover2";
import { H5ADCard } from "./H5ADCard";
import { SECard } from "./SECard";

export function LoadExplore({ setShowPanel, ...props }) {
  const {
    setExploreFiles, setPreInputFiles, preInputFilesStatus, setPreInputFilesStatus,
    setAppMode,
  } = useContext(AppContext);

  const [tabSelected, setTabSelected] = useState("H5AD");
  const [exploreInputs, setExploreInputs] = useState([]);
  const [tmpStatusValid, setTmpStatusValid] = useState(true);
  const [tmpLoadInputs, setTmpLoadInputs] = useState({
    name: `explore-dataset-1`,
    format: tabSelected,
  });
  const [inputOptions, setInputOptions] = useState([]);
  const [jsZipNames, setJsZipNames] = useState(null);
  const [jsZipObjs, setJSZipObjs] = useState(null);

  const handleClose = () => {
    setTmpLoadInputs({ name: `explore-dataset-1`, format: tabSelected });
    setInputOptions([]);
    setTmpStatusValid(true);
  };

  const handleLoadDataset = () => {
    let mapFiles = {};
    mapFiles[tmpLoadInputs.name] = tmpLoadInputs;
    mapFiles[tmpLoadInputs.name]["options"] = inputOptions;

    // Check if data has reduced dimensions
    const fileStatus = preInputFilesStatus?.[tmpLoadInputs.name];
    const hasReducedDims = fileStatus?.reduced_dimension_names &&
                          Array.isArray(fileStatus.reduced_dimension_names) &&
                          fileStatus.reduced_dimension_names.length > 0;

    let fInputFiles = { files: mapFiles };

    if (hasReducedDims) {
      // Has reduced dimensions - load into ExplorerMode for visualization only
      mapFiles[tmpLoadInputs.name].mode = "explore";
      setExploreFiles(fInputFiles);
      setShowPanel("explore");
    } else {
      // No reduced dimensions - need to run analysis
      // Mark for analysis mode
      mapFiles[tmpLoadInputs.name].mode = "analysis";

      // Don't set batch and subset - let them be undefined
      // The worker will handle undefined properly
      setExploreFiles(fInputFiles);
      setShowPanel("explore");
    }
  };

  // Validate inputs
  useEffect(() => {
    if (tmpLoadInputs) {
      let all_valid = true;
      let x = tmpLoadInputs;
      if (x.format === "H5AD") {
        if (!x.h5) all_valid = false;
      } else if (x.format === "SummarizedExperiment") {
        if (!x.rds) all_valid = false;
      } else if (x.format === "Seurat") {
        if (!x.rds) all_valid = false;
      }

      setTmpStatusValid(all_valid);
      if (all_valid) {
        tmpLoadInputs["uid"] = generateUID(tmpLoadInputs);
        setExploreInputs([tmpLoadInputs]);
      }
    }
  }, [tmpLoadInputs]);

  // Preflight check
  useEffect(() => {
    if (Array.isArray(exploreInputs) && exploreInputs.length > 0) {
      let mapFiles = {};
      for (const f of exploreInputs) {
        mapFiles[f.name] = f;
      }
      setPreInputFiles({ files: mapFiles });
    }
  }, [exploreInputs, setPreInputFiles]);

  const render_inputs = () => {
    return (
      <Tabs animate={true} renderActiveTabPanelOnly={true} vertical={true}
        defaultSelectedTabId={tabSelected}
        onChange={(ntab) => {
          let tmp = { ...tmpLoadInputs };
          tmp["format"] = ntab;
          setTmpLoadInputs(tmp);
          setTabSelected(ntab);
          setExploreInputs([]);
          setInputOptions([]);
          setPreInputFiles(null);
          setPreInputFilesStatus(null);
        }}
      >
        <Tab id="H5AD" title="H5AD" panel={
          <div>
            <div className="row">
              <Callout intent="primary">
                <p>Load a H5AD (*.h5ad) file containing a count matrix or pre-computed results.</p>
              </Callout>
            </div>
            <div className="row">
              <Label className="row-input">
                <Text className="text-100"><span>Choose a H5AD file</span></Text>
                <FileInput style={{ marginTop: "5px" }}
                  text={tmpLoadInputs?.h5 ? tmpLoadInputs?.h5.name : ".h5ad"}
                  onInputChange={(msg) => {
                    if (msg.target.files) {
                      setTmpLoadInputs({ ...tmpLoadInputs, h5: msg.target.files[0] });
                    }
                  }}
                />
              </Label>
            </div>
          </div>
        } />
        <Tab id="SummarizedExperiment" title="SCE" panel={
          <div>
            <div className="row">
              <Callout intent="primary">
                <p>Load an RDS (*.rds) file containing a SummarizedExperiment or SingleCellExperiment.</p>
                <p style={{ marginTop: "10px", fontSize: "0.9em" }}>
                  <strong>If you have a Seurat object, convert it first in R:</strong>
                </p>
                <pre style={{
                  background: "#f5f8fa",
                  padding: "10px",
                  borderRadius: "3px",
                  fontSize: "0.85em",
                  marginTop: "5px",
                  overflow: "auto"
                }}>
{`library(Seurat)
library(SingleCellExperiment)

rds <- readRDS("seurat.rds")
sce <- as.SingleCellExperiment(rds)
saveRDS(sce, "sce.rds")`}
                </pre>
              </Callout>
            </div>
            <div className="row">
              <Label className="row-input">
                <Text className="text-100"><span>Choose an RDS file</span></Text>
                <FileInput style={{ marginTop: "5px" }}
                  text={tmpLoadInputs?.rds ? tmpLoadInputs?.rds.name : ".rds"}
                  onInputChange={(msg) => {
                    if (msg.target.files) {
                      setTmpLoadInputs({ ...tmpLoadInputs, rds: msg.target.files[0] });
                    }
                  }}
                />
              </Label>
            </div>
          </div>
        } />
      </Tabs>
    );
  };

  // Check if we have reduced dimensions info
  const fileStatus = preInputFilesStatus?.[tmpLoadInputs.name];
  const hasReducedDims = fileStatus?.reduced_dimension_names &&
                        Array.isArray(fileStatus.reduced_dimension_names) &&
                        fileStatus.reduced_dimension_names.length > 0;
  const buttonText = hasReducedDims ? "Explore" : "Analyze";
  const buttonIntent = hasReducedDims ? "primary" : "warning";

  return (
    <Card className="section" interactive={false} elevation={Elevation.ZERO}>
      <div className="section-header">
        <H2 className="section-header-title">Load Dataset</H2>
      </div>
      <Divider />
      <div className="section-content">
        <div className="section-content-body">
          {/* Privacy Notice */}
          {!(preInputFilesStatus && tmpLoadInputs.name in preInputFilesStatus) && (
            <Callout intent="primary" icon="lock" style={{ marginBottom: "15px" }}>
              <p style={{ marginTop: "0px", marginBottom: "0px" }}>
                <strong>🔒 Privacy Protected</strong>
              </p>
              <p style={{ marginTop: "8px", marginBottom: "0px", fontSize: "14px" }}>
                Your data is loaded directly into your browser's memory and processed entirely on your computer.
                Nothing is uploaded to any server or cloud service. Your data privacy is fully guaranteed.
              </p>
            </Callout>
          )}
          {preInputFilesStatus && tmpLoadInputs.name in preInputFilesStatus && (
            <Callout>
              <p style={{ marginTop: "8px" }}>
                {hasReducedDims ? (
                  <span style={{ color: "#0F9960", fontWeight: "bold" }}>✓ Dataset has reduced dimensions. Click "Explore" to visualize.</span>
                ) : (
                  <span style={{ color: "#D9822B", fontWeight: "bold" }}>⚠ No reduced dimensions found. Click "Analyze" to run analysis in your browser.</span>
                )}
              </p>
            </Callout>
          )}
          {render_inputs()}
        </div>
        <div className="section-info">
          <div className="section-inputs">
            {exploreInputs.map((x, i) => {
              if (x.format === "H5AD" && x.h5) {
                return (
                  <H5ADCard key={i} resource={x} index={i}
                    preflight={preInputFilesStatus && preInputFilesStatus[x.name]}
                    inputOpts={inputOptions} setInputOpts={setInputOptions}
                    inputs={exploreInputs} setInputs={setExploreInputs}
                    selectedFsetModality={props?.selectedFsetModality}
                    setSelectedFsetModality={props?.setSelectedFsetModality}
                  />
                );
              } else if (x.format === "SummarizedExperiment" && x.rds) {
                return (
                  <SECard key={i} resource={x} index={i}
                    preflight={preInputFilesStatus && preInputFilesStatus[x.name]}
                    inputOpts={inputOptions} setInputOpts={setInputOptions}
                    inputs={exploreInputs} setInputs={setExploreInputs}
                    selectedFsetModality={props?.selectedFsetModality}
                    setSelectedFsetModality={props?.setSelectedFsetModality}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>
      <Divider />
      <div className="section-footer">
        <Tooltip2 content="Clear loaded dataset" placement="left">
          <Button icon="cross" intent={"danger"} large={true} onClick={handleClose} text="Clear" />
        </Tooltip2>
        <Tooltip2 content={hasReducedDims ? "Explore pre-computed results" : "Run analysis on this dataset"} placement="right">
          <Button icon={hasReducedDims ? "eye-open" : "flame"} onClick={handleLoadDataset}
            intent={buttonIntent} large={true} disabled={!tmpStatusValid}
            text={buttonText}
          />
        </Tooltip2>
      </div>
    </Card>
  );
}
